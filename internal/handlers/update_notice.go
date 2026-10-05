package handlers

import (
	"encoding/json"
	"os"
	"path/filepath"

	"seanime/internal/updater"

	"github.com/labstack/echo/v4"
)

// What an update was, kept until the client has seen it.
//
// The auto-updater replaces the server underneath itself, so an update that happens while the
// client is closed is one the client only hears about when it next signs in — and the notice has
// to be there when it does. Stored in the data directory rather than in memory, because the
// process that wrote it is the process the update replaced.
//
// It is never pushed at the PIN screen, and it never dismisses itself: it is shown once the client
// is signed in, and it is gone when the person looking at it says so.

// HandleGetUpdateNotice
//
//	@summary returns the pending update notice, if there is one.
//	@desc The message and description of the commit the server last updated to, kept until the
//	@desc client dismisses it. Never shown before the client has signed in — this endpoint is what
//	@desc the signed-in app polls.
//	@route /api/v1/update/notice [GET]
//	@returns handlers.UpdateNoticeResponse
func (h *Handler) HandleGetUpdateNotice(c echo.Context) error {
	path := filepath.Join(h.App.Config.Data.AppDataDir, updater.UpdateNoticeFileName)

	data, err := os.ReadFile(path)
	if err != nil {
		return h.RespondWithData(c, nil) // nothing pending, which is the normal case
	}

	var notice updater.UpdateNotice
	if err := json.Unmarshal(data, &notice); err != nil {
		// Not readable back — it is gone as far as anyone can tell from it, so it is removed
		// rather than shown broken forever.
		_ = os.Remove(path)
		return h.RespondWithData(c, nil)
	}

	return h.RespondWithData(c, notice)
}

// HandleDismissUpdateNotice
//
//	@summary dismisses the update notice.
//	@desc Removes it. Nothing else is touched.
//	@route /api/v1/update/notice/dismiss [POST]
//	@returns bool
func (h *Handler) HandleDismissUpdateNotice(c echo.Context) error {
	path := filepath.Join(h.App.Config.Data.AppDataDir, updater.UpdateNoticeFileName)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}
