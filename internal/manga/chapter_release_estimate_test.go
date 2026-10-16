package manga

import (
	"testing"
	"time"

	hibikemanga "seanime/internal/extension/hibike/manga"
)

func TestEstimateChapterReleaseCadenceUsesRecentMedian(t *testing.T) {
	chapters := []*hibikemanga.ChapterDetails{
		{Chapter: "7", UpdatedAt: "2024-02-16"},
		{Chapter: "1", UpdatedAt: "2024-01-01"},
		{Chapter: "2", UpdatedAt: "2024-01-08"},
		{Chapter: "3", UpdatedAt: "2024-01-15"},
		{Chapter: "4", UpdatedAt: "2024-01-22"},
		{Chapter: "5", UpdatedAt: "2024-02-02"},
		{Chapter: "6", UpdatedAt: "2024-02-09"},
	}

	cadence, next := estimateChapterReleaseCadence(chapters)
	if cadence != 7 {
		t.Fatalf("expected 7-day median from the last five intervals, got %v", cadence)
	}
	if next == nil || !next.Equal(time.Date(2024, time.February, 23, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("expected next estimate on 2024-02-23, got %v", next)
	}
}

func TestEstimateChapterReleaseCadenceRequiresThreeIntervals(t *testing.T) {
	cadence, next := estimateChapterReleaseCadence([]*hibikemanga.ChapterDetails{
		{Chapter: "1", UpdatedAt: "2024-01-01"},
		{Chapter: "2", UpdatedAt: "2024-01-08"},
		{Chapter: "3", UpdatedAt: "2024-01-15"},
	})

	if cadence != 0 || next != nil {
		t.Fatalf("expected no estimate with fewer than three intervals, got cadence=%v next=%v", cadence, next)
	}
}
