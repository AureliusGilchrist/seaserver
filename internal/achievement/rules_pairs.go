package achievement

import (
	"math"
	"sort"
	"time"
)

// Rules that exist once for anime and once for manga, measured the same way on each side.

func pair(animeKey, mangaKey string, mk func(sd sel) rule) {
	if animeKey != "" {
		reg(animeKey, mk(A))
	}
	if mangaKey != "" {
		reg(mangaKey, mk(M))
	}
}

func pairN(animeKey, mangaKey string, a, m float64, mk func(sd sel, n float64) rule) {
	if animeKey != "" {
		reg(animeKey, mk(A, a))
	}
	if mangaKey != "" {
		reg(mangaKey, mk(M, m))
	}
}

func constant(v float64) func(sd sel) rule {
	return func(sel) rule { return func(*Facts) float64 { return v } }
}

// ── Shared measurements ──────────────────────────────────────────────────────────────────────

func totalUnitsR(sd sel) rule { return func(f *Facts) float64 { return float64(sd(f).totalUnits()) } }

func totalUnitsAtLeast(sd sel, n float64) rule { return atLeast(totalUnitsR(sd), n) }

func entriesR(sd sel) rule { return func(f *Facts) float64 { return float64(len(sd(f).entries)) } }

func completedR(sd sel) rule { return func(f *Facts) float64 { return float64(sd(f).completed()) } }

func completedAtLeast(sd sel, n float64) rule { return atLeast(completedR(sd), n) }

func statusR(status ...string) func(sd sel) rule {
	return func(sd sel) rule {
		return func(f *Facts) float64 {
			n := 0
			for _, st := range status {
				n += sd(f).countStatus(st)
			}
			return float64(n)
		}
	}
}

func ratedR(sd sel) rule { return func(f *Facts) float64 { return float64(len(sd(f).rated())) } }

func maxPerDayR(sd sel) rule { return func(f *Facts) float64 { return float64(sd(f).maxPerDay()) } }

func activeDaySet(f *Facts, sd sel) map[dayKey]bool { return sd(f).activeDays() }

func dayRunR(sd sel) rule {
	return func(f *Facts) float64 { return float64(longestDayRun(sd(f).activeDays(), f.TZ)) }
}

func dayRunAtLeast(sd sel, n float64) rule { return atLeast(dayRunR(sd), n) }

func hoursR(from, to int) func(sd sel) rule {
	return func(sd sel) rule { return func(f *Facts) float64 { return float64(sd(f).countInHours(from, to)) } }
}

func daysInHours(f *Facts, sd sel, from, to int) map[dayKey]bool {
	return sd(f).distinctDaysWhere(func(r logRow) bool { return inHours(r.at, from, to) })
}

func distinctMediaInWindow(rows []logRow, days int, pred func(r logRow) bool) int {
	best := 0
	for i := range rows {
		set := map[int]bool{}
		start := rows[i].at
		for j := i; j < len(rows) && rows[j].at.Sub(start) < time.Duration(days)*24*time.Hour; j++ {
			if pred == nil || pred(rows[j]) {
				set[rows[j].mediaID] = true
			}
		}
		if len(set) > best {
			best = len(set)
		}
	}
	return best
}

// groupedWithin is the most distinct media sharing one key consumed within `days` days.
func groupedWithin(s *side, days int, keys func(m *mediaInfo) []string) int {
	best := 0
	rows := s.consumption
	for i := range rows {
		per := map[string]map[int]bool{}
		start := rows[i].at
		for j := i; j < len(rows) && rows[j].at.Sub(start) < time.Duration(days)*24*time.Hour; j++ {
			if rows[j].m == nil {
				continue
			}
			for _, k := range keys(rows[j].m) {
				if per[k] == nil {
					per[k] = map[int]bool{}
				}
				per[k][rows[j].mediaID] = true
				if len(per[k]) > best {
					best = len(per[k])
				}
			}
		}
	}
	return best
}

func mediaGenres(m *mediaInfo) []string { return m.genres }

func mediaStudios(m *mediaInfo) []string {
	if m.ex == nil {
		return nil
	}
	out := make([]string, 0, len(m.ex.Studios))
	for _, id := range m.ex.Studios {
		out = append(out, itoa(id))
	}
	return out
}

func mediaAuthors(m *mediaInfo) []string {
	return staffWhere(isAuthor)(&entry{m: m})
}

// maxCompletionsPerDay etc.
func completionsPerDay(sd sel) rule {
	return func(f *Facts) float64 {
		return float64(sd(f).maxCompletionsPer(func(t time.Time) interface{} { return dayOf(t) }))
	}
}

// longestSessionHours is the longest sitting, from history and from the live heartbeat session.
func longestSessionHours(f *Facts, sd sel) float64 {
	s := sd(f)
	best := 0.0
	for _, ss := range s.sessions() {
		first, last := ss[0], ss[len(ss)-1]
		lead := first.minutes
		if lead <= 0 {
			lead = int(s.breakAllowance(first)/time.Minute) - 15
		}
		h := last.at.Sub(first.at).Hours() + float64(lead)/60
		if h > best {
			best = h
		}
	}
	live := f.LiveAnimeSessionHours
	if !s.anime {
		live = f.LiveMangaSessionHours
	}
	return math.Max(best, live)
}

func weekendMinutesMax(f *Facts, sd sel) float64 {
	per := map[dayKey]int{}
	for k, m := range sd(f).activeMinutes {
		if sat, ok := weekendKey(k, f.TZ); ok {
			per[sat] += m
		}
	}
	return float64(maxValue(per))
}

func periodMinutesMax(f *Facts, sd sel, group func(dayKey) interface{}) float64 {
	per := map[interface{}]int{}
	for k, m := range sd(f).activeMinutes {
		per[group(k)] += m
	}
	return float64(maxOf(per))
}

// transitionsCount counts media whose recorded status changes show them in `from` and later
// moving to `to`. With minGap, the time spent in `from` must be known and at least that long.
func transitionsCount(s *side, from, to string, minGap time.Duration) int {
	n := 0
	for _, rows := range s.transitions() {
		var since time.Time
		wasInFrom, sinceKnown := false, false
		for _, r := range rows {
			if rowFrom(r) == from && !wasInFrom {
				// Leaving `from`: it was there since before the history began.
				wasInFrom, sinceKnown = true, false
			}
			if rowTo(r) == to && wasInFrom {
				if minGap == 0 || (sinceKnown && r.at.Sub(since) >= minGap) {
					n++
					break
				}
			}
			if rowTo(r) == from {
				wasInFrom, sinceKnown, since = true, true, r.at
			}
		}
	}
	return n
}

// ── Registration ─────────────────────────────────────────────────────────────────────────────

