package achievement

var discoveryDefinitions = []Definition{
	{
		Key:            "seasonal_completionist",
		Name:           "Seasonal Completionist",
		Description:    "Complete every anime you start in a season {threshold} times",
		Category:       CategoryDiscovery,
		MaxTier:        5,
		TierThresholds: []int{1, 2, 4, 8, 12},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
	{
		Key:            "no_drop_zone",
		Name:           "No Drop Zone",
		Description:    "Go {threshold} months without dropping an anime",
		Category:       CategoryDiscovery,
		MaxTier:        5,
		TierThresholds: []int{1, 3, 6, 12, 24},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerStatusChange},
	},
	{
		Key:            "try_everything",
		Name:           "Try Everything",
		Description:    "Start {threshold}+ anime in a single day",
		Category:       CategoryDiscovery,
		MaxTier:        5,
		TierThresholds: []int{3, 5, 10, 15, 20},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerStatusChange},
	},
	{
		Key:            "back_to_back",
		Name:           "Back to Back",
		Description:    "Complete {threshold} anime series in a single day",
		Category:       CategoryDiscovery,
		MaxTier:        5,
		TierThresholds: []int{2, 3, 4, 5, 7},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
}
