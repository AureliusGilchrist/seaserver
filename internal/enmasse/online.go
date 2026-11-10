package enmasse

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"seanime/internal/connectivity"
	"strings"
	"sync"
	"time"
	"unicode"

	"seanime/internal/api/anilist"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"

	"github.com/rs/zerolog"

	"golang.org/x/text/unicode/norm"
)

// The anime en masse downloader no longer torrents. For every series the library does not have
// yet, it looks the series up on an online streaming provider (Kickassanime) under every spelling
// it can think of, and when it finds a convincing match it queues the whole series in the online
// stream downloader, which saves each episode into the library already matched.
//
// Everything is paced for a provider that is being asked about tens of thousands of series:
// searches are spaced several seconds apart, each series takes at least half a minute, and the
// search stops running ahead of the downloads when enough episodes are already waiting.

// PrimaryProviders are searched first: Kickassanime. It may take over a series still
// downloading as a torrent.
var PrimaryProviders = []string{OnlineProvider}

// BackupProviders are tried, in order, when no primary provider has a series. They never
// replace a healthy torrent, only a stalled one. AnimePahe comes last: its Cloudflare token
// only lasts about 15 minutes, so it is usually skipped.
var BackupProviders = []string{"anizone", BackupProvider, "animegg", "animepahe"}

func isPrimaryProvider(p string) bool {
	for _, q := range PrimaryProviders {
		if q == p {
			return true
		}
	}
	return false
}

const (
	// OnlineProvider is the provider the en masse downloader searches first.
	OnlineProvider = "kickassanime"
	// BackupProvider is AnimeHeaven, tried after AniZone (see BackupProviders).
	BackupProvider = "animeheaven"

	// onlineMaxWaitingSeries stops the search from running ahead of the downloads: no new
	// series is looked up while this many series still have episodes waiting to download.
	onlineMaxWaitingSeries = 10
	// onlineMaxVariants caps the spellings tried for one series.
	onlineMaxVariants = 14
	// onlineMinSimilarity is how close a provider title must be to one of the series' titles.
	onlineMinSimilarity = 0.86
	// onlineSureSimilarity ends the search early: the match cannot get better.
	onlineSureSimilarity = 0.97
)

// Pacing; variables so tests can shorten them.
var (
	// onlineRequestGap is the minimum time between two requests to the provider's search or
	// episode list. Downloads have their own, separate limiter.
	onlineRequestGap = 8 * time.Second
	// onlineSeriesGap is the minimum time spent on one series, found or not.
	onlineSeriesGap = 30 * time.Second
)

// OnlineHooks connect the en masse downloader to the online stream downloader and the library.
// They are set when the routes are wired, after the modules.
type OnlineHooks struct {
	// InLibrary reports whether the library already has episodes of the anime.
	InLibrary func(mediaId int) bool
	// InDownloadQueue reports whether the anime already has episodes in the online download queue.
	InDownloadQueue func(mediaId int) bool
	// WaitingEpisodes is how many episodes are waiting in the online download queue.
	WaitingEpisodes func() int
	// WaitingSeries is how many series have episodes waiting in the online download queue.
	WaitingSeries func() int
	// Search searches the provider.
	Search func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error)
	// FindEpisodes lists a provider entry's episodes.
	FindEpisodes func(provider string, id string) ([]*hibikeonlinestream.EpisodeDetails, error)
	// SaveMapping remembers which provider entry an anime is, so every later lookup (the online
	// player, the episode downloads) uses the entry that was checked here.
	SaveMapping func(provider string, mediaId int, providerId string) error
	// EnqueueSeries queues every episode of the anime for download and returns how many were queued.
	EnqueueSeries func(ctx context.Context, provider string, mediaId int) (queued int, err error)

	// TorrentSeries lists the anime that have a torrent still downloading in the torrent client.
	// They are handled first: the online download replaces the torrent.
	TorrentSeries func() []TorrentSeries
	// TorrentFallback picks a torrent for a series no streaming provider has (SeaDex first, the
	// Enqueue Future auto torrent rules) and sends it to the torrent client, auto-matched. Returns
	// the torrent's name, or why there was none.
	TorrentFallback func(ctx context.Context, mediaId int) (name string, reason string, err error)
	// TorrentSource, when set, says where the last TorrentFallback pick came from ("seadex" or
	// "animetosho"), for the activity feed.
	TorrentSource func(mediaId int) string
	// HasTorrent reports whether an anime has a torrent still downloading.
	HasTorrent func(mediaId int) bool
	// TorrentStalled reports whether every unfinished torrent of an anime has been stalled for a
	// while (no download, no seeders). Only then may the backup provider replace it.
	TorrentStalled func(mediaId int) bool
	// TakeOverTorrents hands an anime's unfinished torrents to the online download: they are
	// paused now, removed with their files once every episode is in the library, and resumed if
	// the online download fails.
	TakeOverTorrents func(mediaId int)
}

// TorrentSeries is an anime with a torrent still downloading.
type TorrentSeries struct {
	MediaId int
	Title   string
}

// SetOnlineHooks connects the downloader to the online stream downloader.
func (d *Downloader) SetOnlineHooks(h *OnlineHooks) {
	d.mu.Lock()
	d.online = h
	d.mu.Unlock()
}

var errOnlineSkipped = errors.New("skipped")

// onlineSkip is a series the downloader leaves alone (already in the library, adult, not aired).
type onlineSkip struct{ reason string }

func (e onlineSkip) Error() string        { return e.reason }
func (e onlineSkip) Is(target error) bool { return target == errOnlineSkipped }