func init() {
	// Milestones
	pair("a_first_episode", "m_first_chapter", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).totalUnits() > 0 || len(sd(f).consumption) > 0) }
	})
	pair("a_episode_counter", "m_chapter_counter", totalUnitsR)
	pair("a_episode_titan", "m_chapter_titan", totalUnitsR)
	pairN("a_five_hundred_eps", "m_five_hundred_ch", 500, 500, totalUnitsAtLeast)
	pairN("a_thousand_eps", "m_thousand_ch", 1000, 1000, totalUnitsAtLeast)
	pairN("a_five_thousand_eps", "m_five_thousand_ch", 5000, 5000, totalUnitsAtLeast)
	pair("a_anime_collector", "m_manga_collector", entriesR)
	pair("a_library_legend", "m_library_legend", entriesR)
	pairN("a_first_complete", "m_first_complete", 1, 1, completedAtLeast)
	pair("a_hundred_club", "m_hundred_club", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).seenCount() >= 100) }
	})
	pair("a_first_day", "m_first_day", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(len(sd(f).consumption) > 0 || len(sd(f).dayTotals) > 0) }
	})
	pair("a_first_rating", "m_first_rating", func(sd sel) rule { return atLeast(ratedR(sd), 1) })
	pair("a_century_watcher", "m_century_reader", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).maxPerMonth() >= 100) }
	})
	pair("a_watching_ten", "m_reading_ten", func(sd sel) rule { return atLeast(statusR("CURRENT", "REPEATING")(sd), 10) })
	pair("a_ptw_hoarder", "m_ptr_hoarder", statusR("PLANNING"))
	pair("a_dropped_honesty", "m_dropped_honesty", statusR("DROPPED"))
	pairN("a_ten_completed", "m_ten_completed", 10, 10, completedAtLeast)
	pairN("a_fifty_completed", "m_fifty_completed", 50, 50, completedAtLeast)
	pairN("a_five_hundred_completed", "m_five_hundred_completed", 500, 500, completedAtLeast)
	pair("a_completionist", "m_completionist", completedR)
	pair("a_mega_completionist", "m_mega_completionist", completedR)
	pairN("a_zero_to_hero", "m_zero_to_hundred", 100, 100, completedAtLeast)
	pair("a_mean_score_tracker", "m_mean_score_tracker", ratedR)
	pair("a_all_status", "m_all_status", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			for _, st := range []string{"CURRENT", "COMPLETED", "PAUSED", "DROPPED", "PLANNING"} {
				if s.countStatus(st) == 0 {
					return 0
				}
			}
			return 1
		}
	})
	reg("a_first_favorite", func(f *Facts) float64 { return b2f(f.FavoriteAnime > 0) })
	reg("m_first_favorite", func(f *Facts) float64 { return b2f(f.FavoriteManga > 0) })
	reg("a_favorites_collector", func(f *Facts) float64 { return float64(f.FavoriteAnime) })
	reg("m_favorites_collector", func(f *Facts) float64 { return float64(f.FavoriteManga) })
	pair("a_year_explorer", "m_year_explorer", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).distinct(false, yearOf)) }
	})

	// Binge
	pair("a_binge_watcher", "m_binge_reader", maxPerDayR)
	pair("a_ep_counter_day", "m_chapter_counter_day", maxPerDayR)
	reg("a_cour_crusher", atLeast(maxPerDayR(A), 24))
	reg("m_power_reader", atLeast(maxPerDayR(M), 50))
	pair("a_weekend_warrior", "m_weekend_reader", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).totalOnDays(func(k dayKey) bool { _, ok := weekendKey(k, f.TZ); return ok }))
		}
	})
	pair("a_non_stop", "m_non_stop_reading", func(sd sel) rule {
		return func(f *Facts) float64 { return longestSessionHours(f, sd) }
	})
	pair("a_one_more_episode", "m_one_more_chapter", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).maxSessionCountWhere(func(r logRow) bool { return inHours(r.at, 0, 6) }))
		}
	})
	pair("a_midnight_binge", "m_midnight_binge", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).maxSessionCountWhere(func(r logRow) bool { return inHours(r.at, 0, 4) }))
		}
	})
	pair("a_marathon_runner", "", completionsPerDay)
	pair("a_double_feature", "m_double_story", func(sd sel) rule { return atLeast(completionsPerDay(sd), 2) })
	pair("a_rapid_complete", "m_rapid_complete", func(sd sel) rule { return atLeast(completionsPerDay(sd), 3) })
	distinctPerDay := func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).maxDistinctMediaPerDay()) }
	}
	pair("a_triple_threat", "m_triple_read", func(sd sel) rule { return atLeast(distinctPerDay(sd), 3) })
	pair("a_five_a_day", "m_five_a_day", func(sd sel) rule { return atLeast(distinctPerDay(sd), 5) })
	pair("a_multi_series_binge", "m_multi_series_binge", distinctPerDay)
	pair("a_back_to_back", "m_chapter_chain", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).longestSession()) }
	})
	pairN("a_half_day_watch", "m_half_day_read", 360, 360, func(sd sel, n float64) rule {
		return func(f *Facts) float64 { return b2f(float64(maxValue(sd(f).activeMinutes)) >= n) }
	})
	pairN("a_full_day_watch", "m_full_day_read", 720, 720, func(sd sel, n float64) rule {
		return func(f *Facts) float64 { return b2f(float64(maxValue(sd(f).activeMinutes)) >= n) }
	})
	pair("a_power_weekend", "m_power_weekend", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).maxPerWeekend(f.TZ)) }
	})
	// "Binge N total across all days": everything watched on binge days (a day of 5+ episodes /
	// 20+ chapters) added up.
	pairN("a_binge_king", "m_binge_king", 5, 20, func(sd sel, n float64) rule {
		return func(f *Facts) float64 {
			total := 0
			for _, c := range sd(f).perDay() {
				if float64(c) >= n {
					total += c
				}
			}
			if sd(f).anime {
				return b2f(total >= 50)
			}
			return b2f(total >= 100)
		}
	})
	pair("a_no_sleep", "m_no_sleep_read", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).sessionSpans(22, 6)) }
	})
	pairN("a_seven_day_challenge", "m_seven_day_challenge", 7, 7, dayRunAtLeast)
	pairN("a_hundred_day_binge", "m_hundred_day_read", 100, 100, dayRunAtLeast)
	pair("a_genre_binge", "m_genre_binge", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(groupedWithin(sd(f), 7, mediaGenres)) }
	})
	reg("a_studio_binge", func(f *Facts) float64 { return b2f(groupedWithin(f.Anime, 7, mediaStudios) >= 5) })
	reg("m_author_binge", func(f *Facts) float64 { return b2f(groupedWithin(f.Manga, 7, mediaAuthors) >= 5) })
	pair("a_forty_eight_hour", "m_forty_eight_hour", func(sd sel) rule {
		return func(f *Facts) float64 {
			return b2f(periodMinutesMax(f, sd, func(k dayKey) interface{} { return weekOf(k, f.TZ) }) >= 48*60)
		}
	})
	pairN("a_new_year_binge", "m_new_year_binge", 12, 50, func(sd sel, n float64) rule {
		return func(f *Facts) float64 {
			for _, y := range sd(f).yearsActive() {
				if float64(sd(f).perDay()[dayKey{y, time.January, 1}]) >= n {
					return 1
				}
			}
			return 0
		}
	})

	// Completion
	for _, c := range []struct {
		a, m string
		p    float64
	}{{"a_completion_rate_50", "m_completion_rate_50", 50}, {"a_completion_rate_75", "m_completion_rate_75", 75}, {"a_completion_rate_90", "m_completion_rate_90", 90}} {
		pct := c.p
		pair(c.a, c.m, func(sd sel) rule {
			return func(f *Facts) float64 {
				s := sd(f)
				started := len(s.entries) - s.countStatus("PLANNING")
				if started < 10 {
					return 0
				}
				return b2f(float64(s.completed())*100/float64(started) >= pct)
			}
		})
	}
	pair("a_no_drop", "m_no_drop", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			var lastDrop time.Time
			for _, r := range s.statuses {
				if rowTo(r) == "DROPPED" {
					lastDrop = r.at
				}
			}
			if lastDrop.IsZero() && s.countStatus("DROPPED") == 0 {
				return float64(s.completed())
			}
			if lastDrop.IsZero() && len(s.consumption) > 0 {
				// Dropped something before the history began: count from the history's start.
				lastDrop = s.consumption[0].at
			}
			n := 0
			for _, c := range s.completions {
				if c.at.After(lastDrop) {
					n++
				}
			}
			return float64(n)
		}
	})
	pair("a_long_runner_complete", "m_long_runner_complete", func(sd sel) rule {
		return func(f *Facts) float64 {
			best := 0
			for _, e := range sd(f).entries {
				if e.done() && e.m.units() > best {
					best = e.m.units()
				}
			}
			return float64(best)
		}
	})
	pair("a_sequel_chain", "m_sequel_chain", func(sd sel) rule {
		return func(f *Facts) float64 {
			best := 0
			for _, fr := range sd(f).franchises(sequelLinks, nil) {
				if allDone(fr) && len(fr.members) > best {
					best = len(fr.members)
				}
			}
			return float64(best)
		}
	})
	pair("a_full_franchise", "m_full_collection", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, fr := range sd(f).franchises(franchiseLinks, nil) {
				if len(fr.members) >= 2 && allDone(fr) {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_clean_list", "m_clean_list", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			return b2f(s.completed() >= 10 && s.countStatus("PAUSED") == 0)
		}
	})
	pair("a_from_ptw", "m_from_ptr", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(transitionsCount(sd(f), "PLANNING", "COMPLETED", 0)) }
	})
	pair("a_paused_to_done", "m_paused_to_done", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(transitionsCount(sd(f), "PAUSED", "COMPLETED", 0)) }
	})
	pair("a_revival", "m_revival", func(sd sel) rule {
		return func(f *Facts) float64 {
			return b2f(transitionsCount(sd(f), "PAUSED", "COMPLETED", 30*24*time.Hour) > 0)
		}
	})
	pair("a_dropped_recovery", "m_dropped_recovery", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(transitionsCount(sd(f), "DROPPED", "COMPLETED", 0) > 0) }
	})
	pair("a_rewatch_master", "m_reread_master", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).count(func(e *entry) bool { return e.repeat >= 1 })) }
	})
	pair("a_multi_rewatch", "m_multi_reread", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).count(func(e *entry) bool { return e.repeat >= 2 })) }
	})
	pair("a_same_day_start_finish", "m_same_day_start_finish", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			for _, e := range s.entries {
				if e.done() && !e.started.IsZero() && dayOf(e.started) == dayOf(e.completed) {
					return 1
				}
			}
			fl := s.firstLast()
			for _, e := range s.entries {
				if t, ok := fl[e.m.id]; ok && e.done() && dayOf(t[0]) == dayOf(t[1]) && s.consumedCount()[e.m.id] >= e.m.units() && e.m.units() > 1 {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_five_genre_complete", "m_five_genre_complete", func(sd sel) rule {
		return func(f *Facts) float64 {
			cs := sd(f).completions
			for i := range cs {
				set := map[string]bool{}
				for j := i; j < len(cs) && cs[j].at.Sub(cs[i].at) < 7*24*time.Hour; j++ {
					if cs[j].m != nil {
						for _, g := range cs[j].m.genres {
							set[g] = true
						}
					}
				}
				if len(set) >= 5 {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_batch_complete", "m_batch_complete", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).maxCompletionsWithin(7)) }
	})
	pair("a_completion_spree", "m_completion_spree", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).maxCompletionsWithin(3) >= 5) }
	})
	pair("a_ten_perfect_scores", "m_ten_perfect_scores", func(sd sel) rule {
		return func(f *Facts) float64 {
			return b2f(sd(f).count(func(e *entry) bool { return e.done() && e.score >= 10 }) >= 10)
		}
	})
	pair("a_complete_genre_span", "m_complete_genre_span", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).distinct(true, genresOf)) }
	})
	pair("a_monthly_completions", "m_monthly_completions", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).maxCompletionsPer(func(t time.Time) interface{} { return monthKey{t.Year(), t.Month()} }))
		}
	})
	pair("a_yearly_completions", "m_yearly_completions", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).maxCompletionsPer(func(t time.Time) interface{} { return t.Year() }))
		}
	})

	// Dedication
	pair("a_loyal_fan", "m_loyal_reader", func(sd sel) rule {
		return func(f *Facts) float64 {
			best := 0
			for _, e := range sd(f).entries {
				if n := e.consumed(); n > best {
					best = n
				}
			}
			return float64(best)
		}
	})
	pair("a_rewatcher", "m_rereader", func(sd sel) rule {
		return func(f *Facts) float64 {
			return b2f(sd(f).count(func(e *entry) bool { return e.repeat >= 1 || e.status == "REPEATING" }) > 0)
		}
	})
	pair("a_triple_rewatch", "m_triple_reread", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).count(func(e *entry) bool { return e.repeat >= 3 }) > 0) }
	})
	pair("a_annual_tradition", "m_annual_reread", func(sd sel) rule {
		return func(f *Facts) float64 {
			years := map[int]map[int]bool{}
			for _, r := range sd(f).consumption {
				if years[r.mediaID] == nil {
					years[r.mediaID] = map[int]bool{}
				}
				years[r.mediaID][r.at.Year()] = true
				if len(years[r.mediaID]) >= 2 {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_waiting_weekly", "m_waiting_weekly", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).count(func(e *entry) bool { return e.status == "CURRENT" && e.m.status == "RELEASING" }))
		}
	})
	reg("a_childhood_revisit", anySeen(A, yearIn(1, 2004)))
	reg("m_classic_reader", anySeen(M, yearIn(1, 1999)))
	pairN("a_saga_tracker", "m_saga_reader", 100, 500, func(sd sel, n float64) rule {
		return func(f *Facts) float64 {
			for _, fr := range sd(f).franchises(franchiseLinks, nil) {
				if len(fr.members) < 2 {
					continue
				}
				total := 0
				for _, e := range fr.members {
					total += e.consumed()
				}
				if float64(total) >= n {
					return 1
				}
			}
			return 0
		}
	})
	genreShare := func(sd sel, pct float64) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			seen := s.seenCount()
			if seen < 10 {
				return 0
			}
			return b2f(float64(s.maxGroup(false, genresOf))*100/float64(seen) >= pct)
		}
	}
	reg("a_genre_loyalty", genreShare(A, 30))
	reg("m_genre_loyalty", genreShare(M, 30))
	reg("m_genre_loyalty_50", genreShare(M, 50))
	decades := func(sd sel) rule { return func(f *Facts) float64 { return float64(sd(f).distinct(false, decadeOf)) } }
	pair("a_decade_watcher", "m_decade_reader", decades)
	pair("a_decade_hopper", "m_decade_hopper", decades)
	pair("a_adaptation_hunter", "m_ln_adaptation", func(sd sel) rule { return seenWith(sd, source("LIGHT_NOVEL")) })
	pair("a_original_anime_fan", "m_original_work", func(sd sel) rule { return seenWith(sd, source("ORIGINAL")) })
	pair("a_long_commitment", "m_long_commitment", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, e := range sd(f).entries {
				if e.started.IsZero() {
					continue
				}
				end := e.completed
				if end.IsZero() {
					if e.status != "CURRENT" {
						continue
					}
					end = f.Now
				}
				airingWhenStarted := e.m.endDate.IsZero() || e.m.endDate.After(e.started)
				if airingWhenStarted && end.Sub(e.started) >= 182*24*time.Hour {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_genre_master", "m_genre_master", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).maxGroup(false, genresOf) >= 50) }
	})
	pair("a_franchise_collector", "m_franchise_collector", func(sd sel) rule {
		return func(f *Facts) float64 {
			n := 0
			for _, fr := range sd(f).franchises(franchiseLinks, nil) {
				for _, e := range fr.members {
					if e.seen() {
						n++
						break
					}
				}
			}
			return float64(n)
		}
	})
	followedToEnd := func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).count(func(e *entry) bool {
				if !e.done() || e.started.IsZero() || e.m.startDate.IsZero() {
					return false
				}
				return !e.started.Before(e.m.startDate) && (e.m.endDate.IsZero() || e.started.Before(e.m.endDate))
			}))
		}
	}
	pair("a_airing_follower", "m_serialization_follower", followedToEnd)
	reg("m_ongoing_follower", followedToEnd(M))
	pair("a_format_diversity", "m_format_diversity", func(sd sel) rule {
		return func(f *Facts) float64 {
			best := 0
			for _, fr := range sd(f).franchises(franchiseLinks, nil) {
				set := map[string]bool{}
				for _, e := range fr.members {
					if e.seen() && e.m.format != "" {
						set[e.m.format] = true
					}
				}
				if len(set) > best {
					best = len(set)
				}
			}
			return float64(best)
		}
	})
	pair("a_year_dedication", "m_year_dedication", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).maxGroup(false, yearOf)) }
	})
	reg("m_year_completionist", func(f *Facts) float64 { return float64(f.Manga.maxGroup(false, yearOf)) })

	// Discovery
	pair("a_genre_explorer", "m_genre_explorer", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).distinct(false, genresOf)) }
	})
	pair("a_tag_explorer", "m_tag_explorer", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).distinct(false, tagsOf)) }
	})
	pairN("a_hidden_gem", "m_hidden_gem", 50000, 30000, func(sd sel, n float64) rule {
		return seenWith(sd, func(m *mediaInfo) bool { return m.ex != nil && m.ex.Popularity > 0 && float64(m.ex.Popularity) < n })
	})
	pair("a_popular_taste", "m_popular_taste", func(sd sel) rule {
		return seenWith(sd, func(m *mediaInfo) bool { return m.ex != nil && m.ex.PopularRank > 0 && m.ex.PopularRank <= 100 })
	})
	pair("a_top_rated_viewer", "m_top_rated_reader", func(sd sel) rule {
		return seenWith(sd, func(m *mediaInfo) bool { return m.ex != nil && m.ex.RatedRank > 0 && m.ex.RatedRank <= 50 })
	})
	pair("a_retro_appreciator", "m_retro_reader", func(sd sel) rule { return seenWith(sd, yearIn(1, 1999)) })
	pair("a_modern_viewer", "m_modern_reader", func(sd sel) rule {
		return func(f *Facts) float64 {
			y := f.Now.Year()
			return seenWith(sd, yearIn(y, y))(f)
		}
	})
	pair("a_classic_connoisseur", "m_classic_connoisseur", func(sd sel) rule { return seenWith(sd, yearIn(1980, 1999)) })
	pair("a_cross_demographic", "m_cross_demographic", func(sd sel) rule {
		return func(f *Facts) float64 {
			set := map[string]bool{}
			for _, e := range sd(f).entries {
				if !e.seen() {
					continue
				}
				for _, d := range []string{"Shounen", "Seinen", "Shoujo", "Josei", "Kids"} {
					if e.m.hasTag(d) {
						set[d] = true
					}
				}
			}
			return b2f(len(set) >= 3)
		}
	})
	pairN("a_underdog_fan", "m_underdog_fan", 50000, 30000, func(sd sel, n float64) rule {
		return func(f *Facts) float64 {
			return b2f(sd(f).count(func(e *entry) bool {
				return e.score >= 8 && e.m.ex != nil && e.m.ex.Popularity > 0 && float64(e.m.ex.Popularity) < n
			}) > 0)
		}
	})
	pair("a_variety_week", "m_variety_week", func(sd sel) rule {
		return func(f *Facts) float64 {
			rows := sd(f).consumption
			for i := range rows {
				set := map[string]bool{}
				for j := i; j < len(rows) && rows[j].at.Sub(rows[i].at) < 7*24*time.Hour; j++ {
					if rows[j].m != nil {
						for _, g := range rows[j].m.genres {
							set[g] = true
						}
					}
				}
				if len(set) >= 7 {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_award_winner", "m_award_winner", func(sd sel) rule {
		return seenWith(sd, func(m *mediaInfo) bool { return m.meanScore > 85 })
	})
	pair("a_niche_explorer", "m_niche_explorer", func(sd sel) rule {
		return func(f *Facts) float64 {
			set := map[string]bool{}
			for _, e := range sd(f).entries {
				if !e.seen() {
					continue
				}
				for _, g := range []string{"Mahou Shoujo", "Mecha", "Music", "Sports", "Ecchi"} {
					if e.m.hasGenre(g) {
						set[g] = true
					}
				}
				for _, t := range []string{"Josei", "Kids", "Iyashikei", "Avant Garde"} {
					if e.m.hasTag(t) {
						set[t] = true
					}
				}
			}
			return b2f(len(set) >= 3)
		}
	})
	pair("a_cult_classic", "m_cult_classic", func(sd sel) rule {
		return func(f *Facts) float64 {
			old := f.Now.Year() - 15
			return b2f(seenWith(sd, func(m *mediaInfo) bool {
				return m.year > 0 && m.year <= old && m.meanScore >= 75 && m.ex != nil && m.ex.Popularity > 0 && m.ex.Popularity < 100000
			})(f) >= 5)
		}
	})
	pair("a_new_genre_month", "m_new_genre_month", func(sd sel) rule {
		return func(f *Facts) float64 {
			known := map[string]bool{}
			count := 0
			for _, r := range sd(f).consumption {
				if r.m == nil {
					continue
				}
				novel := false
				for _, g := range r.m.genres {
					if !known[g] {
						novel = true
						known[g] = true
					}
				}
				count++
				if novel && count > 20 {
					return 1
				}
			}
			return 0
		}
	})
	pairN("a_unpopular_opinion", "m_unpopular_opinion", 10000, 5000, func(sd sel, n float64) rule {
		return doneWith(sd, func(m *mediaInfo) bool { return m.ex != nil && m.ex.Popularity > 0 && float64(m.ex.Popularity) < n })
	})
	pair("a_source_variety", "m_source_variety", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).distinct(false, func(e *entry) []string {
				if e.m.ex == nil {
					return nil
				}
				return []string{e.m.ex.Source}
			}))
		}
	})
	pair("a_low_score_brave", "m_low_score_brave", func(sd sel) rule {
		return doneWith(sd, func(m *mediaInfo) bool { return m.meanScore > 0 && m.meanScore < 60 })
	})

	// Time of day
	pair("a_night_owl", "m_night_owl", hoursR(0, 6))
	pair("a_early_bird", "m_early_bird", hoursR(5, 9))
	pair("a_lunch_break", "m_lunch_reader", hoursR(11, 13))
	pair("a_afternoon_delight", "m_afternoon_reader", hoursR(14, 17))
	pair("a_golden_hour", "m_golden_hour_reader", hoursR(18, 20))
	pair("a_prime_time", "m_prime_time_reader", hoursR(20, 23))
	pair("a_workday_watcher", "m_workday_reader", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).totalOnDays(func(k dayKey) bool { _, wk := weekendKey(k, f.TZ); return !wk }))
		}
	})
	pair("a_four_am_club", "m_four_am_club", func(sd sel) rule { return atLeast(hoursR(4, 5)(sd), 1) })
	pair("a_new_year_watch", "m_new_year_read", func(sd sel) rule { return onDate(sd, time.January, 1, nil) })
	pair("a_all_hours", "m_all_hours", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).distinctHours() >= 24) }
	})
	pair("a_clock_collector", "m_clock_collector", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).distinctHours()) }
	})
	pair("a_dawn_warrior", "m_dawn_reader", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).sessionSpans(0, 6)) }
	})
	pair("a_sunrise_watcher", "m_sunrise_reader", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).sessionSpans(4, 7)) }
	})
	pairN("a_sunday_marathon", "m_sunday_read", 10, 20, func(sd sel, n float64) rule {
		return func(f *Facts) float64 {
			for k, c := range sd(f).perDay() {
				if k.time(f.TZ).Weekday() == time.Sunday && float64(c) >= n {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_morning_routine", "m_morning_routine", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(longestDayRun(daysInHours(f, sd, 4, 9), f.TZ) >= 7) }
	})
	pair("a_morning_streak", "m_morning_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestDayRun(daysInHours(f, sd, 4, 9), f.TZ)) }
	})
	pair("a_night_streak", "m_night_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestDayRun(daysInHours(f, sd, 0, 6), f.TZ)) }
	})
	nightDays := func(sd sel) rule {
		return func(f *Facts) float64 { return float64(len(daysInHours(f, sd, 0, 6))) }
	}
	pair("a_night_shift", "m_night_shift_reader", nightDays)
	pair("a_late_night_regular", "m_late_night_regular", nightDays)
	pair("a_twilight_zone", "m_twilight_reader", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(longestDayRun(daysInHours(f, sd, 3, 5), f.TZ) >= 3) }
	})
	pair("a_seasonal_premier", "m_seasonal_premier_read", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, r := range sd(f).consumption {
				if r.m == nil || r.m.startDate.IsZero() {
					continue
				}
				sd0 := r.m.startDate
				if sd(f).anime {
					if r.number == 1 && r.at.Year() == sd0.Year() && r.at.YearDay() == sd0.YearDay() {
						return 1
					}
				} else if r.at.Year() == sd0.Year() && r.at.Month() == sd0.Month() {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_weekend_binge_hours", "m_weekend_binge_hours", func(sd sel) rule {
		return func(f *Facts) float64 { return weekendMinutesMax(f, sd) / 60 }
	})
	pair("a_monthly_hours", "m_monthly_hours", func(sd sel) rule {
		return func(f *Facts) float64 {
			return periodMinutesMax(f, sd, func(k dayKey) interface{} { return monthKey{k.y, k.m} }) / 60
		}
	})
	pair("a_every_day_of_week", "m_every_day_of_week", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := map[weekKey]map[time.Weekday]bool{}
			for k := range sd(f).activeDays() {
				w := weekOf(k, f.TZ)
				if per[w] == nil {
					per[w] = map[time.Weekday]bool{}
				}
				per[w][k.time(f.TZ).Weekday()] = true
				if len(per[w]) == 7 {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_midnight_premiere", "m_midnight_start", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			firstRow := map[int]bool{}
			for _, r := range s.consumption {
				if firstRow[r.mediaID] || r.dayOnly {
					firstRow[r.mediaID] = true
					continue
				}
				firstRow[r.mediaID] = true
				length := s.breakAllowance(r) - 15*time.Minute
				start := r.at.Add(-length)
				mins := start.Hour()*60 + start.Minute()
				if mins >= 23*60+55 || mins <= 10 {
					return 1
				}
			}
			return 0
		}
	})

	// Streaks
	pair("a_daily_streak", "m_daily_streak", dayRunR)
	pair("a_mega_streak", "m_mega_streak", dayRunR)
	pairN("a_daily_minimum", "m_daily_minimum", 1, 5, func(sd sel, n float64) rule {
		return func(f *Facts) float64 { return float64(longestDayRun(sd(f).daysWithAtLeast(int(n)), f.TZ)) }
	})
	pairN("a_consistent_pace", "m_consistent_pace", 1, 5, func(sd sel, n float64) rule {
		return func(f *Facts) float64 { return b2f(longestDayRun(sd(f).daysWithAtLeast(int(n)), f.TZ) >= 14) }
	})
	pairN("a_multi_ep_streak", "m_multi_ch_streak", 3, 10, func(sd sel, n float64) rule {
		return func(f *Facts) float64 { return float64(longestDayRun(sd(f).daysWithAtLeast(int(n)), f.TZ)) }
	})
	pair("a_weekly_warrior", "m_weekly_warrior", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestWeekRun(sd(f).activeDays(), f.TZ)) }
	})
	pair("a_monthly_watcher", "m_monthly_reader", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestMonthRun(sd(f).activeDays(), f.TZ)) }
	})
	pair("a_year_long", "m_year_long", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(longestMonthRun(sd(f).activeDays(), f.TZ) >= 12) }
	})
	pair("a_weekend_streak", "m_weekend_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestWeekendRun(sd(f).activeDays(), f.TZ)) }
	})
	pair("a_comeback", "m_comeback", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(longestGap(sd(f).activeDays(), f.TZ) >= 30) }
	})
	pair("a_no_zero_days", "m_no_zero_days", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(anyCalendarMonthFull(sd(f).activeDays(), f.TZ)) }
	})
	pairN("a_iron_will", "m_iron_will", 50, 50, dayRunAtLeast)
	pairN("a_unbreakable", "m_unbreakable", 100, 100, dayRunAtLeast)
	pairN("a_eternal_flame", "m_eternal_flame", 365, 365, dayRunAtLeast)
	pair("a_habit_formed", "m_habit_formed", func(sd sel) rule {
		return func(f *Facts) float64 {
			for h := 0; h < 24; h++ {
				hh := h
				days := sd(f).distinctDaysWhere(func(r logRow) bool { return r.at.Hour() == hh })
				if longestDayRun(days, f.TZ) >= 7 {
					return 1
				}
			}
			return 0
		}
	})
	doubleStreak := func(f *Facts) float64 {
		both := map[dayKey]bool{}
		md := f.Manga.activeDays()
		for k := range f.Anime.activeDays() {
			if md[k] {
				both[k] = true
			}
		}
		return b2f(longestDayRun(both, f.TZ) >= 7)
	}
	reg("a_double_streak", doubleStreak)
	reg("m_double_streak", doubleStreak)
	pair("a_streak_recovery", "m_streak_recovery", func(sd sel) rule {
		return func(f *Facts) float64 {
			runs := dayRuns(sd(f).activeDays(), f.TZ)
			hadOne := false
			for _, r := range runs {
				if hadOne && r >= 14 {
					return 1
				}
				if r >= 7 {
					hadOne = true
				}
			}
			return 0
		}
	})
	pair("a_winter_streak", "m_winter_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(coversWholeMonthInAnyYear(sd(f).activeDays(), time.December, f.TZ)) }
	})
	pair("a_summer_streak", "m_summer_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(coversWholeMonthInAnyYear(sd(f).activeDays(), time.July, f.TZ)) }
	})
	pair("a_completion_streak", "m_completion_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestDayRun(sd(f).completionDays(), f.TZ)) }
	})
	pair("a_rating_streak", "m_rating_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestDayRun(sd(f).scoreDays(), f.TZ)) }
	})
	pair("a_perfect_week", "m_perfect_week_manga", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			watched, rated, done := map[weekKey]bool{}, map[weekKey]bool{}, map[weekKey]bool{}
			for k := range s.activeDays() {
				watched[weekOf(k, f.TZ)] = true
			}
			for k := range s.scoreDays() {
				rated[weekOf(k, f.TZ)] = true
			}
			for k := range s.completionDays() {
				done[weekOf(k, f.TZ)] = true
			}
			for w := range watched {
				if rated[w] && done[w] {
					return 1
				}
			}
			return 0
		}
	})

	registerScoringPairs()
	registerHolidayPairs()
	registerSpecialPairs()
}

