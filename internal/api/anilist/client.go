package anilist

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"seanime/internal/constants"
	"seanime/internal/events"
	"seanime/internal/util"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/Yamashou/gqlgenc/clientv2"
	"github.com/Yamashou/gqlgenc/graphqljson"
	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
)

const anilistRequestTimeout = 45 * time.Second

func newAnilistHTTPClient() *http.Client {
	// Use a fresh transport — never clone http.DefaultTransport, which inherits
	// HTTP/2 handlers in TLSNextProto. When that cloned transport negotiates h2
	// via ALPN and something (e.g. a TLS-intercepting proxy) returns an HTTP/2
	// SETTINGS frame on what the HTTP/1.x reader expects, you get:
	//   "malformed HTTP response \x00\x00\x12\x04..."
	// A fresh Transport{} has no TLSNextProto entries, so it stays HTTP/1.1.
	return &http.Client{
		Timeout: anilistRequestTimeout,
		Transport: &http.Transport{
			ForceAttemptHTTP2:     false,
			MaxIdleConns:          64,
			MaxConnsPerHost:       24,
			MaxIdleConnsPerHost:   24,
			IdleConnTimeout:       30 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}
}

var (
	// ErrNotAuthenticated is returned when trying to access an Anilist API endpoint that requires authentication,
	// but the client is not authenticated.
	ErrNotAuthenticated = errors.New("not authenticated")
)

type AnilistClient interface {
	IsAuthenticated() bool
	AnimeCollection(ctx context.Context, userName *string, interceptors ...clientv2.RequestInterceptor) (*AnimeCollection, error)
	AnimeCollectionWithRelations(ctx context.Context, userName *string, interceptors ...clientv2.RequestInterceptor) (*AnimeCollectionWithRelations, error)
	BaseAnimeByMalID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*BaseAnimeByMalID, error)
	BaseAnimeByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*BaseAnimeByID, error)
	SearchBaseAnimeByIds(ctx context.Context, ids []*int, page *int, perPage *int, status []*MediaStatus, inCollection *bool, sort []*MediaSort, season *MediaSeason, year *int, genre *string, format *MediaFormat, interceptors ...clientv2.RequestInterceptor) (*SearchBaseAnimeByIds, error)
	CompleteAnimeByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*CompleteAnimeByID, error)
	AnimeDetailsByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*AnimeDetailsByID, error)
	ListAnime(ctx context.Context, page *int, search *string, perPage *int, sort []*MediaSort, status []*MediaStatus, genres []*string, averageScoreGreater *int, season *MediaSeason, seasonYear *int, format *MediaFormat, isAdult *bool, interceptors ...clientv2.RequestInterceptor) (*ListAnime, error)
	ListRecentAnime(ctx context.Context, page *int, perPage *int, airingAtGreater *int, airingAtLesser *int, notYetAired *bool, interceptors ...clientv2.RequestInterceptor) (*ListRecentAnime, error)
	UpdateMediaListEntry(ctx context.Context, mediaID *int, status *MediaListStatus, scoreRaw *int, progress *int, startedAt *FuzzyDateInput, completedAt *FuzzyDateInput, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntry, error)
	UpdateMediaListEntryProgress(ctx context.Context, mediaID *int, progress *int, status *MediaListStatus, startedAt *FuzzyDateInput, completedAt *FuzzyDateInput, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntryProgress, error)
	// UpdateMediaListEntryStatus changes only the status, leaving score/progress untouched.
	UpdateMediaListEntryStatus(ctx context.Context, mediaID *int, status *MediaListStatus, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntry, error)
	UpdateMediaListEntryRepeat(ctx context.Context, mediaID *int, repeat *int, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntryRepeat, error)
	DeleteEntry(ctx context.Context, mediaListEntryID *int, interceptors ...clientv2.RequestInterceptor) (*DeleteEntry, error)
	MangaCollection(ctx context.Context, userName *string, interceptors ...clientv2.RequestInterceptor) (*MangaCollection, error)
	SearchBaseManga(ctx context.Context, page *int, perPage *int, sort []*MediaSort, search *string, status []*MediaStatus, interceptors ...clientv2.RequestInterceptor) (*SearchBaseManga, error)
	BaseMangaByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*BaseMangaByID, error)
	MangaDetailsByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*MangaDetailsByID, error)
	ListManga(ctx context.Context, page *int, search *string, perPage *int, sort []*MediaSort, status []*MediaStatus, genres []*string, averageScoreGreater *int, startDateGreater *string, startDateLesser *string, format *MediaFormat, countryOfOrigin *string, isAdult *bool, interceptors ...clientv2.RequestInterceptor) (*ListManga, error)
	ViewerStats(ctx context.Context, interceptors ...clientv2.RequestInterceptor) (*ViewerStats, error)
	StudioDetails(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*StudioDetails, error)
	StaffDetails(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*StaffDetails, error)
	GetViewer(ctx context.Context, interceptors ...clientv2.RequestInterceptor) (*GetViewer, error)
	AnimeAiringSchedule(ctx context.Context, ids []*int, season *MediaSeason, seasonYear *int, previousSeason *MediaSeason, previousSeasonYear *int, nextSeason *MediaSeason, nextSeasonYear *int, interceptors ...clientv2.RequestInterceptor) (*AnimeAiringSchedule, error)
	AnimeAiringScheduleRaw(ctx context.Context, ids []*int, interceptors ...clientv2.RequestInterceptor) (*AnimeAiringScheduleRaw, error)
	GetCacheDir() string
	CustomQuery(body []byte, logger *zerolog.Logger, token ...string) (interface{}, error)
}

