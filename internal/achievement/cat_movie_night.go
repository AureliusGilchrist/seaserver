package achievement

var movieNightDefinitions = []Definition{
	{
		Key:            "movie_night",
		Name:           "Movie Night",
		Description:    "Watch {threshold} anime movies in a single day",
		Category:       CategoryMovieNight,
		MaxTier:        5,
		TierThresholds: []int{2, 3, 5, 7, 10},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
	{
		Key:            "film_buff",
		Name:           "Film Buff",
		Description:    "Watch {threshold} total anime movies",
		Category:       CategoryMovieNight,
		MaxTier:        5,
		TierThresholds: []int{5, 15, 30, 50, 100},
		TierNames:      []string{"I", "II", "III", "IV", "V"},
		Triggers:       []EvalTrigger{TriggerCollectionRefresh},
	},
	{
		Key:            "double_feature",
		Name:           "Double Feature",
		Description:    "Watch 2+ movies back-to-back {threshold} times",
		Category:       CategoryMovieNight,
		MaxTier:        3,
		TierThresholds: []int{1, 5, 15},
		TierNames:      []string{"I", "II", "III"},
		Triggers:       []EvalTrigger{TriggerSeriesComplete},
	},
}
