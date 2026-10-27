package achievement

import (
	"testing"
	"time"

	"seanime/internal/database/models"
)

func ch(mediaID, number int, at time.Time) models.AchievementLogEntry {
	return models.AchievementLogEntry{At: at.Unix(), Kind: LogKindChapter, MediaType: "manga", MediaID: mediaID, Number: number, Minutes: 7}
}

// 24 episodes of one show in a day counts; 24 split across two shows does not.
func TestOneShowDayCountsOneSeries(t *testing.T) {
	base := time.Date(2026, 5, 2, 9, 0, 0, 0, time.UTC)
	var one, split []models.AchievementLogEntry
	for i := 0; i < 24; i++ {
		at := base.Add(time.Duration(i) * 25 * time.Minute)
		one = append(one, ep(1, i+1, at))
		split = append(split, ep(1+i%2, i+1, at))
	}
	if got := rules["a_one_show_day"](factsFromLog(time.UTC, one...)); got != 1 {
		t.Fatalf("one show day = %v, want 1", got)
	}
	if got := rules["a_one_show_day"](factsFromLog(time.UTC, split...)); got != 0 {
		t.Fatalf("one show day across two shows = %v, want 0", got)
	}
}

// The first week starts on the first active day: 50 episodes over days 1–7 counts, day 8 does not.
func TestStrongStartIsTheFirstSevenDays(t *testing.T) {
	base := time.Date(2026, 1, 10, 20, 0, 0, 0, time.UTC)
	var rows []models.AchievementLogEntry
	for d := 0; d < 7; d++ {
		for i := 0; i < 7; i++ { // 49 in the first week
			rows = append(rows, ep(1, d*7+i+1, base.AddDate(0, 0, d).Add(time.Duration(i)*25*time.Minute)))
		}
	}
	late := append(rows, ep(1, 100, base.AddDate(0, 0, 7)))
	if got := rules["a_strong_start"](factsFromLog(time.UTC, late...)); got != 0 {
		t.Fatalf("strong start with the 50th episode on day 8 = %v, want 0", got)
	}
	onTime := append(rows, ep(1, 100, base.AddDate(0, 0, 6).Add(3*time.Hour)))
	if got := rules["a_strong_start"](factsFromLog(time.UTC, onTime...)); got != 1 {
		t.Fatalf("strong start with 50 in the first week = %v, want 1", got)
	}
}

func TestHeavyRotationNeedsEveryDayAboveTheBar(t *testing.T) {
	base := time.Date(2026, 2, 1, 18, 0, 0, 0, time.UTC)
	var rows []models.AchievementLogEntry
	for d := 0; d < 8; d++ {
		n := 5
		if d == 3 {
			n = 4 // one light day breaks the run
		}
		for i := 0; i < n; i++ {
			rows = append(rows, ep(1, d*10+i+1, base.AddDate(0, 0, d).Add(time.Duration(i)*25*time.Minute)))
		}
	}
	if got := rules["a_heavy_rotation"](factsFromLog(time.UTC, rows...)); got != 4 {
		t.Fatalf("heavy rotation = %v, want 4 (days 5–8)", got)
	}
}

func TestTwoWorldsLinksAnimeAndItsManga(t *testing.T) {
	day := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	f := factsFromLog(time.UTC,
		ep(10, 1, day.Add(20*time.Hour)),
		ch(20, 1, day.Add(9*time.Hour)),
	)
	if sameStoryOnOneDay(f) {
		t.Fatal("unrelated anime and manga counted as the same story")
	}
	f.Anime.add(&entry{m: &mediaInfo{id: 10, anime: true, ex: &MediaExtras{Relations: []relation{{Type: "SOURCE", ID: 20, Anime: false}}}}})
	if !sameStoryOnOneDay(f) {
		t.Fatal("an anime and its source manga on the same day were not counted")
	}
}

func TestVersusMeanUsesTheHundredPointScale(t *testing.T) {
	f := factsFromLog(time.UTC)
	f.Anime.add(&entry{m: &mediaInfo{id: 1, anime: true, meanScore: 85}, score: 5, status: "COMPLETED"})  // 35 below
	f.Anime.add(&entry{m: &mediaInfo{id: 2, anime: true, meanScore: 60}, score: 9.5, status: "COMPLETED"}) // 35 above
	f.Anime.add(&entry{m: &mediaInfo{id: 3, anime: true, meanScore: 75}, score: 7.5, status: "COMPLETED"}) // exact
	if got := rules["a_against_the_crowd"](f); got != 1 {
		t.Errorf("against the crowd = %v, want 1", got)
	}
	if got := rules["a_true_believer"](f); got != 1 {
		t.Errorf("true believer = %v, want 1", got)
	}
	if got := rules["a_consensus"](f); got != 1 {
		t.Errorf("consensus = %v, want 1", got)
	}
}
