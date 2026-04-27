package achievement

import (
	"strconv"
	"strings"
)

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

	// Meta categories (achievements about the achievement system)
	CategoryAnimeMeta Category = "anime_meta"
	CategoryMangaMeta Category = "manga_meta"
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
	TriggerComment           EvalTrigger = "comment"
	TriggerAchievementUnlock EvalTrigger = "achievement_unlock"
	TriggerAny               EvalTrigger = "any"
)

// Definition describes a single achievement (or the template for a tiered achievement).
type Definition struct {
	Key            string        `json:"Key"`
	Name           string        `json:"Name"`
	Description    string        `json:"Description"`
	Category       Category      `json:"Category"`
	IconSVG        string        `json:"IconSVG,omitempty"`
	MaxTier        int           `json:"MaxTier"`
	TierThresholds []int         `json:"TierThresholds,omitempty"`
	TierNames      []string      `json:"TierNames,omitempty"`
	Triggers       []EvalTrigger `json:"Triggers"`
	XPReward       int           `json:"XPReward"`     // Base XP per tier unlock (0 = use default)
	Difficulty     Difficulty    `json:"Difficulty"`    // Difficulty rating for XP multiplier
}

// Difficulty represents how hard an achievement is to earn.
type Difficulty string

const (
	DifficultyEasy    Difficulty = "easy"
	DifficultyMedium  Difficulty = "medium"
	DifficultyHard    Difficulty = "hard"
	DifficultyExtreme Difficulty = "extreme"
)

// DifficultyMultiplier returns the XP multiplier for a given difficulty.
func DifficultyMultiplier(d Difficulty) float64 {
	switch d {
	case DifficultyEasy:
		return 1.0
	case DifficultyMedium:
		return 1.5
	case DifficultyHard:
		return 2.5
	case DifficultyExtreme:
		return 5.0
	default:
		return 1.0
	}
}

