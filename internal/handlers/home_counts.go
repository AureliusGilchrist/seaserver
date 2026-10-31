package handlers

import (
	"seanime/internal/database/db_bridge"

	"github.com/labstack/echo/v4"
)

// HomeCounts is what is on the server's disks, for the landing page. Both numbers are already in
// memory, so this answers at once where the collections they used to be read from take many seconds.
type HomeCounts struct {
	AnimeFiles    int `json:"animeFiles"`
	MangaChapters int `json:"mangaChapters"`
}

// HandleGetHomeCounts
//
//	@summary returns the number of anime files and manga chapters on the server.
//	@desc Used by the landing page, which only needs the totals and not a whole collection.
//	@returns handlers.HomeCounts
//	@route /api/v1/home/counts [GET]
func (h *Handler) HandleGetHomeCounts(c echo.Context) error {
	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	counts := HomeCounts{AnimeFiles: len(lfs)}
	if h.App.MangaDownloader != nil {
		counts.MangaChapters = h.App.MangaDownloader.CountDownloadedChapters()
	}

	return h.RespondWithData(c, counts)
}
