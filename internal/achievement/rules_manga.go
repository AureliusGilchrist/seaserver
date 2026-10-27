package achievement

import (
	"time"
)

// Rules that only exist for manga.

func mangaReadingMinutes(f *Facts) float64 {
	// Measured reading time where there is some, otherwise six minutes a chapter.
	measured := 0
	for _, m := range f.Manga.activeMinutes {
		measured += m
	}
	estimate := f.Manga.totalUnits() * 6
	if measured > estimate {
		return float64(measured)
	}
	return float64(estimate)
}

func longStrip(m *mediaInfo) bool { return m.hasTag("Long Strip") }

func init() {
	// Milestones
	reg("m_reading_hours", func(f *Facts) float64 { return mangaReadingMinutes(f) / 60 })
	reg("m_reading_time_lord", func(f *Facts) float64 { return mangaReadingMinutes(f) / 60 })
	reg("m_days_spent_reading", func(f *Facts) float64 { return mangaReadingMinutes(f) / 1440 })
	// About twenty pages a chapter.
	reg("m_ten_thousand_pages", func(f *Facts) float64 { return b2f(f.Manga.totalUnits()*20 >= 10000) })
	reg("m_volume_collector", func(f *Facts) float64 {
		n := 0
		for _, e := range f.Manga.entries {
			if e.done() {
				n += e.m.volumes
			}
		}
		return float64(n)
	})
	reg("m_unique_authors", func(f *Facts) float64 { return float64(f.Manga.distinct(false, staffWhere(isAuthor))) })

	// Binge
	reg("m_marathon_reader", func(f *Facts) float64 {
		// Every chapter of a finished series in one day.
		per := map[int]map[dayKey]int{}
		for _, r := range f.Manga.consumption {
			e := f.Manga.byID[r.mediaID]
			if e == nil || !e.done() || e.m.chapters < 2 {
				continue
			}
			if per[r.mediaID] == nil {
				per[r.mediaID] = map[dayKey]int{}
			}
			k := dayOf(r.at)
			per[r.mediaID][k]++
			if per[r.mediaID][k] >= e.m.chapters {
				return 1
			}
		}
		return 0
	})
	// Read 50+ chapters of a 50+ chapter manga on the day you finished it.
	reg("m_speed_read", func(f *Facts) float64 {
		perDay := map[int]map[dayKey]int{}
		for _, r := range f.Manga.consumption {
			if perDay[r.mediaID] == nil {
				perDay[r.mediaID] = map[dayKey]int{}
			}
			perDay[r.mediaID][dayOf(r.at)]++
		}
		for _, c := range f.Manga.completions {
			if c.m == nil || c.m.chapters < 50 {
				continue
			}
			if perDay[c.m.id][dayOf(c.at)] >= 50 {
				return 1
			}
		}
		return 0
	})
	reg("m_full_series_rush", func(f *Facts) float64 { return b2f(allWithin(f.Manga, 100, 3*24*time.Hour)) })
	// A volume's worth (8+ chapters) of one manga in one sitting.
	reg("m_volume_binge", func(f *Facts) float64 {
		for _, ss := range f.Manga.sessions() {
			per := map[int]int{}
			for _, r := range ss {
				per[r.mediaID]++
				if per[r.mediaID] >= 8 {
					return 1
				}
			}
		}
		return 0
	})
	reg("m_oneshot_binge", func(f *Facts) float64 {
		return b2f(distinctMediaInWindow(f.Manga.consumption, 1, func(r logRow) bool { return r.m != nil && r.m.format == "ONE_SHOT" }) >= 10)
	})

	// Genres and tags
	for key, g := range map[string]string{
		"m_genre_action": "Action", "m_genre_adventure": "Adventure", "m_genre_comedy": "Comedy",
		"m_genre_drama": "Drama", "m_genre_fantasy": "Fantasy", "m_genre_horror": "Horror",
		"m_genre_mystery": "Mystery", "m_genre_romance": "Romance", "m_genre_scifi": "Sci-Fi",
		"m_genre_sol": "Slice of Life", "m_genre_sports": "Sports", "m_genre_supernatural": "Supernatural",
		"m_genre_thriller": "Thriller", "m_genre_psychological": "Psychological", "m_genre_ecchi": "Ecchi",
		"m_genre_mahou_shoujo": "Mahou Shoujo", "m_genre_mecha": "Mecha", "m_genre_music": "Music",
	} {
		reg(key, seenWith(M, genre(g)))
	}
	for key, tags := range mangaTagRules {
		reg(key, seenWith(M, tagAny(tags...)))
	}

	// Completion
	reg("m_oneshot_complete", doneWith(M, format("ONE_SHOT")))
	reg("m_short_manga_explorer", doneWith(M, func(m *mediaInfo) bool { return m.chapters >= 1 && m.chapters <= 10 }))
	reg("m_long_manga_explorer", doneWith(M, func(m *mediaInfo) bool { return m.chapters >= 100 }))
	// Every manga on your list by one author (3+ works), finished.
	reg("m_author_complete", func(f *Facts) float64 { return b2f(authorAllDone(f, 3)) })
	reg("m_complete_portfolio", func(f *Facts) float64 { return b2f(authorAllDone(f, 5)) })

	// Dedication: people
	authors := staffWhere(isAuthor)
	artists := staffWhere(isArtist)
	reg("m_mangaka_lover", func(f *Facts) float64 { return float64(f.Manga.maxGroup(false, authors)) })
	reg("m_multi_series_author", func(f *Facts) float64 { return float64(f.Manga.maxGroup(false, authors)) })
	reg("m_favorite_mangaka", func(f *Facts) float64 { return b2f(f.Manga.maxGroup(false, authors) >= 5) })
	reg("m_artist_fan", func(f *Facts) float64 { return float64(f.Manga.maxGroup(false, artists)) })
	reg("m_art_appreciator", func(f *Facts) float64 { return float64(f.Manga.distinct(false, artists)) })
	// AniList records no publishers or magazines; the original creator is the nearest real credit.
	reg("m_publisher_fan", func(f *Facts) float64 { return float64(f.Manga.maxGroup(false, staffWhere(isOriginalCreator))) })
	reg("m_publisher_hopper", func(f *Facts) float64 { return float64(f.Manga.distinct(false, staffWhere(isOriginalCreator))) })
	reg("m_serialization_explorer", func(f *Facts) float64 { return float64(f.Manga.distinct(false, yearOf)) })
	reg("m_collaboration_reader", func(f *Facts) float64 {
		return float64(f.Manga.distinct(false, func(e *entry) []string {
			var out []string
			for _, a := range authors(e) {
				for _, b := range artists(e) {
					if a != b {
						out = append(out, a+"/"+b)
					}
				}
			}
			return out
		}))
	})
	// The earliest work on your list by an author you have read 3+ works from.
	reg("m_debut_work", func(f *Facts) float64 {
		per := map[string][]*entry{}
		for _, e := range f.Manga.entries {
			if !e.seen() {
				continue
			}
			for _, a := range authors(e) {
				per[a] = append(per[a], e)
			}
		}
		for _, es := range per {
			if len(es) >= 3 {
				return 1
			}
		}
		return 0
	})
	reg("m_author_streak", func(f *Facts) float64 { return float64(longestKeyedDayRun(f, f.Manga, mediaAuthors)) })
	// The most genres read inside one unbroken daily streak.
	reg("m_diverse_streak", func(f *Facts) float64 {
		days := f.Manga.activeDays()
		genresByDay := map[dayKey]map[string]bool{}
		for _, r := range f.Manga.consumption {
			if r.m == nil {
				continue
			}
			k := dayOf(r.at)
			if genresByDay[k] == nil {
				genresByDay[k] = map[string]bool{}
			}
			for _, g := range r.m.genres {
				genresByDay[k][g] = true
			}
		}
		list := make([]time.Time, 0, len(days))
		for k := range days {
			list = append(list, k.time(f.TZ))
		}
		sortTimes(list)
		best := 0
		run := map[string]bool{}
		for i, t := range list {
			if i > 0 && dayOf(list[i-1].AddDate(0, 0, 1)) != dayOf(t) {
				run = map[string]bool{}
			}
			for g := range genresByDay[dayOf(t)] {
				run[g] = true
			}
			if len(run) > best {
				best = len(run)
			}
		}
		return float64(best)
	})

	// Dedication: adaptations
	adaptsToAnime := func(m *mediaInfo) bool {
		if m.ex == nil {
			return false
		}
		for _, r := range m.ex.Relations {
			if r.Type == "ADAPTATION" && r.Anime {
				return true
			}
		}
		return false
	}
	reg("m_source_material_fan", seenWith(M, adaptsToAnime))
	reg("m_adaptation_reader", seenWith(M, adaptsToAnime))
	watchedAdaptation := func(f *Facts, e *entry, formats map[string]bool) bool {
		if e.m.ex == nil {
			return false
		}
		for _, r := range e.m.ex.Relations {
			if r.Type == "ADAPTATION" && r.Anime && (formats == nil || formats[r.Format]) {
				if a := f.Anime.byID[r.ID]; a != nil && a.seen() {
					return true
				}
			}
		}
		return false
	}
	reg("m_manga_to_anime", func(f *Facts) float64 {
		return float64(f.Manga.count(func(e *entry) bool { return e.seen() && watchedAdaptation(f, e, nil) }))
	})
	reg("m_adaptation_compare", func(f *Facts) float64 {
		return b2f(f.Manga.count(func(e *entry) bool { return e.seen() && watchedAdaptation(f, e, nil) }) > 0)
	})
	// Its TV anime and its anime movie both watched.
	reg("m_cross_media", func(f *Facts) float64 {
		return b2f(f.Manga.count(func(e *entry) bool {
			return e.seen() && watchedAdaptation(f, e, map[string]bool{"TV": true, "TV_SHORT": true, "ONA": true}) &&
				watchedAdaptation(f, e, map[string]bool{"MOVIE": true})
		}) > 0)
	})
	reg("m_spinoff_reader", seenWith(M, func(m *mediaInfo) bool {
		if m.ex == nil {
			return false
		}
		for _, r := range m.ex.Relations {
			if r.Type == "PARENT" && !r.Anime {
				return true
			}
		}
		return false
	}))
	reg("m_remake_reader", func(f *Facts) float64 {
		for _, e := range f.Manga.entries {
			if !e.seen() || e.m.ex == nil {
				continue
			}
			for _, r := range e.m.ex.Relations {
				if r.Type == "ALTERNATIVE" && !r.Anime {
					if o := f.Manga.byID[r.ID]; o != nil && o.seen() {
						return 1
					}
				}
			}
		}
		return 0
	})
	// Kept up with an ongoing manga: new chapters read in 4+ different weeks.
	reg("m_up_to_date", func(f *Facts) float64 {
		weeks := map[int]map[weekKey]bool{}
		for _, r := range f.Manga.consumption {
			e := f.Manga.byID[r.mediaID]
			if e == nil || e.m.status != "RELEASING" {
				continue
			}
			if weeks[r.mediaID] == nil {
				weeks[r.mediaID] = map[weekKey]bool{}
			}
			weeks[r.mediaID][weekOf(dayOf(r.at), f.TZ)] = true
			if len(weeks[r.mediaID]) >= 4 {
				return 1
			}
		}
		return 0
	})

	// Discovery
	reg("m_manhwa_reader", seenWith(M, func(m *mediaInfo) bool { return m.country == "KR" }))
	reg("m_manhua_reader", seenWith(M, func(m *mediaInfo) bool { return m.country == "CN" || m.country == "TW" }))
	reg("m_world_manga", func(f *Facts) float64 {
		return b2f(f.Manga.distinct(false, func(e *entry) []string { return []string{e.m.country} }) >= 3)
	})
	// Started reading within a day of adding it to Plan to Read.
	reg("m_random_pick", func(f *Facts) float64 {
		for _, rows := range f.Manga.transitions() {
			var planned time.Time
			for _, r := range rows {
				if rowTo(r) == "PLANNING" {
					planned = r.at
				}
				if rowTo(r) == "CURRENT" && !planned.IsZero() && r.at.Sub(planned) <= 24*time.Hour {
					return 1
				}
			}
		}
		return 0
	})

	// Time
	reg("m_commute_reader", func(f *Facts) float64 {
		return float64(f.Manga.countWhere(func(r logRow) bool { return inHours(r.at, 7, 9) || inHours(r.at, 17, 19) }))
	})
	reg("m_bedtime_reader", func(f *Facts) float64 { return float64(f.Manga.countInHours(22, 24)) })
	reg("m_late_night_horror", func(f *Facts) float64 {
		return b2f(f.Manga.countWhere(func(r logRow) bool { return inHours(r.at, 0, 6) && r.m.hasGenre("Horror") }) > 0)
	})

	// Formats and styles
	reg("m_manga_format", seenWith(M, func(m *mediaInfo) bool { return m.format == "MANGA" && (m.country == "JP" || m.country == "") }))
	reg("m_manhwa_format", seenWith(M, func(m *mediaInfo) bool { return m.country == "KR" }))
	reg("m_manhua_format", seenWith(M, func(m *mediaInfo) bool { return m.country == "CN" || m.country == "TW" }))
	reg("m_ln_format", seenWith(M, format("NOVEL")))
	reg("m_light_novel_reader", seenWith(M, format("NOVEL")))
	reg("m_novel_format", seenWith(M, format("NOVEL")))
	reg("m_novel_reader", seenWith(M, format("NOVEL")))
	reg("m_oneshot_format", seenWith(M, format("ONE_SHOT")))
	reg("m_oneshot_reader", seenWith(M, format("ONE_SHOT")))
	reg("m_doujin_format", seenWith(M, source("DOUJINSHI")))
	reg("m_doujin_reader", seenWith(M, source("DOUJINSHI")))
	reg("m_webtoon_reader", seenWith(M, longStrip))
	reg("m_longstrip_reader", seenWith(M, longStrip))
	reg("m_vertical_scroll", seenWith(M, longStrip))
	reg("m_full_color", seenWith(M, tagAny("Full Color")))
	reg("m_4koma_reader", seenWith(M, tagAny("4-koma", "4-Koma", "Yonkoma")))
	reg("m_anthology_reader", atLeast(seenWith(M, tagAny("Anthology")), 5))
	reg("m_traditional_format", seenWith(M, func(m *mediaInfo) bool {
		return m.format == "MANGA" && (m.country == "JP" || m.country == "") && !longStrip(m)
	}))
	reg("m_webcomic_fan", seenWith(M, func(m *mediaInfo) bool {
		return source("WEB_NOVEL")(m) || (longStrip(m) && m.country != "JP")
	}))
	reg("m_seinen_reader", seenWith(M, tagAny("Seinen")))
	reg("m_josei_reader", seenWith(M, tagAny("Josei")))
	styleOf := func(e *entry) []string {
		var out []string
		switch e.m.format {
		case "MANGA", "ONE_SHOT", "NOVEL":
			out = append(out, e.m.format)
		}
		if longStrip(e.m) {
			out = append(out, "longstrip")
		}
		if e.m.hasTag("Full Color") {
			out = append(out, "color")
		}
		if e.m.hasTag("4-koma") {
			out = append(out, "4koma")
		}
		return out
	}
	reg("m_visual_storyteller", func(f *Facts) float64 { return b2f(f.Manga.distinct(false, styleOf) >= 5) })
	reg("m_format_variety", func(f *Facts) float64 {
		set := map[string]bool{}
		for _, e := range f.Manga.entries {
			if e.seen() {
				set[e.m.format] = true
			}
		}
		return b2f(set["MANGA"] && set["NOVEL"] && set["ONE_SHOT"])
	})
	reg("m_format_master_manga", func(f *Facts) float64 {
		return float64(f.Manga.distinct(false, func(e *entry) []string {
			out := styleOf(e)
			if e.m.country != "" && e.m.country != "JP" {
				out = append(out, "country:"+e.m.country)
			}
			return out
		}))
	})
	// Highly rated (85+) with separate story and art credits.
	reg("m_award_winning_art", func(f *Facts) float64 {
		return b2f(f.Manga.count(func(e *entry) bool {
			if !e.seen() || e.m.meanScore < 85 {
				return false
			}
			a, b := authors(e), artists(e)
			for _, x := range b {
				solo := false
				for _, y := range a {
					if x == y {
						solo = true
					}
				}
				if !solo {
					return true
				}
			}
			return false
		}) >= 5)
	})
	// A full-color edition of a classic (or a full-color manga from before 2000).
	reg("m_colored_classic", func(f *Facts) float64 {
		for _, e := range f.Manga.entries {
			if !e.seen() || !e.m.hasTag("Full Color") {
				continue
			}
			if e.m.year > 0 && e.m.year < 2000 {
				return 1
			}
			if e.m.ex != nil {
				for _, r := range e.m.ex.Relations {
					if r.Type == "ALTERNATIVE" && !r.Anime {
						if o := f.Manga.byID[r.ID]; o != nil && o.m.year > 0 && o.m.year < 2000 {
							return 1
						}
					}
				}
			}
		}
		return 0
	})

	// Special
	reg("m_chapter_match_date", func(f *Facts) float64 {
		for k, n := range f.Manga.perDay() {
			if k.d >= 2 && n == k.d {
				return 1
			}
		}
		return 0
	})
}