// paceRequest waits until the provider may be asked again.
func (d *Downloader) paceRequest(ctx context.Context) error {
	d.mu.Lock()
	wait := time.Until(d.lastOnlineRequest.Add(onlineRequestGap))
	if wait < 0 {
		wait = 0
	}
	d.lastOnlineRequest = time.Now().Add(wait)
	d.mu.Unlock()
	if wait == 0 {
		return nil
	}
	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// processTorrentSeries tries every anime that is still downloading as a torrent before the rest
// of the database: those are the series the user is waiting for right now.
func (d *Downloader) processTorrentSeries(ctx context.Context, hooks *OnlineHooks) {
	if hooks.TorrentSeries == nil {
		return
	}
	series := hooks.TorrentSeries()
	if len(series) == 0 {
		return
	}
	d.logger.Info().Int("series", len(series)).Msg("enmasse-anime: Trying the series that are downloading as torrents first")
	d.setStatus(fmt.Sprintf("Trying %d series that are downloading as torrents", len(series)))
	for i, s := range series {
		if ctx.Err() != nil {
			return
		}
		title := s.Title
		if title == "" {
			title = fmt.Sprintf("AniList %d", s.MediaId)
		}
		d.mu.Lock()
		d.currentAnime = &AnilistMinifiedItem{ID: s.MediaId, Title: title}
		d.status = fmt.Sprintf("Torrent %d/%d: %s", i+1, len(series), title)
		d.details.Phase = "torrents"
		d.details.Step = "replacing a torrent with an online download"
		d.details.LastError = ""
		d.details.TorrentIndex = i
		d.details.TorrentTotal = len(series)
		done := d.torrentDone[s.MediaId]
		d.mu.Unlock()
		if done {
			continue // handled before the pause
		}
		d.sendStatusUpdate()

		d.mu.Lock()
		resumeAt := d.resumeIndex
		d.mu.Unlock()
		save := func() { d.saveCurrentProgress(resumeAt) }

		// Queue what was lined up earlier first, while there is room.
		if err := d.drainReady(ctx, hooks, false, save); err != nil {
			return
		}

		// Look it up like any series: while the download queue is full this searches ahead and
		// lines the series up instead of waiting.
		gap := onlineSeriesGap
		if !d.queueHasRoom(hooks) {
			gap = onlineLookaheadGap
			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.Step = "searching ahead while the download queue is full"
			})
		}
		item := &AnimeOfflineItem{Title: title, AnilistID: s.MediaId, torrentBacked: true}
		var ready *ReadySeries
		err := d.whileOnline(ctx, title, func() error {
			r, perr := d.prepareSeries(ctx, hooks, item, gap)
			ready = r
			return perr
		})
		if ctx.Err() != nil && !errors.Is(err, errOnlineSkipped) && err != nil {
			return // interrupted: this one is tried again on resume
		}
		if err != nil {
			d.recordOnlineResult(ctx, title, err)
		} else {
			d.mu.Lock()
			d.ready = append(d.ready, ready)
			d.mu.Unlock()
		}
		// Settled for this run, found or not, so a resume does not search it all over again. A
		// torrent not found online is tried again on the next fresh start (it may have stalled
		// by then and let the backup take it).
		d.mu.Lock()
		if d.torrentDone == nil {
			d.torrentDone = make(map[int]bool)
		}
		d.torrentDone[s.MediaId] = true
		d.details.TorrentIndex = i + 1
		d.mu.Unlock()
		// Saved after every series, like the main pass.
		save()
		if err := d.drainReady(ctx, hooks, false, save); err != nil {
			return
		}
	}
	d.mu.Lock()
	d.details.TorrentIndex = len(series)
	d.mu.Unlock()
}

// recordOnlineResult files one series' outcome in the downloaded / not found / skipped tallies
// and the activity feed.
func (d *Downloader) recordOnlineResult(ctx context.Context, title string, err error) {
	d.mu.Lock()
	if d.discardProgress {
		// The run was stopped and reset; what it was finishing is not recorded.
		d.mu.Unlock()
		return
	}
	entry := ActivityEntry{Time: time.Now(), Title: title, Episodes: d.lastQueued, Provider: d.lastProvider}
	lastMisses := d.lastMisses
	d.lastMisses = nil
	if d.currentAnime != nil {
		entry.MediaId = d.currentAnime.ID
		entry.Image = d.currentAnime.CoverImage
		if t := firstTitle(d.currentAnime); t != "" {
			entry.Title = t
		}
	}
	d.lastQueued = 0
	d.lastProvider = ""
	d.processedThisRun++
	d.mu.Unlock()

	switch {
	case err == nil:
		entry.Result = "queued"
		entry.Reasons = lastMisses
	case errors.Is(err, errTorrented):
		entry.Result = "torrent"
		entry.Detail = strings.TrimPrefix(err.Error(), "torrent: ")
		entry.Reason = ReasonTorrent
		entry.Provider = "torrent"
		var th torrentHandoff
		if errors.As(err, &th) && th.source != "" && th.source != "seadex" {
			entry.Reason = torrentGuessReason(th.source)
		}
	case errors.Is(err, errOnlineSkipped):
		entry.Result = "skipped"
		entry.Detail = err.Error()
		entry.Reason, _ = explainResult(err)
	case ctx.Err() != nil:
		return
	default:
		entry.Result = "not_found"
		entry.Detail = err.Error()
		entry.Reason, entry.Reasons = explainResult(err)
	}
	if rerr := d.results.add(entry); rerr != nil {
		d.logger.Warn().Err(rerr).Msg("enmasse-anime: Could not save the result")
	}
	d.mu.Lock()
	d.recent = append([]ActivityEntry{entry}, d.recent...)
	if len(d.recent) > maxRecentActivity {
		d.recent = d.recent[:maxRecentActivity]
	}
	d.mu.Unlock()

	switch {
	case err == nil:
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.Step = "anime queued successfully"
			details.LastError = ""
		})
		d.addToDownloaded(title)
	case errors.Is(err, errTorrented):
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.Step = "sent to the torrent client"
			details.LastError = ""
		})
	case errors.Is(err, errOnlineSkipped):
		d.mu.Lock()
		d.skippedCount++
		d.mu.Unlock()
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.Step = "skipped: " + err.Error()
			details.LastError = ""
		})
	case ctx.Err() != nil:
	default:
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.Step = "anime failed"
			details.LastError = err.Error()
		})
		d.logger.Info().Err(err).Str("title", title).Msg("enmasse-anime: Not found online")
		d.addToFailed(title)
	}
}

