package handlers

import (
	"errors"
	"seanime/internal/api/anilist"
	"seanime/internal/platforms/shared_platform"

	"github.com/labstack/echo/v4"
)

// HandleAddAnimeToPlanning
//
//	@summary adds an anime to the signed-in user's own AniList PLANNING list.
//	@desc This targets the user's real AniList account, NOT the shared planning-slut account.
//	@desc If AniList is unreachable, the change is queued and replayed automatically once the
//	@desc API is available again, and the response reports queued=true.
//	@route /api/v1/anilist/planning [POST]
//	@returns handlers.AddToPlanningResponse
func (h *Handler) HandleAddAnimeToPlanning(c echo.Context) error {
	type body struct {
		MediaId int `json:"mediaId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.MediaId <= 0 {
		return h.RespondWithError(c, errors.New("mediaId is required"))
	}

	if h.App.AnilistClientManager == nil {
		return h.RespondWithError(c, errors.New("AniList is not configured"))
	}

	profileID := h.GetProfileID(c)

	// Resolve the user's own account. ResolveClientForWrites never returns the shared
	// planning-slut client, so this can't add to the wrong list.
	client, resolvedProfileID := h.App.AnilistClientManager.ResolveClientForWrites(profileID)
	if client == nil || !client.IsAuthenticated() {
		return h.RespondWithError(c, errors.New("no AniList account is linked to this profile"))
	}

	status := anilist.MediaListStatusPlanning
	mediaID := b.MediaId

	// Status-only mutation: an anime already on the list keeps its score and progress.
	_, err := client.UpdateMediaListEntryStatus(c.Request().Context(), &mediaID, &status)
	if err != nil {
		// AniList unreachable — queue it rather than losing the action.
		if shared_platform.IsOutageError(err) && resolvedProfileID > 0 {
			h.App.AnilistClientManager.EnqueueStatusUpdate(resolvedProfileID, mediaID, status)
			h.App.Logger.Warn().Int("mediaId", mediaID).Msg("anilist: AniList unreachable; queued add-to-planning for later sync")
			return h.RespondWithData(c, AddToPlanningResponse{Added: true, Queued: true})
		}
		return h.RespondWithError(c, err)
	}

	// Refresh the user's cached collection so the new entry shows up immediately.
	if resolvedProfileID > 0 {
		h.App.AnilistClientManager.InvalidateAnimeCollection(resolvedProfileID)
	}
	go func() {
		_, _ = h.App.GetAnimeCollection(true)
	}()

	h.App.Logger.Info().Int("mediaId", mediaID).Uint("profileID", resolvedProfileID).Msg("anilist: Added anime to planning")

	return h.RespondWithData(c, AddToPlanningResponse{Added: true, Queued: false})
}

// AddToPlanningResponse is the result of adding an anime to the user's planning list.
type AddToPlanningResponse struct {
	Added bool `json:"added"`
	// Queued is true when AniList was unreachable and the change was stored for replay.
	Queued bool `json:"queued"`
}
