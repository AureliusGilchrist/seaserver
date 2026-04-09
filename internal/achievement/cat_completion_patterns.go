package achievement

var completionPatternDefinitions = []Definition{
	{
		Key:            "clean_finish",
		Name:           "Clean Finish",
		Description:    "Complete an anime and rate it within 24 hours {threshold} times",
		Category:       CategoryCompletionPattern,
		MaxTier:        5,
		TierThresholds: []int{5, 15, 30, 50, 100},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerRatingChange},
	},
	{
		Key:            "planned_watcher",
		Name:           "Planned Watcher",
		Description:    "Move {threshold} anime from Plan to Watch to Completed",
		Category:       CategoryCompletionPattern,
		MaxTier:        5,
		TierThresholds: []int{5, 15, 30, 50, 100},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerStatusChange},
	},
	{
		Key:            "quick_pick",
		Name:           "Quick Pick",
		Description:    "Start and complete an anime within 48 hours {threshold} times",
		Category:       CategoryCompletionPattern,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
	{
		Key:            "slow_burn",
		Name:           "Slow Burn",
		Description:    "Take {threshold}+ months to complete a series (but finish it!)",
		Category:       CategoryCompletionPattern,
		MaxTier:        5,
		TierThresholds: []int{3, 6, 12, 24, 48},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
}
