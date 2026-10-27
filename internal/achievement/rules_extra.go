package achievement

import (
	"math"
	"time"
)

// Rules for extraDefinitions (cat_extra.go).

func init() {
	// ── Streaks ──────────────────────────────────────────────────────────────────────────────
	pair("a_thousand_day_streak", "m_thousand_day_streak", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(longestDayRun(sd(f).activeDays(), f.TZ) >= 1000) }
	})
	heavy := func(n int) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 { return float64(longestDayRun(sd(f).daysWithAtLeast(n), f.TZ)) }
		}
	}
	reg("a_heavy_rotation", heavy(5)(A))
	reg("m_heavy_rotation", heavy(25)(M))
	pair("a_two_year_weeks", "m_two_year_weeks", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(longestWeekRun(sd(f).activeDays(), f.TZ) >= 104) }
	})
	pair("a_month_chain", "m_month_chain", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(longestMonthRun(sd(f).activeDays(), f.TZ)) }
	})
	pair("a_long_way_home", "m_long_way_home", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(longestGap(sd(f).activeDays(), f.TZ) >= 365) }
	})
	noDayOff := func(n int) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 { return b2f(anyCalendarMonthFull(sd(f).daysWithAtLeast(n), f.TZ)) }
		}
	}
	reg("a_no_day_off", noDayOff(10)(A))
	reg("m_no_day_off", noDayOff(50)(M))

	// ── Binge ────────────────────────────────────────────────────────────────────────────────
	reg("a_fifty_in_a_day", atLeast(maxPerDayR(A), 50))
	reg("m_three_hundred_in_a_day", atLeast(maxPerDayR(M), 300))
	reg("a_thirty_straight", func(f *Facts) float64 { return b2f(f.Anime.longestSession() >= 30) })
	reg("m_hundred_fifty_straight", func(f *Facts) float64 { return b2f(f.Manga.longestSession() >= 150) })
	pair("a_big_week", "m_big_week", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).maxPerWeek(f.TZ)) }
	})
	pair("a_big_month", "m_big_month", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).maxPerMonth()) }
	})
	pair("a_sunrise_to_sunset", "m_sunrise_to_sunset", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).sessionSpans(6, 18)) }
	})
	longDay := func(hours int) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 {
				best := 0
				for _, m := range sd(f).activeMinutes {
					if m > best {
						best = m
					}
				}
				return b2f(best >= hours*60)
			}
		}
	}
	reg("a_twenty_hour_day", longDay(20)(A))
	reg("m_sixteen_hour_day", longDay(16)(M))
	oneSeriesDay := func(n int) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 { return b2f(maxOfOneMediaPerDay(sd(f)) >= n) }
		}
	}
	reg("a_one_show_day", oneSeriesDay(24)(A))
	reg("m_one_series_day", oneSeriesDay(200)(M))
	strongStart := func(n int) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 {
				s := sd(f)
				first := firstActive(s, f.TZ)
				if first.IsZero() {
					return 0
				}
				end := first.AddDate(0, 0, 7)
				total := 0
				for k, c := range s.perDay() {
					if t := k.time(f.TZ); !t.Before(first) && t.Before(end) {
						total += c
					}
				}
				return b2f(total >= n)
			}
		}
	}
	reg("a_strong_start", strongStart(50)(A))
	reg("m_strong_start", strongStart(300)(M))

	// ── Completion ───────────────────────────────────────────────────────────────────────────
	pair("a_ten_in_a_week", "m_ten_in_a_week", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).maxCompletionsWithin(7) >= 10) }
	})
	reg("a_the_long_haul", atLeast(doneWith(A, func(m *mediaInfo) bool { return m.units() >= 500 }), 1))
	reg("m_the_long_haul", atLeast(doneWith(M, func(m *mediaInfo) bool { return m.units() >= 1000 }), 1))
	reg("a_giant_slayer", doneWith(A, func(m *mediaInfo) bool { return m.units() >= 100 }))
	reg("m_giant_slayer", doneWith(M, func(m *mediaInfo) bool { return m.units() >= 200 }))
	pair("a_comfort_show", "m_comfort_read", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(sd(f).count(func(e *entry) bool { return e.repeat >= 5 }) > 0) }
	})
	pair("a_franchise_finisher", "m_franchise_finisher", func(sd sel) rule {
		return func(f *Facts) float64 {
			n := 0
			for _, fr := range sd(f).franchises(franchiseLinks, nil) {
				if len(fr.members) >= 2 && allDone(fr) {
					n++
				}
			}
			return float64(n)
		}
	})
	sweep := func(formats map[string]bool) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 {
				for _, fr := range sd(f).franchises(sequelLinks, formats) {
					if len(fr.members) < 3 || !allDone(fr) {
						continue
					}
					var first, last time.Time
					ok := true
					for _, e := range fr.members {
						if e.completed.IsZero() {
							ok = false
							break
						}
						if first.IsZero() || e.completed.Before(first) {
							first = e.completed
						}
						if e.completed.After(last) {
							last = e.completed
						}
					}
					if ok && last.Sub(first) <= 30*24*time.Hour {
						return 1
					}
				}
				return 0
			}
		}
	}
	reg("a_season_sweeper", sweep(seasonFormats)(A))
	reg("m_series_sweeper", sweep(nil)(M))
	pair("a_inbox_zero", "m_inbox_zero", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			return b2f(s.countStatus("PLANNING") == 0 && s.completed() >= 50)
		}
	})
	pair("a_nothing_left_behind", "m_nothing_left_behind", func(sd sel) rule {
		return func(f *Facts) float64 {
			s := sd(f)
			return b2f(len(s.entries) >= 200 && s.countStatus("DROPPED") == 0 && s.countStatus("PAUSED") == 0)
		}
	})
	lapsing("a_inbox_zero", "m_inbox_zero", "a_nothing_left_behind", "m_nothing_left_behind")
	pair("a_backlog_purge", "m_backlog_purge", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(transitionsCount(sd(f), "PLANNING", "COMPLETED", 0) >= 25) }
	})

	// ── Discovery & taste ────────────────────────────────────────────────────────────────────
	pair("a_top_rated_hundred", "m_top_rated_hundred", func(sd sel) rule {
		return doneWith(sd, func(m *mediaInfo) bool { return m.ex != nil && m.ex.RatedRank >= 1 && m.ex.RatedRank <= 100 })
	})
	pair("a_most_popular_hundred", "m_most_popular_hundred", func(sd sel) rule {
		return doneWith(sd, func(m *mediaInfo) bool { return m.ex != nil && m.ex.PopularRank >= 1 && m.ex.PopularRank <= 100 })
	})
	obscure := func(limit int) func(m *mediaInfo) bool {
		return func(m *mediaInfo) bool { return m.ex != nil && m.ex.Popularity > 0 && m.ex.Popularity < limit }
	}
	reg("a_off_the_map", doneWith(A, obscure(1000)))
	reg("m_off_the_map", doneWith(M, obscure(500)))
	pair("a_well_rounded", "m_well_rounded", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := map[string]int{}
			for _, e := range sd(f).entries {
				if !e.done() {
					continue
				}
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
	pair("a_through_the_ages", "m_through_the_ages", func(sd sel) rule {
		return func(f *Facts) float64 { return float64(sd(f).distinct(true, decadeOf)) }
	})

	// ── Scoring ──────────────────────────────────────────────────────────────────────────────
	pair("a_full_spectrum", "m_full_spectrum", func(sd sel) rule {
		return func(f *Facts) float64 {
			h := histogram10(sd(f).rated())
			for p := 1; p <= 10; p++ {
				if h[p] == 0 {
					return 0
				}
			}
			return 1
		}
	})
	pair("a_perfect_collection", "m_perfect_collection", func(sd sel) rule {
		return func(f *Facts) float64 {
			n := 0
			for _, e := range sd(f).rated() {
				if e.score >= 10 {
					n++
				}
			}
			return float64(n)
		}
	})
	pair("a_thousand_verdicts", "m_thousand_verdicts", func(sd sel) rule {
		return func(f *Facts) float64 { return b2f(len(sd(f).rated()) >= 1000) }
	})
	// Against the AniList average: the list score on the 100-point scale against meanScore.
	versusMean := func(pred func(mine, mean float64) bool) func(sd sel) rule {
		return func(sd sel) rule {
			return func(f *Facts) float64 {
				n := 0
				for _, e := range sd(f).rated() {
					if e.m.meanScore > 0 && pred(e.score*10, float64(e.m.meanScore)) {
						n++
					}
				}
				return float64(n)
			}
		}
	}
	pair("a_against_the_crowd", "m_against_the_crowd", versusMean(func(mine, mean float64) bool { return mine <= mean-30 }))
	pair("a_true_believer", "m_true_believer", versusMean(func(mine, mean float64) bool { return mine >= mean+30 }))
	pair("a_consensus", "m_consensus", versusMean(func(mine, mean float64) bool { return math.Abs(mine-mean) < 0.5 }))
	lapsing("a_full_spectrum", "m_full_spectrum")

	// ── Calendar ─────────────────────────────────────────────────────────────────────────────
	pair("a_every_date", "m_every_date", func(sd sel) rule {
		return func(f *Facts) float64 {
			dates := map[[2]int]bool{}
			for k := range sd(f).activeDays() {
				dates[[2]int{int(k.m), k.d}] = true
			}
			return float64(len(dates))
		}
	})
	pair("a_all_twelve", "m_all_twelve", func(sd sel) rule {
		return func(f *Facts) float64 {
			months := map[int]map[time.Month]bool{}
			for k := range sd(f).activeDays() {
				if months[k.y] == nil {
					months[k.y] = map[time.Month]bool{}
				}
				months[k.y][k.m] = true
			}
			for _, ms := range months {
				if len(ms) == 12 {
					return 1
				}
			}
			return 0
		}
	})
	pair("a_whole_year", "m_whole_year", func(sd sel) rule {
		return func(f *Facts) float64 {
			per := map[int]int{}
			best := 0
			for k := range sd(f).activeDays() {
				per[k.y]++
				if per[k.y] > best {
					best = per[k.y]
				}
			}
			return float64(best)
		}
	})

	// ── Watch parties ────────────────────────────────────────────────────────────────────────
	// maxPeers counts the others in the party; "10+ people" includes you.
	reg("a_packed_house", func(f *Facts) float64 {
		for _, p := range f.Parties {
			if p.maxPeers+1 >= 10 {
				return 1
			}
		}
		return 0
	})
	reg("a_party_hours", func(f *Facts) float64 {
		var total time.Duration
		for _, p := range f.Parties {
			if p.end.After(p.start) {
				total += p.end.Sub(p.start)
			}
		}
		return total.Hours()
	})
	reg("a_chatterbox", func(f *Facts) float64 {
		for _, p := range f.Parties {
			if p.chatMessages >= 100 {
				return 1
			}
		}
		return 0
	})

	// ── Both sides ───────────────────────────────────────────────────────────────────────────
	reg("a_two_worlds", func(f *Facts) float64 { return b2f(sameStoryOnOneDay(f)) })
	reg("a_dual_master", func(f *Facts) float64 {
		return b2f(f.Anime.totalUnits() >= 1000 && f.Manga.totalUnits() >= 10000)
	})
}

// maxOfOneMediaPerDay is the most episodes/chapters of a single series in one local day.
func maxOfOneMediaPerDay(s *side) int {
	type key struct {
		d  dayKey
		id int
	}
	per := map[key]int{}
	best := 0
	for _, r := range s.consumption {
		k := key{dayOf(r.at), r.mediaID}
		per[k]++
		if per[k] > best {
			best = per[k]
		}
	}
	return best
}

// sameStoryOnOneDay reports a day with an anime episode and a chapter of a manga that is its source
// or adaptation (by AniList relation, in either direction).
func sameStoryOnOneDay(f *Facts) bool {
	mangaOn := map[dayKey]map[int]bool{}
	for _, r := range f.Manga.consumption {
		d := dayOf(r.at)
		if mangaOn[d] == nil {
			mangaOn[d] = map[int]bool{}
		}
		mangaOn[d][r.mediaID] = true
	}
	if len(mangaOn) == 0 {
		return false
	}
	// Anime → manga links from both sides' relations.
	linked := map[int]map[int]bool{}
	link := func(animeID, mangaID int) {
		if linked[animeID] == nil {
			linked[animeID] = map[int]bool{}
		}
		linked[animeID][mangaID] = true
	}
	for _, e := range f.Anime.entries {
		if e.m.ex == nil {
			continue
		}
		for _, r := range e.m.ex.Relations {
			if !r.Anime {
				link(e.m.id, r.ID)
			}
		}
	}
	for _, e := range f.Manga.entries {
		if e.m.ex == nil {
			continue
		}
		for _, r := range e.m.ex.Relations {
			if r.Anime {
				link(r.ID, e.m.id)
			}
		}
	}
	for _, r := range f.Anime.consumption {
		day := mangaOn[dayOf(r.at)]
		if day == nil {
			continue
		}
		for mangaID := range linked[r.mediaID] {
			if day[mangaID] {
				return true
			}
		}
	}
	return false
}
