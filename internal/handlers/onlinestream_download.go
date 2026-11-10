package handlers

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/core"
	"seanime/internal/database/db_bridge"
	"seanime/internal/events"
	"seanime/internal/library/anime"
	onlinestream_download "seanime/internal/onlinestream/download"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/unmatched"
	"seanime/internal/util"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// wireOnlinestreamDownloader creates the download queue for online streaming providers. The
// queue lives on the App; the handler supplies the library side — where files go and how a
// finished file is recorded as a matched local file.
func (h *Handler) wireOnlinestreamDownloader(app *core.App) {
	if app.OnlinestreamDownloader != nil || app.OnlinestreamRepository == nil {
		return
	}
	defer h.backfillOnlineDownloadBadges()
	app.OnlinestreamDownloader = onlinestream_download.NewManager(onlinestream_download.NewManagerOptions{
		Logger:         app.Logger,
		WSEventManager: app.WSEventManager,
		Repository:     app.OnlinestreamRepository,
		WorkDir:        filepath.Join(app.Config.Cache.Dir, "onlinestream-downloads"),
		StatePath:      filepath.Join(app.Config.Data.AppDataDir, "onlinestream-download-queue.json"),
		LibraryPath: func() string {
			p, err := app.Database.GetLibraryPathFromSettings()
			if err != nil {
				return ""
			}
			return p
		},
		Destination: func(media *anilist.BaseAnime, episode int) (string, string) {
			if app.UnmatchedRepository == nil || media == nil {
				return "", ""
			}
			// Same title the Unmatched screen files a match under: the romaji title.
			title := media.GetRomajiTitleSafe()
			if title == "" {
				title = media.GetTitleSafe()
			}
			format := ""
			if media.Format != nil {
				format = string(*media.Format)
			}
			return app.UnmatchedRepository.LibraryDestination(media.ID, title, episode, format, media.GetStartYearSafe(), ".mkv")
		},
		FfmpegPath: func() string {
			if ms := app.SecondarySettings.Mediastream; ms != nil && ms.FfmpegPath != "" {
				return ms.FfmpegPath
			}
			return "ffmpeg"
		},
		FfprobePath: func() string {
			if ms := app.SecondarySettings.Mediastream; ms != nil && ms.FfprobePath != "" {
				return ms.FfprobePath
			}
			return "ffprobe"
		},
		Register:         h.registerOnlinestreamDownload,
		LibraryFileOwner: h.onlinestreamLibraryFileOwner,
		MapProvider:      h.mapOnlineProvider,
		SeriesFailing: func(mediaId int) {
			res := h.torrentInsteadOfOnline(context.Background(), h.App.OnlinestreamDownloader, []int{mediaId})
			for _, r := range res {
				h.App.Logger.Info().Int("mediaId", r.MediaId).Str("torrent", r.Torrent).Str("reason", r.Reason).
					Msg("onlinestream download: Failing en masse series handed to the torrent fallback")
			}
		},
		EpisodeFiles: h.onlinestreamEpisodeFiles,
		ReplaceOld:   h.replaceOldEpisodeFiles,
	})
}

