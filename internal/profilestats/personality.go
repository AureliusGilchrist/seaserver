package profilestats

import (
	"sort"
)

type personalityDef struct {
	Type        string
	Name        string
	Description string
	IconSVG     string
	Traits      []string
}

var personalities = []personalityDef{
	{
		Type:        "battle_enthusiast",
		Name:        "Battle Enthusiast",
		Description: "You live for the thrill of combat. Epic clashes and power-ups are your bread and butter.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>`,
		Traits:      []string{"Adrenaline seeker", "Power scaling expert", "Tournament arc aficionado"},
	},
	{
		Type:        "romance_connoisseur",
		Name:        "Romance Connoisseur",
		Description: "Your heart flutters with every confession scene. Love stories are your true calling.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
		Traits:      []string{"Shipping expert", "Hopeless romantic", "Loves slow burns"},
	},
	{
		Type:        "mind_game_master",
		Name:        "Mind Game Master",
		Description: "You crave intellectual stimulation. Twists, mind games, and unreliable narrators keep you hooked.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 4.4 8 12 8 12s8-7.6 8-12a8 8 0 0 0-8-8Z"/><circle cx="12" cy="10" r="3"/></svg>`,
		Traits:      []string{"Theory crafter", "Detail obsessed", "Loves plot twists"},
	},
	{
		Type:        "fantasy_voyager",
		Name:        "Fantasy Voyager",
		Description: "You seek worlds beyond your own. Magic systems, mythical creatures, and epic quests fuel your imagination.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>`,
		Traits:      []string{"World-building enthusiast", "Magic system analyst", "Isekai veteran"},
	},
	{
		Type:        "scifi_pioneer",
		Name:        "Sci-Fi Pioneer",
		Description: "Technology, space, and the future fascinate you. You appreciate stories that push boundaries.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
		Traits:      []string{"Tech enthusiast", "Mecha appreciator", "Future visionary"},
	},
	{
		Type:        "comedy_guru",
		Name:        "Comedy Guru",
		Description: "Life is too short to be serious. You gravitate toward laughter, gags, and absurd humor.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>`,
		Traits:      []string{"Gag connoisseur", "Pun appreciator", "Lighthearted soul"},
	},
	{
		Type:        "drama_sage",
		Name:        "Drama Sage",
		Description: "Deep emotions and complex characters draw you in. You appreciate nuanced storytelling and character development.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
		Traits:      []string{"Character analyst", "Emotionally invested", "Story-driven"},
	},
	{
		Type:        "horror_fiend",
		Name:        "Horror Fiend",
		Description: "The dark side calls to you. Psychological horror, supernatural terror, and unsettling atmospheres are your comfort zone.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>`,
		Traits:      []string{"Thrill seeker", "Dark atmosphere lover", "Sleep optional"},
	},
	{
		Type:        "slice_of_life_zen",
		Name:        "Slice of Life Zen",
		Description: "You find beauty in the mundane. Everyday stories, warm friendships, and gentle pacing soothe your soul.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`,
		Traits:      []string{"Cozy vibes seeker", "Patience personified", "Appreciates subtlety"},
	},
	{
		Type:        "sports_champion",
		Name:        "Sports Champion",
		Description: "Competition and teamwork ignite your passion. You cheer for the underdogs and love training arcs.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
		Traits:      []string{"Team spirit", "Underdog believer", "Hype moments addict"},
	},
	{
		Type:        "eclectic_explorer",
		Name:        "Eclectic Explorer",
		Description: "Your taste knows no bounds. You sample every genre equally and refuse to be put in a box.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
		Traits:      []string{"Open-minded", "Genre agnostic", "Always exploring"},
	},
	{
		Type:        "the_completionist",
		Name:        "The Completionist",
		Description: "You don't leave things unfinished. Your completion rate is legendary and your dropped list is nearly empty.",
		IconSVG:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
		Traits:      []string{"Finish what you start", "Disciplined viewer", "Drop rate minimal"},
	},
}

type genreScore struct {
	Genre string
	Count int
	Pct   float64
}

