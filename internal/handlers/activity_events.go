package handlers

import (
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleGetActivityEvents
//
//	@summary returns granular activity events for the current profile.
//	@desc Returns individual discrete events (episode watched, file matched, etc.)
//	@desc with optional filtering by event type and limit.
//	@param limit - int - false - "Max number of events to return (default 50)"
//	@param type - string - false - "Filter by event type"
//	@param days - int - false - "Number of days to look back (default 30)"
//	@returns []*models.ActivityEvent
//	@route /api/v1/activity-events [GET]
func (h *Handler) HandleGetActivityEvents(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)

	limit := 50
	if l := c.QueryParam("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}

	days := 30
	if d := c.QueryParam("days"); d != "" {
		if v, err := strconv.Atoi(d); err == nil && v > 0 {
			days = v
		}
	}

	since := time.Now().AddDate(0, 0, -days)
	eventType := c.QueryParam("type")

	events, err := pdb.GetActivityEvents(since, limit, eventType)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, events)
}
