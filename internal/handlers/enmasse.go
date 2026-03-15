package handlers

import (
	"github.com/labstack/echo/v4"
)

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Anime En Masse Downloader
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleEnMasseGetStatus
//
//	@summary get the status of the en masse downloader.
//	@desc Returns the current status of the en masse downloader including progress and current anime.
//	@returns enmasse.DownloaderStatus
//	@route /api/v1/enmasse/status [GET]
func (h *Handler) HandleEnMasseGetStatus(c echo.Context) error {
	status := h.App.EnMasseDownloader.GetStatus()
	return h.RespondWithData(c, status)
}

type EnMasseStartBody struct {
	Resume bool `json:"resume"`
}

// HandleEnMasseStart
//
//	@summary start the en masse downloader.
//	@desc Starts the en masse downloader to process anime from anilist-minified.json.
//	@returns bool
//	@route /api/v1/enmasse/start [POST]
func (h *Handler) HandleEnMasseStart(c echo.Context) error {
	var body EnMasseStartBody
	if err := c.Bind(&body); err != nil {
		body.Resume = false
	}
	
	err := h.App.EnMasseDownloader.Start(body.Resume)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

type EnMasseStopBody struct {
	SaveProgress bool `json:"saveProgress"`
}

// HandleEnMasseStop
//
//	@summary stop the en masse downloader.
//	@desc Stops the en masse downloader if it's running.
//	@returns bool
//	@route /api/v1/enmasse/stop [POST]
func (h *Handler) HandleEnMasseStop(c echo.Context) error {
	var body EnMasseStopBody
	if err := c.Bind(&body); err != nil {
		body.SaveProgress = true // Default to saving progress
	}
	
	h.App.EnMasseDownloader.Stop(body.SaveProgress)
	return h.RespondWithData(c, true)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Manga En Masse Downloader
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleMangaEnMasseGetStatus
//
//	@summary get the status of the manga en masse downloader.
//	@desc Returns the current status of the manga en masse downloader including progress and current manga.
//	@returns enmasse.MangaDownloaderStatus
//	@route /api/v1/enmasse/manga/status [GET]
func (h *Handler) HandleMangaEnMasseGetStatus(c echo.Context) error {
	status := h.App.MangaEnMasseDownloader.GetStatus()
	return h.RespondWithData(c, status)
}

type MangaEnMasseStartBody struct {
	Resume bool `json:"resume"`
}

// HandleMangaEnMasseStart
//
//	@summary start the manga en masse downloader.
//	@desc Starts the manga en masse downloader to process manga from hakuneko-mangas.json.
//	@returns bool
//	@route /api/v1/enmasse/manga/start [POST]
func (h *Handler) HandleMangaEnMasseStart(c echo.Context) error {
	var body MangaEnMasseStartBody
	if err := c.Bind(&body); err != nil {
		body.Resume = false
	}

	err := h.App.MangaEnMasseDownloader.Start(body.Resume)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

type MangaEnMasseStopBody struct {
	SaveProgress bool `json:"saveProgress"`
}

// HandleMangaEnMasseStop
//
//	@summary stop the manga en masse downloader.
//	@desc Stops the manga en masse downloader if it's running.
//	@returns bool
//	@route /api/v1/enmasse/manga/stop [POST]
func (h *Handler) HandleMangaEnMasseStop(c echo.Context) error {
	var body MangaEnMasseStopBody
	if err := c.Bind(&body); err != nil {
		body.SaveProgress = true // Default to saving progress
	}

	h.App.MangaEnMasseDownloader.Stop(body.SaveProgress)
	return h.RespondWithData(c, true)
}

