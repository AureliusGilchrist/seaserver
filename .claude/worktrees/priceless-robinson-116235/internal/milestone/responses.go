package milestone

// AchievedMilestone represents a milestone that has been achieved, for the API response.
type AchievedMilestone struct {
	Key              string  `json:"key"`
	Category         string  `json:"category"`
	Tier             int     `json:"tier"`
	IsFirstToAchieve bool    `json:"isFirstToAchieve"`
	ProfileID        uint    `json:"profileId"`
	ProfileName      string  `json:"profileName"`
	AchievedAt       *string `json:"achievedAt,omitempty"`
}

// ListResponse is the shape of the GET /api/v1/milestones response.
type ListResponse struct {
	Definitions    []Definition             `json:"definitions"`
	FirstToAchieve []FirstToAchieveDefinition `json:"firstToAchieve"`
	Categories     []CategoryInfo           `json:"categories"`
	Achieved       []AchievedMilestone      `json:"achieved"`
}
