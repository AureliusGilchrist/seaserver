package handlers

import (
	"seanime/internal/achievement"

	"github.com/labstack/echo/v4"
)

// HandleGetAnimeFavorites
//
//	@summary get the list of favorited anime media IDs.
//	@desc Returns an array of media IDs that are favorited for the current profile.
//	@returns []int
//	@route /api/v1/library/favorites [GET]
func (h *Handler) HandleGetAnimeFavorites(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)
	ids, err := pdb.GetAnimeFavoriteIDs()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, ids)
}

// HandleToggleAnimeFavorite
//
//	@summary toggle an anime as favorite (add/remove).
//	@desc Adds the anime to favorites if not present, removes it if already favorited.
//	@returns bool
//	@route /api/v1/library/favorites/toggle [POST]
func (h *Handler) HandleToggleAnimeFavorite(c echo.Context) error {
	type body struct {
		MediaID int `json:"mediaId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.MediaID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaId is required"))
	}

	pdb := h.GetProfileDatabase(c)
	isFavorited, err := pdb.ToggleAnimeFavorite(b.MediaID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Fire achievement event for favorite toggle
	go h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
		ProfileID: h.GetProfileID(c),
		Trigger:   achievement.TriggerFavoriteToggle,
		MediaID:   b.MediaID,
		Metadata: map[string]interface{}{
			"isFavorited": isFavorited,
		},
	})

	return h.RespondWithData(c, isFavorited)
}

// HandleBulkAddAnimeFavorites
//
//	@summary bulk-add anime favorites (for localStorage migration).
//	@desc Accepts an array of media IDs and adds them all as favorites, skipping duplicates.
//	@returns bool
//	@route /api/v1/library/favorites/bulk [POST]
func (h *Handler) HandleBulkAddAnimeFavorites(c echo.Context) error {
	type body struct {
		MediaIDs []int `json:"mediaIds"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	pdb := h.GetProfileDatabase(c)
	if err := pdb.BulkAddAnimeFavorites(b.MediaIDs); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}
