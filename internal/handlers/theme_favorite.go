package handlers

import (
	"strings"

	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// HandleGetThemeFavorites
//
//	@summary get the profile's favourite openings and endings.
//	@desc Returns favourite themes in the order the user arranged them, each with the song and links saved when it was favourited.
//	@returns []models.ThemeFavorite
//	@route /api/v1/theme/favorites [GET]
func (h *Handler) HandleGetThemeFavorites(c echo.Context) error {
	favs, err := h.GetProfileDatabase(c).GetThemeFavorites()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	if favs == nil {
		favs = []models.ThemeFavorite{}
	}
	return h.RespondWithData(c, favs)
}

// HandleToggleThemeFavorite
//
//	@summary toggle an opening or ending as favourite (add/remove).
//	@desc Adds the theme to favourites if not present, removes it if already favourited.
//	@returns bool
//	@route /api/v1/theme/favorites/toggle [POST]
func (h *Handler) HandleToggleThemeFavorite(c echo.Context) error {
	type body struct {
		MediaID   int    `json:"mediaId"`
		ThemeSlug string `json:"themeSlug"`
		AnimeName string `json:"animeName"`
		SongTitle string `json:"songTitle"`
		Artists   string `json:"artists"`
		VideoURL  string `json:"videoUrl"`
		AudioURL  string `json:"audioUrl"`
		Image     string `json:"image"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.MediaID == 0 || strings.TrimSpace(b.ThemeSlug) == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaId and themeSlug are required"))
	}
	clip := func(s string, n int) string {
		if len(s) > n {
			return s[:n]
		}
		return s
	}
	// Only links to animethemes.moe are kept: they are played back through the proxy.
	link := func(s string) string {
		if len(s) > 2048 || !(strings.HasPrefix(s, "https://v.animethemes.moe/") || strings.HasPrefix(s, "https://a.animethemes.moe/")) {
			return ""
		}
		return s
	}
	image := b.Image
	if len(image) > 2048 {
		image = ""
	}

	isFavorited, err := h.GetProfileDatabase(c).ToggleThemeFavorite(models.ThemeFavorite{
		MediaID:   b.MediaID,
		ThemeSlug: clip(b.ThemeSlug, 64),
		AnimeName: clip(b.AnimeName, 300),
		SongTitle: clip(b.SongTitle, 300),
		Artists:   clip(b.Artists, 500),
		VideoURL:  link(b.VideoURL),
		AudioURL:  link(b.AudioURL),
		Image:     image,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, isFavorited)
}
