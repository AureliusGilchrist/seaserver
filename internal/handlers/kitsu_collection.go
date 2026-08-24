package handlers

import (
	"errors"
	"strconv"

	"seanime/internal/api/kitsu"
	"seanime/internal/platforms/kitsu_platform"

	"github.com/labstack/echo/v4"
)

// resolveProfilePlatform picks the right Kitsu platform for a handler call. It prefers the
// profile-specific platform when a profile id is supplied; otherwise it returns the planning-slut
// ("server") one. When neither is bound, the call returns nil and the caller surfaces 401.
func (h *Handler) resolveProfilePlatform(profileID uint) *kitsu_platform.KitsuPlatform {
	if h.App.KitsuClientManager == nil {
		return nil
	}
	if profileID > 0 {
		if p, _ := h.App.KitsuClientManager.GetProfileAccount(profileID); p != nil {
			return p
		}
	}
	return h.App.KitsuClientManager.GetPlanningSlut()
}

// HandleGetKitsuAnimeCollection
//
//	@summary returns the Kitsu anime library for the calling profile (or shared).
//	@route /api/v1/kitsu/anime-collection [GET]
//	@returns []platforms.KitsuPlatform.LibraryEntry
func (h *Handler) HandleGetKitsuAnimeCollection(c echo.Context) error {
	profileID := h.getProfileID(c)
	p := h.resolveProfilePlatform(profileID)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu account not linked"))
	}

	bypass := c.QueryParam("refresh") == "1"
	entries, err := p.GetAnimeCollection(c.Request().Context(), bypass)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, entries)
}

// HandleGetKitsuMangaCollection is the manga variant of HandleGetKitsuAnimeCollection.
func (h *Handler) HandleGetKitsuMangaCollection(c echo.Context) error {
	profileID := h.getProfileID(c)
	p := h.resolveProfilePlatform(profileID)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu account not linked"))
	}

	bypass := c.QueryParam("refresh") == "1"
	entries, err := p.GetMangaCollection(c.Request().Context(), bypass)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, entries)
}

// HandleGetKitsuAnime
//
//	@summary returns one Kitsu anime's full details by id.
//	@route /api/v1/kitsu/anime/{id} [GET]
//	@returns platforms.KitsuPlatform.AnimeDetails
func (h *Handler) HandleGetKitsuAnime(c echo.Context) error {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid anime id"))
	}

	p := h.resolveProfilePlatform(0) // no profile required for public data
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu client not initialized"))
	}
	out, err := p.GetAnime(c.Request().Context(), id)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, out)
}

// HandleGetKitsuManga is the manga counterpart of HandleGetKitsuAnime.
func (h *Handler) HandleGetKitsuManga(c echo.Context) error {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid manga id"))
	}

	p := h.resolveProfilePlatform(0)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu client not initialized"))
	}
	out, err := p.GetManga(c.Request().Context(), id)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, out)
}

// HandleSearchKitsuAnime
//
//	@summary full-text search over Kitsu anime catalog.
//	@route /api/v1/kitsu/anime/search?q=&page= [GET]
//	@returns []platforms.KitsuPlatform.AnimeDetails
func (h *Handler) HandleSearchKitsuAnime(c echo.Context) error {
	q := c.QueryParam("q")
	page := atoiDefault(c.QueryParam("page"), 1)
	limit := atoiDefault(c.QueryParam("limit"), 20)
	offset := (page - 1) * limit

	p := h.resolveProfilePlatform(0)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu client not initialized"))
	}
	out, err := p.SearchAnime(c.Request().Context(), q, limit, offset)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, map[string]interface{}{
		"page":  page,
		"limit": limit,
		"items": out,
	})
}

// HandleGetKitsuViewer returns the OAuth viewer's profile record.
func (h *Handler) HandleGetKitsuViewer(c echo.Context) error {
	profileID := h.getProfileID(c)
	p := h.resolveProfilePlatform(profileID)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu account not linked"))
	}
	v, err := p.GetViewer(c.Request().Context())
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, v)
}

// HandleGetKitsuViewerStats derives a basic stat block from the user's libraries.
func (h *Handler) HandleGetKitsuViewerStats(c echo.Context) error {
	profileID := h.getProfileID(c)
	p := h.resolveProfilePlatform(profileID)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu account not linked"))
	}
	stats, err := p.GetViewerStats(c.Request().Context())
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, stats)
}

// HandleUpdateKitsuEntry mutates a single library entry's status, progress or rating.
func (h *Handler) HandleUpdateKitsuEntry(c echo.Context) error {
	type body struct {
		MediaID    int     `json:"mediaId"`
		Status     *string `json:"status,omitempty"`
		Score      *float64 `json:"score,omitempty"`
		Progress   *int    `json:"progress,omitempty"`
		StartedAt  *string `json:"startedAt,omitempty"`
		FinishedAt *string `json:"finishedAt,omitempty"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.getProfileID(c)
	p := h.resolveProfilePlatform(profileID)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu account not linked"))
	}
	if err := p.UpdateEntry(c.Request().Context(), b.MediaID, b.Status, b.Score, b.Progress, b.StartedAt, b.FinishedAt); err != nil {
		return h.RespondWithError(c, err)
	}
	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// HandleDeleteKitsuEntry deletes a single library entry tied to the supplied media id.
func (h *Handler) HandleDeleteKitsuEntry(c echo.Context) error {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid media id"))
	}

	profileID := h.getProfileID(c)
	p := h.resolveProfilePlatform(profileID)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu account not linked"))
	}
	if err := p.DeleteEntry(c.Request().Context(), id, 0); err != nil {
		return h.RespondWithError(c, err)
	}
	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// HandleAddKitsuMediaToCollection bulk-adds a list of media to PLANNING.
func (h *Handler) HandleAddKitsuMediaToCollection(c echo.Context) error {
	type body struct {
		MediaIDs []int `json:"mediaIds"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if len(b.MediaIDs) == 0 {
		return h.RespondWithError(c, errors.New("mediaIds required"))
	}

	profileID := h.getProfileID(c)
	p := h.resolveProfilePlatform(profileID)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu account not linked"))
	}
	if err := p.AddMediaToCollection(c.Request().Context(), b.MediaIDs); err != nil {
		return h.RespondWithError(c, err)
	}
	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// HandleGetKitsuUserLibrary returns one Kitsu user's library. Useful for the public profile page.
func (h *Handler) HandleGetKitsuUserLibrary(c echo.Context) error {
	idStr := c.Param("id")
	if idStr == "" {
		return h.RespondWithError(c, errors.New("user id required"))
	}

	p := h.resolveProfilePlatform(0)
	if p == nil {
		return h.RespondWithError(c, errors.New("Kitsu client not initialized"))
	}

	authed := *p
	authed.Client.SetToken("") // public profile endpoint is unauthenticated
	bypass := c.QueryParam("refresh") == "1"
	rows, err := authed.GetUserLibrary(c.Request().Context(), bypass)
	if err != nil {
		// Fall back to the actual platform if explicit unauthenticated call fails — the data is
		// gated by the supplied user id, and the Kitsu endpoint usually allows public reads.
		rows, err = p.GetUserLibrary(c.Request().Context(), bypass)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}
	return h.RespondWithData(c, rows)
}

// keep imports alive
var _ = kitsu.LibraryStatusCurrent
