package handlers

import (
	"seanime/internal/api/anilist"
	"seanime/internal/core"
	"seanime/internal/database/db"

	"github.com/labstack/echo/v4"
)

// GetProfileDatabase returns the per-profile database for the request's authenticated profile.
// Falls back to the global database if no profile session exists or profiles are not active.
func (h *Handler) GetProfileDatabase(c echo.Context) *db.Database {
	if h.App.ProfileDatabaseManager == nil {
		return h.App.Database
	}

	session := c.Get("profileSession")
	if session == nil {
		return h.App.Database
	}

	payload := session.(*core.ProfileSessionPayload)
	database, err := h.App.ProfileDatabaseManager.GetDatabase(payload.ProfileID)
	if err != nil {
		h.App.Logger.Error().Err(err).Uint("profileID", payload.ProfileID).Msg("handler: Failed to get profile database, falling back to global")
		return h.App.Database
	}

	return database
}

// GetProfileID extracts the profile ID from the request context. Returns 0 if not authenticated.
func (h *Handler) GetProfileID(c echo.Context) uint {
	session := c.Get("profileSession")
	if session == nil {
		return 0
	}
	return session.(*core.ProfileSessionPayload).ProfileID
}

// GetProfileSession extracts the profile session payload from the request context. Returns nil if not authenticated.
func (h *Handler) GetProfileSession(c echo.Context) *core.ProfileSessionPayload {
	session := c.Get("profileSession")
	if session == nil {
		return nil
	}
	return session.(*core.ProfileSessionPayload)
}

// GetProfileAnilistClient returns the AniList client for the request's authenticated profile.
// Falls back to the global client if no profile session exists or profiles are not active.
func (h *Handler) GetProfileAnilistClient(c echo.Context) anilist.AnilistClient {
	if h.App.AnilistClientManager == nil {
		return h.App.AnilistClientRef.Get()
	}

	profileID := h.GetProfileID(c)
	return h.App.AnilistClientManager.GetClient(profileID)
}

// IsProfileAuthenticated checks if the current profile has a linked AniList account.
func (h *Handler) IsProfileAuthenticated(c echo.Context) bool {
	client := h.GetProfileAnilistClient(c)
	return client.IsAuthenticated()
}