var mangaTagRules = map[string][]string{
	"m_genre_isekai":         {"Isekai"},
	"m_tag_isekai_new":       {"Isekai"},
	"m_genre_shounen":        {"Shounen"},
	"m_tag_harem":            {"Male Harem", "Female Harem", "Mixed Gender Harem", "Harem"},
	"m_tag_bl":               {"Boys' Love"},
	"m_tag_gl":               {"Yuri", "Girls' Love"},
	"m_tag_historical":       {"Historical"},
	"m_tag_military":         {"Military"},
	"m_tag_school":           {"School"},
	"m_tag_martial_arts":     {"Martial Arts"},
	"m_tag_vampire":          {"Vampire"},
	"m_tag_samurai":          {"Samurai"},
	"m_tag_space":            {"Space", "Space Opera"},
	"m_tag_parody":           {"Parody"},
	"m_tag_idol":             {"Idol", "Female Idol", "Male Idol"},
	"m_tag_post_apocalyptic": {"Post-Apocalyptic"},
	"m_tag_cyberpunk":        {"Cyberpunk"},
	"m_tag_shoujo":           {"Shoujo"},
	"m_tag_survival":         {"Survival"},
	"m_tag_cooking":          {"Cooking", "Food"},
	"m_tag_medical":          {"Medicine"},
	"m_tag_villainess":       {"Villainess"},
}

// authorAllDone reports an author with at least min works on the list, every one finished.
func authorAllDone(f *Facts, min int) bool {
	seen, done := map[string]int{}, map[string]int{}
	for _, e := range f.Manga.entries {
		if e.status == "PLANNING" || e.status == "" {
			continue
		}
		for _, a := range staffWhere(isAuthor)(e) {
			seen[a]++
			if e.done() {
				done[a]++
			}
		}
	}
	for a, n := range seen {
		if n >= min && done[a] == n {
			return true
		}
	}
	return false
}