// ClassifyPersonality determines anime personality from genre counts and collection stats.
// genreCounts: map of genre name → number of entries with that genre.
// totalEntries: total anime entries in collection.
// completedEntries: number of completed entries.
// droppedEntries: number of dropped entries.
func ClassifyPersonality(genreCounts map[string]int, totalEntries, completedEntries, droppedEntries int) *PersonalityResult {
	if totalEntries == 0 {
		return fallbackPersonality()
	}

	// Build sorted genre list by percentage
	genres := make([]genreScore, 0, len(genreCounts))
	for g, c := range genreCounts {
		genres = append(genres, genreScore{Genre: g, Count: c, Pct: float64(c) / float64(totalEntries) * 100})
	}
	sort.Slice(genres, func(i, j int) bool { return genres[i].Count > genres[j].Count })

	topGenres := make([]string, 0, 3)
	for i := 0; i < len(genres) && i < 3; i++ {
		topGenres = append(topGenres, genres[i].Genre)
	}

	// Helper: check if genre is in top N
	inTopN := func(genre string, n int) bool {
		for i := 0; i < len(genres) && i < n; i++ {
			if genres[i].Genre == genre {
				return true
			}
		}
		return false
	}

	// Helper: combined percentage of genres
	combinedPct := func(names ...string) float64 {
		var total float64
		for _, name := range names {
			if c, ok := genreCounts[name]; ok {
				total += float64(c) / float64(totalEntries) * 100
			}
		}
		return total
	}

	// Check behavior-based types first
	if totalEntries >= 10 {
		completionRate := float64(completedEntries) / float64(totalEntries)
		dropRate := float64(droppedEntries) / float64(totalEntries)
		if completionRate > 0.80 && dropRate < 0.05 {
			return buildResult("the_completionist", topGenres)
		}
	}

	// Check genre-based types (order matters — more specific first)
	if inTopN("Horror", 3) && combinedPct("Horror", "Supernatural", "Thriller") > 20 {
		return buildResult("horror_fiend", topGenres)
	}
	if inTopN("Sports", 3) && combinedPct("Sports") > 10 {
		return buildResult("sports_champion", topGenres)
	}
	if combinedPct("Psychological", "Thriller", "Mystery") > 30 {
		return buildResult("mind_game_master", topGenres)
	}
	if combinedPct("Sci-Fi") > 15 && inTopN("Sci-Fi", 2) {
		return buildResult("scifi_pioneer", topGenres)
	}
	if combinedPct("Action", "Adventure") > 35 {
		return buildResult("battle_enthusiast", topGenres)
	}
	if inTopN("Romance", 1) || combinedPct("Romance") > 20 {
		return buildResult("romance_connoisseur", topGenres)
	}
	if inTopN("Fantasy", 1) && combinedPct("Fantasy", "Supernatural") > 25 {
		return buildResult("fantasy_voyager", topGenres)
	}
	if inTopN("Slice of Life", 1) {
		return buildResult("slice_of_life_zen", topGenres)
	}
	if inTopN("Comedy", 1) {
		return buildResult("comedy_guru", topGenres)
	}
	if inTopN("Drama", 1) && !inTopN("Romance", 3) {
		return buildResult("drama_sage", topGenres)
	}

	// Diversity check: no genre dominates
	if len(genres) > 0 && genres[0].Pct < 20 {
		return buildResult("eclectic_explorer", topGenres)
	}

	// Default fallback based on top genre
	return buildResult("eclectic_explorer", topGenres)
}

func buildResult(pType string, topGenres []string) *PersonalityResult {
	for _, p := range personalities {
		if p.Type == pType {
			return &PersonalityResult{
				Type:        p.Type,
				Name:        p.Name,
				Description: p.Description,
				IconSVG:     p.IconSVG,
				Traits:      p.Traits,
				TopGenres:   topGenres,
			}
		}
	}
	return fallbackPersonality()
}

func fallbackPersonality() *PersonalityResult {
	return buildResult("eclectic_explorer", nil)
}
