package onlinestream_download

import (
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
)

func newTestManager(t *testing.T, state string) *Manager {
	logger := zerolog.Nop()
	return NewManager(NewManagerOptions{
		Logger:      &logger,
		WorkDir:     t.TempDir(),
		StatePath:   state,
		LibraryPath: func() string { return t.TempDir() },
	})
}

func TestQueueControlsAndPersistence(t *testing.T) {
	state := filepath.Join(t.TempDir(), "queue.json")
	m := newTestManager(t, state)
	// Paused so the worker does not try to download the fake items.
	m.Stop()

	m.mu.Lock()
	for i, st := range []Status{StatusCompleted, StatusQueued, StatusQueued, StatusFailed, StatusDownloading} {
		m.items = append(m.items, &Item{ID: string(rune('a' + i)), MediaId: 1, EpisodeNumber: i + 1, Status: st, Title: "Show"})
	}
	m.mu.Unlock()

	if !m.MoveToTop("c") {
		t.Fatal("move to top refused")
	}
	if got := m.GetQueue().Items; got[1].ID != "c" || got[2].ID != "b" {
		t.Fatalf("move to top order: %s %s", got[1].ID, got[2].ID)
	}
	if n := m.ResetErrored(); n != 1 {
		t.Fatalf("reset errored: %d", n)
	}
	m.ClearFinished()
	if got := len(m.GetQueue().Items); got != 4 {
		t.Fatalf("clear finished left %d items", got)
	}

	// A restart: the interrupted download goes back to the queue, the pause is kept.
	m2 := newTestManager(t, state)
	q := m2.GetQueue()
	if !q.Paused {
		t.Error("pause was not restored")
	}
	if len(q.Items) != 4 {
		t.Fatalf("restored %d items", len(q.Items))
	}
	for _, it := range q.Items {
		if it.Status != StatusQueued {
			t.Errorf("item %s restored as %s", it.ID, it.Status)
		}
	}

	if !m2.Remove("b") || len(m2.GetQueue().Items) != 3 {
		t.Error("remove failed")
	}
	m2.ClearAll()
	if len(m2.GetQueue().Items) != 0 {
		t.Error("clear all left items")
	}
}