// backfillOnlineDownloadBadges fixes the badges of series that are in the library but still read
// "downloading": series downloaded online after a torrent had once been queued for them, from
// before the online downloader recorded the badge itself, whatever their history says. Only when
// nothing is actually downloading them — no unfinished torrent in the client and nothing in the
// online queue — so a series with another season genuinely coming down keeps its badge.
//
// Runs in the background a couple of minutes after start, once the torrent client has connected:
// without the client's list it cannot tell a stale badge from a live download, so it does nothing.
func (h *Handler) backfillOnlineDownloadBadges() {
	if h.App.UnmatchedRepository == nil {
		return
	}
	go func() {
		defer util.HandlePanicInModuleThen("handlers/backfillOnlineDownloadBadges", func() {})
		time.Sleep(2 * time.Minute)

		client := h.App.TorrentClientRepositoryRef
		if client == nil || client.Get() == nil {
			h.App.Logger.Debug().Msg("onlinestream download: No torrent client; download badges left as they are")
			return
		}
		torrents, err := client.Get().GetList(&torrent_client.GetListOptions{})
		if err != nil {
			h.App.Logger.Debug().Err(err).Msg("onlinestream download: Torrent client unavailable; download badges left as they are")
			return
		}
		torrentActive := make(map[int]bool)
		for _, tor := range torrents {
			if tor == nil || tor.Progress >= 1 || tor.Status == torrent_client.TorrentStatusSeeding {
				continue
			}
			if meta := h.App.UnmatchedRepository.GetTorrentMetadata(tor.Name); meta != nil && meta.AnimeID > 0 {
				torrentActive[meta.AnimeID] = true
			}
		}

		onlineActive := func(int) bool { return false }
		if m := h.App.OnlinestreamDownloader; m != nil {
			onlineActive = m.HasActive
		}

		ids := staleDownloadingBadges(h.App.UnmatchedRepository.AnimeDownloadStates(), h.animeWithLocalFiles(), torrentActive, onlineActive)
		for _, id := range ids {
			h.App.UnmatchedRepository.MarkAnimeMatchedState(id)
		}
		if len(ids) > 0 {
			h.App.Logger.Info().Int("series", len(ids)).Ints("mediaIds", ids).
				Msg("onlinestream download: Set the library badge on series that are in the library with nothing downloading")
		}
	}()
}

// staleDownloadingBadges picks the anime whose recorded "downloading" badge is stale: the library
// has their episodes and neither a torrent nor the online queue is downloading them.
func staleDownloadingBadges(states []unmatched.AnimeDownloadState, inLibrary map[int]struct{}, torrentActive map[int]bool, onlineActive func(int) bool) []int {
	out := make([]int, 0)
	for _, st := range states {
		if st.State != unmatched.DownloadStateDownloading {
			continue
		}
		if _, ok := inLibrary[st.MediaID]; !ok {
			continue
		}
		if torrentActive[st.MediaID] || onlineActive(st.MediaID) {
			continue
		}
		out = append(out, st.MediaID)
	}
	sort.Ints(out)
	return out
}

// onlinestreamEpisodeFiles lists the library files of an anime episode, whatever their source.
func (h *Handler) onlinestreamEpisodeFiles(mediaId int, episode int) []string {
	return h.libraryEpisodeFiles(mediaId)[episode]
}

// libraryEpisodeFiles maps each main episode of an anime to its library files.
func (h *Handler) libraryEpisodeFiles(mediaId int) map[int][]string {
	out := make(map[int][]string)
	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return out
	}
	for _, lf := range lfs {
		if lf.MediaId != mediaId || lf.Metadata == nil || lf.Metadata.Type != anime.LocalFileTypeMain || lf.Metadata.Episode <= 0 {
			continue
		}
		out[lf.Metadata.Episode] = append(out[lf.Metadata.Episode], lf.Path)
	}
	return out
}

// replaceOldEpisodeFiles finishes an overwrite: the new file for the episode is saved and
// registered at keepPath, so every other library file of that episode is dropped from the
// library and deleted from disk.
func (h *Handler) replaceOldEpisodeFiles(mediaId int, episode int, keepPath string) error {
	keep := util.NormalizePath(keepPath)
	var removed []string

	injectMu.Lock()
	lfs, lfsId, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		injectMu.Unlock()
		return err
	}
	kept := make([]*anime.LocalFile, 0, len(lfs))
	for _, lf := range lfs {
		if lf.MediaId == mediaId && lf.Metadata != nil && lf.Metadata.Type == anime.LocalFileTypeMain &&
			lf.Metadata.Episode == episode && !strings.EqualFold(lf.GetNormalizedPath(), keep) {
			removed = append(removed, lf.Path)
			continue
		}
		kept = append(kept, lf)
	}
	if len(removed) > 0 {
		if _, err := db_bridge.SaveLocalFiles(h.App.Database, lfsId, kept); err != nil {
			injectMu.Unlock()
			return err
		}
	}
	injectMu.Unlock()

	var lastErr error
	for _, p := range removed {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			lastErr = err
			h.App.Logger.Warn().Err(err).Str("path", p).Msg("onlinestream download: Could not delete the old copy of an overwritten episode")
			continue
		}
		h.App.Logger.Info().Str("path", p).Int("mediaId", mediaId).Int("episode", episode).
			Msg("onlinestream download: Deleted the old copy of an overwritten episode")
	}
	if len(removed) > 0 && h.App.WSEventManager != nil {
		h.App.WSEventManager.SendEvent(events.InvalidateQueries, []string{events.GetLocalFilesEndpoint, events.GetAnimeEntryEndpoint})
	}
	return lastErr
}

