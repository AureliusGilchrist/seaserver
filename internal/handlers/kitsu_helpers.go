package handlers

import (
	"strconv"

	"seanime/internal/core"

	"github.com/labstack/echo/v4"
)

// atoiDefault parses a query params string with a fallback. Empty strings or invalid numbers
// return the supplied default.
func atoiDefault(s string, def int) int {
	v, err := strconv.Atoi(s)
	if err != nil || v <= 0 {
		return def
	}
	return v
}

// getProfileID returns the requesting profile id from the session payload, or 0 for an
// unauthenticated request.
//
// Many Kitsu endpoints can run with either a profile or the shared planning-slut; this function
// merely surfaces the payload and lets callers decide whether they need an authenticated platform
// or are willing to fall back to the server-wide account.
func (h *Handler) getProfileID(c echo.Context) uint {
	v := c.Get("profileSession")
	if v == nil {
		return 0
	}
	payload, ok := v.(*core.ProfileSessionPayload)
	if !ok || payload == nil {
		return 0
	}
	return payload.ProfileID
}
