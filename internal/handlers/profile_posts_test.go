package handlers

import (
	"testing"
	"time"

	"seanime/internal/database/models"
)

func TestValidTargetKey(t *testing.T) {
	for k, want := range map[string]bool{
		"post:12":    true,
		"act:3:45":   true,
		"post:":      false,
		"post:x":     false,
		"act:3":      false,
		"comment:1":  false,
		"act:3:45:9": false,
		"":           false,
	} {
		if got := validTargetKey(k); got != want {
			t.Errorf("validTargetKey(%q) = %v, want %v", k, got, want)
		}
	}
}

func TestGroupActivityCollapsesConsecutiveEpisodes(t *testing.T) {
	now := time.Now()
	ev := func(id uint, media int, ep int, ago time.Duration) *TimelineEvent {
		return &TimelineEvent{
			ID:        id,
			EventType: models.ActivityEventEpisodeWatched,
			MediaID:   media,
			Metadata:  `{"episode":` + itoa(ep) + `}`,
			CreatedAt: now.Add(-ago),
		}
	}
	// Newest first, as the database returns them.
	events := []*TimelineEvent{
		ev(5, 100, 5, 0),
		ev(4, 100, 4, 30*time.Minute),
		ev(3, 100, 3, time.Hour),
		ev(2, 200, 1, 2*time.Hour),  // different media breaks the run
		ev(1, 100, 2, 10*time.Hour), // same media but far apart: its own item
	}
	items := groupActivity(1, events, &TimelineProfileSummary{ID: 1})
	if len(items) != 3 {
		t.Fatalf("got %d items, want 3", len(items))
	}
	if items[0].EpisodeFrom != 3 || items[0].EpisodeTo != 5 {
		t.Errorf("first group = %d–%d, want 3–5", items[0].EpisodeFrom, items[0].EpisodeTo)
	}
	if items[0].Key != "act:1:5" {
		t.Errorf("group key = %q, want act:1:5 (newest event)", items[0].Key)
	}
	if items[2].EpisodeFrom != 2 || items[2].EpisodeTo != 2 {
		t.Errorf("isolated item = %d–%d, want 2–2", items[2].EpisodeFrom, items[2].EpisodeTo)
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	s := ""
	for i > 0 {
		s = string(rune('0'+i%10)) + s
		i /= 10
	}
	return s
}