// maxRecentActivity is how many results the activity feed keeps.
const maxRecentActivity = 60

func firstTitle(it *AnilistMinifiedItem) string {
	for _, t := range []string{it.TitleEnglish, it.TitleRomaji, it.Title} {
		if strings.TrimSpace(t) != "" {
			return t
		}
	}
	return ""
}

// waitForDownloads holds the search while the download queue is already well fed.
func (d *Downloader) waitForDownloads(ctx context.Context, hooks *OnlineHooks) error {
	if hooks.WaitingSeries == nil {
		return nil
	}
	announced := false
	for {
		waiting := hooks.WaitingSeries()
		if waiting < onlineMaxWaitingSeries {
			return nil
		}
		if !announced {
			announced = true
			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.Phase = "waiting"
				details.Step = fmt.Sprintf("waiting for downloads (%d series queued)", waiting)
			})
		}
		t := time.NewTimer(30 * time.Second)
		select {
		case <-t.C:
		case <-ctx.Done():
			t.Stop()
			return ctx.Err()
		}
	}
}

// ReadySeries is a series that has been looked up and found on a provider, waiting for room in
// the download queue. While the queue is full the run keeps looking series up and lines them up
// here; they are queued, in order, as soon as there is room. Saved with the run's progress.
type ReadySeries struct {
	// Title is the series' name in the offline database (what the activity feed records).
	Title         string              `json:"title"`
	Resolved      AnilistMinifiedItem `json:"resolved"`
	Year          int                 `json:"year,omitempty"`
	TorrentBacked bool                `json:"torrentBacked,omitempty"`
	// Provider and Match are where it was found; Rest are the providers after it, tried if the
	// series cannot be queued from Provider after all.
	Provider string        `json:"provider"`
	Match    providerMatch `json:"match"`
	Rest     []string      `json:"rest,omitempty"`
	ReadyAt  time.Time     `json:"readyAt"`
	// Misses are what the providers before Provider said.
	Misses []ProviderReason `json:"misses,omitempty"`
}

// processAnimeOnline handles one series start to finish: look it up, then queue it as soon as
// there is room. (The run itself splits the two; see run and drainReady.)
func (d *Downloader) processAnimeOnline(ctx context.Context, hooks *OnlineHooks, animeItem *AnimeOfflineItem) error {
	r, err := d.prepareSeries(ctx, hooks, animeItem, onlineSeriesGap)
	if err != nil {
		return err
	}
	if err := d.waitForDownloads(ctx, hooks); err != nil {
		return err
	}
	return d.queueReady(ctx, hooks, r)
}

// prepareSeries looks a series up: AniList, then each provider in turn until one has it. It
// does not queue anything. minGap is the least time it takes, so a run of quick skips or misses
// does not turn into a burst of searches.
func (d *Downloader) prepareSeries(ctx context.Context, hooks *OnlineHooks, animeItem *AnimeOfflineItem, minGap time.Duration) (*ReadySeries, error) {
	started := time.Now()
	defer func() {
		if rest := minGap - time.Since(started); rest > 0 {
			t := time.NewTimer(rest)
			select {
			case <-t.C:
			case <-ctx.Done():
				t.Stop()
			}
		}
	}()

	// Quick exits on what the offline database already says, before any request.
	if animeItem.AnilistID > 0 && hooks.InLibrary != nil && hooks.InLibrary(animeItem.AnilistID) {
		return nil, onlineSkip{"already in the library"}
	}
	if strings.EqualFold(animeItem.Status, "UPCOMING") {
		return nil, onlineSkip{"not aired yet"}
	}
	if animeItem.AnilistID > 0 && d.isReady(animeItem.AnilistID) {
		return nil, onlineSkip{"already lined up to be queued"}
	}

	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "processing"
		details.Step = "resolving AniList metadata"
	})
	resolve := d.resolveAniList
	if d.resolveOverride != nil {
		resolve = d.resolveOverride
	}
	resolved, err := resolve(ctx, animeItem)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve AniList: %w", err)
	}
	if resolved.ID <= 0 {
		return nil, onlineSkip{"no AniList entry, so it could not be matched"}
	}
	d.mu.Lock()
	d.currentAnime = resolved
	d.mu.Unlock()

	switch {
	case resolved.IsAdult:
		return nil, onlineSkip{"adult"}
	case resolved.Status == "NOT_YET_RELEASED":
		return nil, onlineSkip{"not aired yet"}
	case hooks.InLibrary != nil && hooks.InLibrary(resolved.ID):
		return nil, onlineSkip{"already in the library"}
	case hooks.InDownloadQueue != nil && hooks.InDownloadQueue(resolved.ID):
		return nil, onlineSkip{"already downloading"}
	case d.isReady(resolved.ID):
		return nil, onlineSkip{"already lined up to be queued"}
	}

	year := 0
	if animeItem.AnimeSeason != nil {
		year = animeItem.AnimeSeason.Year
	}
	// Kickassanime, then AniZone, AnimeHeaven and AnimePahe as the backups. A series still
	// downloading as a torrent is only taken over by Kickassanime, unless its torrent is
	// stalled: then the backups may replace it too. A healthy torrent is never replaced by a
	// backup.
	torrentBacked := animeItem.torrentBacked || (hooks.HasTorrent != nil && hooks.HasTorrent(resolved.ID))
	providers := d.providersFor(hooks, resolved.ID, torrentBacked)

	var misses []ProviderReason
	for i, p := range providers {
		m, err := d.findOnProvider(ctx, hooks, p, resolved, year)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if connectivity.IsNetworkError(err) {
				return nil, err // the internet, not the provider: tried again once it is back
			}
			misses = append(misses, ProviderReason{Provider: p, Detail: err.Error()})
			continue
		}
		return &ReadySeries{
			Title:         animeItem.Title,
			Resolved:      *resolved,
			Year:          year,
			TorrentBacked: torrentBacked,
			Provider:      p,
			Match:         *m,
			Rest:          append([]string(nil), providers[i+1:]...),
			Misses:        labelled(misses),
			ReadyAt:       time.Now(),
		}, nil
	}
	return nil, d.torrentOrNotFound(ctx, hooks, resolved, misses, torrentBacked)
}

