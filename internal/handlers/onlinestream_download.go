package handlers

import (
	"context"
	"errors"
	"path/filepath"
	"seanime/internal/core"
	"seanime/internal/database/db_bridge"
	"seanime/internal/events"
	"seanime/internal/library/anime"
	onlinestream_download "seanime/internal/onlinestream/download"
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
		LibraryPath: func() string {
			p, err := app.Database.GetLibraryPathFromSettings()
			if err != nil {
				return ""
			}
			return p
		},
		ExistingFolder: h.existingFolderForMedia,
		FfmpegPath: func() string {
			if ms := app.SecondarySettings.Mediastream; ms != nil && ms.FfmpegPath != "" {
				return ms.FfmpegPath
			}
			return "ffmpeg"
		},
		Register: h.registerOnlinestreamDownload,
	})
}

// existingFolderForMedia returns the folder already holding this anime's episodes, so a
// downloaded episode lands next to the ones the library has instead of in a second folder.
func (h *Handler) existingFolderForMedia(mediaId int) string {
	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return ""
	}
	counts := make(map[string]int)
	best, bestCount := "", 0
	for _, lf := range lfs {
		if lf.MediaId != mediaId || lf.Path == "" {
			continue
		}
		dir := filepath.Dir(lf.Path)
		counts[dir]++
		if counts[dir] > bestCount {
			best, bestCount = dir, counts[dir]
		}
	}
	return best
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
//	@returns []onlinestream_download.Item
func (h *Handler) HandleGetOnlinestreamDownloads(c echo.Context) error {
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, m.GetQueue())
}

// HandleCancelOnlinestreamDownload
//
//	@summary cancels a running or queued online stream download.
//	@route /api/v1/onlinestream/downloads/cancel [POST]
//	@returns bool
func (h *Handler) HandleCancelOnlinestreamDownload(c echo.Context) error {
	type body struct {
		ID string `json:"id"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, m.Cancel(b.ID))
}

// HandleClearOnlinestreamDownloads
//
//	@summary removes finished items from the online stream download queue.
//	@route /api/v1/onlinestream/downloads/finished [DELETE]
//	@returns bool
func (h *Handler) HandleClearOnlinestreamDownloads(c echo.Context) error {
	m, err := h.onlinestreamDownloader()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	m.ClearFinished()
	return h.RespondWithData(c, true)
}
