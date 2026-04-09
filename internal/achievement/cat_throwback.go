package achievement

var throwbackDefinitions = []Definition{
	{
		Key:            "retro_appreciator",
		Name:           "Retro Appreciator",
		Description:    "Watch {threshold} anime from the 1990s or earlier",
		Category:       CategoryThrowback,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
	{
		Key:            "throwback",
		Name:           "Throwback",
		Description:    "Watch {threshold} anime that aired 20+ years ago",
		Category:       CategoryThrowback,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
	{
		Key:            "classic_connoisseur",
		Name:           "Classic Connoisseur",
		Description:    "Watch {threshold} anime from before 1980",
		Category:       CategoryThrowback,
		MaxTier:        3,
		TierThresholds: []int{1, 3, 10},
		TierNames:      []string{"I", "II", "III"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
	{
		Key:            "modern_viewer",
		Name:           "Modern Viewer",
		Description:    "Watch {threshold} anime from the current season",
		Category:       CategoryThrowback,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 10, 20, 30},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
}
