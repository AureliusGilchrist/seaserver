package handlers

import (
	"fmt"
	"seanime/internal/events"
	"seanime/internal/manga"
	chapter_downloader "seanime/internal/manga/downloader"

	"github.com/labstack/echo/v4"
)

// HandleDownloadMangaChapters
//
//	@summary adds chapters to the download queue.
//	@route /api/v1/manga/download-chapters [POST]
//	@returns bool
func (h *Handler) HandleDownloadMangaChapters(c echo.Context) error {

	type body struct {
		MediaId    int      `json:"mediaId"`
		Provider   string   `json:"provider"`
		ChapterIds []string `json:"chapterIds"`
		StartNow   bool     `json:"startNow"`
		MediaTitle string   `json:"mediaTitle"` // Romaji title for folder naming
		CoverImage string   `json:"coverImage"` // Optional cover image URL
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)

	// Store manga metadata for display purposes (even if not in AniList collection)
	// This ensures titles and covers display correctly in the download queue and local library
	if b.MediaId > 0 {
		coverImage := b.CoverImage
		title := b.MediaTitle

		// If cover image not provided, try to fetch from AniList API
		if coverImage == "" && h.App.AnilistPlatformRef != nil {
			if mangaMedia, err := h.App.AnilistPlatformRef.Get().GetManga(c.Request().Context(), b.MediaId); err == nil && mangaMedia != nil {
				if mangaMedia.GetCoverImage() != nil {
					if mangaMedia.GetCoverImage().GetExtraLarge() != nil {
						coverImage = *mangaMedia.GetCoverImage().GetExtraLarge()
					} else if mangaMedia.GetCoverImage().GetLarge() != nil {
						coverImage = *mangaMedia.GetCoverImage().GetLarge()
					}
				}
				// Also get title if not provided
				if title == "" && mangaMedia.GetTitle() != nil {
					if mangaMedia.GetTitle().GetRomaji() != nil {
						title = *mangaMedia.GetTitle().GetRomaji()
					} else if mangaMedia.GetTitle().GetEnglish() != nil {
						title = *mangaMedia.GetTitle().GetEnglish()
					}
				}
			}
		}

		// Save metadata to database
		if title != "" || coverImage != "" {
			_ = h.App.Database.SaveDownloadedMangaMetadata(b.MediaId, title, coverImage, b.Provider)
		}
	}

	// Hand the chapters to the background worker, which adds one every few seconds and keeps
	// going after this request (and the page that made it) is gone.
	jobs := make([]chapterQueueingJob, 0, len(b.ChapterIds))
	for _, chapterId := range b.ChapterIds {
		jobs = append(jobs, chapterQueueingJob{
			ProfileID:  profileID,
			Provider:   b.Provider,
			MediaID:    b.MediaId,
			MediaTitle: b.MediaTitle,
			ChapterID:  chapterId,
			StartNow:   b.StartNow,
		})
	}

	scheduled := h.queueChaptersInBackground(jobs)

	if scheduled > 0 {
		h.App.WSEventManager.SendEvent(events.InfoToast, fmt.Sprintf(
			"Queueing %d chapter(s), one every %d seconds — you can leave this page",
			scheduled, int(chapterQueueingInterval.Seconds()),
		))
	}

	return h.RespondWithData(c, true)
}

// HandleGetMangaDownloadData
//
//	@summary returns the download data for a specific media.
//	@desc This is used to display information about the downloaded and queued chapters in the UI.
//	@desc If the 'cached' parameter is false, it will refresh the data by rescanning the download folder.
//	@route /api/v1/manga/download-data [POST]
//	@returns manga.MediaDownloadData
func (h *Handler) HandleGetMangaDownloadData(c echo.Context) error {

	type body struct {
		MediaId int  `json:"mediaId"`
		Cached  bool `json:"cached"` // If false, it will refresh the data
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	data, err := h.App.MangaDownloader.GetMediaDownloads(b.MediaId, b.Cached)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, data)
}

// HandleGetMangaDownloadQueue
//
//	@summary returns the items in the download queue.
//	@route /api/v1/manga/download-queue [GET]
//	@returns []models.ChapterDownloadQueueItem
func (h *Handler) HandleGetMangaDownloadQueue(c echo.Context) error {

	data, err := h.App.Database.GetChapterDownloadQueue()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, data)
}

