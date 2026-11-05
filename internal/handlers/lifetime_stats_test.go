package handlers

import (
	"testing"
	"time"

	"seanime/internal/database/db"
	"seanime/internal/database/models"
)

func TestCombineLifetime(t *testing.T) {
	base := &models.LifetimeStatsBaseline{
		EstAnimeMinutes: 2400, EstAnimeEpisodes: 100, // AniList says 100 episodes
		EstMangaMinutes: 50, EstMangaChapters: 10,
		LogAnimeMinutes: 240, LogAnimeEpisodes: 10, // 10 of those were already tracked
		LogMangaMinutes: 300, LogMangaChapters: 60, // log knew more manga than AniList
		EstimatedAt: time.Now(),
	}

	// Nothing new since the baseline: just the estimate (or the log, where it knew more).
	got := combineLifetime(base, db.ActivityLogTotals{AnimeEpisodes: 10, AnimeMinutes: 240, MangaChapters: 60, MangaMinutes: 300}, lifetimeEstimate{})
	if got.AnimeEpisodes != 100 || got.AnimeMinutes != 2400 || got.MangaChapters != 60 || got.MangaMinutes != 300 {
		t.Fatalf("at baseline: %+v", got)
	}

	// Two episodes and three chapters tracked afterwards are added once.
	got = combineLifetime(base, db.ActivityLogTotals{AnimeEpisodes: 12, AnimeMinutes: 288, MangaChapters: 63, MangaMinutes: 315}, lifetimeEstimate{})
	if got.AnimeEpisodes != 102 || got.AnimeMinutes != 2448 || got.MangaChapters != 63 || got.MangaMinutes != 315 {
		t.Fatalf("after tracking: %+v", got)
	}
	if !got.IncludesEstimate {
		t.Fatal("expected IncludesEstimate")
	}

	// No baseline yet: the log alone.
	got = combineLifetime(nil, db.ActivityLogTotals{AnimeEpisodes: 3, AnimeMinutes: 72}, lifetimeEstimate{animeCompleted: 4})
	if got.AnimeEpisodes != 3 || got.AnimeMinutes != 72 || got.AnimeCompleted != 4 || got.IncludesEstimate {
		t.Fatalf("no baseline: %+v", got)
	}
}