func (d *Downloader) torrentStalled(hooks *OnlineHooks, mediaId int, torrentBacked bool) bool {
	return torrentBacked && hooks.TorrentStalled != nil && hooks.TorrentStalled(mediaId)
}

// providersFor is the provider order for a series.
func (d *Downloader) providersFor(hooks *OnlineHooks, mediaId int, torrentBacked bool) []string {
	providers := append([]string(nil), PrimaryProviders...)
	if !torrentBacked || d.torrentStalled(hooks, mediaId, torrentBacked) {
		providers = append(providers, BackupProviders...)
	}
	return providers
}

// notFoundError is a series no provider could supply, with what each one said.
type notFoundError struct {
	msg   string
	parts []ProviderReason
}

func (e *notFoundError) Error() string { return e.msg }

func newNotFound(misses []ProviderReason, torrentBacked, stalled bool) error {
	for i := range misses {
		misses[i].Reason = labelFor(misses[i].Detail)
	}
	return &notFoundError{msg: notFoundMessage(misses, torrentBacked, stalled), parts: misses}
}

func notFoundMessage(misses []ProviderReason, torrentBacked, stalled bool) string {
	details := make([]string, 0, len(misses))
	for _, m := range misses {
		details = append(details, m.Detail)
	}
	msg := strings.Join(details, "; ")
	if torrentBacked && !stalled {
		msg += " (the torrent keeps downloading)"
	} else if stalled {
		msg += " (the torrent is stalled and was left as it is)"
	}
	return msg
}

// queueReady queues a looked-up series. When its provider cannot supply it after all (no
// playable source, no episode list), the providers after it are searched and tried in turn; the
// series only counts as not found once every one has been.
func (d *Downloader) queueReady(ctx context.Context, hooks *OnlineHooks, r *ReadySeries) error {
	resolved := r.Resolved
	d.mu.Lock()
	d.currentAnime = &resolved
	d.mu.Unlock()

	// Things may have moved on while it waited.
	switch {
	case hooks.InLibrary != nil && hooks.InLibrary(resolved.ID):
		return onlineSkip{"already in the library"}
	case hooks.InDownloadQueue != nil && hooks.InDownloadQueue(resolved.ID):
		return onlineSkip{"already downloading"}
	}

	stalled := d.torrentStalled(hooks, resolved.ID, r.TorrentBacked)
	misses := append([]ProviderReason(nil), r.Misses...)
	try := func(p string, m *providerMatch) (int, bool, error) {
		d.mu.Lock()
		d.lastProvider = p
		d.mu.Unlock()
		if hooks.SaveMapping != nil {
			if err := hooks.SaveMapping(p, resolved.ID, m.ID); err != nil {
				d.logger.Warn().Err(err).Int("mediaId", resolved.ID).Msg("enmasse-anime: Could not save the provider match")
			}
		}
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.Phase = "queueing"
			details.Step = "queueing the full series for download"
			details.SelectedTorrent = m.Title
		})
		if err := d.paceRequest(ctx); err != nil {
			return 0, false, err
		}
		n, err := hooks.EnqueueSeries(ctx, p, resolved.ID)
		if err != nil {
			if ctx.Err() != nil || connectivity.IsNetworkError(err) {
				return 0, false, err
			}
			d.logger.Info().Err(err).Int("mediaId", resolved.ID).Str("provider", p).
				Msg("enmasse-anime: Found the series but could not queue it there; trying the next provider")
			misses = append(misses, ProviderReason{Provider: p, Detail: fmt.Sprintf("found on %s but could not queue it there: %v", p, err)})
			return 0, false, nil
		}
		return n, true, nil
	}

	match := r.Match
	queued, ok, err := try(r.Provider, &match)
	if err != nil {
		return err
	}
	provider := r.Provider
	for _, p := range r.Rest {
		if ok {
			break
		}
		m, ferr := d.findOnProvider(ctx, hooks, p, &resolved, r.Year)
		if ferr != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if connectivity.IsNetworkError(ferr) {
				return ferr
			}
			misses = append(misses, ProviderReason{Provider: p, Detail: ferr.Error()})
			continue
		}
		match = *m
		if queued, ok, err = try(p, m); err != nil {
			return err
		}
		provider = p
	}
	if !ok {
		_ = stalled
		resolvedCopy := r.Resolved
		return d.torrentOrNotFound(ctx, hooks, &resolvedCopy, misses, r.TorrentBacked)
	}
	if queued == 0 {
		return onlineSkip{"nothing to download (every episode is already in the library or the queue)"}
	}

	d.mu.Lock()
	d.lastMisses = labelled(misses)
	d.lastQueued = queued
	d.mu.Unlock()
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Step = fmt.Sprintf("queued %d episodes", queued)
		details.EpisodesQueued += queued
	})
	// The main provider replaces a torrent; the backup only replaces a stalled one.
	if (isPrimaryProvider(provider) || stalled) && hooks.TakeOverTorrents != nil {
		hooks.TakeOverTorrents(resolved.ID)
	}
	if d.OnAnimeQueued != nil {
		d.OnAnimeQueued(resolved.ID)
	}
	d.logger.Info().Int("mediaId", resolved.ID).Str("title", resolved.TitleRomaji).Str("provider", provider).Str("match", match.Title).
		Int("episodes", queued).Msg("enmasse-anime: Queued the series for online download")
	return nil
}

