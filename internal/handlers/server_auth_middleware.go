package handlers

import (
	"errors"
	"strings"

	"github.com/labstack/echo/v4"
)

func (h *Handler) OptionalAuthMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if h.App.Config.Server.Password == "" {
			return next(c)
		}

		path := c.Request().URL.Path
		passwordHash := c.Request().Header.Get("X-Seanime-Token")

		// Allow the following paths to be accessed by anyone
		if path == "/api/v1/status" || // public but restricted
			path == "/events" || // for server events (auth handled by websocket handler)
			path == "/api/v1/image-cache" || // only ever public artwork from listed hosts, and an <img> can't send the token
			path == "/api/v1/mobile-frontend/manifest" || // the Android client checks for frontend updates before it has a session; both endpoints serve the same public web build the server already serves at /
			strings.HasPrefix(path, "/api/v1/mobile-frontend/bundle") ||
			strings.HasPrefix(path, "/api/v1/mediastream/transcode/") { // HLS segments (TODO: secure later)

			if path == "/api/v1/status" {
				// allow status requests by all clients but mark as unauthenticated
				if !secureEqual(passwordHash, h.App.ServerPasswordHash) {
					c.Set("unauthenticated", true)
				}
			}

			return next(c)
		}

		if passwordHash != "" {
			if secureEqual(passwordHash, h.App.ServerPasswordHash) {
				return next(c)
			}
			// Wrong password: slow repeated guesses from the same address down
			serverAuthGuard.failed(c.Request().Context(), c.RealIP())
		}

		// Check HMAC token in query parameter
		token := c.Request().URL.Query().Get("token")
		if token != "" {
			hmacAuth := h.App.GetServerPasswordHMACAuth()
			_, err := hmacAuth.ValidateToken(token, path)
			if err == nil {
				return next(c)
			} else {
				h.App.Logger.Debug().Err(err).Str("path", path).Msg("server auth: HMAC token validation failed")
			}
		}

		// Handle Nakama client connections
		if h.App.Settings.GetNakama().Enabled && h.App.Settings.GetNakama().IsHost {
			// Verify the Nakama host password in the client request
			// An empty host password never matches (secureEqual), so a host without one can't
			// be reached by a request that simply omits the header.
			nakamaPasswordHeader := c.Request().Header.Get("X-Seanime-Nakama-Token")
			isNakamaPath := path == "/api/v1/nakama/ws" || // peer-to-host WebSocket
				strings.HasPrefix(path, "/api/v1/nakama/host/") // the only paths Nakama clients may use

			if isNakamaPath && nakamaPasswordHeader != "" {
				if secureEqual(nakamaPasswordHeader, h.App.Settings.GetNakama().HostPassword) {
					c.Response().Header().Set("X-Seanime-Nakama-Is-Client", "true")
					return next(c)
				}
				serverAuthGuard.failed(c.Request().Context(), c.RealIP())
			}
		}

		return h.RespondWithError(c, errors.New("UNAUTHENTICATED"))
	}
}
