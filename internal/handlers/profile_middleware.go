package handlers

import (
	"errors"
	"seanime/internal/core"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// profileSessionRenewAfter is how old a token has to be before a request renews it.
//
// A session runs for its full day and is rolled over near the end of it, rather than being reissued
// on every request that happens to be a little old. So a client in use is signed in indefinitely,
// picking up a fresh token about once a day, and the signing work happens once a day rather than on
// the great many requests this app makes while a page is merely sitting there.
const profileSessionRenewAfter = core.ProfileSessionDuration - time.Hour

// ProfileSessionMiddleware extracts and validates the profile session token from the
// X-Seanime-Profile-Token header and sets it in the echo context.
// This runs after OptionalAuthMiddleware and FeaturesMiddleware.
//
// It also renews: a session near the end of its day, or one issued by an earlier run of the server,
// comes back with a fresh token in the X-Seanime-Profile-Token response header, which the client
// stores. So a session lasts a day, rolls over into another day whenever the app is being used, and
// a restart of the server renews it rather than ending it.
func (h *Handler) ProfileSessionMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if h.App.ProfileManager == nil {
			return next(c)
		}

		token := c.Request().Header.Get("X-Seanime-Profile-Token")
		if token == "" {
			return next(c)
		}

		payload, err := core.ValidateProfileSessionToken(
			h.App.ProfileManager.GetJWTSecret(),
			h.App.ProfileManager.GetSessionEpoch(),
			token,
		)

		// A session from an earlier run of the server is honoured and reissued, not refused. The
		// server restarting is not the user signing out, and treating it as one is what had this
		// app asking for a PIN several times a day.
		fromPreviousRun := errors.Is(err, core.ErrSessionFromPreviousRun)
		if payload == nil || (err != nil && !fromPreviousRun) {
			// Token invalid or expired — signal expiry to the frontend so it can clear the stale
			// token and offer a way to sign in again.
			c.Response().Header().Set("X-Seanime-Profile-Expired", "true")
			return next(c)
		}

		c.Set("profileSession", payload)

		if fromPreviousRun || time.Now().Unix()-payload.IssuedAt > int64(profileSessionRenewAfter.Seconds()) {
			if newToken, err := core.CreateProfileSessionToken(
				h.App.ProfileManager.GetJWTSecret(),
				h.App.ProfileManager.GetSessionEpoch(),
				payload.ProfileID,
				payload.IsAdmin,
				payload.ClientID,
			); err == nil {
				c.Response().Header().Set("X-Seanime-Profile-Token", newToken)
			}
		}

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
