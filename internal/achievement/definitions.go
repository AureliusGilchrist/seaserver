package achievement

// Category represents an achievement category for grouping and display.
type Category string

const (
	CategoryFirstSteps       Category = "first_steps"
	CategoryBingeWatching    Category = "binge_watching"
	CategoryNightOwl         Category = "night_owl"
	CategoryEarlyBird        Category = "early_bird"
	CategoryStreakMaster     Category = "streak_master"
	CategoryEpisodeMilestone Category = "episode_milestones"
	CategoryMangaMilestone   Category = "manga_milestones"
	CategorySpeedDemon       Category = "speed_demon"
	CategoryDedication       Category = "dedication"
	CategoryGenreExplorer    Category = "genre_explorer"
	CategoryFormatExplorer   Category = "format_explorer"
	CategoryHolidaySeasonal  Category = "holiday_seasonal"
	CategorySeasonalWatcher  Category = "seasonal_watcher"
	CategoryTimeQuirky       Category = "time_quirky"
	CategoryCrossMedia       Category = "cross_media"
	CategoryMangaCreative    Category = "manga_creative"
	CategoryThrowback        Category = "throwback"
	CategoryScoring          Category = "scoring"
	CategorySocial           Category = "social"
	CategoryDiscovery        Category = "discovery"
	CategoryMovieNight       Category = "movie_night"
	CategoryTimeChallenge    Category = "time_challenges"
	CategoryCompletionPattern Category = "completion_patterns"
	CategorySpecialMedia     Category = "special_media"
	CategoryPlatform         Category = "platform_engagement"
	CategoryObscureFun       Category = "obscure_fun"
	CategoryReadingMilestone Category = "reading_milestones"
	CategoryMixed            Category = "mixed_creative"
)

// EvalTrigger defines what type of event triggers reevaluation.
type EvalTrigger string

const (
	TriggerEpisodeProgress EvalTrigger = "episode_progress" // Episode watched / progress updated
	TriggerSeriesComplete  EvalTrigger = "series_complete"  // Anime series completed
	TriggerChapterRead     EvalTrigger = "chapter_read"     // Manga chapter read
	TriggerMangaComplete   EvalTrigger = "manga_complete"   // Manga completed
	TriggerRatingChange    EvalTrigger = "rating_change"    // Score/rating changed
	TriggerStatusChange    EvalTrigger = "status_change"    // List status changed
	TriggerSessionUpdate   EvalTrigger = "session_update"   // Watch session updated (time/duration)
	TriggerCollectionRefresh EvalTrigger = "collection_refresh" // AniList collection refreshed (stat-based)
	TriggerFavoriteToggle  EvalTrigger = "favorite_toggle"  // Manga favorite toggled
	TriggerNakamaEvent     EvalTrigger = "nakama_event"     // Nakama/social event
	TriggerPlatformEvent   EvalTrigger = "platform_event"   // Extension installed, theme changed, etc.
	TriggerAny             EvalTrigger = "any"              // Evaluated on any event
)

// Definition describes a single achievement (or the template for a tiered achievement).
type Definition struct {
	Key             string      // Unique key, e.g. "binge_watcher"
	Name            string      // Display name, e.g. "Binge Watcher"
	Description     string      // Description template, may include {threshold} placeholder
	Category        Category    // Category for grouping
	IconSVG         string      // SVG icon string (category-level default if empty)
	MaxTier         int         // 0 = one-time, 1-5 for tiered
	TierThresholds  []int       // Thresholds for each tier (length = MaxTier), empty for one-time
	TierNames       []string    // Optional per-tier names (e.g. "I", "II", "III", "IV", "V")
	Triggers        []EvalTrigger // What events cause this to be re-evaluated
}

// CategoryInfo provides display metadata for categories.
type CategoryInfo struct {
	Key         Category
	Name        string
	Description string
	IconSVG     string // Default SVG icon for the category
}

// TierLabel returns the Roman numeral label for a tier (1-5).
func TierLabel(tier int) string {
	labels := []string{"", "I", "II", "III", "IV", "V"}
	if tier >= 1 && tier <= 5 {
		return labels[tier]
	}
	return ""
}