// ── Scoring ──────────────────────────────────────────────────────────────────────────────────

func registerScoringPairs() {
	pair("a_critic", "m_critic", ratedR)
	pairN("a_100_rated", "m_100_rated", 100, 100, func(sd sel, n float64) rule { return atLeast(ratedR(sd), n) })
	pairN("a_500_rated", "m_500_rated", 500, 500, func(sd sel, n float64) rule { return atLeast(ratedR(sd), n) })
	pair("a_perfect_ten", "m_perfect_ten", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).count(func(e *entry) bool { return e.score >= 10 })) }
	})
	pair("a_harsh_critic", "m_harsh_critic", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).count(func(e *entry) bool { return e.score > 0 && e.score <= 3 }))
		}
	})
	meanIn := func(min int, lo, hi float64) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 {
				rated := sd(f).rated()
				if len(rated) < min {
					return 0
				}
				mean, _ := meanStd(rated)
				return b2f(mean >= lo && mean <= hi)
			}
		}
	}
	pair("a_fair_judge", "m_fair_judge", meanIn(50, 5, 7))
	pair("a_generous_spirit", "m_generous_spirit", meanIn(50, 8.0001, 10))
	pair("a_picky_watcher", "m_picky_reader", meanIn(25, 0, 4.9999))
	pair("a_mean_above_8", "m_mean_above_8", meanIn(100, 8.0001, 10))
	pair("a_score_all", "m_score_all", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			done := 0
			for _, e := range s.entries {
				if e.done() {
					done++
					if e.score <= 0 {
						return 0
					}
				}
			}
			return b2f(done >= 10)
		}
	})
	pairN("a_wide_range", "m_wide_range", 1, 1, func(sd sel, n float64) rule {
		return func(f *Facts) float64 {
			h := histogram10(sd(f).rated())
			for p := 1; p <= 10; p++ {
				if float64(h[p]) < n {
					return 0
				}
			}
			return 1
		}
	})
	pairN("a_score_distributor", "m_score_distributor", 5, 5, func(sd sel, n float64) rule {
		return func(f *Facts) float64 {
			h := histogram10(sd(f).rated())
			for p := 1; p <= 10; p++ {
				if float64(h[p]) < n {
					return 0
				}
			}
			return 1
		}
	})
	pair("a_controversial", "m_controversial", func(sd sel) rule {
		return func(f *Facts) float64 {
			return b2f(sd(f).count(func(e *entry) bool {
				return e.score > 0 && e.m.meanScore > 0 && math.Abs(e.score-float64(e.m.meanScore)/10) >= 4
			}) > 0)
		}
	})
	pair("a_consistent_scorer", "m_consistent_scorer", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := map[float64]int{}
			best := 0
			for _, e := range sd(f).rated() {
				per[e.score]++
				if per[e.score] > best {
					best = per[e.score]
				}
			}
			return b2f(best >= 20)
		}
	})
	pair("a_score_sniper", "m_score_sniper", func(sd sel) rule {
		return func(f *Facts) float64 {
			return b2f(sd(f).count(func(e *entry) bool {
				return e.score > 0 && e.m.meanScore > 0 && math.Abs(e.score*10-float64(e.m.meanScore)) <= 1
			}) > 0)
		}
	})
	pair("a_evolving_taste", "m_evolving_taste", func(sd sel) rule {
		return func(f *Facts) float64 {
			set := map[int]bool{}
			for _, r := range sd(f).scores {
				if from, ok := r.data["from"].(float64); ok && from > 0 && int(from) != r.number {
					set[r.mediaID] = true
				}
			}
			return float64(len(set))
		}
	})
	pair("a_bell_curve", "m_bell_curve", func(sd sel) rule {
		return func(f *Facts) float64 {
			rated := sd(f).rated()
			if len(rated) < 30 {
				return 0
			}
			h := histogram10(rated)
			peak := 1
			for p := 2; p <= 10; p++ {
				if h[p] > h[peak] {
					peak = p
				}
			}
			if peak < 5 || peak > 8 {
				return 0
			}
			// Falls away on both sides of the peak (a step of one rating either way is noise).
			for p := peak; p < 10; p++ {
				if h[p+1] > h[p]+1 {
					return 0
				}
			}
			for p := peak; p > 1; p-- {
				if h[p-1] > h[p]+1 {
					return 0
				}
			}
			return 1
		}
	})
	pair("a_mediocre_majority", "m_mediocre_majority", func(sd sel) rule {
		return func(f *Facts) float64 {
			rated := sd(f).rated()
			if len(rated) < 20 {
				return 0
			}
			n := 0
			for _, e := range rated {
				if e.score >= 5 && e.score <= 7 {
					n++
				}
			}
			return b2f(float64(n)*2 >= float64(len(rated)))
		}
	})
	pair("a_rating_spree", "m_rating_spree", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := map[dayKey]map[int]bool{}
			best := 0
			for _, r := range sd(f).scores {
				k := dayOf(r.at)
				if per[k] == nil {
					per[k] = map[int]bool{}
				}
				per[k][r.mediaID] = true
				if len(per[k]) > best {
					best = len(per[k])
				}
			}
			return float64(best)
		}
	})
	pair("a_score_variance", "m_score_variance", func(sd sel) rule {
		return func(f *Facts) float64 {
			rated := sd(f).rated()
			if len(rated) < 20 {
				return 0
			}
			_, std := meanStd(rated)
			return b2f(std >= 2)
		}
	})
	pair("a_masterpiece_hunter", "m_masterpiece_hunter", func(sd sel) rule {
		return seenWith(sd, func(m *mediaInfo) bool { return m.meanScore > 90 })
	})
	pair("a_contrarian", "m_contrarian", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).count(func(e *entry) bool {
				return e.score > 0 && e.m.meanScore > 0 && e.score <= float64(e.m.meanScore)/10-3
			}))
		}
	})
	pair("a_optimist", "m_optimist", func(sd sel) rule {
		return func(f *Facts) float64 {
			return float64(sd(f).count(func(e *entry) bool {
				return e.score > 0 && e.m.meanScore > 0 && e.score >= float64(e.m.meanScore)/10+2
			}))
		}
	})
	pair("a_genre_critic", "m_genre_critic", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := map[string]int{}
			for _, e := range sd(f).rated() {
				for _, g := range e.m.genres {
					per[g]++
				}
			}
			n := 0
			for _, c := range per {
				if c >= 10 {
					n++
				}
			}
			return float64(n)
		}
	})
	reg("m_binge_rater", func(f *Facts) float64 {
		rows := f.Manga.scores
		for i := range rows {
			set := map[int]bool{}
			for j := i; j < len(rows) && rows[j].at.Sub(rows[i].at) < 7*24*time.Hour; j++ {
				set[rows[j].mediaID] = true
			}
			if len(set) >= 50 {
				return 1
			}
		}
		return 0
	})
	reg("m_reread_rerate", func(f *Facts) float64 {
		for _, r := range f.Manga.scores {
			e := f.Manga.byID[r.mediaID]
			if e == nil || e.repeat < 1 {
				continue
			}
			if from, ok := r.data["from"].(float64); ok && from > 0 && int(from) != r.number {
				return 1
			}
		}
		return 0
	})
}

