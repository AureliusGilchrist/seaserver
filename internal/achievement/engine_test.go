package achievement

import (
	"testing"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"

	"github.com/rs/zerolog"
)

func testEngine(t *testing.T, col *anilist.AnimeCollection) (*Engine, *db.Database) {
	t.Helper()
	logger := zerolog.Nop()
	database, err := db.NewDatabase("", "achievement-test", &logger)
	if err != nil {
		t.Fatal(err)
	}
	e := NewEngine(&NewEngineOptions{
		Logger:         &logger,
		WSEventManager: events.NewMockWSEventManager(&logger),
		GetDB:          func(uint) (*db.Database, error) { return database, nil },
		Sources: Sources{
			AnimeCollection: func(uint) *anilist.AnimeCollection { return col },
			MangaCollection: func(uint) *anilist.MangaCollection { return &anilist.MangaCollection{} },
		},
	})
	return e, database
}

func unlocked(t *testing.T, database *db.Database, key string, tier int) bool {
	t.Helper()
	a, err := database.GetAchievement(key, tier)
	if err != nil || a == nil {
		return false
	}
	return a.IsUnlocked
}

func TestEngineUnlocksFromHistoryAndRevokesWrongUnlocks(t *testing.T) {
	e, database := testEngine(t, &anilist.AnimeCollection{})
	e.ensureInitialized(database)

	// Seven days in a row of one episode each.
	base := time.Now().AddDate(0, 0, -10)
	for d := 0; d < 7; d++ {
		_ = database.AppendAchievementLog(models.AchievementLogEntry{
			At: base.AddDate(0, 0, d).Unix(), Kind: LogKindEpisode, MediaType: "anime", MediaID: 1, Number: d + 1, Minutes: 24,
		})
	}
	// An unlock the old evaluator gave for nothing.
	_ = database.UnlockAchievement("a_score_sniper", 0)

	e.EvaluateNow(1)

	if !unlocked(t, database, "a_daily_streak", 1) {
		t.Error("a 7-day streak did not unlock Daily Streak I")
	}
	if unlocked(t, database, "a_daily_streak", 2) {
		t.Error("Daily Streak II (14 days) unlocked from 7 days")
	}
	if unlocked(t, database, "a_score_sniper", 0) {
		t.Error("the unsupported Score Sniper unlock was not revoked")
	}
	if database.GetAchievementRulesVersion() != CurrentRulesVersion {
		t.Error("rules version not recorded after the re-check")
	}

	// A second pass must not unlock (or award) anything twice.
	lp, _ := database.GetLevelProgress()
	xp := lp.TotalXP
	e.EvaluateNow(1)
	lp, _ = database.GetLevelProgress()
	if lp.TotalXP != xp {
		t.Errorf("XP changed on a pass with nothing new: %d → %d", xp, lp.TotalXP)
	}
}

func TestFreshProfileUnlocksNothing(t *testing.T) {
	st := anilist.MediaListStatusCompleted
	progress := 500
	col := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
		Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{{Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{
			{Status: &st, Progress: &progress, Media: &anilist.BaseAnime{ID: 9}},
		}}},
	}}
	e, database := testEngine(t, col)
	e.EvaluateNow(1)
	if unlocked(t, database, "a_episode_counter", 1) {
		t.Error("a profile with no activity here was handed its AniList history as unlocks")
	}
}

func TestSnapshotSeedsThenLogsChanges(t *testing.T) {
	st := anilist.MediaListStatusPaused
	col := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
		Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{{Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{
			{Status: &st, Media: &anilist.BaseAnime{ID: 3}},
		}}},
	}}
	e, database := testEngine(t, col)
	_ = database.AppendAchievementLog(models.AchievementLogEntry{At: time.Now().Unix(), Kind: LogKindEpisode, MediaType: "anime", MediaID: 3, Number: 1})

	e.EvaluateNow(1)
	rows, _ := database.GetAchievementLog()
	for _, r := range rows {
		if r.Kind == LogKindStatus {
			t.Fatal("the first snapshot logged the existing list as changes")
		}
	}

	done := anilist.MediaListStatusCompleted
	col.MediaListCollection.Lists[0].Entries[0].Status = &done
	e.EvaluateNow(1)
	rows, _ = database.GetAchievementLog()
	statuses, completes := 0, 0
	for _, r := range rows {
		switch r.Kind {
		case LogKindStatus:
			statuses++
		case LogKindComplete:
			completes++
		}
	}
	if statuses != 1 || completes != 1 {
		t.Fatalf("after PAUSED→COMPLETED: %d status rows, %d completions; want 1 and 1", statuses, completes)
	}
	// Tier I needs 3: one is progress, not an unlock.
	if a, _ := database.GetAchievement("a_paused_to_done", 1); a == nil || a.IsUnlocked || a.Progress != 1 {
		t.Fatalf("paused-to-done tier I = %+v, want locked with progress 1", a)
	}
}

func TestResetProfileClearsUnlocksButKeepsWhatWasWatched(t *testing.T) {
	e, database := testEngine(t, &anilist.AnimeCollection{})
	e.ensureInitialized(database)
	_ = database.AppendAchievementLog(
		models.AchievementLogEntry{At: time.Now().Unix(), Kind: LogKindEpisode, MediaType: "anime", MediaID: 1, Number: 1, Minutes: 24},
		models.AchievementLogEntry{At: time.Now().Unix(), Kind: LogKindStatus, MediaType: "manga", MediaID: 2},
	)
	_ = database.UpsertAchievementListSnapshot(models.AchievementListSnapshot{MediaType: "manga", MediaID: 2})
	_ = database.UnlockAchievement("m_manga_collector", 7)

	if err := e.ResetProfile(1); err != nil {
		t.Fatal(err)
	}
	if rows, _ := database.GetUnlockedAchievements(); len(rows) != 0 {
		t.Errorf("%d unlocks survived the reset", len(rows))
	}
	if lp, _ := database.GetLevelProgress(); lp != nil && lp.TotalXP != 0 {
		t.Errorf("XP after reset = %d", lp.TotalXP)
	}
	if snap, _ := database.GetAchievementListSnapshot(); len(snap) != 0 {
		t.Error("the stored list state survived the reset")
	}
	rows, _ := database.GetAchievementLog()
	if len(rows) != 1 || rows[0].Kind != LogKindEpisode {
		t.Errorf("log after reset = %+v, want only the watched episode", rows)
	}
}
