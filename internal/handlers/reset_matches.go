package handlers

import (
	"seanime/internal/database/db_bridge"
	"seanime/internal/events"

	"github.com/labstack/echo/v4"
)

// HandleResetIncorrectMatches
//
//	@summary resets files matched to incorrect media IDs.
//	@desc This allows bulk resetting of incorrectly matched files so they can be re-matched correctly.
//	@route /api/v1/library/reset-matches [POST]
//	@returns bool
func (h *Handler) HandleResetIncorrectMatches(c echo.Context) error {
	type body struct {
		MediaIds []int `json:"mediaIds"` // Media IDs to reset (files matched to these will be unmatched)
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if len(b.MediaIds) == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "No media IDs provided"))
	}

	// Get all local files
	localFiles, lfsId, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Reset local files matched to the specified media IDs
	resetCount := 0
	for _, lf := range localFiles {
		for _, mediaId := range b.MediaIds {
			if lf.MediaId == mediaId {
				lf.MediaId = 0
				resetCount++
			}
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
			h.App.Logger.Warn().Err(err).Msg("reset-matches: failed to refresh anime collection")
		}
	}()

	h.App.WSEventManager.SendEvent(events.InfoToast, "Reset matches for specified media. Files will appear in unmatched.")

	return h.RespondWithData(c, true)
}
