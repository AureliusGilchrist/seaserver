package handlers

import (
	"context"
	"errors"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/core"
	"seanime/internal/database/db_bridge"
	"seanime/internal/events"
	"seanime/internal/library/anime"
	onlinestream_download "seanime/internal/onlinestream/download"
	"seanime/internal/util"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

// wireOnlinestreamDownloader creates the download queue for online streaming providers. The
// queue lives on the App; the handler supplies the library side — where files go and how a
// finished file is recorded as a matched local file.
func (h *Handler) wireOnlinestreamDownloader(app *core.App) {
	if app.OnlinestreamDownloader != nil || app.OnlinestreamRepository == nil {
		return
	}
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
	})
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

	queued := make([]*onlinestream_download.Item, 0, len(b.EpisodeNumbers))
	var lastErr error
	for _, ep := range b.EpisodeNumbers {
		req := onlinestream_download.Request{
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
//	@summary returns the online stream download queue.
//	@route /api/v1/onlinestream/downloads [GET]
//	@returns onlinestream_download.QueueState
func (h *Handler) HandleGetOnlinestreamDownloads(c echo.Context) error {
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, m.GetQueue())
}

// HandleGetOnlinestreamDownloadHistory
//
//	@summary returns the episodes downloaded through online streaming providers, newest first.
//	@route /api/v1/onlinestream/downloads/history [GET]
//	@returns []onlinestream_download.HistoryEntry
func (h *Handler) HandleGetOnlinestreamDownloadHistory(c echo.Context) error {
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, m.GetHistory())
}

// HandleOnlinestreamDownloadSeries
//
//	@summary queues every episode the provider lists for an anime.
//	@desc Episodes already in the library or already in the queue are skipped unless includeExisting is set.
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
		IncludeExisting  bool   `json:"includeExisting,omitempty"`
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

	// Episodes the library already has, from any source.
	have := make(map[int]bool)
	if lfs, _, lfErr := db_bridge.GetLocalFiles(h.App.Database); lfErr == nil {
		for _, lf := range lfs {
			if lf.MediaId == b.MediaId && lf.Metadata != nil && lf.Metadata.Type == anime.LocalFileTypeMain {
				have[lf.Metadata.Episode] = true
			}
		}
	}

	res, err := m.EnqueueSeries(c.Request().Context(), onlinestream_download.Request{
		MediaId:          b.MediaId,
		Provider:         b.Provider,
		Dubbed:           b.Dubbed,
		Server:           b.Server,
		Quality:          b.Quality,
		SubtitleLanguage: b.SubtitleLanguage,
	}, func(ep int) bool { return have[ep] }, b.IncludeExisting)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, res)
}

// HandleOnlinestreamDownloadQueueAction
//
//	@summary controls the online stream download queue.
//	@desc Actions: start, stop, reset-errored, clear-finished, clear-all, clear-media (mediaId),
//	@desc and per item (id): cancel, retry, remove, move-to-top.
//	@route /api/v1/onlinestream/downloads/action [POST]
//	@returns bool
func (h *Handler) HandleOnlinestreamDownloadQueueAction(c echo.Context) error {
	type body struct {
		Action  string `json:"action"`
		ID      string `json:"id,omitempty"`
		MediaId int    `json:"mediaId,omitempty"`
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
	case "remove":
		ok = m.Remove(b.ID)
	case "move-to-top":
		ok = m.MoveToTop(b.ID)
	default:
		return h.RespondWithError(c, errors.New("unknown action"))
	}
	return h.RespondWithData(c, ok)
}