// ── Holidays ─────────────────────────────────────────────────────────────────────────────────

func registerHolidayPairs() {
	romance, comedy, horror, scifi := genre("Romance"), genre("Comedy"), genre("Horror"), genre("Sci-Fi")
	nature := func(m *mediaInfo) bool {
		return m.hasTag("Nature") || m.hasTag("Environmental") || m.hasTag("Agriculture") || m.hasTag("Animals") || m.hasTag("Outdoor Activities") || m.hasTag("Iyashikei")
	}
	pair("a_new_years_resolution", "m_new_years_resolution", func(sd sel) rule { return onHoliday(sd, "new_year", nil, 1) })
	pair("a_valentines_weeb", "m_valentines_read", func(sd sel) rule { return onHoliday(sd, "valentines", romance, 1) })
	pair("a_pi_day", "m_pi_day", func(sd sel) rule { return onHoliday(sd, "pi_day", nil, 1) })
	pair("a_april_fools", "m_april_fools", func(sd sel) rule { return onHoliday(sd, "april_fools", comedy, 1) })
	reg("a_international_anime_day", onHoliday(A, "anime_day", nil, 1))
	reg("m_international_manga_day", onHoliday(M, "manga_day", nil, 1))
	reg("a_star_wars_day", onHoliday(A, "star_wars_day", scifi, 1))
	reg("m_free_comic_day", onHoliday(M, "free_comic_day", nil, 1))
	pair("a_summer_solstice", "m_summer_solstice", func(sd sel) rule { return onHoliday(sd, "summer_solstice", nil, 1) })
	pair("a_tanabata", "m_tanabata", func(sd sel) rule { return onHoliday(sd, "tanabata", romance, 1) })
	pair("a_friday_13th", "m_friday_13th", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, r := range sd(f).consumption {
				if r.at.Day() == 13 && r.at.Weekday() == time.Friday && horror(r.m) {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_halloween_spirit", "m_halloween_read", func(sd sel) rule { return onHoliday(sd, "halloween", horror, 1) })
	pairN("a_thanksgiving_binge", "m_thanksgiving_binge", 10, 50, func(sd sel, n float64) rule {
		return onHoliday(sd, "thanksgiving", nil, int(n))
	})
	pair("a_christmas_special", "m_christmas_read", func(sd sel) rule { return onHoliday(sd, "christmas", nil, 1) })
	pair("a_new_years_eve", "m_new_years_eve", func(sd sel) rule { return onHoliday(sd, "new_years_eve", nil, 1) })
	pair("a_independence_day", "m_independence_day", func(sd sel) rule { return onHoliday(sd, "independence_day", nil, 1) })
	pair("a_culture_day", "m_culture_day", func(sd sel) rule { return onHoliday(sd, "culture_day", nil, 1) })
	pair("a_spring_equinox", "m_spring_equinox", func(sd sel) rule { return onHoliday(sd, "spring_equinox", nil, 1) })
	pair("a_earth_day", "m_earth_day", func(sd sel) rule { return onHoliday(sd, "earth_day", nature, 1) })
	pair("a_labor_day", "m_labor_day", func(sd sel) rule { return onHoliday(sd, "labor_day", nil, 1) })
	pair("a_winter_solstice", "m_winter_solstice", func(sd sel) rule { return onHoliday(sd, "winter_solstice", nil, 1) })
	pair("a_holiday_marathon", "m_holiday_marathon", func(sd sel) rule {
		return func(f *Facts) float64 {
			days := sd(f).activeDays()
			for _, y := range sd(f).yearsActive() {
				if coversAll(days, time.Date(y, time.December, 24, 12, 0, 0, 0, f.TZ), time.Date(y, time.December, 31, 12, 0, 0, 0, f.TZ)) {
					return 1
				}
			}
			return 0
		}
	})
	// Birthdays: AniList does not share a user's birthday, so "your birthday" here is the
	// anniversary of the first day you watched (or read) anything in this app.
	pair("a_birthday_watch", "m_birthday_read", func(sd sel) rule {
		return func(f *Facts) float64 { return anniversaryOf(sd(f), firstActive(sd(f), f.TZ)) }
	})
	pair("a_anime_birthday", "m_manga_birthday", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			if len(s.completions) == 0 {
				return 0
			}
			return anniversaryOf(s, s.completions[0].at)
		}
	})
	pair("a_holiday_watcher", "", func(sd sel) rule {
		return func(f *Facts) float64 {
			set := map[string]bool{}
			for _, hs := range sd(f).holidaysActive(f.TZ) {
				for h := range hs {
					set[h] = true
				}
			}
			return float64(len(set))
		}
	})
	pair("a_every_holiday", "m_every_holiday_reader", func(sd sel) rule {
		return func(f *Facts) float64 {
			best := 0
			for _, hs := range sd(f).holidaysActive(f.TZ) {
				if len(hs) > best {
					best = len(hs)
				}
			}
			return float64(best)
		}
	})
	pair("a_consecutive_holidays", "m_consecutive_holidays", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).longestHolidayRun(f.TZ) >= 3) }
	})
}