// providerMatch is the provider entry chosen for a series.
type providerMatch struct {
	ID       string
	Title    string
	Score    float64
	Episodes int
}

// findOnProvider searches the provider with every spelling of the series and returns the entry
// whose title is closest to one of them, provided it is close enough and has episodes.
func (d *Downloader) findOnProvider(ctx context.Context, hooks *OnlineHooks, provider string, item *AnilistMinifiedItem, year int) (*providerMatch, error) {
	titles := seriesTitles(item)
	queries := onlineSearchQueries(titles)
	if len(queries) == 0 {
		return nil, fmt.Errorf("no title to search for")
	}

	english := item.TitleEnglish
	media := hibikeonlinestream.Media{
		ID:           item.ID,
		Status:       item.Status,
		Format:       item.Format,
		EnglishTitle: &english,
		RomajiTitle:  item.TitleRomaji,
		EpisodeCount: item.Episodes,
		Synonyms:     item.Synonyms,
		IsAdult:      item.IsAdult,
	}
	if year > 0 {
		media.StartDate = &hibikeonlinestream.FuzzyDate{Year: year}
	}

	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "searching"
		details.Step = "searching " + provider
		details.CurrentProvider = provider
		details.ProvidersTotal = 1
		details.ProvidersDone = 0
		details.VariantsTotal = len(queries)
		details.VariantIndex = 0
		details.TorrentsCollected = 0
		details.SelectedTorrent = ""
	})

	if until, blocked := providerBlockedUntil(provider); blocked {
		return nil, fmt.Errorf("%w: %s is refusing this server (Cloudflare check); not searched again until %s", ErrProviderBlocked, provider, until.Format("15:04"))
	}

	seen := make(map[string]bool)
	var candidates []*providerMatch
	var best *providerMatch
	var lastErr error
	for i, q := range queries {
		if best != nil && best.Score >= onlineSureSimilarity {
			break
		}
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.CurrentQuery = q
			details.VariantIndex = i + 1
		})
		if err := d.paceRequest(ctx); err != nil {
			return nil, err
		}
		results, err := hooks.Search(provider, hibikeonlinestream.SearchOptions{Media: media, Query: q, Year: year})
		if err != nil {
			// A provider that refuses the server (403, a Cloudflare check) refuses every
			// spelling: it is left alone for a while instead of being asked 14 times per series.
			if connectivity.IsNetworkError(err) {
				return nil, err
			}
			if isBlockedError(err) {
				until := blockProvider(provider)
				d.logger.Warn().Err(err).Str("provider", provider).Time("until", until).Msg("enmasse-anime: The provider is refusing this server; skipping it for now")
				return nil, fmt.Errorf("%w: %s is refusing this server (%v); not searched again until %s", ErrProviderBlocked, provider, err, until.Format("15:04"))
			}
			lastErr = err
			continue
		}
		for _, r := range results {
			if r == nil || r.ID == "" || seen[r.ID] {
				continue
			}
			seen[r.ID] = true
			score := bestTitleSimilarity(r.Title, titles)
			if score < onlineMinSimilarity {
				continue
			}
			c := &providerMatch{ID: r.ID, Title: r.Title, Score: score}
			candidates = append(candidates, c)
			if best == nil || c.Score > best.Score {
				best = c
			}
		}
		d.updateDetails(func(details *AnimeDownloaderDetails) { details.TorrentsCollected = len(candidates) })
	}

	if len(candidates) == 0 {
		if lastErr != nil {
			return nil, fmt.Errorf("not found on %s (last search error: %v)", provider, lastErr)
		}
		return nil, fmt.Errorf("not found on %s (tried %d spellings)", provider, len(queries))
	}

	// Best title first; the episode list decides between close titles (a TV series and its
	// movie of the same name) and rules out empty entries.
	sortMatches(candidates)
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "verifying"
		details.Step = "checking the episode list"
	})
	var reasons []string
	for i, c := range candidates {
		if i >= 3 {
			break
		}
		if err := d.paceRequest(ctx); err != nil {
			return nil, err
		}
		eps, err := hooks.FindEpisodes(provider, c.ID)
		if err != nil && connectivity.IsNetworkError(err) {
			return nil, err // the connection, not the site: waited out and tried again
		}
		if err != nil || len(eps) == 0 {
			// The site lists the title but has no episodes for it (no language available), or
			// the episode list could not be read.
			reasons = append(reasons, fmt.Sprintf("%q is listed on %s but has no episodes", c.Title, provider))
			continue
		}
		c.Episodes = len(eps)
		if !episodeCountFits(item, c.Episodes) {
			reasons = append(reasons, fmt.Sprintf("%q on %s has %d episodes, the series has %d", c.Title, provider, c.Episodes, item.Episodes))
			continue
		}
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.ProvidersDone = 1
			details.SelectedTorrent = fmt.Sprintf("%s (%d episodes)", c.Title, c.Episodes)
		})
		return c, nil
	}
	if len(reasons) > 0 {
		return nil, errors.New(reasons[0])
	}
	return nil, fmt.Errorf("found %q on %s, but its episode list does not fit the series", candidates[0].Title, provider)
}

func sortMatches(m []*providerMatch) {
	for i := 1; i < len(m); i++ {
		for j := i; j > 0 && m[j].Score > m[j-1].Score; j-- {
			m[j], m[j-1] = m[j-1], m[j]
		}
	}
}

// episodeCountFits rejects a provider entry whose episode count cannot be this series: a movie
// listed with dozens of episodes, or a finished 24-episode series with only 3.
func episodeCountFits(item *AnilistMinifiedItem, got int) bool {
	if got <= 0 {
		return false
	}
	want := item.Episodes
	if want <= 0 {
		return true // unknown or still airing without a count
	}
	if strings.EqualFold(item.Format, "MOVIE") {
		return got <= 3
	}
	if got > want*2+2 {
		return false
	}
	if item.Status == "FINISHED" && got*2 < want {
		return false
	}
	return true
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Titles and spellings
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// seriesTitles is every name the series goes by: English, romaji and the synonyms written in
// Latin script (the provider has no use for the others).
func seriesTitles(item *AnilistMinifiedItem) []string {
	var out []string
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" || !mostlyLatin(s) {
			return
		}
		for _, o := range out {
			if strings.EqualFold(o, s) {
				return
			}
		}
		out = append(out, s)
	}
	add(item.TitleEnglish)
	add(item.TitleRomaji)
	add(item.Title)
	for _, s := range item.Synonyms {
		add(s)
	}
	return out
}

