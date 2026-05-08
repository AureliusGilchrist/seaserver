package handlers

import (
	"errors"
	"net/http"
	"seanime/internal/database/models"
	"strings"

	"github.com/labstack/echo/v4"
)

// HandleGetClientPrefs
//
//	@summary returns all client preferences stored for the current profile.
//	@desc Returns a map of key -> JSON-encoded value strings. The value strings are opaque to the server.
//	@desc Used by the web client to hydrate UI state (UI customizer, easter eggs, theme settings, etc.) on bootstrap.
//	@route /api/v1/client-prefs [GET]
//	@returns map[string]string
func (h *Handler) HandleGetClientPrefs(c echo.Context) error {
	database := h.GetProfileDatabase(c)
	prefs, err := database.GetClientPrefs()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	out := make(map[string]string, len(prefs))
	for _, p := range prefs {
		if p != nil {
			out[p.Key] = p.Value
		}
	}
	return h.RespondWithData(c, out)
}

// HandleUpsertClientPref
//
//	@summary creates or updates a client preference for the current profile.
//	@desc The value is an opaque JSON-encoded string owned by the web client.
//	@route /api/v1/client-prefs [PUT]
//	@returns models.ClientPref
func (h *Handler) HandleUpsertClientPref(c echo.Context) error {
	type body struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if strings.TrimSpace(b.Key) == "" {
		return h.RespondWithError(c, errors.New("key is required"))
	}
	// Cap the value size to keep one bad client from filling the DB.
	const maxValueBytes = 256 * 1024 // 256 KiB
	if len(b.Value) > maxValueBytes {
		return c.JSON(http.StatusRequestEntityTooLarge, map[string]string{"error": "value too large"})
	}

	database := h.GetProfileDatabase(c)
	pref, err := database.UpsertClientPref(b.Key, b.Value)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, pref)
}

// HandleDeleteClientPref
//
//	@summary deletes a client preference for the current profile.
//	@route /api/v1/client-prefs/:key [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteClientPref(c echo.Context) error {
	key := c.Param("key")
	if strings.TrimSpace(key) == "" {
		return h.RespondWithError(c, errors.New("key is required"))
	}
	database := h.GetProfileDatabase(c)
	if err := database.DeleteClientPref(key); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

var _ = models.ClientPref{} // ensure package import even if codegen drops the type reference