// HandleStartMangaDownloadQueue
//
//	@summary starts the download queue if it's not already running.
//	@desc This will start the download queue if it's not already running.
//	@desc Returns 'true' whether the queue was started or not.
//	@route /api/v1/manga/download-queue/start [POST]
//	@returns bool
func (h *Handler) HandleStartMangaDownloadQueue(c echo.Context) error {

	h.App.MangaDownloader.RunChapterDownloadQueue()

	return h.RespondWithData(c, true)
}

// HandleStopMangaDownloadQueue
//
//	@summary stops the manga download queue.
//	@desc This will stop the manga download queue.
//	@desc Returns 'true' whether the queue was stopped or not.
//	@route /api/v1/manga/download-queue/stop [POST]
//	@returns bool
func (h *Handler) HandleStopMangaDownloadQueue(c echo.Context) error {

	h.App.MangaDownloader.StopChapterDownloadQueue()

	return h.RespondWithData(c, true)

}

// HandleClearAllChapterDownloadQueue
//
//	@summary clears all chapters from the download queue.
//	@desc This will clear all chapters from the download queue.
//	@desc Returns 'true' whether the queue was cleared or not.
//	@desc This will also send a websocket event telling the client to refetch the download queue.
//	@route /api/v1/manga/download-queue [DELETE]
//	@returns bool
func (h *Handler) HandleClearAllChapterDownloadQueue(c echo.Context) error {

	err := h.App.Database.ClearAllChapterDownloadQueueItems()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	h.App.WSEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)

	return h.RespondWithData(c, true)
}

// HandleResetErroredChapterDownloadQueue
//
//	@summary resets the errored chapters in the download queue.
//	@desc This will reset the errored chapters in the download queue, so they can be re-downloaded.
//	@desc Returns 'true' whether the queue was reset or not.
//	@desc This will also send a websocket event telling the client to refetch the download queue.
//	@route /api/v1/manga/download-queue/reset-errored [POST]
//	@returns bool
func (h *Handler) HandleResetErroredChapterDownloadQueue(c echo.Context) error {

	err := h.App.Database.ResetErroredChapterDownloadQueueItems()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	h.App.WSEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)

	return h.RespondWithData(c, true)
}

// HandleDeleteMangaDownloadedChapters
//
//	@summary deletes downloaded chapters.
//	@desc This will delete downloaded chapters from the filesystem.
//	@desc Returns 'true' whether the chapters were deleted or not.
//	@desc The client should refetch the download data after this.
//	@route /api/v1/manga/download-chapter [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteMangaDownloadedChapters(c echo.Context) error {

	type body struct {
		DownloadIds []chapter_downloader.DownloadID `json:"downloadIds"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	err := h.App.MangaDownloader.DeleteChapters(b.DownloadIds)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleGetMangaDownloadsList
//
//	@summary displays the list of downloaded manga.
//	@desc This analyzes the download folder and returns a well-formatted structure for displaying downloaded manga.
//	@desc It returns a list of manga.DownloadListItem where the media data might be nil if it's not in the AniList collection.
//	@route /api/v1/manga/downloads [GET]
//	@returns []manga.DownloadListItem
func (h *Handler) HandleGetMangaDownloadsList(c echo.Context) error {

	// The signed-in user's own collection, so the cards on this screen carry their status and their
	// progress rather than the admin's — and so a series just added to a list shows as added.
	mangaCollection, err := h.mangaCollectionForProfile(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	res, err := h.App.MangaDownloader.NewDownloadList(&manga.NewDownloadListOptions{
		MangaCollection: mangaCollection,
		PlatformRef:     h.App.AnilistPlatformRef,
		Ctx:             c.Request().Context(),
		// Still false, and deliberately: this endpoint is called every time the Local Library screen
		// is opened, and a library of two hundred downloads whose series are not on your lists would
		// be two hundred AniList requests before the screen could paint. The ones with nothing are
		// handed to the background backfill below instead — the screen stays instant, and the entries
		// it could not describe describe themselves on the next open.
		EnableRemoteMetadataFetch: false,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Anything with no metadata at all, and anything whose metadata carries no cover — a locally
	// scanned series is stored with neither, and both render as a blank card.
	missing := make([]int, 0)
	for _, item := range res {
		if item == nil || item.MediaId == 0 {
			continue
		}
		if item.Media == nil || item.Media.GetCoverImage() == nil || item.Media.GetCoverImage().GetLarge() == nil ||
			*item.Media.GetCoverImage().GetLarge() == "" {
			missing = append(missing, item.MediaId)
		}
	}
	if len(missing) > 0 {
		h.App.MangaDownloader.BackfillMissingMetadata(h.App.AnilistPlatformRef, missing)
	}

	return h.RespondWithData(c, res)
}
