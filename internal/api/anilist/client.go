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

// NewAnilistClient creates a new AnilistClientImpl with the given token.
// The token is used for authorization when making requests to the AniList API.
func NewAnilistClient(token string, cacheDir string) *AnilistClientImpl {
	ac := &AnilistClientImpl{
		token:    token,
		cacheDir: cacheDir,
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

// customDoFunc is a custom request interceptor that handles rate limiting and retries
// with exponential back-off.  It retries on:
//   - HTTP 429 (AniList rate limit) — honours the Retry-After header, broadcasts a WS event
//   - HTTP 500/502/503/504 (transient server errors)
//   - Network / connection errors
//
// Maximum 5 attempts total; back-off caps at 60 s.
func (ac *AnilistClientImpl) customDoFunc(ctx context.Context, req *http.Request, gqlInfo *clientv2.GQLRequestInfo, res interface{}) (err error) {
	var rlRemainingStr string

	reqTime := time.Now()
	defer func() {
		timeSince := time.Since(reqTime)
		dur := timeSince.Truncate(time.Millisecond).String()
		if err != nil {
			ac.logger.Error().Str("duration", dur).Str("rlr", rlRemainingStr).Err(err).Msg("anilist: Failed Request")
		} else {
			ac.broadcastOnline()
			if timeSince > 900*time.Millisecond {
				ac.logger.Warn().Str("rtt", dur).Str("rlr", rlRemainingStr).Msg("anilist: Successful Request (slow)")
			} else {
				ac.logger.Info().Str("rtt", dur).Str("rlr", rlRemainingStr).Msg("anilist: Successful Request")
			}
		}
	}()

	httpClient := newAnilistHTTPClient()
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
		if err != nil {
			backoff := backoffDuration(attempt, 2*time.Second, 60*time.Second)
			ac.logger.Warn().Err(err).Int("attempt", attempt+1).
				Msgf("anilist: network error, retrying in %s", backoff)
			select {
			case <-reqCtx.Done():
				return fmt.Errorf("anilist: request failed: %w", err)
			case <-time.After(backoff):
			}
			continue
		}

		rlRemainingStr = resp.Header.Get("X-Ratelimit-Remaining")

		// ── HTTP 429 – Rate limited ───────────────────────────────────────
		if resp.StatusCode == 429 {
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

		// ── Transient server errors (5xx) ────────────────────────────────
		if resp.StatusCode == 500 || resp.StatusCode == 502 ||
			resp.StatusCode == 503 || resp.StatusCode == 504 {
			resp.Body.Close()
			backoff := backoffDuration(attempt, 3*time.Second, 60*time.Second)
			ac.logger.Warn().Int("status", resp.StatusCode).Int("attempt", attempt+1).
				Msgf("anilist: server error, retrying in %s", backoff)
			select {
			case <-reqCtx.Done():
				return reqCtx.Err()
			case <-time.After(backoff):
			}
			continue
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
