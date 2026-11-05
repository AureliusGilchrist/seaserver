package handlers

import (
	"errors"
	"net/http"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"strings"

	"github.com/labstack/echo/v4"
)

// HandleGetClientPrefs
//
//	@summary returns all client preferences stored for the current profile.
//	@desc Returns a map of key -> JSON-encoded value strings. The value strings are opaque to the server.
//	@desc Pass scope=global to read preferences shared across profiles.
//	@desc Used by the web client to hydrate UI state (UI customizer, easter eggs, theme settings, etc.) on bootstrap.
//	@route /api/v1/client-prefs [GET]
//	@returns map[string]string
func (h *Handler) HandleGetClientPrefs(c echo.Context) error {
	database := h.GetProfileDatabase(c)
	if c.QueryParam("scope") == "global" {
		database = h.App.Database
	}
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
//	@desc Pass scope=global to write a preference shared across profiles.
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
	if c.QueryParam("scope") == "global" {
		database = h.App.Database
	}
	pref, err := database.UpsertClientPref(b.Key, b.Value)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	h.broadcastClientPref(c, b.Key, b.Value, false)
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
	if c.QueryParam("scope") == "global" {
		database = h.App.Database
	}
	if err := database.DeleteClientPref(key); err != nil {
		return h.RespondWithError(c, err)
	}
	h.broadcastClientPref(c, key, "", true)
	return h.RespondWithData(c, true)
}

// broadcastClientPref tells the profile's other open clients (web, Denshi, Denshi Mobile) that a
// synced preference changed, so they apply it live instead of on their next load. Global-scope
// preferences go to every client. `origin` (the writing tab's id, from the query string) lets the
// writer ignore its own echo.
func (h *Handler) broadcastClientPref(c echo.Context, key string, value string, deleted bool) {
	if h.App.WSEventManager == nil {
		return
	}
	scope := "profile"
	if c.QueryParam("scope") == "global" {
		scope = "global"
	}
	payload := map[string]any{
		"key":     key,
		"value":   value,
		"deleted": deleted,
		"scope":   scope,
		"origin":  c.QueryParam("origin"),
	}
	if scope == "global" {
		h.App.WSEventManager.SendEvent(events.ClientPrefUpdated, payload)
		return
	}
	h.App.WSEventManager.SendEventToProfile(h.GetProfileID(c), events.ClientPrefUpdated, payload)
}

var _ = models.ClientPref{} // ensure package import even if codegen drops the type reference