// HandleGetOnlinestreamDownloadExisting
//
//	@summary returns the episodes of an anime that are already in the library, with their files.
//	@desc The client asks about overwriting these before downloading them again.
//	@route /api/v1/onlinestream/download/existing [POST]
//	@returns []handlers.OnlinestreamExistingEpisode
func (h *Handler) HandleGetOnlinestreamDownloadExisting(c echo.Context) error {
	type body struct {
		MediaId int `json:"mediaId"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	byEpisode := h.libraryEpisodeFiles(b.MediaId)
	out := make([]OnlinestreamExistingEpisode, 0, len(byEpisode))
	for ep, paths := range byEpisode {
		names := make([]string, 0, len(paths))
		for _, p := range paths {
			names = append(names, filepath.Base(p))
		}
		out = append(out, OnlinestreamExistingEpisode{EpisodeNumber: ep, Files: names})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].EpisodeNumber < out[j].EpisodeNumber })
	return h.RespondWithData(c, out)
}

// OnlinestreamExistingEpisode is an episode the library already has.
type OnlinestreamExistingEpisode struct {
	EpisodeNumber int      `json:"episodeNumber"`
	Files         []string `json:"files"`
}

// onlinestreamLibraryFileOwner reports which anime and episode the library has a file matched
// to. A file left on disk after unmatching is matched to nothing, so a download may replace it.
func (h *Handler) onlinestreamLibraryFileOwner(path string) (int, int, bool) {
	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return 0, 0, false
	}
	target := util.NormalizePath(path)
	for _, lf := range lfs {
		if lf.MediaId <= 0 || !strings.EqualFold(lf.GetNormalizedPath(), target) {
			continue
		}
		ep := 0
		if lf.Metadata != nil {
			ep = lf.Metadata.Episode
		}
		return lf.MediaId, ep, true
	}
	return 0, 0, false
}

// registerOnlinestreamDownload records a downloaded episode as a locked local file matched to
// its media and episode — the same entry a match from the Unmatched screen injects — so it shows
// as downloaded and plays locally without a scan or a manual match.
func (h *Handler) registerOnlinestreamDownload(mediaId int, episode int, path string) error {
	libraryPaths, err := h.App.Database.GetAllLibraryPathsFromSettings()
	if err != nil || len(libraryPaths) == 0 {
		return errors.New("no library folder is set")
	}

	lf := anime.NewLocalFileS(path, libraryPaths)
	lf.MediaId = mediaId
	lf.Locked = true
	lf.Ignored = false
	lf.Metadata = &anime.LocalFileMetadata{
		Episode:      episode,
		AniDBEpisode: strconv.Itoa(episode),
		Type:         anime.LocalFileTypeMain,
	}

	func() {
		injectMu.Lock()
		defer injectMu.Unlock()

		existing, lfsId, lfsErr := db_bridge.GetLocalFiles(h.App.Database)
		if lfsErr != nil {
			err = lfsErr
			return
		}
		normalized := lf.GetNormalizedPath()
		merged := make([]*anime.LocalFile, 0, len(existing)+1)
		for _, e := range existing {
			if strings.EqualFold(e.GetNormalizedPath(), normalized) {
				continue
			}
			merged = append(merged, e)
		}
		merged = append(merged, lf)
		_, err = db_bridge.SaveLocalFiles(h.App.Database, lfsId, merged)
	}()
	if err != nil {
		return err
	}

	h.App.Logger.Info().Str("path", path).Int("mediaId", mediaId).Int("episode", episode).
		Msg("onlinestream download: Registered the episode in the library")

	// The library badge, the same one a match from the Unmatched screen gives. It also replaces a
	// "downloading" state left by a torrent this series once had, which otherwise outranks the
	// files and keeps the series badged as downloading after it is in the library.
	if h.App.UnmatchedRepository != nil {
		h.App.UnmatchedRepository.MarkAnimeMatchedState(mediaId)
	}

	// The library only lists anime that are on a list, same as a manual match.
	if added, addErr := h.addAnimeToPlanningIfAbsent(context.Background(), mediaId); addErr != nil {
		h.App.Logger.Warn().Err(addErr).Int("mediaId", mediaId).Msg("onlinestream download: Failed to add the anime to the planning list")
	} else if added {
		h.App.Logger.Info().Int("mediaId", mediaId).Msg("onlinestream download: Added the anime to the planning list")
	}

	if h.App.WSEventManager != nil {
		h.App.WSEventManager.SendEvent(events.InvalidateQueries, []string{
			events.GetLocalFilesEndpoint,
			events.GetAnimeEntryEndpoint,
			events.GetLibraryCollectionEndpoint,
			events.GetMissingEpisodesEndpoint,
		})
	}
	h.scheduleAnimeCollectionRefresh()
	return nil
}

func (h *Handler) onlinestreamDownloader() (*onlinestream_download.Manager, error) {
	if h.App.OnlinestreamDownloader == nil {
		return nil, errors.New("online stream downloads are unavailable")
	}
	return h.App.OnlinestreamDownloader, nil
}

// HandleOnlinestreamDownload
//
//	@summary queues an episode download through an online streaming provider.
//	@desc The video is fetched through the provider's source (rate limited per provider and host),
//	@desc the subtitles the stream serves are converted to ASS, and everything is muxed into an MKV in the library.
//	@desc The file is then registered as a matched local file. Progress is sent over the websocket.
//	@route /api/v1/onlinestream/download [POST]
//	@returns onlinestream_download.Item
func (h *Handler) HandleOnlinestreamDownload(c echo.Context) error {
	type body struct {
		MediaId          int    `json:"mediaId"`
		EpisodeNumbers   []int  `json:"episodeNumbers"`
		Provider         string `json:"provider"`
		Dubbed           bool   `json:"dubbed"`
		Server           string `json:"server,omitempty"`
		Quality          string `json:"quality,omitempty"`
		SourceURL        string `json:"sourceUrl,omitempty"`
		SubtitleLanguage string `json:"subtitleLanguage,omitempty"`
		// OverwriteEpisodes are the episodes the user chose to replace in the library.
		OverwriteEpisodes []int `json:"overwriteEpisodes,omitempty"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if h.App.Settings == nil || !h.App.Settings.GetLibrary().EnableOnlinestream {
		return h.RespondWithError(c, errors.New("enable online streaming in the settings"))
	}
	if len(b.EpisodeNumbers) == 0 {
		return h.RespondWithError(c, errors.New("no episode selected"))
	}

	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	overwrite := make(map[int]bool, len(b.OverwriteEpisodes))
	for _, ep := range b.OverwriteEpisodes {
		overwrite[ep] = true
	}
	have := h.libraryEpisodeFiles(b.MediaId)

	queued := make([]*onlinestream_download.Item, 0, len(b.EpisodeNumbers))
	var lastErr error
	for _, ep := range b.EpisodeNumbers {
		if len(have[ep]) > 0 && !overwrite[ep] {
			lastErr = fmt.Errorf("episode %d is already in your library", ep)
			continue
		}
		req := onlinestream_download.Request{
			Overwrite:     overwrite[ep],
			MediaId:       b.MediaId,
			EpisodeNumber: ep,
			Provider:      b.Provider,
			Dubbed:        b.Dubbed,
			Server:        b.Server,
			Quality:       b.Quality,
		}
		// The exact source and shown subtitle only apply to the episode being played.
		if len(b.EpisodeNumbers) == 1 {
			req.SourceURL = b.SourceURL
		}
		req.SubtitleLanguage = b.SubtitleLanguage
		it, err := m.Enqueue(c.Request().Context(), req)
		if err != nil {
			lastErr = err
			continue
		}
		queued = append(queued, it)
	}
	if len(queued) == 0 && lastErr != nil {
		return h.RespondWithError(c, lastErr)
	}

	return h.RespondWithData(c, queued)
}

// HandleGetOnlinestreamDownloads
//
//	@summary returns the online stream download queue as a summary: counts, one line per series and the running episode.
//	@desc The episodes of a series are fetched separately (downloads/series), so a queue of thousands stays light.
//	@route /api/v1/onlinestream/downloads [GET]
//	@returns onlinestream_download.QueueSummary
func (h *Handler) HandleGetOnlinestreamDownloads(c echo.Context) error {
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, m.Summary())
}

