package handlers

import (
	"github.com/labstack/echo/v4"
)

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Services
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleRunUpdateAnimeLibrary
//
//	@summary triggers an anime library update from AniList.
//	@returns bool
//	@route /api/v1/services/update-anime-library [POST]
func (h *Handler) HandleRunUpdateAnimeLibrary(c echo.Context) error {
	err := h.App.ServiceRunner.RunUpdateAnimeLibrary()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// HandleRunUpdateMangaLibrary
//
//	@summary triggers a manga library update from AniList.
//	@returns bool
//	@route /api/v1/services/update-manga-library [POST]
func (h *Handler) HandleRunUpdateMangaLibrary(c echo.Context) error {
	err := h.App.ServiceRunner.RunUpdateMangaLibrary()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// HandleRunScanAnimeLibrary
//
//	@summary triggers a local anime library scan.
//	@returns bool
//	@route /api/v1/services/scan-anime-library [POST]
func (h *Handler) HandleRunScanAnimeLibrary(c echo.Context) error {
	err := h.App.ServiceRunner.RunScanAnimeLibrary()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// HandleRunScanMangaLibrary
//
//	@summary triggers a local manga library sync.
//	@returns bool
//	@route /api/v1/services/scan-manga-library [POST]
func (h *Handler) HandleRunScanMangaLibrary(c echo.Context) error {
	err := h.App.ServiceRunner.RunScanMangaLibrary()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// HandleRunFindAnimeLibrarySorting
//
//	@summary computes GoJuuon sort order for the anime library.
//	@returns map[int]interface{}
//	@route /api/v1/services/find-anime-library-sorting [POST]
func (h *Handler) HandleRunFindAnimeLibrarySorting(c echo.Context) error {
	result, err := h.App.ServiceRunner.RunFindAnimeLibrarySorting()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, result)
}

// HandleRunFindMangaLibrarySorting
//
//	@summary computes GoJuuon sort order for the manga library.
//	@returns map[int]interface{}
//	@route /api/v1/services/find-manga-library-sorting [POST]
func (h *Handler) HandleRunFindMangaLibrarySorting(c echo.Context) error {
	result, err := h.App.ServiceRunner.RunFindMangaLibrarySorting()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, result)
}

// HandleGetAnimeGojuuonMap
//
//	@summary returns the cached GoJuuon sort map for anime.
//	@returns map[int]*gojuuon.SortEntry
//	@route /api/v1/services/anime-gojuuon-map [GET]
func (h *Handler) HandleGetAnimeGojuuonMap(c echo.Context) error {
	if h.App.GojuuonService == nil {
		return h.RespondWithData(c, map[string]interface{}{})
	}
	return h.RespondWithData(c, h.App.GojuuonService.GetAnimeSortMap())
}

// HandleGetMangaGojuuonMap
//
//	@summary returns the cached GoJuuon sort map for manga.
//	@returns map[int]*gojuuon.SortEntry
//	@route /api/v1/services/manga-gojuuon-map [GET]
func (h *Handler) HandleGetMangaGojuuonMap(c echo.Context) error {
	if h.App.GojuuonService == nil {
		return h.RespondWithData(c, map[string]interface{}{})
	}
	return h.RespondWithData(c, h.App.GojuuonService.GetMangaSortMap())
}
