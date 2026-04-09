package achievement

var firstStepsDefinitions = []Definition{
	{
		Key:         "first_episode",
		Name:        "First Episode",
		Description: "Watch your first anime episode",
		Category:    CategoryFirstSteps,
		MaxTier:     0,
		Triggers:    []EvalTrigger{TriggerEpisodeProgress},
	},
	{
		Key:         "first_chapter",
		Name:        "First Chapter",
		Description: "Read your first manga chapter",
		Category:    CategoryFirstSteps,
		MaxTier:     0,
		Triggers:    []EvalTrigger{TriggerChapterRead},
	},
	{
		Key:         "first_completion",
		Name:        "First Completion",
		Description: "Complete your first anime series",
		Category:    CategoryFirstSteps,
		MaxTier:     0,
		Triggers:    []EvalTrigger{TriggerSeriesComplete},
	},
	{
		Key:         "first_manga_complete",
		Name:        "First Manga Complete",
		Description: "Complete your first manga",
		Category:    CategoryFirstSteps,
		MaxTier:     0,
		Triggers:    []EvalTrigger{TriggerMangaComplete},
	},
	{
		Key:         "first_score",
		Name:        "First Score",
		Description: "Rate your first anime or manga",
		Category:    CategoryFirstSteps,
		MaxTier:     0,
		Triggers:    []EvalTrigger{TriggerRatingChange},
	},
	{
		Key:         "first_favorite",
		Name:        "First Favorite",
		Description: "Add your first manga to favorites",
		Category:    CategoryFirstSteps,
		MaxTier:     0,
		Triggers:    []EvalTrigger{TriggerFavoriteToggle},
	},
}
