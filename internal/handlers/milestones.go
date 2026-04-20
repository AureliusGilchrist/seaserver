package handlers

import (
	"seanime/internal/milestone"

	"github.com/labstack/echo/v4"
)

// HandleGetMilestones
//
//	@summary returns all milestone definitions and achieved milestones.
//	@route /api/v1/milestones [GET]
//	@returns milestone.ListResponse
func (h *Handler) HandleGetMilestones(c echo.Context) error {
	achieved := make([]milestone.AchievedMilestone, 0)

	dbMilestones, err := h.App.Database.GetAllGlobalMilestones()
	if err == nil {
		for _, m := range dbMilestones {
			am := milestone.AchievedMilestone{
				Key:              m.Key,
				Category:         m.Category,
				Tier:             m.Tier,
				IsFirstToAchieve: m.IsFirstToAchieve,
				ProfileID:        m.ProfileID,
				ProfileName:      m.ProfileName,
			}
			if m.AchievedAt != nil {
				ts := m.AchievedAt.Format("2006-01-02T15:04:05Z")
				am.AchievedAt = &ts
			}
			achieved = append(achieved, am)
		}
	}

	return h.RespondWithData(c, milestone.ListResponse{
		Definitions:    milestone.AllDefinitions,
		FirstToAchieve: milestone.AllFirstToAchieve,
		Categories:     milestone.AllCategories,
		Achieved:       achieved,
	})
}