// AllCategories returns display info for all categories.
var AllCategories = []CategoryInfo{
	{CategoryFirstSteps, "First Steps", "Your first milestones", iconTrophy},
	{CategoryBingeWatching, "Binge Watching", "For the marathon watchers", iconFlame},
	{CategoryNightOwl, "Night Owl", "Burning the midnight oil", iconMoon},
	{CategoryEarlyBird, "Early Bird", "The early watcher gets the episode", iconSunrise},
	{CategoryStreakMaster, "Streak Master", "Consistency is key", iconStreak},
	{CategoryEpisodeMilestone, "Episode Milestones", "Climbing the episode ladder", iconMilestone},
	{CategoryMangaMilestone, "Manga Milestones", "A reader's journey", iconBook},
	{CategorySpeedDemon, "Speed Demon", "Fast and furious consumption", iconBolt},
	{CategoryDedication, "Dedication", "Devoted to the craft", iconHeart},
	{CategoryGenreExplorer, "Genre Explorer", "Broadening your horizons", iconCompass},
	{CategoryFormatExplorer, "Format Explorer", "Every format has its charm", iconGrid},
	{CategoryHolidaySeasonal, "Holiday & Seasonal", "Festive watching", iconCalendar},
	{CategorySeasonalWatcher, "Seasonal Watcher", "Following the seasons", iconLeaf},
	{CategoryTimeQuirky, "Time-Based Quirky", "Unusual timing achievements", iconClock},
	{CategoryCrossMedia, "Cross-Media", "Bridging anime and manga", iconBridge},
	{CategoryMangaCreative, "Manga Creative", "Creative reading patterns", iconPen},
	{CategoryThrowback, "Throwback", "Appreciating the classics", iconRewind},
	{CategoryScoring, "Scoring & Rating", "The critic's corner", iconStar},
	{CategorySocial, "Social", "Better together", iconUsers},
	{CategoryDiscovery, "Discovery & Variety", "Try everything once", iconSearch},
	{CategoryMovieNight, "Movie Night", "Anime cinema appreciation", iconFilm},
	{CategoryTimeChallenge, "Time Challenges", "Specific time feats", iconHourglass},
	{CategoryCompletionPattern, "Completion Patterns", "Finishing what you start", iconCheck},
	{CategorySpecialMedia, "Special Media", "Genre-specific mastery", iconSparkle},
	{CategoryPlatform, "Platform Engagement", "Power user status", iconSettings},
	{CategoryObscureFun, "Obscure & Fun", "Hidden gems and oddities", iconDice},
	{CategoryReadingMilestone, "Reading Milestones", "Manga reading records", iconBookOpen},
	{CategoryMixed, "Mixed & Creative", "Creative cross-category feats", iconPuzzle},
}

// AllDefinitions contains every achievement definition.
// Built at init time by combining all category definition slices.
var AllDefinitions []Definition

func init() {
	AllDefinitions = make([]Definition, 0, 200)
	AllDefinitions = append(AllDefinitions, firstStepsDefinitions...)
	AllDefinitions = append(AllDefinitions, bingeWatchingDefinitions...)
	AllDefinitions = append(AllDefinitions, nightOwlDefinitions...)
	AllDefinitions = append(AllDefinitions, earlyBirdDefinitions...)
	AllDefinitions = append(AllDefinitions, streakMasterDefinitions...)
	AllDefinitions = append(AllDefinitions, episodeMilestoneDefinitions...)
	AllDefinitions = append(AllDefinitions, mangaMilestoneDefinitions...)
	AllDefinitions = append(AllDefinitions, speedDemonDefinitions...)
	AllDefinitions = append(AllDefinitions, dedicationDefinitions...)
	AllDefinitions = append(AllDefinitions, genreExplorerDefinitions...)
	AllDefinitions = append(AllDefinitions, formatExplorerDefinitions...)
	AllDefinitions = append(AllDefinitions, holidaySeasonalDefinitions...)
	AllDefinitions = append(AllDefinitions, seasonalWatcherDefinitions...)
	AllDefinitions = append(AllDefinitions, timeQuirkyDefinitions...)
	AllDefinitions = append(AllDefinitions, crossMediaDefinitions...)
	AllDefinitions = append(AllDefinitions, mangaCreativeDefinitions...)
	AllDefinitions = append(AllDefinitions, throwbackDefinitions...)
	AllDefinitions = append(AllDefinitions, scoringDefinitions...)
	AllDefinitions = append(AllDefinitions, socialDefinitions...)
	AllDefinitions = append(AllDefinitions, discoveryDefinitions...)
	AllDefinitions = append(AllDefinitions, movieNightDefinitions...)
	AllDefinitions = append(AllDefinitions, timeChallengeDefinitions...)
	AllDefinitions = append(AllDefinitions, completionPatternDefinitions...)
	AllDefinitions = append(AllDefinitions, specialMediaDefinitions...)
	AllDefinitions = append(AllDefinitions, platformDefinitions...)
	AllDefinitions = append(AllDefinitions, obscureFunDefinitions...)
	AllDefinitions = append(AllDefinitions, readingMilestoneDefinitions...)
	AllDefinitions = append(AllDefinitions, mixedDefinitions...)
}

// TotalAchievementCount returns the total number of individual achievement entries (including all tiers).
func TotalAchievementCount() int {
	count := 0
	for _, d := range AllDefinitions {
		if d.MaxTier == 0 {
			count++ // One-time achievement
		} else {
			count += d.MaxTier
		}
	}
	return count
}

// DefinitionMap returns a map of key -> Definition for quick lookup.
func DefinitionMap() map[string]*Definition {
	m := make(map[string]*Definition, len(AllDefinitions))
	for i := range AllDefinitions {
		m[AllDefinitions[i].Key] = &AllDefinitions[i]
	}
	return m
}