func mostlyLatin(s string) bool {
	letters, latin := 0, 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			letters++
			if r < 0x250 {
				latin++
			}
		}
	}
	return letters > 0 && latin*10 >= letters*8
}

var (
	seasonWordRe   = regexp.MustCompile(`(?i)\b(?:season|s)\s*(\d+)\b`)
	seasonOrdRe    = regexp.MustCompile(`(?i)\b(\d+)(?:st|nd|rd|th)\s+season\b`)
	romanSuffixRe  = regexp.MustCompile(`\s+(II|III|IV|V|VI)$`)
	yearParenRe    = regexp.MustCompile(`\s*\((?:19|20)\d\d\)\s*`)
	tvParenRe      = regexp.MustCompile(`(?i)\s*\((?:tv|ona|ova)\)\s*`)
	nonWordRe      = regexp.MustCompile(`[^\p{L}\p{N}]+`)
	romanToNumbers = map[string]string{"II": "2", "III": "3", "IV": "4", "V": "5", "VI": "6"}
)

// onlineSearchQueries builds the spellings to search for, most likely first: each title as
// written, without punctuation, with its season written the other common ways, and its main
// title before a colon (which finds entries named only by the franchise).
func onlineSearchQueries(all []string) []string {
	var titles []string
	for _, t := range all {
		if mostlyLatin(t) {
			titles = append(titles, t)
		}
	}
	var out []string
	add := func(s string) {
		s = strings.Join(strings.Fields(s), " ")
		if len([]rune(s)) < 2 {
			return
		}
		for _, o := range out {
			if strings.EqualFold(o, s) {
				return
			}
		}
		out = append(out, s)
	}

	for _, t := range titles {
		add(t)
	}
	for _, t := range titles {
		clean := tvParenRe.ReplaceAllString(yearParenRe.ReplaceAllString(t, " "), " ")
		add(clean)
		add(stripPunctuation(clean))
		add(strings.ReplaceAll(clean, "&", "and"))
		add(foldAccents(clean))

		// Season spellings: "Season 2" / "2nd Season" / "S2" / "II".
		if m := seasonWordRe.FindStringSubmatch(clean); m != nil {
			add(seasonWordRe.ReplaceAllString(clean, ordinal(m[1])+" Season"))
			add(seasonWordRe.ReplaceAllString(clean, m[1]))
		}
		if m := seasonOrdRe.FindStringSubmatch(clean); m != nil {
			add(seasonOrdRe.ReplaceAllString(clean, "Season "+m[1]))
		}
		if m := romanSuffixRe.FindStringSubmatch(clean); m != nil {
			add(romanSuffixRe.ReplaceAllString(clean, " Season "+romanToNumbers[m[1]]))
		}
	}
	// Franchise names last: broad searches whose results the title check narrows down.
	for _, t := range titles {
		if i := strings.IndexAny(t, ":-–"); i > 3 {
			add(strings.TrimSpace(t[:i]))
		}
	}

	if len(out) > onlineMaxVariants {
		out = out[:onlineMaxVariants]
	}
	return out
}

func ordinal(n string) string {
	switch {
	case strings.HasSuffix(n, "11"), strings.HasSuffix(n, "12"), strings.HasSuffix(n, "13"):
		return n + "th"
	case strings.HasSuffix(n, "1"):
		return n + "st"
	case strings.HasSuffix(n, "2"):
		return n + "nd"
	case strings.HasSuffix(n, "3"):
		return n + "rd"
	}
	return n + "th"
}

func stripPunctuation(s string) string {
	return strings.TrimSpace(nonWordRe.ReplaceAllString(s, " "))
}

