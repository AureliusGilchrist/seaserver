package achievement

import (
	"testing"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
)

func ep(mediaID, number int, at time.Time) models.AchievementLogEntry {
	return models.AchievementLogEntry{At: at.Unix(), Kind: LogKindEpisode, MediaType: "anime", MediaID: mediaID, Number: number, Minutes: 24}
}

func factsFromLog(tz *time.Location, rows ...models.AchievementLogEntry) *Facts {
	return buildFacts(&factsInput{now: time.Date(2026, 10, 26, 12, 0, 0, 0, tz), tz: tz, log: rows})
}

func TestDayStreakCountsLocalDaysAndBreaks(t *testing.T) {
	ny, _ := time.LoadLocation("America/New_York")
	base := time.Date(2026, 3, 1, 21, 0, 0, 0, ny)
	var rows []models.AchievementLogEntry
	for d := 0; d < 7; d++ {
		rows = append(rows, ep(1, d+1, base.AddDate(0, 0, d)))
	}
	// A gap, then three more days.
	for d := 9; d < 12; d++ {
		rows = append(rows, ep(1, d+1, base.AddDate(0, 0, d)))
	}
	f := factsFromLog(ny, rows...)
	if got := rules["a_daily_streak"](f); got != 7 {
		t.Fatalf("daily streak = %v, want 7 (the gap breaks it)", got)
	}
	if got := rules["a_seven_day_challenge"](f); got != 1 {
		t.Fatalf("seven-day challenge = %v, want 1", got)
	}
	if got := rules["a_hundred_day_binge"](f); got != 0 {
		t.Fatalf("hundred-day = %v, want 0", got)
	}
}

// 9 PM in New York is 1 AM UTC the next day: the streak and the hours must follow the user's clock.
func TestTimeOfDayUsesProfileZone(t *testing.T) {
	ny, _ := time.LoadLocation("America/New_York")
	at := time.Date(2026, 3, 2, 3, 30, 0, 0, ny) // 3:30 AM local
	f := factsFromLog(ny, ep(1, 1, at))
	if got := rules["a_night_owl"](f); got != 1 {
		t.Fatalf("night owl = %v, want 1 for a 3:30 AM episode", got)
	}
	if got := rules["a_prime_time"](f); got != 0 {
		t.Fatalf("prime time = %v, want 0", got)
	}
	// The same instant seen from UTC is 8:30 AM: an early-bird episode, not a night-owl one.
	fu := factsFromLog(time.UTC, ep(1, 1, at))
	if got := rules["a_night_owl"](fu); got != 0 {
		t.Fatalf("night owl in UTC = %v, want 0", got)
	}
	if got := rules["a_early_bird"](fu); got != 1 {
		t.Fatalf("early bird in UTC = %v, want 1", got)
	}
}

func TestEpisodesPerDayAndSessions(t *testing.T) {
	loc := time.UTC
	start := time.Date(2026, 5, 2, 18, 0, 0, 0, loc) // a Saturday
	var rows []models.AchievementLogEntry
	for i := 0; i < 12; i++ {
		rows = append(rows, ep(7, i+1, start.Add(time.Duration(i*25)*time.Minute)))
	}
	f := factsFromLog(loc, rows...)
	if got := rules["a_binge_watcher"](f); got != 12 {
		t.Fatalf("binge (per day) = %v, want 12", got)
	}
	if got := rules["a_back_to_back"](f); got != 12 {
		t.Fatalf("back to back = %v, want 12 (25 minutes apart is one sitting)", got)
	}
	if got := rules["a_power_weekend"](f); got != 12 {
		t.Fatalf("power weekend = %v, want 12", got)
	}
	if got := rules["a_workday_watcher"](f); got != 0 {
		t.Fatalf("workday = %v, want 0 on a Saturday", got)
	}
}

func scoreEntry(id int, score float64, mean int) *anilist.AnimeCollection_MediaListCollection_Lists_Entries {
	st := anilist.MediaListStatusCompleted
	return &anilist.AnimeCollection_MediaListCollection_Lists_Entries{
		Score:  &score,
		Status: &st,
		Media:  &anilist.BaseAnime{ID: id, MeanScore: &mean},
	}
}

