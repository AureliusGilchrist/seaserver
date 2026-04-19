package handlers

import (
	"seanime/internal/achievement"
	"seanime/internal/continuity"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleUpdateContinuityWatchHistoryItem
//
//	@summary Updates watch history item.
//	@desc This endpoint is used to update a watch history item.
//	@desc Since this is low priority, we ignore any errors.
//	@route /api/v1/continuity/item [PATCH]
//	@returns bool
func (h *Handler) HandleUpdateContinuityWatchHistoryItem(c echo.Context) error {
	type body struct {
		Options continuity.UpdateWatchHistoryItemOptions `json:"options"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)
	if profileID > 0 {
		err := h.App.ContinuityManager.UpdateWatchHistoryItemForProfile(profileID, &b.Options)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	} else {
		err := h.App.ContinuityManager.UpdateWatchHistoryItem(&b.Options)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	// Fire achievement event for session update (time-of-day tracking)
	now := time.Now()
	go h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
		ProfileID: profileID,
		Trigger:   achievement.TriggerSessionUpdate,
		MediaID:   b.Options.MediaId,
		Timestamp: now,
		Metadata: map[string]interface{}{
			"hour":   now.Hour(),
			"minute": now.Minute(),
		},
	})

	return h.RespondWithData(c, true)
}

// HandleGetContinuityWatchHistoryItem
//
//	@summary Returns a watch history item.
//	@desc This endpoint is used to retrieve a watch history item.
//	@desc If the "episode" query param is provided, returns the per-episode position instead.
//	@route /api/v1/continuity/item/{id} [GET]
//	@param id - int - true - "AniList anime media ID"
//	@returns continuity.WatchHistoryItemResponse
func (h *Handler) HandleGetContinuityWatchHistoryItem(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	force := c.QueryParam("force") == "true" || c.QueryParam("force") == "1"

	if !h.App.ContinuityManager.GetSettings().WatchContinuityEnabled && !force {
		return h.RespondWithData(c, &continuity.WatchHistoryItemResponse{
			Item:  nil,
			Found: false,
		})
	}

	// If episode query param is provided, return per-episode position
	episodeParam := c.QueryParam("episode")
	if episodeParam != "" {
		episodeNum, epErr := strconv.Atoi(episodeParam)
		if epErr != nil {
			return h.RespondWithError(c, epErr)
		}

		profileID := h.GetProfileID(c)
		var epResp *continuity.EpisodeWatchPositionResponse
		if profileID > 0 {
			epResp = h.App.ContinuityManager.GetEpisodeWatchPositionForProfile(profileID, id, episodeNum)
		} else {
			epResp = h.App.ContinuityManager.GetEpisodeWatchPosition(id, episodeNum)
		}

		if epResp.Found {
			// Convert to WatchHistoryItemResponse for backward compatibility
			return h.RespondWithData(c, &continuity.WatchHistoryItemResponse{
				Item: &continuity.WatchHistoryItem{
					MediaId:       id,
					EpisodeNumber: episodeNum,
					CurrentTime:   epResp.Item.CurrentTime,
					Duration:      epResp.Item.Duration,
					TimeUpdated:   epResp.Item.TimeUpdated,
				},
				Found: true,
			})
		}

		// Fall through to series-level lookup if no per-episode entry
	}

	profileID := h.GetProfileID(c)
	if profileID > 0 {
		resp := h.App.ContinuityManager.GetWatchHistoryItemForProfile(profileID, id)
		return h.RespondWithData(c, resp)
	}

	resp := h.App.ContinuityManager.GetWatchHistoryItem(id)
	return h.RespondWithData(c, resp)
}

// HandleGetContinuityWatchHistory
//
//	@summary Returns the continuity watch history
//	@desc This endpoint is used to retrieve all watch history items.
//	@route /api/v1/continuity/history [GET]
//	@returns continuity.WatchHistory
func (h *Handler) HandleGetContinuityWatchHistory(c echo.Context) error {
	if !h.App.ContinuityManager.GetSettings().WatchContinuityEnabled {
		ret := make(map[int]*continuity.WatchHistoryItem)
		return h.RespondWithData(c, ret)
	}

	profileID := h.GetProfileID(c)
	if profileID > 0 {
		resp := h.App.ContinuityManager.GetWatchHistoryForProfile(profileID)
		return h.RespondWithData(c, resp)
	}

	resp := h.App.ContinuityManager.GetWatchHistory()
	return h.RespondWithData(c, resp)
}
