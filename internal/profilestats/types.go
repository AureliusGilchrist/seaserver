package profilestats

// ProfileStats is the response for GET /api/v1/profile/stats.
type ProfileStats struct {
	ActivityHeatmap                []*ActivityDay     `json:"activityHeatmap"`
	AnimeStreak                    *StreakInfo        `json:"animeStreak"`
	MangaStreak                    *StreakInfo        `json:"mangaStreak"`
	TotalActiveDays                int                `json:"totalActiveDays"`
	TotalAnimeDays                 int                `json:"totalAnimeDays"`
	TotalMangaDays                 int                `json:"totalMangaDays"`
	Personality                    *PersonalityResult `json:"personality"`
	WatchPatterns                  *WatchPatterns     `json:"watchPatterns"`
	TotalWatchMinutesWithRewatches int                `json:"totalWatchMinutesWithRewatches"`
	EstimatedReadingMinutes        int                `json:"estimatedReadingMinutes"`
	// Weekly averages over the last 4 weeks
	AnimeHoursPerWeek    float64 `json:"animeHoursPerWeek"`
	MangaChaptersPerWeek float64 `json:"mangaChaptersPerWeek"`
	// Lifetime totals: an estimate of the history before tracking began, plus everything tracked since.
	Lifetime *LifetimeStats `json:"lifetime,omitempty"`
}

// LifetimeStats are a profile's all-time totals. The same shape, summed over every profile, is the
// Community page's totals.
type LifetimeStats struct {
	AnimeMinutes   int `json:"animeMinutes"`
	AnimeEpisodes  int `json:"animeEpisodes"`
	MangaMinutes   int `json:"mangaMinutes"`
	MangaChapters  int `json:"mangaChapters"`
	AnimeCompleted int `json:"animeCompleted"`
	MangaCompleted int `json:"mangaCompleted"`
	ActiveDays     int `json:"activeDays"`
	// IncludesEstimate is true when part of the totals was estimated from the AniList lists.
	IncludesEstimate bool `json:"includesEstimate"`
	// EstimatedAt is when that estimate was made (empty when there is none yet).
	EstimatedAt string `json:"estimatedAt,omitempty"`
}

// Add sums o into l (for community totals).
func (l *LifetimeStats) Add(o *LifetimeStats) {
	if o == nil {
		return
	}
	l.AnimeMinutes += o.AnimeMinutes
	l.AnimeEpisodes += o.AnimeEpisodes
	l.MangaMinutes += o.MangaMinutes
	l.MangaChapters += o.MangaChapters
	l.AnimeCompleted += o.AnimeCompleted
	l.MangaCompleted += o.MangaCompleted
	l.ActiveDays += o.ActiveDays
	l.IncludesEstimate = l.IncludesEstimate || o.IncludesEstimate
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
