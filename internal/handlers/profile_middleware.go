package handlers

import (
	"seanime/internal/core"
	"strings"

	"github.com/labstack/echo/v4"
)

// ProfileSessionMiddleware extracts and validates the profile session token
// from the X-Seanime-Profile-Token header and sets it in the echo context.
// This runs after OptionalAuthMiddleware and FeaturesMiddleware.
func (h *Handler) ProfileSessionMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if h.App.ProfileManager == nil {
			return next(c)
		}

		token := c.Request().Header.Get("X-Seanime-Profile-Token")
		if token == "" {
			return next(c)
		}

		payload, err := core.ValidateProfileSessionToken(h.App.ProfileManager.GetJWTSecret(), token)
		if err != nil {
			// Token invalid/expired — continue without profile context
			return next(c)
		}

		c.Set("profileSession", payload)
		return next(c)
	}
}

// RequireProfileAdmin is a middleware that ensures the current profile session
// belongs to an admin. Returns 403 if not admin.
func (h *Handler) RequireProfileAdmin(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		session := c.Get("profileSession")
		if session == nil {
			// No profile session — check if profiles system is active
			if h.App.ProfileManager != nil {
				if h.App.ProfileManager.HasProfiles() {
					return echo.NewHTTPError(401, "profile session required")
				}
			}
			return next(c)
		}

		payload := session.(*core.ProfileSessionPayload)
		if !payload.IsAdmin {
			return echo.NewHTTPError(403, "admin access required")
		}

		return next(c)
	}
}

// RequireProfileSession is a middleware that ensures a valid profile session exists.
// Returns 401 if no active profile session and profiles system is active.
func (h *Handler) RequireProfileSession(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Skip enforcement if profile system not active
		if h.App.ProfileManager == nil {
			return next(c)
		}

	if !h.App.ProfileManager.HasProfiles() {
			return next(c)
		}

		// Allow profile-related routes without a session
		path := c.Request().URL.Path
		if strings.HasPrefix(path, "/api/v1/profiles") || path == "/api/v1/status" {
			return next(c)
		}

		session := c.Get("profileSession")
		if session == nil {
			return echo.NewHTTPError(401, "profile session required")
		}

		return next(c)
	}
}