// CategoryInfo provides display metadata for categories.
type CategoryInfo struct {
	Key         Category `json:"Key"`
	Name        string   `json:"Name"`
	Description string   `json:"Description"`
	IconSVG     string   `json:"IconSVG"`
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

// FormatThreshold replaces {threshold} in a description with the actual threshold for the given tier.
func FormatThreshold(desc string, thresholds []int, tier int) string {
	if len(thresholds) == 0 {
		return desc
	}
	idx := tier - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(thresholds) {
		idx = len(thresholds) - 1
	}
	return strings.ReplaceAll(desc, "{threshold}", strconv.Itoa(thresholds[idx]))
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

	// Meta
	{CategoryAnimeMeta, "Anime Meta Mastery", "Achievements about achievements", iconCrown},
	{CategoryMangaMeta, "Manga Meta Mastery", "Achievements about achievements", iconCrown},
}

// AllDefinitions contains every achievement definition.
var AllDefinitions []Definition

func init() {
	AllDefinitions = make([]Definition, 0, 1200)
	AllDefinitions = append(AllDefinitions, animeDefinitions...)
	AllDefinitions = append(AllDefinitions, mangaDefinitions...)
	AllDefinitions = append(AllDefinitions, metaDefinitions...)

	// Auto-assign difficulty where not explicitly set
	for i := range AllDefinitions {
		if AllDefinitions[i].Difficulty == "" {
			AllDefinitions[i].Difficulty = inferDifficulty(&AllDefinitions[i])
		}
	}
}

// inferDifficulty assigns a difficulty rating based on achievement properties.
func inferDifficulty(def *Definition) Difficulty {
	cat := string(def.Category)

	// One-time achievements (MaxTier == 0)
	if def.MaxTier == 0 {
		key := def.Key

		// Holiday/seasonal achievements are easy
		if strings.HasSuffix(cat, "_holiday") {
			return DifficultyEasy
		}
		// Special number achievements (fibonacci, palindrome, pi, nice, etc.) are easy
		if strings.HasSuffix(cat, "_special") {
			return DifficultyEasy
		}
		// Meta achievements scale by what they require
		if strings.HasSuffix(cat, "_meta") {
			if strings.Contains(key, "first_") || strings.Contains(key, "collector") {
				return DifficultyEasy
			}
			if strings.Contains(key, "dominator") || strings.Contains(key, "perfectionist") || strings.Contains(key, "completionist") {
				return DifficultyExtreme
			}
			return DifficultyMedium
		}
		// First-time achievements are easy
		if strings.Contains(key, "first_") || strings.HasSuffix(key, "_first") ||
			strings.Contains(key, "_first_") || strings.HasSuffix(key, "_first_day") {
			return DifficultyEasy
		}
		// Simple one-off achievements
		switch {
		case strings.Contains(key, "variety_pack") || strings.Contains(key, "cross_demographic") ||
			strings.Contains(key, "underdog") || strings.Contains(key, "comeback") ||
			strings.Contains(key, "rewatcher") || strings.Contains(key, "rereader") ||
			strings.Contains(key, "theatrical") || strings.Contains(key, "source_reader") ||
			strings.Contains(key, "childhood") || strings.Contains(key, "classic_reader") ||
			strings.Contains(key, "random_pick") || strings.Contains(key, "new_genre"):
			return DifficultyEasy

		// Medium: require some sustained effort
		case strings.Contains(key, "hundred_club") || strings.Contains(key, "speed_run") ||
			strings.Contains(key, "double_feature") || strings.Contains(key, "triple_") ||
			strings.Contains(key, "five_a_day") || strings.Contains(key, "seasonal_binge") ||
			strings.Contains(key, "cour_crusher") || strings.Contains(key, "binge_king") ||
			strings.Contains(key, "half_day") || strings.Contains(key, "clean_list") ||
			strings.Contains(key, "same_day_start") || strings.Contains(key, "revival") ||
			strings.Contains(key, "film_festival") || strings.Contains(key, "double_streak") ||
			strings.Contains(key, "habit_formed") || strings.Contains(key, "consistent_pace") ||
			strings.Contains(key, "morning_routine") || strings.Contains(key, "sunday_") ||
			strings.Contains(key, "rainy_day") || strings.Contains(key, "score_sniper") ||
			strings.Contains(key, "four_am") || strings.Contains(key, "midnight_") ||
			strings.Contains(key, "genre_clash") || strings.Contains(key, "volume_binge"):
			return DifficultyMedium

		// Hard: require significant effort
		case strings.Contains(key, "full_day") || strings.Contains(key, "no_sleep") ||
			strings.Contains(key, "no_zero_days") || strings.Contains(key, "iron_will") ||
			strings.Contains(key, "unbreakable") || strings.Contains(key, "completion_rate_75") ||
			strings.Contains(key, "year_long") || strings.Contains(key, "score_all") ||
			strings.Contains(key, "all_hours") || strings.Contains(key, "saga_tracker") ||
			strings.Contains(key, "century_watcher") || strings.Contains(key, "century_reader") ||
			strings.Contains(key, "ten_thousand") || strings.Contains(key, "five_hundred") ||
			strings.Contains(key, "entire_season") || strings.Contains(key, "seven_day") ||
			strings.Contains(key, "completion_spree") || strings.Contains(key, "streak_recovery") ||
			strings.Contains(key, "annual_tradition") || strings.Contains(key, "long_commitment") ||
			strings.Contains(key, "perfect_attendance") || strings.Contains(key, "zero_to"):
			return DifficultyHard

		// Extreme: near-impossible feats
		case strings.Contains(key, "hundred_day") || strings.Contains(key, "complete_catalog") ||
			strings.Contains(key, "dawn_warrior") || strings.Contains(key, "dawn_reader") ||
			strings.Contains(key, "eternal_flame") || strings.Contains(key, "completion_rate_90") ||
			strings.Contains(key, "thousand_complete") || strings.Contains(key, "power_level") ||
			strings.Contains(key, "world_record") || strings.Contains(key, "community_pillar") ||
			strings.Contains(key, "holiday_marathon") ||
			strings.Contains(key, "twilight_zone") || strings.Contains(key, "twilight_reader"):
			return DifficultyExtreme
		}
		return DifficultyMedium
	}

	// Tiered achievements — classify by the highest threshold
	if len(def.TierThresholds) > 0 {
		maxThreshold := def.TierThresholds[len(def.TierThresholds)-1]
		switch {
		case maxThreshold <= 100:
			return DifficultyEasy
		case maxThreshold <= 5000:
			return DifficultyMedium
		case maxThreshold <= 100000:
			return DifficultyHard
		default:
			return DifficultyExtreme
		}
	}

	return DifficultyMedium
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

// CategoryMap returns a map of category key -> CategoryInfo for quick lookup.
func CategoryMap() map[Category]CategoryInfo {
	m := make(map[Category]CategoryInfo, len(AllCategories))
	for _, c := range AllCategories {
		m[c.Key] = c
	}
	return m
}
