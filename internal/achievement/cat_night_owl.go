package achievement

var nightOwlDefinitions = []Definition{
	{
		Key:            "night_owl",
		Name:           "Night Owl",
		Description:    "Watch {threshold}+ episodes between midnight and 6 AM",
		Category:       CategoryNightOwl,
		MaxTier:        5,
		TierThresholds: []int{5, 25, 100, 250, 500},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerEpisodeProgress},
	},
	{
		Key:            "dawn_patrol",
		Name:           "Dawn Patrol",
		Description:    "Watch from midnight until {threshold} AM",
		Category:       CategoryNightOwl,
		MaxTier:        5,
		TierThresholds: []int{3, 4, 5, 6, 7},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSessionUpdate},
	},
	{
		Key:            "midnight_premiere",
		Name:           "Midnight Premiere",
		Description:    "Start watching at exactly midnight (±5 min) {threshold} times",
		Category:       CategoryNightOwl,
		MaxTier:        3,
		TierThresholds: []int{1, 10, 50},
		TierNames:      []string{"I", "II", "III"},
		Triggers:       []EvalTrigger{TriggerSessionUpdate},
	},
	{
		Key:            "after_hours",
		Name:           "After Hours",
		Description:    "Accumulate {threshold} hours watched between 10 PM - 6 AM",
		Category:       CategoryNightOwl,
		MaxTier:        5,
		TierThresholds: []int{10, 50, 200, 500, 1000},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSessionUpdate},
	},
}
