package milestone

// Category represents a milestone measurement category.
type Category string

const (
	CategoryHoursWatched        Category = "hours_watched"
	CategoryEpisodesWatched     Category = "episodes_watched"
	CategoryChaptersRead        Category = "chapters_read"
	CategorySeriesCompleted     Category = "series_completed"
	CategoryLibraryFiles        Category = "library_files"
	CategoryGenresExplored      Category = "genres_explored"
	CategoryDaysActive          Category = "days_active"
	CategoryAchievementsUnlocked Category = "achievements_unlocked"
)

// AllCategories lists every milestone category with display info.
var AllCategories = []CategoryInfo{
	{Key: CategoryHoursWatched, Name: "Hours Watched", Description: "Total hours of anime watched locally", IconSVG: iconHoursWatched},
	{Key: CategoryEpisodesWatched, Name: "Episodes Watched", Description: "Total anime episodes watched", IconSVG: iconEpisodesWatched},
	{Key: CategoryChaptersRead, Name: "Chapters Read", Description: "Total manga chapters read", IconSVG: iconChaptersRead},
	{Key: CategorySeriesCompleted, Name: "Series Completed", Description: "Total anime/manga series completed", IconSVG: iconSeriesCompleted},
	{Key: CategoryLibraryFiles, Name: "Library Files", Description: "Total files in your media library", IconSVG: iconLibraryFiles},
	{Key: CategoryGenresExplored, Name: "Genres Explored", Description: "Unique anime/manga genres watched or read", IconSVG: iconGenresExplored},
	{Key: CategoryDaysActive, Name: "Days Active", Description: "Total days with recorded activity", IconSVG: iconDaysActive},
	{Key: CategoryAchievementsUnlocked, Name: "Achievements Unlocked", Description: "Total achievements unlocked", IconSVG: iconAchievements},
}

// CategoryInfo provides display metadata for a category.
type CategoryInfo struct {
	Key         Category `json:"key"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	IconSVG     string   `json:"iconSVG"`
}

// FixedTiers are the threshold values for milestone tiers.
var FixedTiers = []int{10, 50, 100, 500, 1000, 5000}

// Definition describes a single milestone.
type Definition struct {
	Key       string   `json:"key"`       // e.g. "hours_watched_100"
	Name      string   `json:"name"`      // e.g. "Century Viewer"
	Category  Category `json:"category"`  // e.g. "hours_watched"
	Threshold int      `json:"threshold"` // e.g. 100
	IconSVG   string   `json:"iconSVG"`
}

// FirstToAchieveDefinition describes a race milestone (one winner per category).
type FirstToAchieveDefinition struct {
	Key       string   `json:"key"`       // e.g. "first_hours_watched"
	Name      string   `json:"name"`      // e.g. "Trailblazer: Hours Watched"
	Category  Category `json:"category"`
	Threshold int      `json:"threshold"` // highest tier threshold (5000)
	IconSVG   string   `json:"iconSVG"`
}

// AllDefinitions contains all individual milestone definitions (48 total: 8 categories × 6 tiers).
var AllDefinitions []Definition

// AllFirstToAchieve contains all first-to-achieve milestone definitions (8 total: 1 per category).
var AllFirstToAchieve []FirstToAchieveDefinition

func init() {
	type catMeta struct {
		category Category
		names    map[int]string // tier → display name
		icon     string
	}

	cats := []catMeta{
		{CategoryHoursWatched, map[int]string{
			10: "Casual Viewer", 50: "Dedicated Viewer", 100: "Century Viewer",
			500: "Marathon Runner", 1000: "Thousand-Hour Legend", 5000: "Eternal Watcher",
		}, iconHoursWatched},
		{CategoryEpisodesWatched, map[int]string{
			10: "First Steps", 50: "Episode Hunter", 100: "Centurion",
			500: "Binge Lord", 1000: "Episode Titan", 5000: "Anime Deity",
		}, iconEpisodesWatched},
		{CategoryChaptersRead, map[int]string{
			10: "Page Turner", 50: "Bookworm", 100: "Chapter Champion",
			500: "Reading Machine", 1000: "Manga Master", 5000: "Legendary Reader",
		}, iconChaptersRead},
		{CategorySeriesCompleted, map[int]string{
			10: "Finisher", 50: "Completionist", 100: "Series Slayer",
			500: "Library Conqueror", 1000: "Media Overlord", 5000: "Completion God",
		}, iconSeriesCompleted},
		{CategoryLibraryFiles, map[int]string{
			10: "Collector", 50: "Hoarder", 100: "Archive Builder",
			500: "Data Vault", 1000: "Library Titan", 5000: "Digital Librarian",
		}, iconLibraryFiles},
		{CategoryGenresExplored, map[int]string{
			10: "Curious Mind", 50: "Genre Hopper", 100: "Taste Explorer",
			500: "Omnivore", 1000: "Genre Sage", 5000: "Universal Connoisseur",
		}, iconGenresExplored},
		{CategoryDaysActive, map[int]string{
			10: "Regular", 50: "Devoted", 100: "Streak Keeper",
			500: "Daily Warrior", 1000: "Ironclad", 5000: "Eternal Flame",
		}, iconDaysActive},
		{CategoryAchievementsUnlocked, map[int]string{
			10: "Trophy Novice", 50: "Trophy Hunter", 100: "Achievement Addict",
			500: "Completionist Elite", 1000: "Trophy Titan", 5000: "Achievement Deity",
		}, iconAchievements},
	}

	AllDefinitions = make([]Definition, 0, len(cats)*len(FixedTiers))
	AllFirstToAchieve = make([]FirstToAchieveDefinition, 0, len(cats))

	for _, c := range cats {
		for _, tier := range FixedTiers {
			name := c.names[tier]
			if name == "" {
				name = string(c.category) + " " + itoa(tier)
			}
			AllDefinitions = append(AllDefinitions, Definition{
				Key:       string(c.category) + "_" + itoa(tier),
				Name:      name,
				Category:  c.category,
				Threshold: tier,
				IconSVG:   c.icon,
			})
		}
		// First-to-achieve: highest tier (5000)
		AllFirstToAchieve = append(AllFirstToAchieve, FirstToAchieveDefinition{
			Key:       "first_" + string(c.category),
			Name:      "Trailblazer: " + getCategoryName(c.category),
			Category:  c.category,
			Threshold: FixedTiers[len(FixedTiers)-1],
			IconSVG:   c.icon,
		})
	}
}

func getCategoryName(c Category) string {
	for _, ci := range AllCategories {
		if ci.Key == c {
			return ci.Name
		}
	}
	return string(c)
}

func itoa(n int) string {
	switch {
	case n >= 1000:
		return string(rune('0'+n/1000)) + "000"
	default:
		s := ""
		for n > 0 {
			s = string(rune('0'+n%10)) + s
			n /= 10
		}
		if s == "" {
			return "0"
		}
		return s
	}
}

// SVG icons for milestone categories
const (
	iconHoursWatched    = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
	iconEpisodesWatched = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
	iconChaptersRead    = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
	iconSeriesCompleted = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
	iconLibraryFiles    = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
	iconGenresExplored  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
	iconDaysActive      = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
	iconAchievements    = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`
)