// HandleGetOnlinestreamDownloadSeries
//
//	@summary returns the episodes of one anime in the online stream download queue.
//	@route /api/v1/onlinestream/downloads/series [POST]
//	@returns []onlinestream_download.Item
func (h *Handler) HandleGetOnlinestreamDownloadSeries(c echo.Context) error {
	type body struct {
		MediaId int `json:"mediaId"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, m.SeriesItems(b.MediaId))
}

// HandleGetOnlinestreamDownloadHistory
//
//	@summary returns the anime downloaded through online streaming providers, with episode counts, most recent first.
//	@route /api/v1/onlinestream/downloads/history [GET]
//	@returns []onlinestream_download.HistorySeries
func (h *Handler) HandleGetOnlinestreamDownloadHistory(c echo.Context) error {
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, m.HistorySummary())
}

// HandleOnlinestreamDownloadSeries
//
//	@summary queues every episode the provider lists for an anime.
//	@desc Episodes already in the queue are skipped, and so are episodes in the library unless listed in overwriteEpisodes.
//	@route /api/v1/onlinestream/download/series [POST]
//	@returns onlinestream_download.SeriesResult
func (h *Handler) HandleOnlinestreamDownloadSeries(c echo.Context) error {
	type body struct {
		MediaId          int    `json:"mediaId"`
		Provider         string `json:"provider"`
		Dubbed           bool   `json:"dubbed"`
		Server           string `json:"server,omitempty"`
		Quality          string `json:"quality,omitempty"`
		SubtitleLanguage string `json:"subtitleLanguage,omitempty"`
		// OverwriteEpisodes are the episodes in the library the user chose to replace; the
		// other episodes the library has are skipped.
		OverwriteEpisodes []int `json:"overwriteEpisodes,omitempty"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if h.App.Settings == nil || !h.App.Settings.GetLibrary().EnableOnlinestream {
		return h.RespondWithError(c, errors.New("enable online streaming in the settings"))
	}
	if b.MediaId <= 0 || b.Provider == "" {
		return h.RespondWithError(c, errors.New("missing anime or provider"))
	}
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	overwrite := make(map[int]bool, len(b.OverwriteEpisodes))
	for _, ep := range b.OverwriteEpisodes {
		overwrite[ep] = true
	}

	// Episodes the library already has, from any source.
	have := make(map[int]bool)
	if lfs, _, lfErr := db_bridge.GetLocalFiles(h.App.Database); lfErr == nil {
		for _, lf := range lfs {
			if lf.MediaId == b.MediaId && lf.Metadata != nil && lf.Metadata.Type == anime.LocalFileTypeMain {
				have[lf.Metadata.Episode] = true
			}
		}
	}

	ctx := c.Request().Context()
	enqueue := func(provider string) (*onlinestream_download.SeriesResult, error) {
		// The thorough match (every title, synonym and spelling) first; when it finds nothing the
		// provider's own matching still gets its turn inside EnqueueSeries.
		if err := h.mapOnlineProvider(ctx, provider, b.MediaId); err != nil {
			h.App.Logger.Debug().Err(err).Str("provider", provider).Int("mediaId", b.MediaId).
				Msg("onlinestream download: Thorough match found nothing; using the provider's own")
		}
		res, err := m.EnqueueSeries(ctx, onlinestream_download.Request{
			MediaId:          b.MediaId,
			Provider:         provider,
			Dubbed:           b.Dubbed,
			Server:           b.Server,
			Quality:          b.Quality,
			SubtitleLanguage: b.SubtitleLanguage,
		}, func(ep int) bool { return have[ep] }, overwrite)
		if err == nil {
			res.Provider = provider
		}
		return res, err
	}

	// "auto": the first provider, in the usual order, that has the series.
	if b.Provider == "auto" {
		var misses []string
		for _, p := range onlinestream_download.FallbackProviders {
			if _, err := h.onlineProvider(p); err != nil {
				continue
			}
			res, err := enqueue(p)
			if err == nil {
				return h.RespondWithData(c, res)
			}
			if ctx.Err() != nil {
				return h.RespondWithError(c, ctx.Err())
			}
			misses = append(misses, onlinestream_download.ProviderLabel(p)+": "+err.Error())
		}
		return h.RespondWithError(c, fmt.Errorf("no provider has this series (%s)", strings.Join(misses, "; ")))
	}

	res, err := enqueue(b.Provider)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, res)
}

