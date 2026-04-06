package handlers

import (
	"seanime/internal/database/db_bridge"
	"seanime/internal/events"

	"github.com/labstack/echo/v4"
)

// HandleResetAllMatches
//
//	@summary resets ALL media matches, making all files unmatched.
//	@desc This clears all media_id values, making every local file appear in unmatched for fresh matching.
//	@route /api/v1/library/reset-all-matches [POST]
//	@returns bool
func (h *Handler) HandleResetAllMatches(c echo.Context) error {
	// Get all local files
	localFiles, lfsId, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Reset ALL local files to unmatched (media_id = 0)
	resetCount := 0
	for _, lf := range localFiles {
		if lf.MediaId > 0 {
			lf.MediaId = 0
			resetCount++
		}
	}

	// Save the updated local files
	if resetCount > 0 {
		_, err = db_bridge.SaveLocalFiles(h.App.Database, lfsId, localFiles)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	// Trigger library refresh in background
	go func() {
		if _, err := h.App.GetAnimeCollection(true); err != nil {
			h.App.Logger.Warn().Err(err).Msg("reset-all-matches: failed to refresh anime collection")
		}
	}()

	h.App.WSEventManager.SendEvent(events.InfoToast, "All matches reset! All files will appear in unmatched for fresh matching.")

	return h.RespondWithData(c, true)
}