type (
	// AnilistClientImpl is a wrapper around the AniList API client.
	AnilistClientImpl struct {
		Client         *Client
		logger         *zerolog.Logger
		token          string
		cacheDir       string
		wsEventManager events.WSEventManagerInterface
		// tokenExpiredEvent is the WS event name sent on 401. Defaults to AnilistTokenExpired.
		tokenExpiredEvent string
		// httpClient is a shared HTTP client reused across all requests for connection pooling.
		httpClient *http.Client
		// rateLimited tracks whether we are currently in a rate-limited state so we
		// only send the recovery "online" event once.
		rateLimited atomic.Bool
	}
)

// SetWSEventManager wires in the WebSocket event manager after construction so that
// rate-limit / recovery notifications can be broadcast to all connected clients.
func (ac *AnilistClientImpl) SetWSEventManager(wsem events.WSEventManagerInterface) {
	ac.wsEventManager = wsem
}

// SetTokenExpiredEvent overrides the WS event name sent when a 401 is received.
func (ac *AnilistClientImpl) SetTokenExpiredEvent(eventName string) {
	ac.tokenExpiredEvent = eventName
}

func (ac *AnilistClientImpl) broadcastRateLimited(retryAfterSec int) {
	if ac.wsEventManager == nil {
		return
	}
	ac.rateLimited.Store(true)
	ac.wsEventManager.SendEvent(events.AnilistRateLimited, map[string]interface{}{
		"retryAfter": retryAfterSec,
	})
}

func (ac *AnilistClientImpl) broadcastOnline() {
	if ac.wsEventManager == nil || !ac.rateLimited.Load() {
		return
	}
	ac.rateLimited.Store(false)
	ac.wsEventManager.SendEvent(events.AnilistAPIOnline, nil)
}

func (ac *AnilistClientImpl) broadcastTokenExpired() {
	if ac.wsEventManager == nil {
		return
	}
	eventName := ac.tokenExpiredEvent
	if eventName == "" {
		eventName = events.AnilistTokenExpired
	}
	ac.wsEventManager.SendEvent(eventName, nil)
}

