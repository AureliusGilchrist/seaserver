package achievement

var socialDefinitions = []Definition{
	{
		Key:      "first_connection",
		Name:     "First Connection",
		Description: "Connect with someone on Nakama",
		Category: CategorySocial,
		MaxTier:  0,
		Triggers: []EvalTrigger{TriggerNakamaEvent},
	},
	{
		Key:            "watch_together",
		Name:           "Watch Together",
		Description:    "Complete {threshold} watch party sessions",
		Category:       CategorySocial,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerNakamaEvent},
	},
	{
		Key:            "party_host",
		Name:           "Party Host",
		Description:    "Host {threshold} watch parties",
		Category:       CategorySocial,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerNakamaEvent},
	},
	{
		Key:            "team_player",
		Name:           "Team Player",
		Description:    "Join {threshold} watch parties",
		Category:       CategorySocial,
		MaxTier:        5,
		TierThresholds: []int{1, 5, 15, 30, 50},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerNakamaEvent},
	},
}
