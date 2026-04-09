package achievement

var earlyBirdDefinitions = []Definition{
	{
		Key:            "early_bird",
		Name:           "Early Bird",
		Description:    "Watch {threshold}+ episodes between 5 AM and 8 AM",
		Category:       CategoryEarlyBird,
		MaxTier:        5,
		TierThresholds: []int{5, 25, 100, 250, 500},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerEpisodeProgress},
	},
	{
		Key:            "sunrise_watcher",
		Name:           "Sunrise Watcher",
		Description:    "Start watching before 6 AM and finish after sunrise {threshold} times",
		Category:       CategoryEarlyBird,
		MaxTier:        3,
		TierThresholds: []int{1, 10, 50},
		TierNames:      []string{"I", "II", "III"},
		Triggers:       []EvalTrigger{TriggerSessionUpdate},
	},
	{
		Key:            "morning_routine",
		Name:           "Morning Routine",
		Description:    "Watch anime before 9 AM for {threshold} consecutive days",
		Category:       CategoryEarlyBird,
		MaxTier:        5,
		TierThresholds: []int{3, 7, 14, 30, 60},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerEpisodeProgress},
	},
}