// NewAnilistClient creates a new AnilistClientImpl with the given token.
// The token is used for authorization when making requests to the AniList API.
func NewAnilistClient(token string, cacheDir string) *AnilistClientImpl {
	ac := &AnilistClientImpl{
		token:      token,
		cacheDir:   cacheDir,
		httpClient: newAnilistHTTPClient(),
		Client: &Client{
			Client: clientv2.NewClient(newAnilistHTTPClient(), constants.AnilistApiUrl, nil,
				func(ctx context.Context, req *http.Request, gqlInfo *clientv2.GQLRequestInfo, res interface{}, next clientv2.RequestInterceptorFunc) error {
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Accept", "application/json")
					if len(token) > 0 {
						req.Header.Set("Authorization", "Bearer "+token)
					}
					return next(ctx, req, gqlInfo, res)
				}),
		},
		logger: util.NewLogger(),
	}

	ac.Client.Client.CustomDo = ac.customDoFunc

	return ac
}

func (ac *AnilistClientImpl) IsAuthenticated() bool {
	if ac.Client == nil || ac.Client.Client == nil {
		return false
	}
	if len(ac.token) == 0 {
		return false
	}
	// If the token is not empty, we are authenticated
	return true
}

func (ac *AnilistClientImpl) GetCacheDir() string {
	return ac.cacheDir
}

func (ac *AnilistClientImpl) CustomQuery(body []byte, logger *zerolog.Logger, token ...string) (data interface{}, err error) {
	return customQuery(body, logger, token...)
}

////////////////////////////////
// Authenticated
////////////////////////////////

func (ac *AnilistClientImpl) UpdateMediaListEntry(ctx context.Context, mediaID *int, status *MediaListStatus, scoreRaw *int, progress *int, startedAt *FuzzyDateInput, completedAt *FuzzyDateInput, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntry, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Int("mediaId", *mediaID).Msg("anilist: Updating media list entry")
	return ac.Client.UpdateMediaListEntry(ctx, mediaID, status, scoreRaw, progress, startedAt, completedAt, interceptors...)
}

func (ac *AnilistClientImpl) UpdateMediaListEntryProgress(ctx context.Context, mediaID *int, progress *int, status *MediaListStatus, startedAt *FuzzyDateInput, completedAt *FuzzyDateInput, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntryProgress, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Int("mediaId", *mediaID).Msg("anilist: Updating media list entry progress")
	return ac.Client.UpdateMediaListEntryProgress(ctx, mediaID, progress, status, startedAt, completedAt, interceptors...)
}

func (ac *AnilistClientImpl) UpdateMediaListEntryRepeat(ctx context.Context, mediaID *int, repeat *int, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntryRepeat, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Int("mediaId", *mediaID).Msg("anilist: Updating media list entry repeat")
	return ac.Client.UpdateMediaListEntryRepeat(ctx, mediaID, repeat, interceptors...)
}

func (ac *AnilistClientImpl) DeleteEntry(ctx context.Context, mediaListEntryID *int, interceptors ...clientv2.RequestInterceptor) (*DeleteEntry, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Int("entryId", *mediaListEntryID).Msg("anilist: Deleting media list entry")
	return ac.Client.DeleteEntry(ctx, mediaListEntryID, interceptors...)
}

func (ac *AnilistClientImpl) AnimeCollection(ctx context.Context, userName *string, interceptors ...clientv2.RequestInterceptor) (*AnimeCollection, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Msg("anilist: Fetching anime collection")
	return ac.Client.AnimeCollection(ctx, userName, interceptors...)
}

func (ac *AnilistClientImpl) AnimeCollectionWithRelations(ctx context.Context, userName *string, interceptors ...clientv2.RequestInterceptor) (*AnimeCollectionWithRelations, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Msg("anilist: Fetching anime collection with relations")
	return ac.Client.AnimeCollectionWithRelations(ctx, userName, interceptors...)
}

func (ac *AnilistClientImpl) GetViewer(ctx context.Context, interceptors ...clientv2.RequestInterceptor) (*GetViewer, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Msg("anilist: Fetching viewer")
	return ac.Client.GetViewer(ctx, interceptors...)
}

