package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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

// HandleUpdateBackend
//
//	@summary updates the backend from the fork's repository.
//	@desc Fetches origin and, when the checkout is behind, pulls, builds and restarts the server.
//	@desc Used by remote clients (e.g. the desktop app connected to a NAS).
//	@route /api/v1/update/backend [POST]
//	@returns handlers.UpdateBackendResponse
func (h *Handler) HandleUpdateBackend(c echo.Context) error {
	u := updater.CurrentGitUpdater()
	if u == nil {
		return h.RespondWithError(c, errors.New("this server is not running from a git checkout, so it cannot update itself"))
	}
	started, files, err := u.UpdateNow()
	if err != nil {
		return h.respondUpdateError(c, "Manual update failed", err)
	}
	msg := "Backend is already up to date."
	if started {
		msg = "Update found. The server is building it and will restart shortly."
	}
	return h.RespondWithData(c, UpdateBackendResponse{Started: started, Message: msg, Files: files})
}

type UpdateBackendResponse struct {
	Started bool                 `json:"started"`
	Message string               `json:"message"`
	Files   []updater.FileChange `json:"files,omitempty"`
}

// CheckBackendUpdateResponse is what pulling would bring, without pulling it.
type CheckBackendUpdateResponse struct {
	Behind  bool                 `json:"behind"`
	Blocked string               `json:"blocked,omitempty"`
	Files   []updater.FileChange `json:"files"`
}

// HandleCheckBackendUpdate
//
//	@summary reports whether the backend has an update and which files it changes.
//	@route /api/v1/update/backend/check [POST]
//	@returns handlers.CheckBackendUpdateResponse
func (h *Handler) HandleCheckBackendUpdate(c echo.Context) error {
	u := updater.CurrentGitUpdater()
	if u == nil {
		return h.RespondWithError(c, errors.New("this server is not running from a git checkout, so it cannot update itself"))
	}
	behind, files, blocked, err := u.CheckPending()
	go func() { _ = u.RefreshStatus() }()
	if err != nil {
		return h.respondUpdateError(c, "Update check failed", err)
	}
	if files == nil {
		files = []updater.FileChange{}
	}
	return h.RespondWithData(c, CheckBackendUpdateResponse{Behind: behind, Blocked: blocked, Files: files})
}

// HandleGetBackendUpdateStatus
//
//	@summary returns the cached backend update status.
//	@desc Whether the fork has commits this server lacks, which ones and which files they change,
//	@desc when it last checked and when it checks next (every 5 minutes), and any check error.
//	@desc Never fetches on request — the server's own check loop keeps it current.
//	@route /api/v1/update/backend/status [GET]
//	@returns updater.UpdateStatus
func (h *Handler) HandleGetBackendUpdateStatus(c echo.Context) error {
	u := updater.CurrentGitUpdater()
	if u == nil {
		return h.RespondWithError(c, errors.New("this server is not running from a git checkout, so it cannot update itself"))
	}
	return h.RespondWithData(c, u.Status())
}

// respondUpdateError logs a failed update or check and answers with a status the client can tell
// apart: 409 while an update is already running, 502 when git or the network failed. It used to
// be a bare 500 with nothing in the log, so the reason was lost on both ends.
func (h *Handler) respondUpdateError(c echo.Context, what string, err error) error {
	code := http.StatusBadGateway
	if strings.Contains(err.Error(), "already running") {
		code = http.StatusConflict
	} else {
		h.App.Logger.Error().Err(err).Msg("selfupdate: " + what)
	}
	return c.JSON(code, NewErrorResponse(err))
}

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
