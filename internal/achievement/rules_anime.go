package achievement

import (
	"time"
)

// Rules that only exist for anime.

func animeMinutes(f *Facts) float64 {
	n := 0
	for _, e := range f.Anime.entries {
		d := e.m.duration
		if d <= 0 {
			d = 24
		}
		n += e.consumed() * d
	}
	return float64(n)
}

func init() {
	// Milestones
	reg("a_hours_invested", func(f *Facts) float64 { return animeMinutes(f) / 60 })
	reg("a_time_lord", func(f *Facts) float64 { return animeMinutes(f) / 60 })
	reg("a_ten_thousand_min", func(f *Facts) float64 { return b2f(animeMinutes(f) >= 10000) })
	reg("a_days_spent_watching", func(f *Facts) float64 { return animeMinutes(f) / 1440 })
	reg("a_season_veteran", func(f *Facts) float64 { return float64(f.Anime.distinct(false, seasonOf)) })
	reg("a_unique_studios", func(f *Facts) float64 { return float64(f.Anime.distinct(false, studiosOf)) })
	reg("a_studio_hopper", func(f *Facts) float64 { return float64(f.Anime.distinct(false, studiosOf)) })

	// Binge
	reg("a_rainy_day", atLeast(maxPerDayR(A), 20))
	// All of a 12-episode (one-cour) series inside one sitting.
	reg("a_speed_run", func(f *Facts) float64 {
		for _, ss := range f.Anime.sessions() {
			per := map[int]int{}
			for _, r := range ss {
				per[r.mediaID]++
				if r.m != nil && r.m.episodes >= 10 && r.m.episodes <= 14 && per[r.mediaID] >= r.m.episodes {
					return 1
				}
			}
		}
		return 0
	})
	// Every episode of a one-cour seasonal series in one calendar day.
	reg("a_seasonal_binge", func(f *Facts) float64 {
		per := map[int]map[dayKey]int{}
		for _, r := range f.Anime.consumption {
			if r.m == nil || r.m.episodes < 10 || r.m.episodes > 14 {
				continue
			}
			if per[r.mediaID] == nil {
				per[r.mediaID] = map[dayKey]int{}
			}
			k := dayOf(r.at)
			per[r.mediaID][k]++
			if per[r.mediaID][k] >= r.m.episodes {
				return 1
			}
		}
		return 0
	})
	// Ten anime from one season (of a year) watched within a month.
	reg("a_season_sweep", func(f *Facts) float64 {
		return b2f(groupedWithin(f.Anime, 30, func(m *mediaInfo) []string {
			if m.season == "" || m.year <= 0 {
				return nil
			}
			return []string{m.season + itoa(m.year)}
		}) >= 10)
	})
	reg("a_entire_season", func(f *Facts) float64 {
		return b2f(allWithin(f.Anime, 24, 3*24*time.Hour))
	})

	// Genres (AniList genres) and tags
	for key, g := range map[string]string{
		"a_genre_action": "Action", "a_genre_adventure": "Adventure", "a_genre_comedy": "Comedy",
		"a_genre_drama": "Drama", "a_genre_fantasy": "Fantasy", "a_genre_horror": "Horror",
		"a_genre_mystery": "Mystery", "a_genre_romance": "Romance", "a_genre_scifi": "Sci-Fi",
		"a_genre_sol": "Slice of Life", "a_genre_sports": "Sports", "a_genre_supernatural": "Supernatural",
		"a_genre_thriller": "Thriller", "a_genre_mecha": "Mecha", "a_genre_music": "Music",
		"a_genre_psychological": "Psychological", "a_genre_ecchi": "Ecchi", "a_genre_mahou_shoujo": "Mahou Shoujo",
	} {
		reg(key, seenWith(A, genre(g)))
	}
	for key, tags := range animeTagRules {
		reg(key, seenWith(A, tagAny(tags...)))
	}

	// Completion
	reg("a_short_complete", doneWith(A, func(m *mediaInfo) bool { return m.episodes > 0 && m.episodes < 6 }))
	reg("a_short_series_explorer", doneWith(A, func(m *mediaInfo) bool { return m.episodes >= 1 && m.episodes <= 6 }))
	reg("a_long_series_explorer", doneWith(A, func(m *mediaInfo) bool { return m.episodes >= 50 }))
	// A season (of a year) with 3+ series started, all of them finished.
	reg("a_seasonal_clear", func(f *Facts) float64 {
		started, done := map[string]int{}, map[string]int{}
		for _, e := range f.Anime.entries {
			k := seasonOf(e)
			if len(k) == 0 || !e.seen() {
				continue
			}
			started[k[0]]++
			if e.done() {
				done[k[0]]++
			}
		}
		for k, n := range started {
			if n >= 3 && done[k] == n {
				return 1
			}
		}
		return 0
	})

	// Dedication
	reg("a_studio_devotee", func(f *Facts) float64 { return float64(f.Anime.maxGroup(false, studiosOf)) })
	reg("a_favorite_studio_5", func(f *Facts) float64 { return b2f(f.Anime.maxGroup(false, studiosOf) >= 5) })
	// Every series you started from a studio you have watched 10+ of, finished.
	reg("a_complete_catalog", func(f *Facts) float64 {
		seen, done := map[string]int{}, map[string]int{}
		for _, e := range f.Anime.entries {
			if !e.seen() {
				continue
			}
			for _, s := range studiosOf(e) {
				seen[s]++
				if e.done() {
					done[s]++
				}
			}
		}
		for s, n := range seen {
			if n >= 10 && done[s] == n {
				return 1
			}
		}
		return 0
	})
	reg("a_director_fan", func(f *Facts) float64 { return float64(f.Anime.maxGroup(false, staffWhere(isDirector))) })
	reg("a_staff_follower", func(f *Facts) float64 {
		return float64(f.Anime.maxGroup(false, staffWhere(func(string) bool { return true })))
	})
	reg("a_voice_actor_fan", func(f *Facts) float64 { return float64(f.Anime.maxGroup(false, voiceActorsOf)) })
	// Music-centred anime: the Music genre or a band / idol / musical story.
	reg("a_ost_lover", seenWith(A, func(m *mediaInfo) bool {
		return m.hasGenre("Music") || m.hasTag("Band") || m.hasTag("Musical Theater") || m.hasTag("Idol") || m.hasTag("Female Idol") || m.hasTag("Male Idol")
	}))
	// An anime adapted from a manga you have read.
	reg("a_source_reader", func(f *Facts) float64 {
		for _, e := range f.Anime.entries {
			if !e.seen() || e.m.ex == nil {
				continue
			}
			for _, r := range e.m.ex.Relations {
				if (r.Type == "SOURCE" || r.Type == "ADAPTATION") && !r.Anime {
					if me := f.Manga.byID[r.ID]; me != nil && me.seen() {
						return 1
					}
				}
			}
		}
		return 0
	})
	// Kept up as it aired: started within a week of the premiere, finished within a week of the finale.
	reg("a_perfect_attendance", func(f *Facts) float64 {
		for _, e := range f.Anime.entries {
			if !e.done() || e.m.format != "TV" || e.m.startDate.IsZero() || e.m.endDate.IsZero() {
				continue
			}
			first, last := e.started, e.completed
			if fl, ok := f.Anime.firstLast()[e.m.id]; ok {
				first, last = fl[0], fl[1]
			}
			if first.IsZero() || last.IsZero() {
				continue
			}
			if first.Sub(e.m.startDate) <= 7*24*time.Hour && first.After(e.m.startDate.Add(-24*time.Hour)) &&
				last.Sub(e.m.endDate) <= 7*24*time.Hour {
				return 1
			}
		}
		return 0
	})
	// Series whose every TV season you have finished.
	reg("a_multi_season_fan", func(f *Facts) float64 {
		n := 0
		for _, fr := range f.Anime.franchises(sequelLinks, seasonFormats) {
			if len(fr.members) >= 2 && allDone(fr) {
				n++
			}
		}
		return float64(n)
	})
	reg("a_season_dedication", func(f *Facts) float64 { return float64(f.Anime.maxGroup(false, seasonOf)) })
	reg("a_seasonal_completionist", func(f *Facts) float64 { return float64(f.Anime.maxGroup(false, seasonOf)) })

	// Discovery
	reg("a_foreign_cinema", anySeen(A, func(m *mediaInfo) bool { return m.country != "" && m.country != "JP" }))
	reg("a_global_anime", func(f *Facts) float64 {
		return float64(f.Anime.distinct(false, func(e *entry) []string { return []string{e.m.country} }))
	})
	reg("a_every_season", func(f *Facts) float64 {
		per := map[int]map[string]bool{}
		for _, e := range f.Anime.entries {
			if !e.seen() || e.m.season == "" || e.m.year <= 0 {
				continue
			}
			if per[e.m.year] == nil {
				per[e.m.year] = map[string]bool{}
			}
			per[e.m.year][e.m.season] = true
			if len(per[e.m.year]) == 4 {
				return 1
			}
		}
		return 0
	})
	reg("a_random_pick", func(f *Facts) float64 { return b2f(f.Anime.actions["random_pick"] > 0) })
	// Started within its first airing season (within 90 days of the premiere).
	reg("a_upcoming_watcher", func(f *Facts) float64 {
		return float64(f.Anime.count(func(e *entry) bool {
			if !e.seen() || e.m.startDate.IsZero() {
				return false
			}
			first := e.started
			if fl, ok := f.Anime.firstLast()[e.m.id]; ok {
				first = fl[0]
			}
			if first.IsZero() {
				return false
			}
			d := first.Sub(e.m.startDate)
			return d >= -24*time.Hour && d <= 90*24*time.Hour
		}))
	})

	// Time
	reg("a_witching_hour", func(f *Facts) float64 {
		return b2f(f.Anime.countWhere(func(r logRow) bool { return r.at.Hour() == 3 && r.m.hasGenre("Horror") }) > 0)
	})

	// Formats
	for key, fs := range map[string][]string{
		"a_tv_watcher": {"TV"}, "a_movie_buff": {"MOVIE"}, "a_ova_hunter": {"OVA"}, "a_ona_explorer": {"ONA"},
		"a_special_watcher": {"SPECIAL"}, "a_tv_short": {"TV_SHORT"}, "a_music_video": {"MUSIC"},
	} {
		reg(key, seenWith(A, format(fs...)))
	}
	reg("a_theatrical", anySeen(A, format("MOVIE")))
	reg("a_short_king", seenWith(A, func(m *mediaInfo) bool { return m.duration > 0 && m.duration < 5 }))
	reg("a_double_length", seenWith(A, func(m *mediaInfo) bool { return m.duration >= 40 }))
	reg("a_mini_series", seenWith(A, func(m *mediaInfo) bool {
		return m.episodes >= 1 && m.episodes <= 3 && m.format != "MOVIE" && m.format != "MUSIC"
	}))
	reg("a_long_movie", anySeen(A, func(m *mediaInfo) bool { return m.format == "MOVIE" && m.duration > 120 }))
	reg("a_anthology", atLeast(seenWith(A, tagAny("Anthology")), 5))
	reg("a_episodic_master", doneWith(A, tagAny("Episodic")))
	reg("a_variety_pack", func(f *Facts) float64 {
		set := map[string]bool{}
		for _, e := range f.Anime.entries {
			if e.seen() {
				set[e.m.format] = true
			}
		}
		for _, x := range []string{"TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"} {
			if !set[x] {
				return 0
			}
		}
		return 1
	})
	reg("a_format_balance", func(f *Facts) float64 {
		per := map[string]int{}
		for _, e := range f.Anime.entries {
			if e.seen() && e.m.format != "" {
				per[e.m.format]++
			}
		}
		n := 0
		for _, c := range per {
			if c >= 5 {
				n++
			}
		}
		return b2f(n >= 3)
	})
	// Anything that is not a TV series: movies, OVAs, ONAs, specials, shorts, music videos.
	reg("a_format_master", doneWith(A, func(m *mediaInfo) bool { return m.format != "" && m.format != "TV" }))
	// Already finished airing when you started it.
	reg("a_back_catalog", func(f *Facts) float64 {
		return float64(f.Anime.count(func(e *entry) bool {
			if !e.seen() {
				return false
			}
			if !e.started.IsZero() && !e.m.endDate.IsZero() {
				return e.started.After(e.m.endDate)
			}
			return e.m.status == "FINISHED"
		}))
	})
	// Commercials: a minute or less. Promotional videos: one-episode specials or ONAs under five minutes.
	reg("a_cm_watcher", seenWith(A, func(m *mediaInfo) bool { return m.duration == 1 }))
	reg("a_pv_collector", seenWith(A, func(m *mediaInfo) bool {
		return (m.format == "SPECIAL" || m.format == "ONA") && m.episodes == 1 && m.duration > 1 && m.duration < 5
	}))
	reg("a_film_festival", func(f *Facts) float64 {
		return b2f(distinctMediaInWindow(f.Anime.consumption, 7, func(r logRow) bool { return r.m != nil && r.m.format == "MOVIE" }) >= 5)
	})
	reg("a_movie_marathon", func(f *Facts) float64 {
		return b2f(distinctMediaInWindow(f.Anime.consumption, 1, func(r logRow) bool { return r.m != nil && r.m.format == "MOVIE" }) >= 3)
	})
	// A movie continuing a TV series you have finished.
	reg("a_sequel_movie", func(f *Facts) float64 {
		for _, e := range f.Anime.entries {
			if !e.seen() || e.m.format != "MOVIE" || e.m.ex == nil {
				continue
			}
			for _, r := range e.m.ex.Relations {
				if r.Type == "PREQUEL" && r.Anime {
					if tv := f.Anime.byID[r.ID]; tv != nil && tv.done() && tv.m.format == "TV" {
						return 1
					}
				}
			}
		}
		return 0
	})
	// A recap/summary of a series you have finished.
	reg("a_recap_watcher", func(f *Facts) float64 {
		for _, e := range f.Anime.entries {
			if !e.done() || e.m.ex == nil {
				continue
			}
			for _, r := range e.m.ex.Relations {
				if r.Type == "SUMMARY" && r.Anime {
					if x := f.Anime.byID[r.ID]; x != nil && x.seen() {
						return 1
					}
				}
			}
		}
		return 0
	})

	// Special
	reg("a_all_tens", func(f *Facts) float64 {
		return b2f(f.Anime.count(func(e *entry) bool { return e.done() && e.m.episodes == 10 && e.score >= 10 }) > 0)
	})

	// Streaks
	reg("a_genre_streak", func(f *Facts) float64 { return float64(longestKeyedDayRun(f, f.Anime, mediaGenres)) })
	reg("a_studio_streak", func(f *Facts) float64 { return float64(longestKeyedDayRun(f, f.Anime, mediaStudios)) })

	registerSocial()
}

