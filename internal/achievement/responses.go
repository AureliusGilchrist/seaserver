package achievement

// ListResponse is returned by the get-all endpoint.
type ListResponse struct {
	Definitions  []Definition      `json:"definitions"`
	Categories   []CategoryInfo    `json:"categories"`
	Achievements []Entry           `json:"achievements"`
	Summary      SummaryResponse   `json:"summary"`
}

// Entry represents a single achievement row with its progress/unlock state.
type Entry struct {
	Key        string  `json:"key"`
	Tier       int     `json:"tier"`
	IsUnlocked bool    `json:"isUnlocked"`
	UnlockedAt *string `json:"unlockedAt"`
	Progress   float64 `json:"progress"`
}

// SummaryResponse is the summary of unlocked achievements.
type SummaryResponse struct {
	TotalCount    int64 `json:"totalCount"`
	UnlockedCount int64 `json:"unlockedCount"`
}
