package db

import (
	"testing"
	"time"

	"seanime/internal/database/models"
	"seanime/internal/util"
)

func TestLifetimeStatsBaselineIsMadeOnce(t *testing.T) {
	database, err := NewDatabase(t.TempDir(), "lifetime-test", util.NewLogger())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })

	// Tracked before the backfill.
	if err := database.RecordAnimeActivity(3, 72); err != nil {
		t.Fatal(err)
	}
	if err := database.RecordMangaActivity(4, 20); err != nil {
		t.Fatal(err)
	}

	if b, err := database.GetLifetimeStatsBaseline(); err != nil || b != nil {
		t.Fatalf("expected no baseline yet, got %+v %v", b, err)
	}

	first, err := database.CreateLifetimeStatsBaseline(&models.LifetimeStatsBaseline{EstAnimeEpisodes: 50, EstAnimeMinutes: 1200, EstimatedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	if first.LogAnimeEpisodes != 3 || first.LogAnimeMinutes != 72 || first.LogMangaChapters != 4 || first.LogMangaMinutes != 20 {
		t.Fatalf("snapshot not taken: %+v", first)
	}

	// More watching, then a second backfill: the first baseline stays, nothing is re-estimated.
	if err := database.RecordAnimeActivity(1, 24); err != nil {
		t.Fatal(err)
	}
	second, err := database.CreateLifetimeStatsBaseline(&models.LifetimeStatsBaseline{EstAnimeEpisodes: 999, EstimatedAt: time.Now()})
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID || second.EstAnimeEpisodes != 50 || second.LogAnimeEpisodes != 3 {
		t.Fatalf("second backfill changed the baseline: %+v", second)
	}

	sum, err := database.SumActivityLogs()
	if err != nil {
		t.Fatal(err)
	}
	if sum.AnimeEpisodes != 4 || sum.AnimeMinutes != 96 || sum.MangaChapters != 4 || sum.ActiveDays != 1 {
		t.Fatalf("unexpected sum: %+v", sum)
	}
}
