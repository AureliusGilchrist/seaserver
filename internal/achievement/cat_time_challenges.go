package achievement

var timeChallengeDefinitions = []Definition{
	{
		Key:      "four_am_club",
		Name:     "4 AM Club",
		Description: "Watch anime at 4 AM",
		Category: CategoryTimeChallenge,
		MaxTier:  0,
		Triggers: []EvalTrigger{TriggerEpisodeProgress},
	},
	{
		Key:      "the_witching_hour",
		Name:     "The Witching Hour",
		Description: "Start an episode at exactly 3:00 AM (±5 min)",
		Category: CategoryTimeChallenge,
		MaxTier:  0,
		Triggers: []EvalTrigger{TriggerSessionUpdate},
	},
	{
		Key:      "five_more_minutes",
		Name:     "Five More Minutes",
		Description: "Watch past your bedtime 3 nights in a row (start before 11 PM, still watching after midnight)",
		Category: CategoryTimeChallenge,
		MaxTier:  0,
		Triggers: []EvalTrigger{TriggerSessionUpdate},
	},
	{
		Key:      "all_nighter",
		Name:     "All-Nighter",
		Description: "Watch anime from 10 PM to 6 AM continuously",
		Category: CategoryTimeChallenge,
		MaxTier:  0,
		Triggers: []EvalTrigger{TriggerSessionUpdate},
	},
	{
		Key:      "twenty_four_hour_marathon",
		Name:     "24-Hour Marathon",
		Description: "Watch anime for 24 consecutive hours",
		Category: CategoryTimeChallenge,
		MaxTier:  0,
		Triggers: []EvalTrigger{TriggerSessionUpdate},
	},
	{
		Key:      "golden_hour",
		Name:     "Golden Hour",
		Description: "Watch anime during golden hour (1 hr before sunset)",
		Category: CategoryTimeChallenge,
		MaxTier:  0,
		Triggers: []EvalTrigger{TriggerSessionUpdate},
	},
}
