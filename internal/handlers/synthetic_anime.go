package handlers

import (
    "errors"
    "strconv"

    "seanime/internal/database/models"

    "github.com/labstack/echo/v4"
)

// HandleSearchSyntheticAnime
//
// @summary searches for synthetic anime by title.
// @desc Returns synthetic anime entries that match the search query.
// @route /api/v1/anime/synthetic/search [POST]
// @returns []*models.SyntheticAnime
func (h *Handler) HandleSearchSyntheticAnime(c echo.Context) error {
    type body struct {
        Query string `json:"query"`
        Limit int    `json:"limit"`
    }

    var b body
    if err := c.Bind(&b); err != nil {
        return h.RespondWithError(c, err)
    }

    if b.Query == "" {
        return h.RespondWithData(c, []*models.SyntheticAnime{})
    }

    results, err := h.App.Database.SearchSyntheticAnime(b.Query, b.Limit)
    if err != nil {
        return h.RespondWithError(c, err)
    }

    return h.RespondWithData(c, results)
}

// HandleGetSyntheticAnime
//
// @summary returns a synthetic anime by synthetic ID.
// @route /api/v1/anime/synthetic/:id [GET]
// @returns models.SyntheticAnime
func (h *Handler) HandleGetSyntheticAnime(c echo.Context) error {
    idStr := c.Param("id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        return h.RespondWithError(c, err)
    }

    anime, found := h.App.Database.GetSyntheticAnime(id)
    if !found || anime == nil {
        return h.RespondWithError(c, errors.New("synthetic anime not found"))
    }

    return h.RespondWithData(c, anime)
}
