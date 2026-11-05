package handlers

import (
	"seanime/internal/achievement"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"

	"github.com/labstack/echo/v4"
)

// HandleGetTheme
//
//	@summary returns the theme settings.
//	@route /api/v1/theme [GET]
//	@returns models.Theme
func (h *Handler) HandleGetTheme(c echo.Context) error {
	theme, err := h.getThemeDatabase(c).GetTheme()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, theme)
}

// HandleUpdateTheme
//
//	@summary updates the theme settings.
//	@desc The server status should be re-fetched after this on the client.
//	@route /api/v1/theme [PATCH]
//	@returns models.Theme
func (h *Handler) HandleUpdateTheme(c echo.Context) error {
	type body struct {
		Theme models.Theme `json:"theme"`
	}

	var b body

	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Set the theme ID to 1, so we overwrite the previous settings
	b.Theme.BaseModel = models.BaseModel{
		ID: 1,
	}

	database := h.getThemeDatabase(c)
	currentTheme, err := database.GetTheme()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Home layouts live in the install-wide theme row (see the home-items handlers); a profile's
	// theme row only carries the look.
	b.Theme.HomeItems = currentTheme.HomeItems
	b.Theme.MangaHomeItems = currentTheme.MangaHomeItems

	// Update the theme settings
	if _, err := database.UpsertTheme(&b.Theme); err != nil {
		return h.RespondWithError(c, err)
	}

	// The profile's other open clients (web, Denshi, Denshi Mobile) refetch the status to pick
	// the new look up.
	h.App.WSEventManager.SendEventToProfile(h.GetProfileID(c), events.ThemeUpdated, nil)

	// Fire achievement event for theme change
	go h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
		ProfileID: h.GetProfileID(c),
		Trigger:   achievement.TriggerPlatformEvent,
		Metadata: map[string]interface{}{
			"action": "theme_change",
		},
	})

	// Send the new theme to the client
	return h.RespondWithData(c, b.Theme)
}

// getThemeDatabase returns the database that holds the requesting profile's theme.
//
// The theme (colours, banners, card and episode display, custom CSS…) is a per-profile setting:
// each profile database has its own theme row. A profile that has none yet starts from a copy of
// the install-wide theme, so the look everyone had before themes became per-profile is kept.
// Without profiles (or without a session) the install-wide theme is used.
func (h *Handler) getThemeDatabase(c echo.Context) *db.Database {
	database := h.GetProfileDatabase(c)
	if database == nil || database == h.App.Database {
		return h.App.Database
	}
	if database.HasTheme() {
		return database
	}

	global, err := h.App.Database.GetThemeCopy()
	if err != nil || global == nil {
		return database
	}
	seed := *global
	seed.BaseModel = models.BaseModel{ID: 1}
	seed.HomeItems = nil
	seed.MangaHomeItems = nil
	if _, err := database.UpsertTheme(&seed); err != nil {
		h.App.Logger.Warn().Err(err).Msg("theme: Could not copy the install-wide theme into the profile")
	}
	return database
}
