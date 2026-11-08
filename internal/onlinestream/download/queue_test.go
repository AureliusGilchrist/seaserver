package onlinestream_download

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

func newTestManager(t *testing.T, state string) *Manager {
	logger := zerolog.Nop()
	return NewManager(NewManagerOptions{
		Logger:      &logger,
		WorkDir:     t.TempDir(),
		StatePath:   state,
		LibraryPath: func() string { return t.TempDir() },
		holdQueue:   true,
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

	// A restart: the interrupted download goes back to the queue and a Stop does not stick.
	m2 := newTestManager(t, state)
	q := m2.GetQueue()
	if q.Paused {
		t.Error("a Stop survived the restart; the queue must resume on its own")
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

// TestRestoredQueueStartsByItself checks that a queue saved before a restart starts downloading
// on its own, and that a crash in one episode does not stop the worker from taking the next.
func TestRestoredQueueStartsByItself(t *testing.T) {
	state := filepath.Join(t.TempDir(), "queue.json")
	m := newTestManager(t, state)
	m.Stop()
	m.mu.Lock()
	m.items = append(m.items,
		&Item{ID: "a", MediaId: 1, EpisodeNumber: 1, Status: StatusQueued},
		&Item{ID: "b", MediaId: 1, EpisodeNumber: 2, Status: StatusQueued})
	m.mu.Unlock()
	m.save()

	logger := zerolog.Nop()
	// No repository: each run panics, which must fail that episode and move on.
	m2 := NewManager(NewManagerOptions{Logger: &logger, WorkDir: t.TempDir(), StatePath: state, LibraryPath: func() string { return "x" }, EpisodeGap: -1})

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		q := m2.GetQueue()
		if q.Items[0].Status == StatusFailed && q.Items[1].Status == StatusFailed {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	q := m2.GetQueue()
	t.Fatalf("restored queue did not run: %s, %s (paused=%v)", q.Items[0].Status, q.Items[1].Status, q.Paused)
}
