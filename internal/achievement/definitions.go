package achievement

// Category represents an achievement category for grouping and display.
type Category string

const (
	// Anime categories
	CategoryAnimeMilestones  Category = "anime_milestones"
	CategoryAnimeBinge       Category = "anime_binge"
	CategoryAnimeGenres      Category = "anime_genres"
	CategoryAnimeCompletion  Category = "anime_completion"
	CategoryAnimeDedication  Category = "anime_dedication"
	CategoryAnimeDiscovery   Category = "anime_discovery"
	CategoryAnimeTime        Category = "anime_time"
	CategoryAnimeSocial      Category = "anime_social"
	CategoryAnimeSpecial     Category = "anime_special"
	CategoryAnimeFormats     Category = "anime_formats"
	CategoryAnimeStreaks     Category = "anime_streaks"
	CategoryAnimeScoring     Category = "anime_scoring"
	CategoryAnimeHoliday     Category = "anime_holiday"

	// Manga categories
	CategoryMangaMilestones  Category = "manga_milestones"
	CategoryMangaBinge       Category = "manga_binge"
	CategoryMangaGenres      Category = "manga_genres"
	CategoryMangaCompletion  Category = "manga_completion"
	CategoryMangaDedication  Category = "manga_dedication"
	CategoryMangaDiscovery   Category = "manga_discovery"
	CategoryMangaTime        Category = "manga_time"
	CategoryMangaSpecial     Category = "manga_special"
	CategoryMangaFormats     Category = "manga_formats"
	CategoryMangaStreaks     Category = "manga_streaks"
	CategoryMangaScoring     Category = "manga_scoring"
	CategoryMangaCreative    Category = "manga_creative"
	CategoryMangaHoliday     Category = "manga_holiday"
)

// EvalTrigger defines what type of event triggers reevaluation.
type EvalTrigger string

const (
	TriggerEpisodeProgress   EvalTrigger = "episode_progress"
	TriggerSeriesComplete    EvalTrigger = "series_complete"
	TriggerChapterProgress   EvalTrigger = "chapter_progress"
	TriggerMangaComplete     EvalTrigger = "manga_complete"
	TriggerRatingChange      EvalTrigger = "rating_change"
	TriggerStatusChange      EvalTrigger = "status_change"
	TriggerSessionUpdate     EvalTrigger = "session_update"
	TriggerCollectionRefresh EvalTrigger = "collection_refresh"
	TriggerFavoriteToggle    EvalTrigger = "favorite_toggle"
	TriggerNakamaEvent       EvalTrigger = "nakama_event"
	TriggerPlatformEvent     EvalTrigger = "platform_event"
	TriggerAny               EvalTrigger = "any"
)

// Definition describes a single achievement (or the template for a tiered achievement).
type Definition struct {
	Key            string        `json:"key"`
	Name           string        `json:"name"`
	Description    string        `json:"description"`
	Category       Category      `json:"category"`
	IconSVG        string        `json:"iconSVG,omitempty"`
	MaxTier        int           `json:"maxTier"`
	TierThresholds []int         `json:"tierThresholds,omitempty"`
	TierNames      []string      `json:"tierNames,omitempty"`
	Triggers       []EvalTrigger `json:"triggers"`
	XPReward       int           `json:"xpReward"` // Base XP per tier unlock (0 = use default)
}

// CategoryInfo provides display metadata for categories.
type CategoryInfo struct {
	Key         Category `json:"key"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	IconSVG     string   `json:"iconSVG"`
}

// TierLabel returns the Roman numeral label for a tier (1-10).
func TierLabel(tier int) string {
	labels := []string{"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"}
	if tier >= 1 && tier <= 10 {
		return labels[tier]
	}
	return ""
}

// DefaultTierXP returns the default XP for unlocking a given tier.
func DefaultTierXP(tier int) int {
	xp := []int{0, 50, 100, 200, 400, 800, 1200, 1800, 2500, 3500, 5000}
	if tier >= 1 && tier <= 10 {
		return xp[tier]
	}
	if tier == 0 {
		return 150 // one-time achievement
	}
	return 50
}

// AllCategories returns display info for all categories.
var AllCategories = []CategoryInfo{
	// Anime
	{CategoryAnimeMilestones, "Anime Milestones", "Your anime journey in numbers", iconMilestone},
	{CategoryAnimeBinge, "Anime Binge", "For the marathon watchers", iconFlame},
	{CategoryAnimeGenres, "Anime Genre Mastery", "Explore every genre", iconCompass},
	{CategoryAnimeCompletion, "Anime Completion", "Finishing what you start", iconCheck},
	{CategoryAnimeDedication, "Anime Dedication", "Devoted to the craft", iconHeart},
	{CategoryAnimeDiscovery, "Anime Discovery", "Broadening your horizons", iconSearch},
	{CategoryAnimeTime, "Anime Time", "When you watch matters", iconClock},
	{CategoryAnimeSocial, "Anime Social", "Better together", iconUsers},
	{CategoryAnimeSpecial, "Anime Special", "Unique feats", iconSparkle},
	{CategoryAnimeFormats, "Anime Formats", "Every format has its charm", iconGrid},
	{CategoryAnimeStreaks, "Anime Streaks", "Consistency is key", iconStreak},
	{CategoryAnimeScoring, "Anime Scoring", "The critic's corner", iconStar},
	{CategoryAnimeHoliday, "Anime Holiday", "Festive watching", iconCalendar},

	// Manga
	{CategoryMangaMilestones, "Manga Milestones", "Your reading journey in numbers", iconBook},
	{CategoryMangaBinge, "Manga Binge", "For the voracious readers", iconFlame},
	{CategoryMangaGenres, "Manga Genre Mastery", "Read across all genres", iconCompass},
	{CategoryMangaCompletion, "Manga Completion", "Closing the last chapter", iconCheck},
	{CategoryMangaDedication, "Manga Dedication", "A reader's devotion", iconHeart},
	{CategoryMangaDiscovery, "Manga Discovery", "Discovering new worlds", iconSearch},
	{CategoryMangaTime, "Manga Time", "When you read matters", iconClock},
	{CategoryMangaSpecial, "Manga Special", "Unique reading feats", iconSparkle},
	{CategoryMangaFormats, "Manga Formats", "Every format tells a story", iconGrid},
	{CategoryMangaStreaks, "Manga Streaks", "Daily dedication", iconStreak},
	{CategoryMangaScoring, "Manga Scoring", "The literary critic", iconStar},
	{CategoryMangaCreative, "Manga Creative", "Creative reading patterns", iconPen},
	{CategoryMangaHoliday, "Manga Holiday", "Festive reading", iconCalendar},
}

// AllDefinitions contains every achievement definition.
var AllDefinitions []Definition

func init() {
	AllDefinitions = make([]Definition, 0, 1200)
	AllDefinitions = append(AllDefinitions, animeDefinitions...)
	AllDefinitions = append(AllDefinitions, mangaDefinitions...)
}

// TotalAchievementCount returns the total number of individual achievement entries (including all tiers).
func TotalAchievementCount() int {
	count := 0
	for _, d := range AllDefinitions {
		if d.MaxTier == 0 {
			count++
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