// Scores arrive on AniList's 100-point scale; the rules speak 10-point.
func TestScoringUsesTenPointScale(t *testing.T) {
	var entries []*anilist.AnimeCollection_MediaListCollection_Lists_Entries
	for i := 1; i <= 60; i++ {
		entries = append(entries, scoreEntry(i, 60, 72)) // 6/10 against a 7.2 mean
	}
	col := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
		Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{{Entries: entries}},
	}}
	f := buildFacts(&factsInput{now: time.Now(), tz: time.UTC, animeCol: col})
	if got := rules["a_fair_judge"](f); got != 1 {
		t.Fatalf("fair judge = %v, want 1 for a 6.0 average over 60 ratings", got)
	}
	if got := rules["a_generous_spirit"](f); got != 0 {
		t.Fatalf("generous = %v, want 0", got)
	}
	if got := rules["a_score_sniper"](f); got != 0 {
		t.Fatalf("score sniper = %v, want 0: 6.0 is not within 0.1 of 7.2", got)
	}
	if got := rules["a_perfect_ten"](f); got != 0 {
		t.Fatalf("perfect ten = %v, want 0", got)
	}

	entries = append(entries, scoreEntry(999, 72, 72))
	col.MediaListCollection.Lists[0].Entries = entries
	f = buildFacts(&factsInput{now: time.Now(), tz: time.UTC, animeCol: col})
	if got := rules["a_score_sniper"](f); got != 1 {
		t.Fatalf("score sniper = %v, want 1 for a 7.2 against a 7.2 mean", got)
	}
}

func TestStatusTransitions(t *testing.T) {
	loc := time.UTC
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, loc)
	row := func(at time.Time, from, to string) models.AchievementLogEntry {
		return models.AchievementLogEntry{At: at.Unix(), Kind: LogKindStatus, MediaType: "anime", MediaID: 5,
			Data: `{"from":"` + from + `","to":"` + to + `"}`}
	}
	f := factsFromLog(loc,
		row(t0, "CURRENT", "PAUSED"),
		row(t0.AddDate(0, 0, 40), "PAUSED", "COMPLETED"),
	)
	if got := rules["a_paused_to_done"](f); got != 1 {
		t.Fatalf("paused to done = %v, want 1", got)
	}
	if got := rules["a_revival"](f); got != 1 {
		t.Fatalf("revival = %v, want 1 after 40 days on hold", got)
	}
	f = factsFromLog(loc,
		row(t0, "CURRENT", "PAUSED"),
		row(t0.AddDate(0, 0, 3), "PAUSED", "COMPLETED"),
	)
	if got := rules["a_revival"](f); got != 0 {
		t.Fatalf("revival = %v, want 0 after only 3 days on hold", got)
	}
}

func TestHolidayDates(t *testing.T) {
	loc := time.UTC
	if got := holidayByName("thanksgiving").on(2026, loc); got.Day() != 26 || got.Month() != time.November {
		t.Fatalf("thanksgiving 2026 = %v, want Nov 26", got)
	}
	if got := holidayByName("labor_day").on(2026, loc); got.Day() != 7 || got.Month() != time.September {
		t.Fatalf("labor day 2026 = %v, want Sep 7", got)
	}
	f := factsFromLog(loc, ep(1, 1, time.Date(2025, 12, 25, 20, 0, 0, 0, loc)))
	if got := rules["a_christmas_special"](f); got != 1 {
		t.Fatalf("christmas = %v, want 1", got)
	}
	if got := rules["a_halloween_spirit"](f); got != 0 {
		t.Fatalf("halloween = %v, want 0", got)
	}
}

func TestLongestRuns(t *testing.T) {
	loc := time.UTC
	days := map[dayKey]bool{}
	for _, d := range []int{1, 2, 3, 5, 6} {
		days[dayKey{2026, time.January, d}] = true
	}
	if got := longestDayRun(days, loc); got != 3 {
		t.Fatalf("longest run = %d, want 3", got)
	}
	if got := longestGap(days, loc); got != 1 {
		t.Fatalf("longest gap = %d, want 1", got)
	}
	// Across a month boundary.
	days = map[dayKey]bool{{2026, time.January, 31}: true, {2026, time.February, 1}: true}
	if got := longestDayRun(days, loc); got != 2 {
		t.Fatalf("run across months = %d, want 2", got)
	}
}