var animeTagRules = map[string][]string{
	"a_tag_isekai":           {"Isekai"},
	"a_tag_harem":            {"Male Harem", "Female Harem", "Mixed Gender Harem", "Harem"},
	"a_tag_bl":               {"Boys' Love"},
	"a_tag_gl":               {"Yuri", "Girls' Love"},
	"a_tag_historical":       {"Historical"},
	"a_tag_military":         {"Military"},
	"a_tag_school":           {"School"},
	"a_tag_martial_arts":     {"Martial Arts"},
	"a_tag_vampire":          {"Vampire"},
	"a_tag_samurai":          {"Samurai"},
	"a_tag_space":            {"Space", "Space Opera"},
	"a_tag_parody":           {"Parody"},
	"a_tag_idol":             {"Idol", "Female Idol", "Male Idol"},
	"a_tag_post_apocalyptic": {"Post-Apocalyptic"},
	"a_tag_cyberpunk":        {"Cyberpunk"},
	"a_tag_shounen":          {"Shounen"},
	"a_tag_seinen":           {"Seinen"},
	"a_tag_shoujo":           {"Shoujo"},
	"a_tag_josei":            {"Josei"},
	"a_tag_survival":         {"Survival"},
}

// allWithin reports whether some series of at least minUnits had all its episodes/chapters
// consumed inside the window.
func allWithin(s *side, minUnits int, window time.Duration) bool {
	rows := map[int][]time.Time{}
	for _, r := range s.consumption {
		if r.dayOnly || r.m == nil || r.m.units() < minUnits {
			continue
		}
		rows[r.mediaID] = append(rows[r.mediaID], r.at)
	}
	for id, ts := range rows {
		units := s.byID[id].unitsOr(0)
		if units < minUnits || len(ts) < units {
			continue
		}
		// Any `units` consecutive rows inside the window.
		for i := 0; i+units-1 < len(ts); i++ {
			if ts[i+units-1].Sub(ts[i]) <= window {
				return true
			}
		}
	}
	return false
}

