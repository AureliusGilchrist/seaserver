package achievement

var crossMediaDefinitions = []Definition{
	{
		Key:            "cross_media",
		Name:           "Cross-Media",
		Description:    "Watch anime AND read manga for the same series {threshold} times",
		Category:       CategoryCrossMedia,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
	{
		Key:            "source_reader",
		Name:           "Source Reader",
		Description:    "Read the source manga BEFORE watching the anime {threshold} times",
		Category:       CategoryCrossMedia,
		MaxTier:        3,
		TierThresholds: []int{1, 5, 15},
		TierNames:      []string{"I", "II", "III"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
	{
		Key:            "adaptation_hunter",
		Name:           "Adaptation Hunter",
		Description:    "Watch the anime THEN read the source manga {threshold} times",
		Category:       CategoryCrossMedia,
		MaxTier:        3,
		TierThresholds: []int{1, 5, 15},
		TierNames:      []string{"I", "II", "III"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
}
