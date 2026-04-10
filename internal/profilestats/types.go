package profilestats

// ProfileStats is the response for GET /api/v1/profile/stats.
type ProfileStats struct {
	ActivityHeatmap            []*ActivityDay     `json:"activityHeatmap"`
	AnimeStreak                *StreakInfo        `json:"animeStreak"`
	MangaStreak                *StreakInfo        `json:"mangaStreak"`
	TotalActiveDays            int                `json:"totalActiveDays"`
	TotalAnimeDays             int                `json:"totalAnimeDays"`
	TotalMangaDays             int                `json:"totalMangaDays"`
	Personality                *PersonalityResult `json:"personality"`
	WatchPatterns              *WatchPatterns     `json:"watchPatterns"`
	TotalWatchMinutesWithRewatches int            `json:"totalWatchMinutesWithRewatches"`
	EstimatedReadingMinutes    int                `json:"estimatedReadingMinutes"`
}

// ActivityDay represents one day's activity for the heatmap.
type ActivityDay struct {
	Date          string `json:"date"` // "2006-01-02"
	AnimeEpisodes int    `json:"animeEpisodes"`
	MangaChapters int    `json:"mangaChapters"`
	TotalActivity int    `json:"totalActivity"`
}

// StreakInfo tracks anime or manga streak data.
type StreakInfo struct {
	Current    int    `json:"current"`    // consecutive days ending at today/yesterday
	Longest    int    `json:"longest"`    // longest streak ever
	LastActive string `json:"lastActive"` // date of last activity
}

// PersonalityResult is the user's anime personality classification.
type PersonalityResult struct {
	Type        string   `json:"type"`        // e.g. "battle_enthusiast"
	Name        string   `json:"name"`        // e.g. "Battle Enthusiast"
	Description string   `json:"description"` // fun description
	IconSVG     string   `json:"iconSvg"`     // inline SVG icon
	Traits      []string `json:"traits"`      // e.g. ["Action lover", "High energy"]
	TopGenres   []string `json:"topGenres"`   // top 3 contributing genres
}

// WatchPatterns contains aggregate activity patterns.
type WatchPatterns struct {
	ByDayOfWeek [7]int `json:"byDayOfWeek"` // index 0=Monday, 6=Sunday
}
