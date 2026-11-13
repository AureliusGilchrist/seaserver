package handlers

import (
	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// HandleGetEpisodeFavorites
//
//	@summary get the profile's favourite episodes.
//	@desc Returns favourite episodes in the order the user arranged them, each with the title and image saved when it was favourited.
//	@returns []models.EpisodeFavorite
//	@route /api/v1/episode/favorites [GET]
func (h *Handler) HandleGetEpisodeFavorites(c echo.Context) error {
	favs, err := h.GetProfileDatabase(c).GetEpisodeFavorites()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	if favs == nil {
		favs = []models.EpisodeFavorite{}
	}
	return h.RespondWithData(c, favs)
}

// HandleToggleEpisodeFavorite
//
//	@summary toggle an episode as favourite (add/remove).
//	@desc Adds the episode to favourites if not present, removes it if already favourited.
//	@returns bool
//	@route /api/v1/episode/favorites/toggle [POST]
func (h *Handler) HandleToggleEpisodeFavorite(c echo.Context) error {
	type body struct {
		MediaID       int    `json:"mediaId"`
		EpisodeNumber int    `json:"episodeNumber"`
		Title         string `json:"title"`
		Image         string `json:"image"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.MediaID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaId is required"))
	}
	if len(b.Title) > 300 {
		b.Title = b.Title[:300]
	}
	if len(b.Image) > 2048 {
		b.Image = ""
	}

	isFavorited, err := h.GetProfileDatabase(c).ToggleEpisodeFavorite(b.MediaID, b.EpisodeNumber, b.Title, b.Image)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, isFavorited)
}