func foldAccents(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(s) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// normalizeTitle reduces a title to lowercase words for comparison: no punctuation, accents,
// season wording or the year.
func normalizeTitle(s string) string {
	s = foldAccents(strings.ToLower(s))
	s = yearParenRe.ReplaceAllString(s, " ")
	s = tvParenRe.ReplaceAllString(s, " ")
	s = seasonOrdRe.ReplaceAllString(s, "season $1")
	s = seasonWordRe.ReplaceAllString(s, "season $1")
	s = strings.ReplaceAll(s, "&", " and ")
	return strings.Join(strings.Fields(nonWordRe.ReplaceAllString(s, " ")), " ")
}

// bestTitleSimilarity is how close a provider title is to the closest of the series' titles,
// from 0 to 1.
func bestTitleSimilarity(candidate string, titles []string) float64 {
	c := normalizeTitle(candidate)
	best := 0.0
	for _, t := range titles {
		if s := similarity(c, normalizeTitle(t)); s > best {
			best = s
		}
	}
	return best
}

// similarity is 1 minus the edit distance relative to the longer string.
func similarity(a, b string) float64 {
	if a == "" || b == "" {
		return 0
	}
	if a == b {
		return 1
	}
	ra, rb := []rune(a), []rune(b)
	prev := make([]int, len(rb)+1)
	cur := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	longest := max(len(ra), len(rb))
	return 1 - float64(prev[len(rb)])/float64(longest)
}

// MatchOnProvider finds an anime on an online provider the way the en masse downloader does:
// every title, synonym and spelling, a close title match, and an episode list that fits. Used
// outside a run, for a download that has to fall back to another provider. It returns the
// provider's id and title for the anime, or an error when the provider does not have it.
func MatchOnProvider(ctx context.Context, logger *zerolog.Logger, hooks *OnlineHooks, provider string, media *anilist.BaseAnime) (id string, title string, err error) {
	if media == nil || hooks == nil || hooks.Search == nil || hooks.FindEpisodes == nil {
		return "", "", errors.New("nothing to search with")
	}
	d := NewDownloader(&NewDownloaderOptions{Logger: logger})
	item := d.minifyBaseAnime(media)
	match, err := d.findOnProvider(ctx, hooks, provider, item, media.GetStartYearSafe())
	if err != nil {
		return "", "", err
	}
	return match.ID, match.Title, nil
}

// ErrProviderBlocked is returned for a provider that is refusing this server (HTTP 403, a
// Cloudflare check). Such a provider is skipped for providerBlockFor before it is tried again.
var ErrProviderBlocked = errors.New("the provider is refusing this server")

var providerBlockFor = 30 * time.Minute

var (
	providerBlocksMu sync.Mutex
	providerBlocks   = map[string]time.Time{}
)

func isBlockedError(err error) bool {
	if err == nil {
		return false
	}
	l := strings.ToLower(err.Error())
	return strings.Contains(l, "403") || strings.Contains(l, "forbidden") || strings.Contains(l, "cloudflare") ||
		strings.Contains(l, "challenge")
}

func blockProvider(provider string) time.Time {
	providerBlocksMu.Lock()
	defer providerBlocksMu.Unlock()
	until := time.Now().Add(providerBlockFor)
	providerBlocks[provider] = until
	return until
}

func providerBlockedUntil(provider string) (time.Time, bool) {
	providerBlocksMu.Lock()
	defer providerBlocksMu.Unlock()
	until, ok := providerBlocks[provider]
	if !ok || time.Now().After(until) {
		delete(providerBlocks, provider)
		return time.Time{}, false
	}
	return until, true
}

// ClearProviderBlock lets a provider be searched again straight away (after it was unlocked).
func ClearProviderBlock(provider string) {
	providerBlocksMu.Lock()
	defer providerBlocksMu.Unlock()
	delete(providerBlocks, provider)
}

// offlineSiteRetries is how often a series is tried again after a network failure while the
// internet itself stays up (the site was unreachable), before its result is recorded.
const offlineSiteRetries = 3

// processWhileOnline handles one series, but never while the internet is down: it waits for the
// connection first, and when the series fails because the connection dropped it waits for it to
// come back and handles the same series again. Nothing is recorded as not found while offline.
func (d *Downloader) processWhileOnline(ctx context.Context, hooks *OnlineHooks, item *AnimeOfflineItem) error {
	return d.whileOnline(ctx, item.Title, func() error { return d.processAnimeOnline(ctx, hooks, item) })
}

// whileOnline runs fn, but never while the internet is down: it waits for the connection first,
// and when fn fails because the connection dropped it waits for it and runs fn again.
func (d *Downloader) whileOnline(ctx context.Context, title string, fn func() error) error {
	siteFailures := 0
	for {
		if err := d.waitForInternet(ctx); err != nil {
			return err
		}
		err := fn()
		if err == nil || ctx.Err() != nil || !connectivity.IsNetworkError(err) {
			return err
		}
		d.logger.Warn().Err(err).Str("title", title).Msg("enmasse-anime: Network failure; checking the connection before trying the series again")
		waited, werr := d.settleAfterNetworkError(ctx)
		if werr != nil {
			return werr
		}
		if !waited {
			siteFailures++
			if siteFailures >= offlineSiteRetries {
				return err
			}
		}
	}
}

// waitForInternet holds the run while the server has no internet connection, as long as it
// takes, and says so on the page.
func (d *Downloader) waitForInternet(ctx context.Context) error {
	if !connectivity.IsOffline() {
		return nil
	}
	d.logger.Warn().Msg("enmasse-anime: No internet connection; waiting for it to come back")
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "offline"
		details.Step = "no internet connection: waiting for it to come back"
	})
	d.setStatus("No internet connection: waiting for it to come back")
	if err := connectivity.WaitOnline(ctx); err != nil {
		return err
	}
	d.logger.Info().Msg("enmasse-anime: The internet connection is back; continuing")
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "processing"
		details.Step = "internet connection back: continuing"
	})
	d.setStatus("Internet connection back: continuing")
	return nil
}

// settleAfterNetworkError gives the connection check time to decide after a request failed on
// the network; if the internet is down it waits until it is back. Returns true when it waited.
func (d *Downloader) settleAfterNetworkError(ctx context.Context) (bool, error) {
	connectivity.ReportNetworkFailure()
	deadline := time.Now().Add(offlineSettleWindow)
	for time.Now().Before(deadline) {
		if connectivity.IsOffline() {
			return true, d.waitForInternet(ctx)
		}
		t := time.NewTimer(2 * time.Second)
		select {
		case <-ctx.Done():
			t.Stop()
			return false, ctx.Err()
		case <-t.C:
		}
		connectivity.ReportNetworkFailure()
	}
	return false, nil
}

// offlineSettleWindow is how long settleAfterNetworkError gives the probes to agree.
var offlineSettleWindow = 45 * time.Second

// readyAheadMax caps how far the run looks ahead while the download queue is full.
var readyAheadMax = 100

// onlineLookaheadGap is the least time a series takes to look up while the run is searching
// ahead (the download queue is full): gentler than the normal pace, since nothing is waiting on it.
var onlineLookaheadGap = 45 * time.Second

func (d *Downloader) isReady(mediaId int) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, r := range d.ready {
		if r.Resolved.ID == mediaId {
			return true
		}
	}
	return false
}

func (d *Downloader) readyCount() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.ready)
}

// queueHasRoom reports whether another series may be queued (fewer than onlineMaxWaitingSeries
// en masse series waiting).
func (d *Downloader) queueHasRoom(hooks *OnlineHooks) bool {
	return hooks.WaitingSeries == nil || hooks.WaitingSeries() < onlineMaxWaitingSeries
}