func (e *entry) unitsOr(def int) int {
	if e == nil || e.m == nil {
		return def
	}
	return e.m.units()
}

// longestKeyedDayRun is the longest run of consecutive days on which some single key (genre,
// studio, author) was watched/read every day.
func longestKeyedDayRun(f *Facts, s *side, keys func(m *mediaInfo) []string) int {
	per := map[string]map[dayKey]bool{}
	for _, r := range s.consumption {
		if r.m == nil {
			continue
		}
		for _, k := range keys(r.m) {
			if per[k] == nil {
				per[k] = map[dayKey]bool{}
			}
			per[k][dayOf(r.at)] = true
		}
	}
	best := 0
	for _, days := range per {
		if n := longestDayRun(days, f.TZ); n > best {
			best = n
		}
	}
	return best
}

// ── Watch parties and the community ──────────────────────────────────────────────────────────

func registerSocial() {
	parties := func(f *Facts, hostOnly bool) []partySession {
		if !hostOnly {
			return f.Parties
		}
		var out []partySession
		for _, p := range f.Parties {
			if p.host {
				out = append(out, p)
			}
		}
		return out
	}
	rowsIn := func(f *Facts, p partySession) []logRow {
		var out []logRow
		for _, r := range f.Anime.consumption {
			if !r.dayOnly && !r.at.Before(p.start) && !r.at.After(p.end.Add(5*time.Minute)) {
				out = append(out, r)
			}
		}
		return out
	}
	partyDays := func(f *Facts, hostOnly bool) map[dayKey]bool {
		out := map[dayKey]bool{}
		for _, p := range parties(f, hostOnly) {
			out[dayOf(p.start)] = true
		}
		return out
	}

	reg("a_first_party", func(f *Facts) float64 { return b2f(len(f.Parties) > 0) })
	reg("a_party_host", func(f *Facts) float64 { return float64(len(parties(f, true))) })
	reg("a_party_regular", func(f *Facts) float64 { return float64(len(f.Parties)) })
	reg("a_social_butterfly", func(f *Facts) float64 {
		set := map[string]bool{}
		for _, p := range f.Parties {
			for _, x := range p.peers {
				set[x] = true
			}
		}
		return float64(len(set))
	})
	// Peers who joined parties you hosted — they watched what you put on.
	reg("a_recommendation_giver", func(f *Facts) float64 {
		set := map[string]bool{}
		for _, p := range parties(f, true) {
			for _, x := range p.peers {
				set[x] = true
			}
		}
		return float64(len(set))
	})
	reg("a_group_binge", func(f *Facts) float64 {
		best := 0
		for _, p := range f.Parties {
			if n := len(rowsIn(f, p)); n > best {
				best = n
			}
		}
		return float64(best)
	})
	reg("a_sync_viewer", func(f *Facts) float64 {
		for _, p := range f.Parties {
			if p.end.Sub(p.start) >= 30*time.Minute {
				return 1
			}
		}
		return 0
	})
	reg("a_party_marathon", func(f *Facts) float64 {
		for _, p := range parties(f, true) {
			if p.end.Sub(p.start) >= 4*time.Hour {
				return 1
			}
		}
		return 0
	})
	reg("a_full_house", func(f *Facts) float64 {
		for _, p := range f.Parties {
			if p.maxPeers >= 5 {
				return 1
			}
		}
		return 0
	})
	reg("a_party_veteran", func(f *Facts) float64 {
		h := 0.0
		for _, p := range f.Parties {
			h += p.end.Sub(p.start).Hours()
		}
		return h
	})
	reg("a_late_night_party", func(f *Facts) float64 {
		for _, p := range f.Parties {
			if dayOf(p.start) != dayOf(p.end) || p.start.Hour() < 4 {
				return 1
			}
		}
		return 0
	})
	reg("a_silent_viewer", func(f *Facts) float64 {
		for _, p := range f.Parties {
			if !p.host && p.chatMessages == 0 && p.end.Sub(p.start) >= 10*time.Minute {
				return 1
			}
		}
		return 0
	})
	reg("a_watch_party_streak", func(f *Facts) float64 { return float64(longestWeekRun(partyDays(f, false), f.TZ)) })
	reg("a_weekly_party", func(f *Facts) float64 { return float64(longestWeekRun(partyDays(f, true), f.TZ)) })
	reg("a_diverse_party", func(f *Facts) float64 {
		set := map[string]bool{}
		for _, p := range f.Parties {
			for _, r := range rowsIn(f, p) {
				if r.m != nil {
					for _, g := range r.m.genres {
						set[g] = true
					}
				}
			}
		}
		return b2f(len(set) >= 5)
	})
	// A hosted party of 3+ episodes that all share a genre.
	reg("a_genre_party", func(f *Facts) float64 {
		for _, p := range parties(f, true) {
			rows := rowsIn(f, p)
			if len(rows) < 3 || rows[0].m == nil {
				continue
			}
			for _, g := range rows[0].m.genres {
				all := true
				for _, r := range rows[1:] {
					if !r.m.hasGenre(g) {
						all = false
						break
					}
				}
				if all {
					return 1
				}
			}
		}
		return 0
	})
	// A finished series every logged episode of which was watched in a party.
	reg("a_party_completionist", func(f *Facts) float64 {
		inParty := map[int]int{}
		for _, p := range f.Parties {
			for _, r := range rowsIn(f, p) {
				inParty[r.mediaID]++
			}
		}
		total := f.Anime.consumedCount()
		for _, e := range f.Anime.entries {
			if e.done() && e.m.episodes > 0 && inParty[e.m.id] >= e.m.episodes && inParty[e.m.id] == total[e.m.id] {
				return 1
			}
		}
		return 0
	})
	// Rated something within three days of watching it in a party.
	reg("a_social_scorer", func(f *Facts) float64 {
		watched := map[int][]time.Time{}
		for _, p := range f.Parties {
			for _, r := range rowsIn(f, p) {
				watched[r.mediaID] = append(watched[r.mediaID], r.at)
			}
		}
		for _, s := range f.Anime.scores {
			for _, t := range watched[s.mediaID] {
				if d := s.at.Sub(t); d >= 0 && d <= 3*24*time.Hour {
					return 1
				}
			}
		}
		return 0
	})
	reg("a_commentator", func(f *Facts) float64 { return float64(f.CommentAnime) })
	reg("a_community_pillar", func(f *Facts) float64 { return b2f(len(f.SocialDays) >= 30) })
}