func (ac *AnilistClientImpl) MangaCollection(ctx context.Context, userName *string, interceptors ...clientv2.RequestInterceptor) (*MangaCollection, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Msg("anilist: Fetching manga collection")
	return ac.Client.MangaCollection(ctx, userName, interceptors...)
}

func (ac *AnilistClientImpl) ViewerStats(ctx context.Context, interceptors ...clientv2.RequestInterceptor) (*ViewerStats, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	ac.logger.Debug().Msg("anilist: Fetching stats")
	return ac.Client.ViewerStats(ctx, interceptors...)
}

////////////////////////////////
// Not authenticated
////////////////////////////////

func (ac *AnilistClientImpl) BaseAnimeByMalID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*BaseAnimeByMalID, error) {
	return ac.Client.BaseAnimeByMalID(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) BaseAnimeByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*BaseAnimeByID, error) {
	ac.logger.Debug().Int("mediaId", *id).Msg("anilist: Fetching anime")
	return ac.Client.BaseAnimeByID(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) AnimeDetailsByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*AnimeDetailsByID, error) {
	ac.logger.Debug().Int("mediaId", *id).Msg("anilist: Fetching anime details")
	return ac.Client.AnimeDetailsByID(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) CompleteAnimeByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*CompleteAnimeByID, error) {
	ac.logger.Debug().Int("mediaId", *id).Msg("anilist: Fetching complete media")
	return ac.Client.CompleteAnimeByID(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) ListAnime(ctx context.Context, page *int, search *string, perPage *int, sort []*MediaSort, status []*MediaStatus, genres []*string, averageScoreGreater *int, season *MediaSeason, seasonYear *int, format *MediaFormat, isAdult *bool, interceptors ...clientv2.RequestInterceptor) (*ListAnime, error) {
	defer func() {
		if r := recover(); r != nil {
			ac.logger.Warn().Interface("panic", r).Msg("anilist: Recovered from panic in ListAnime")
		}
	}()
	ac.logger.Debug().Msg("anilist: Fetching media list")
	return ac.Client.ListAnime(ctx, page, search, perPage, sort, status, genres, averageScoreGreater, season, seasonYear, format, isAdult, interceptors...)
}

func (ac *AnilistClientImpl) ListRecentAnime(ctx context.Context, page *int, perPage *int, airingAtGreater *int, airingAtLesser *int, notYetAired *bool, interceptors ...clientv2.RequestInterceptor) (*ListRecentAnime, error) {
	ac.logger.Debug().Msg("anilist: Fetching recent media list")
	return ac.Client.ListRecentAnime(ctx, page, perPage, airingAtGreater, airingAtLesser, notYetAired, interceptors...)
}

func (ac *AnilistClientImpl) SearchBaseManga(ctx context.Context, page *int, perPage *int, sort []*MediaSort, search *string, status []*MediaStatus, interceptors ...clientv2.RequestInterceptor) (*SearchBaseManga, error) {
	ac.logger.Debug().Msg("anilist: Searching manga")
	return ac.Client.SearchBaseManga(ctx, page, perPage, sort, search, status, interceptors...)
}

func (ac *AnilistClientImpl) BaseMangaByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*BaseMangaByID, error) {
	ac.logger.Debug().Int("mediaId", *id).Msg("anilist: Fetching manga")
	return ac.Client.BaseMangaByID(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) MangaDetailsByID(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*MangaDetailsByID, error) {
	ac.logger.Debug().Int("mediaId", *id).Msg("anilist: Fetching manga details")
	return ac.Client.MangaDetailsByID(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) ListManga(ctx context.Context, page *int, search *string, perPage *int, sort []*MediaSort, status []*MediaStatus, genres []*string, averageScoreGreater *int, startDateGreater *string, startDateLesser *string, format *MediaFormat, countryOfOrigin *string, isAdult *bool, interceptors ...clientv2.RequestInterceptor) (*ListManga, error) {
	ac.logger.Debug().Msg("anilist: Fetching manga list")
	return ac.Client.ListManga(ctx, page, search, perPage, sort, status, genres, averageScoreGreater, startDateGreater, startDateLesser, format, countryOfOrigin, isAdult, interceptors...)
}

func (ac *AnilistClientImpl) StudioDetails(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*StudioDetails, error) {
	ac.logger.Debug().Int("studioId", *id).Msg("anilist: Fetching studio details")
	return ac.Client.StudioDetails(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) StaffDetails(ctx context.Context, id *int, interceptors ...clientv2.RequestInterceptor) (*StaffDetails, error) {
	ac.logger.Debug().Int("staffId", *id).Msg("anilist: Fetching staff details")
	return ac.Client.StaffDetails(ctx, id, interceptors...)
}

func (ac *AnilistClientImpl) SearchBaseAnimeByIds(ctx context.Context, ids []*int, page *int, perPage *int, status []*MediaStatus, inCollection *bool, sort []*MediaSort, season *MediaSeason, year *int, genre *string, format *MediaFormat, interceptors ...clientv2.RequestInterceptor) (*SearchBaseAnimeByIds, error) {
	ac.logger.Debug().Msg("anilist: Searching anime by ids")
	return ac.Client.SearchBaseAnimeByIds(ctx, ids, page, perPage, status, inCollection, sort, season, year, genre, format, interceptors...)
}

func (ac *AnilistClientImpl) AnimeAiringSchedule(ctx context.Context, ids []*int, season *MediaSeason, seasonYear *int, previousSeason *MediaSeason, previousSeasonYear *int, nextSeason *MediaSeason, nextSeasonYear *int, interceptors ...clientv2.RequestInterceptor) (*AnimeAiringSchedule, error) {
	ac.logger.Debug().Msg("anilist: Fetching schedule")
	return ac.Client.AnimeAiringSchedule(ctx, ids, season, seasonYear, previousSeason, previousSeasonYear, nextSeason, nextSeasonYear, interceptors...)
}

func (ac *AnilistClientImpl) AnimeAiringScheduleRaw(ctx context.Context, ids []*int, interceptors ...clientv2.RequestInterceptor) (*AnimeAiringScheduleRaw, error) {
	ac.logger.Debug().Msg("anilist: Fetching schedule")
	return ac.Client.AnimeAiringScheduleRaw(ctx, ids, interceptors...)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// customDoFunc is a custom request interceptor that handles rate limiting and retries.
//
// It retries on HTTP 429 alone — honouring the Retry-After header and broadcasting a WS event —
// because a rate limit is the one failure whose answer changes simply for having waited. Transport
// errors and 5xx are reported after a single attempt: the caller has gone, or the service is
// struggling, and in both cases retrying multiplies the load that caused the failure. Ported from
// upstream v3.10.2, "AniList: Restrict retries to 429 errors only".
//
// Maximum 5 attempts, all of them rate-limit waits; back-off caps at 60 s.
func (ac *AnilistClientImpl) customDoFunc(ctx context.Context, req *http.Request, gqlInfo *clientv2.GQLRequestInfo, res interface{}) (err error) {
	// The user goes first. Every AniList request in the server arrives here, which makes this the
	// one place the ordering can be decided — see priority.go for why it needs deciding at all.
	release, gateErr := gateRequest(ctx)
	if gateErr != nil {
		// Refused rather than queued. Reported here because it is not a failure of AniList's and
		// reads like one otherwise: the budget is spent and the queue for it is deeper than this
		// request could be held for. See maxBudgetWait.
		ac.logger.Warn().Err(gateErr).Msg("anilist: Request not sent, rate budget queue is full")
		return gateErr
	}
	defer release()

	var rlRemainingStr string

	reqTime := time.Now()
	defer func() {
		timeSince := time.Since(reqTime)
		dur := timeSince.Truncate(time.Millisecond).String()
		if err != nil {
			// Log context deadline exceeded as WARN to reduce log spam during transient issues
			if errors.Is(err, context.DeadlineExceeded) {
				ac.logger.Warn().Str("duration", dur).Str("rlr", rlRemainingStr).Err(err).Msg("anilist: Request timeout")
			} else {
				ac.logger.Error().Str("duration", dur).Str("rlr", rlRemainingStr).Err(err).Msg("anilist: Failed Request")
			}
		} else {
			ac.broadcastOnline()
			if timeSince > 900*time.Millisecond {
				ac.logger.Warn().Str("rtt", dur).Str("rlr", rlRemainingStr).Msg("anilist: Successful Request (slow)")
			} else {
				ac.logger.Info().Str("rtt", dur).Str("rlr", rlRemainingStr).Msg("anilist: Successful Request")
			}
		}
	}()

	httpClient := ac.httpClient
	reqCtx := ctx
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		reqCtx, cancel = context.WithTimeout(ctx, anilistRequestTimeout)
		defer cancel()
	}
	req = req.Clone(reqCtx)

	const maxAttempts = 5
	var resp *http.Response

	for attempt := 0; attempt < maxAttempts; attempt++ {
		// Close previous response body before each retry.
		if resp != nil && resp.Body != nil {
			resp.Body.Close()
			resp = nil
		}

		// Rebuild the request body on subsequent attempts.
		if attempt > 0 && req.GetBody != nil {
			newBody, bodyErr := req.GetBody()
			if bodyErr != nil {
				return fmt.Errorf("anilist: rebuild request body: %w", bodyErr)
			}
			req.Body = newBody
		}

		resp, err = httpClient.Do(req)

		// ── Network / transport error ─────────────────────────────────────
		//
		// Not retried. Ported from upstream v3.10.2, "AniList: Restrict retries to 429 errors
		// only", and the reason is visible in this server's own logs: a request whose context had
		// already been cancelled was logged as a network error, waited two seconds, tried again,
		// failed again for the same reason, and did it five times — a burst of
		// "network error, retrying in 2s ... context canceled" per request, several requests at
		// once, all of it work that could not possibly succeed.
		//
		// A rate limit is worth retrying because the answer changes after the wait. A transport
		// failure is not: the caller has gone, or the network is down, and retrying multiplies load
		// during exactly the outage that caused it. 429 keeps its retry below; everything else is
		// reported once and left to the caller.
		if err != nil {
			if reqCtx.Err() != nil {
				// The caller gave up. Not a network failure worth reporting as one.
				return fmt.Errorf("anilist: request cancelled: %w", reqCtx.Err())
			}
			ac.logger.Warn().Err(err).Msg("anilist: network error")
			return fmt.Errorf("anilist: request failed: %w", err)
		}

		rlRemainingStr = resp.Header.Get("X-Ratelimit-Remaining")

		// Pace against what AniList actually reports rather than against this side's own count.
		// Another client on the same token, or a window that reset differently, shows up here
		// first — and believing our own tally over theirs is how the ceiling gets exceeded.
		if remaining, convErr := strconv.Atoi(rlRemainingStr); convErr == nil {
			ObserveRateLimitRemaining(remaining)
		}

		// ── HTTP 429 – Rate limited ───────────────────────────────────────
		if resp.StatusCode == 429 {
			// Already over the line: treat the window as fully spent so nothing else is sent
			// into it. Without this the pacer keeps letting requests through on its own
			// optimistic count, and each one comes back 429 and waits its own minute.
			ObserveRateLimitRemaining(0)
			resp.Body.Close()
			waitSec := 65 // safe default: AniList resets after 60 s
			if ra, e := strconv.Atoi(resp.Header.Get("Retry-After")); e == nil && ra > 0 {
				waitSec = ra + 2
			}
			ac.logger.Warn().Int("attempt", attempt+1).
				Msgf("anilist: rate limited (429), waiting %ds", waitSec)
			ac.broadcastRateLimited(waitSec)
			select {
			case <-reqCtx.Done():
				return reqCtx.Err()
			case <-time.After(time.Duration(waitSec) * time.Second):
			}
			continue
		}

		// ── Unauthorized — token expired or invalid ───────────────────────
		if resp.StatusCode == 401 {
			resp.Body.Close()
			ac.logger.Error().Msg("anilist: token expired or invalid (401) — re-authentication required")
			ac.broadcastTokenExpired()
			break
		}

		// ── Transient server errors (5xx) ────────────────────────────────
		//
		// Also no longer retried, for the same reason as the transport errors above: when AniList
		// is having trouble, every client retrying five times each is a fair part of the trouble.
		// One attempt, reported honestly, and the cache layer serves what it has — which is the
		// point of having a cache that never expires.
		if resp.StatusCode == 500 || resp.StatusCode == 502 ||
			resp.StatusCode == 503 || resp.StatusCode == 504 {
			resp.Body.Close()
			ac.logger.Warn().Int("status", resp.StatusCode).Msg("anilist: server error")
			return fmt.Errorf("anilist: server error: status %d", resp.StatusCode)
		}

		// Success or a non-retryable HTTP error — exit the loop.
		break
	}

	if resp == nil {
		return fmt.Errorf("anilist: all %d attempts exhausted with no response", 5)
	}

	defer resp.Body.Close()

	if resp.Header.Get("Content-Encoding") == "gzip" {
		resp.Body, err = gzip.NewReader(resp.Body)
		if err != nil {
			return fmt.Errorf("gzip decode failed: %w", err)
		}
	}

	var body []byte
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	err = parseResponse(body, resp.StatusCode, res)
	return
}

// backoffDuration returns min(base * 2^attempt, max) for exponential back-off.
func backoffDuration(attempt int, base, max time.Duration) time.Duration {
	d := time.Duration(float64(base) * math.Pow(2, float64(attempt)))
	if d > max {
		return max
	}
	return d
}

func parseResponse(body []byte, httpCode int, result interface{}) error {
	errResponse := &clientv2.ErrorResponse{}
	isKOCode := httpCode < 200 || 299 < httpCode
	if isKOCode {
		errResponse.NetworkError = &clientv2.HTTPError{
			Code:    httpCode,
			Message: fmt.Sprintf("Response body %s", string(body)),
		}
	}

	// some servers return a graphql error with a non OK http code, try anyway to parse the body
	if err := unmarshal(body, result); err != nil {
		var gqlErr *clientv2.GqlErrorList
		if errors.As(err, &gqlErr) {
			errResponse.GqlErrors = &gqlErr.Errors
		} else if !isKOCode {
			return err
		}
	}

	if errResponse.HasErrors() {
		return errResponse
	}

	return nil
}

// response is a GraphQL layer response from a handler.
type response struct {
	Data   json.RawMessage `json:"data"`
	Errors json.RawMessage `json:"errors"`
}

func unmarshal(data []byte, res interface{}) error {
	ParseDataWhenErrors := false
	resp := response{}
	if err := json.Unmarshal(data, &resp); err != nil {
		return fmt.Errorf("failed to decode data %s: %w", string(data), err)
	}

	var err error
	if resp.Errors != nil && len(resp.Errors) > 0 {
		// try to parse standard graphql error
		err = &clientv2.GqlErrorList{}
		if e := json.Unmarshal(data, err); e != nil {
			return fmt.Errorf("faild to parse graphql errors. Response content %s - %w", string(data), e)
		}

		// if ParseDataWhenErrors is true, try to parse data as well
		if !ParseDataWhenErrors {
			return err
		}
	}

	if errData := graphqljson.UnmarshalData(resp.Data, res); errData != nil {
		// if ParseDataWhenErrors is true, and we failed to unmarshal data, return the actual error
		if ParseDataWhenErrors {
			return err
		}

		return fmt.Errorf("failed to decode data into response %s: %w", string(data), errData)
	}

	return err
}
