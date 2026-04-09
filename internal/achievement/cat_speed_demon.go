package achievement

var speedDemonDefinitions = []Definition{
	{
		Key:            "speed_runner",
		Name:           "Speed Runner",
		Description:    "Complete a {threshold}-episode series within 24 hours of starting",
		Category:       CategorySpeedDemon,
		MaxTier:        5,
		TierThresholds: []int{12, 24, 36, 50, 100},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
	{
		Key:            "speed_reader",
		Name:           "Speed Reader",
		Description:    "Read {threshold}+ chapters of a single manga in one sitting",
		Category:       CategorySpeedDemon,
		MaxTier:        5,
		TierThresholds: []int{20, 50, 100, 200, 500},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerChapterRead},
	},
	{
		Key:            "opening_day",
		Name:           "Opening Day",
		Description:    "Complete a series the same day it finishes airing {threshold} times",
		Category:       CategorySpeedDemon,
		MaxTier:        3,
		TierThresholds: []int{1, 5, 15},
		TierNames:      []string{"I", "II", "III"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
	{
		Key:            "same_day_finish",
		Name:           "Same Day Finish",
		Description:    "Start and complete a series in the same day {threshold} times",
		Category:       CategorySpeedDemon,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
}
