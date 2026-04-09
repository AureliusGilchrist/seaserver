package achievement

var bingeWatchingDefinitions = []Definition{
	{
		Key:            "binge_watcher",
		Name:           "Binge Watcher",
		Description:    "Watch {threshold}+ episodes in a single day",
		Category:       CategoryBingeWatching,
		MaxTier:        5,
		TierThresholds: []int{12, 24, 36, 48, 60},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerEpisodeProgress},
	},
	{
		Key:            "marathon_runner",
		Name:           "Marathon Runner",
		Description:    "Complete {threshold} full series in a single day",
		Category:       CategoryBingeWatching,
		MaxTier:        5,
		TierThresholds: []int{1, 2, 3, 4, 5},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
	{
		Key:            "weekend_warrior",
		Name:           "Weekend Warrior",
		Description:    "Watch {threshold}+ episodes on weekend days (cumulative)",
		Category:       CategoryBingeWatching,
		MaxTier:        5,
		TierThresholds: []int{50, 200, 500, 1000, 2500},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerEpisodeProgress},
	},
	{
		Key:            "non_stop",
		Name:           "Non-Stop",
		Description:    "Watch continuously for {threshold}+ hours",
		Category:       CategoryBingeWatching,
		MaxTier:        5,
		TierThresholds: []int{3, 6, 10, 16, 24},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSessionUpdate},
	},
}