// HandleOnlinestreamDownloadQueueAction
//
//	@summary controls the online stream download queue.
//	@desc Actions: start, stop, reset-errored, clear-finished, clear-all, clear-media and retry-media (mediaId),
//	@desc and per item (id): cancel, retry, remove, move-to-top.
//	@route /api/v1/onlinestream/downloads/action [POST]
//	@returns bool
func (h *Handler) HandleOnlinestreamDownloadQueueAction(c echo.Context) error {
	type body struct {
		Action   string `json:"action"`
		ID       string `json:"id,omitempty"`
		MediaId  int    `json:"mediaId,omitempty"`
		MediaIds []int  `json:"mediaIds,omitempty"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	ok := true
	switch b.Action {
	case "start":
		m.Start()
	case "stop":
		m.Stop()
	case "reset-errored":
		ok = m.ResetErrored() > 0
	case "clear-finished":
		m.ClearFinished()
	case "clear-all":
		m.ClearAll()
	case "clear-media":
		m.ClearMedia(b.MediaId)
	case "cancel":
		ok = m.Cancel(b.ID)
	case "retry":
		ok = m.Retry(b.ID)
	case "retry-media":
		ok = m.RetryMedia(b.MediaId) > 0
	case "remove":
		ok = m.Remove(b.ID)
	case "move-to-top":
		ok = m.MoveToTop(b.ID)
	case "remove-series":
		for _, id := range b.MediaIds {
			m.RemoveSeries(id)
		}
	case "torrent-series":
		// Out of the queue, and a torrent instead (SeaDex first, the auto torrent rules).
		return h.RespondWithData(c, h.torrentInsteadOfOnline(c.Request().Context(), m, b.MediaIds))
	default:
		return h.RespondWithError(c, errors.New("unknown action"))
	}
	return h.RespondWithData(c, ok)
}

// TorrentInsteadResult is what became of one anime taken out of the online queue for a torrent.
type TorrentInsteadResult struct {
	MediaId int    `json:"mediaId"`
	Torrent string `json:"torrent,omitempty"`
	// Reason says why there is no torrent, when there is none.
	Reason string `json:"reason,omitempty"`
}

// torrentInsteadOfOnline takes anime out of the online download queue and gets each as a torrent
// instead: picked the way Enqueue Future's auto torrent does (SeaDex first), sent to the client
// auto-matched, so it lands in unmatched and is matched into the library when it completes.
func (h *Handler) torrentInsteadOfOnline(ctx context.Context, m *onlinestream_download.Manager, mediaIds []int) []TorrentInsteadResult {
	out := make([]TorrentInsteadResult, 0, len(mediaIds))
	for _, id := range mediaIds {
		if m != nil {
			m.RemoveSeries(id)
		}
		r := TorrentInsteadResult{MediaId: id}
		if h.App.EnqueueFutureRepository == nil {
			r.Reason = "the torrent fallback is not available"
			out = append(out, r)
			continue
		}
		pick, err := h.App.EnqueueFutureRepository.TorrentOne(ctx, id)
		switch {
		case err != nil:
			r.Reason = err.Error()
		case pick.Torrent == nil:
			r.Reason = pick.Reason
			if r.Reason == "" {
				r.Reason = "no torrent passed the rules"
			}
		default:
			r.Torrent = pick.Torrent.Name
		}
		out = append(out, r)
	}
	return out
}