func firstActive(s *side, loc *time.Location) time.Time {
	var first time.Time
	for k := range s.perDay() {
		t := k.time(loc)
		if first.IsZero() || t.Before(first) {
			first = t
		}
	}
	return first
}

// anniversaryOf reports activity on the same month and day as `origin`, in a later year.
func anniversaryOf(s *side, origin time.Time) float64 {
	if origin.IsZero() {
		return 0
	}
	for k := range s.activeDays() {
		if k.y > origin.Year() && k.m == origin.Month() && k.d == origin.Day() {
			return 1
		}
	}
	return 0
}

// ── Special ──────────────────────────────────────────────────────────────────────────────────

func registerSpecialPairs() {
	exactCompleted := func(n int) func(sd sel) rule {
		return func(sd sel) rule { return func(f *Facts) float64 { return b2f(sd(f).completed() == n) } }
	}
	exactUnits := func(n int) func(sd sel) rule {
		return func(sd sel) rule { return func(f *Facts) float64 { return b2f(sd(f).totalUnits() == n) } }
	}
	pairN("a_round_number", "m_round_number", 100, 100, completedAtLeast)
	pairN("a_thousand_complete", "m_thousand_complete", 1000, 1000, completedAtLeast)
	pair("a_fibonacci", "m_fibonacci", func(sd sel) rule {
		return func(f *Facts) float64 { n := sd(f).completed(); return b2f(n >= 8 && isFibonacci(n)) }
	})
	pair("a_square_number", "m_square_number", func(sd sel) rule {
		return func(f *Facts) float64 { n := sd(f).completed(); return b2f(n >= 16 && isSquare(n)) }
	})
	pair("a_prime_count", "m_prime_count", func(sd sel) rule {
		return func(f *Facts) float64 { n := sd(f).completed(); return b2f(n > 100 && isPrime(n)) }
	})
	pair("a_nice", "m_nice", exactCompleted(69))
	pair("a_answer_42", "m_answer_42", exactCompleted(42))
	pair("a_double_digits", "m_double_digits", exactCompleted(11))
	pair("a_one_two_three", "m_one_two_three", exactCompleted(123))
	pair("a_year_match_count", "m_year_match_count", func(sd sel) rule {
		return func(f *Facts) float64 { n := sd(f).completed(); return b2f(n > 0 && n == f.Now.Year()%100) }
	})
	pair("a_triple_seven", "m_triple_seven", exactUnits(777))
	pair("a_pi_episodes", "m_pi_chapters", exactUnits(314))
	pair("a_exact_hundred_eps", "m_exact_hundred_ch", exactUnits(100))
	pair("a_power_level", "m_power_level_chapters", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).totalUnits() > 9000) }
	})
	pair("a_lucky_seven", "m_lucky_seven", func(sd sel) rule {
		return func(f *Facts) float64 {
			return b2f(sd(f).count(func(e *entry) bool { return e.score == 7 }) == 7)
		}
	})
	lapsing("a_nice", "m_nice", "a_answer_42", "m_answer_42", "a_double_digits", "m_double_digits",
		"a_one_two_three", "m_one_two_three", "a_year_match_count", "m_year_match_count",
		"a_triple_seven", "m_triple_seven", "a_pi_episodes", "m_pi_chapters", "a_exact_hundred_eps", "m_exact_hundred_ch",
		"a_fibonacci", "m_fibonacci", "a_square_number", "m_square_number", "a_prime_count", "m_prime_count",
		"a_lucky_seven", "m_lucky_seven", "a_clean_list", "m_clean_list", "a_all_status", "m_all_status",
		"a_watching_ten", "m_reading_ten", "a_genre_loyalty", "m_genre_loyalty", "m_genre_loyalty_50",
		"a_completion_rate_50", "a_completion_rate_75", "a_completion_rate_90",
		"m_completion_rate_50", "m_completion_rate_75", "m_completion_rate_90",
		"a_fair_judge", "m_fair_judge", "a_generous_spirit", "m_generous_spirit", "a_picky_watcher", "m_picky_reader",
		"a_mean_above_8", "m_mean_above_8", "a_score_all", "m_score_all", "a_bell_curve", "m_bell_curve",
		"a_mediocre_majority", "m_mediocre_majority", "a_score_variance", "m_score_variance",
		"a_waiting_weekly", "m_waiting_weekly", "a_ptw_hoarder", "m_ptr_hoarder")

	pair("a_palindrome_day", "m_palindrome_day", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, c := range sd(f).completions {
				if isPalindrome(c.at.Format("20060102")) {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_binary_day", "m_binary_day", func(sd sel) rule {
		return func(f *Facts) float64 {
			for k := range sd(f).activeDays() {
				if isBinaryDate(k.time(f.TZ)) {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_full_moon", "m_full_moon_read", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, r := range sd(f).consumption {
				if !r.dayOnly && isFullMoon(r.at) {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_leap_year", "m_leap_year_read", func(sd sel) rule { return onDate(sd, time.February, 29, nil) })
	pair("a_time_traveler", "m_time_traveler", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := map[dayKey]map[int]bool{}
			for _, r := range sd(f).consumption {
				if r.m == nil || r.m.year <= 0 {
					continue
				}
				k := dayOf(r.at)
				if per[k] == nil {
					per[k] = map[int]bool{}
				}
				per[k][r.m.year/10] = true
				if len(per[k]) >= 5 {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_genre_clash", "m_genre_clash", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, ss := range sd(f).sessions() {
				sawHorror := false
				for _, r := range ss {
					if r.m.hasGenre("Horror") {
						sawHorror = true
					} else if sawHorror && r.m.hasGenre("Romance") {
						return 1
					}
				}
			}
			return 0
		}
	})
	pair("a_synchronicity", "m_synchronicity", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, r := range sd(f).consumption {
				if !r.dayOnly && r.number > 0 && r.number == r.at.Day() {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_world_record", "m_world_record", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := sd(f).perDay()
			keys := make([]time.Time, 0, len(per))
			for k := range per {
				keys = append(keys, k.time(f.TZ))
			}
			sortTimes(keys)
			best, days := 0, 0
			for _, t := range keys {
				n := per[dayOf(t)]
				if days >= 7 && n > best {
					return 1
				}
				if n > best {
					best = n
				}
				days++
			}
			return 0
		}
	})
	pair("a_matching_date", "m_matching_date", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, c := range sd(f).completions {
				if c.m != nil && c.m.units() > 0 && c.m.units() == c.at.Day() {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_century_episode", "m_century_chapter", func(sd sel) rule {
		return func(f *Facts) float64 {
			for _, e := range sd(f).entries {
				if e.progress >= 100 {
					return 1
				}
			}
			for _, r := range sd(f).consumption {
				if r.number >= 100 {
					return 1
				}
			}
			return 0
		}
	})
}

func sortTimes(ts []time.Time) {
	sort.Slice(ts, func(i, j int) bool { return ts[i].Before(ts[j]) })
}