// drainReady queues lined-up series, oldest first, while the download queue has room. With
// untilEmpty it waits for room until the list is empty (the end of the run); otherwise it returns
// as soon as the queue is full, unless the list itself is full, when it waits for room too.
// save is called after each series so a pause or restart keeps the list as it is.
func (d *Downloader) drainReady(ctx context.Context, hooks *OnlineHooks, untilEmpty bool, save func()) error {
	announced := false
	for {
		n := d.readyCount()
		if n == 0 {
			return nil
		}
		if !d.queueHasRoom(hooks) {
			if !untilEmpty && n < readyAheadMax {
				return nil
			}
			if !announced {
				announced = true
				d.updateDetails(func(details *AnimeDownloaderDetails) {
					details.Phase = "waiting"
					details.Step = fmt.Sprintf("waiting for downloads: %d series lined up to queue", n)
				})
				d.setStatus(fmt.Sprintf("Waiting for downloads: %d series lined up to queue", n))
			}
			t := time.NewTimer(30 * time.Second)
			select {
			case <-t.C:
			case <-ctx.Done():
				t.Stop()
				return ctx.Err()
			}
			continue
		}
		announced = false

		d.mu.Lock()
		r := d.ready[0]
		d.mu.Unlock()
		d.setStatus(fmt.Sprintf("Queueing %s (lined up earlier)", firstTitle(&r.Resolved)))
		err := d.whileOnline(ctx, r.Title, func() error { return d.queueReady(ctx, hooks, r) })
		if ctx.Err() != nil {
			return ctx.Err() // stays at the front of the list for the resume
		}
		d.mu.Lock()
		if len(d.ready) > 0 && d.ready[0] == r {
			d.ready = d.ready[1:]
		}
		d.mu.Unlock()
		d.recordOnlineResult(ctx, r.Title, err)
		save()
	}
}

// ReadyPreview is a lined-up series as the page shows it.
type ReadyPreview struct {
	MediaId  int       `json:"mediaId"`
	Title    string    `json:"title"`
	Image    string    `json:"image,omitempty"`
	Provider string    `json:"provider"`
	Episodes int       `json:"episodes,omitempty"`
	ReadyAt  time.Time `json:"readyAt"`
}

func (d *Downloader) readyPreviewLocked() []ReadyPreview {
	out := make([]ReadyPreview, 0, len(d.ready))
	for _, r := range d.ready {
		title := firstTitle(&r.Resolved)
		if title == "" {
			title = r.Title
		}
		out = append(out, ReadyPreview{MediaId: r.Resolved.ID, Title: title, Image: r.Resolved.CoverImage,
			Provider: r.Provider, Episodes: r.Resolved.Episodes, ReadyAt: r.ReadyAt})
	}
	return out
}

// errTorrented marks a series handed to the torrent client after every streaming provider came up
// empty.
var errTorrented = errors.New("sent to the torrent client")

type torrentHandoff struct{ name, source string }

func (e torrentHandoff) Error() string        { return "torrent: " + e.name }
func (e torrentHandoff) Is(target error) bool { return target == errTorrented }

// torrentOrNotFound is the last resort for a series every streaming provider (AnimeHeaven and
// AnimePahe included) came up empty for: a torrent, picked the way Enqueue Future's auto torrent
// does (SeaDex first) and sent to the client auto-matched. It starts in the torrent client, lands
// in unmatched when it is moved, and is matched into the library when it completes. A series that
// is already downloading as a torrent is left as it is.
func (d *Downloader) torrentOrNotFound(ctx context.Context, hooks *OnlineHooks, resolved *AnilistMinifiedItem, misses []ProviderReason, torrentBacked bool) error {
	stalled := d.torrentStalled(hooks, resolved.ID, torrentBacked)
	if torrentBacked || hooks.TorrentFallback == nil {
		return newNotFound(misses, torrentBacked, stalled)
	}
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "searching"
		details.Step = "no streaming provider has it: looking for a torrent on SeaDex"
		details.CurrentProvider = "torrent"
	})
	if err := d.paceRequest(ctx); err != nil {
		return err
	}
	name, reason, err := hooks.TorrentFallback(ctx, resolved.ID)
	switch {
	case ctx.Err() != nil:
		return ctx.Err()
	case err != nil:
		if connectivity.IsNetworkError(err) {
			return err
		}
		misses = append(misses, ProviderReason{Provider: "torrent", Detail: "torrent: " + err.Error()})
	case name == "":
		if reason == "" {
			reason = "no torrent passed the rules"
		}
		misses = append(misses, ProviderReason{Provider: "torrent", Detail: "torrent: " + reason})
	default:
		source := "seadex"
		if hooks.TorrentSource != nil {
			if s := hooks.TorrentSource(resolved.ID); s != "" {
				source = s
			}
		}
		d.logger.Info().Int("mediaId", resolved.ID).Str("torrent", name).Str("source", source).Msg("enmasse-anime: No streaming provider has it; sent a torrent to the client")
		if d.OnAnimeQueued != nil {
			d.OnAnimeQueued(resolved.ID)
		}
		d.mu.Lock()
		d.lastMisses = labelled(misses)
		d.mu.Unlock()
		return torrentHandoff{name: name, source: source}
	}
	return newNotFound(misses, torrentBacked, stalled)
}

// labelled gives each provider's miss its short label.
func labelled(misses []ProviderReason) []ProviderReason {
	out := make([]ProviderReason, 0, len(misses))
	for _, m := range misses {
		if m.Reason == "" {
			m.Reason = labelFor(m.Detail)
		}
		out = append(out, m)
	}
	return out
}

// torrentGuessReason labels a torrent that was a best guess on a provider other than SeaDex.
func torrentGuessReason(source string) string {
	switch source {
	case "animetosho":
		return ReasonTorrentTosho
	case "nyaa":
		return "Torrent (Nyaa guess)"
	}
	return "Torrent (" + source + " guess)"
}
