package onlinestream_download

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

// TestCleanupKeepsFoldersInUse: a work folder the queue does not know may belong to another
// server process on the same cache (a restart overlapping the old one, or the updater's test
// start). Only folders untouched for hours are removed.
func TestCleanupKeepsFoldersInUse(t *testing.T) {
	work := t.TempDir()
	fresh := filepath.Join(work, "running-elsewhere")
	stale := filepath.Join(work, "left-over")
	for _, d := range []string{fresh, stale} {
		if err := os.MkdirAll(filepath.Join(d, "video"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	old := time.Now().Add(-2 * staleWorkDirAge)
	_ = os.Chtimes(stale, old, old)

	logger := zerolog.Nop()
	NewManager(NewManagerOptions{Logger: &logger, WorkDir: work, LibraryPath: func() string { return "x" }, holdQueue: true})

	if _, err := os.Stat(fresh); err != nil {
		t.Errorf("a folder in use was deleted: %v", err)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Errorf("a stale folder was kept")
	}
}

func TestFailedEpisodeRetriesByItself(t *testing.T) {
	logger := zerolog.Nop()
	m := NewManager(NewManagerOptions{Logger: &logger, WorkDir: t.TempDir(), LibraryPath: func() string { return "x" }, holdQueue: true})

	calls := 0
	m.processOverride = func(ctx context.Context, it *Item, workDir string) (string, error) {
		calls++
		if calls == 1 {
			return "", errors.New("rename v_seg00115.ts.part: no such file or directory")
		}
		return "/library/ep.mkv", nil
	}
	it := &Item{ID: "a", MediaId: 1, EpisodeNumber: 7, Status: StatusQueued}
	m.items = []*Item{it}

	m.run(it)
	if it.Status != StatusQueued || it.retryAt.IsZero() {
		t.Fatalf("after a temporary failure: status %s, retryAt %v", it.Status, it.retryAt)
	}
	if m.nextQueued() != nil {
		t.Fatal("the retry did not wait")
	}
	it.retryAt = time.Now().Add(-time.Second)
	if m.nextQueued() != it {
		t.Fatal("the retry was not picked up once due")
	}
	m.run(it)
	if it.Status != StatusCompleted || calls != 2 {
		t.Fatalf("second attempt: status %s, calls %d", it.Status, calls)
	}

	// Final errors are not retried.
	m.processOverride = func(ctx context.Context, it *Item, workDir string) (string, error) {
		return "", finalError{errors.New("episode 7 is already in your library")}
	}
	it2 := &Item{ID: "b", MediaId: 1, EpisodeNumber: 8, Status: StatusQueued}
	m.items = append(m.items, it2)
	m.run(it2)
	if it2.Status != StatusFailed {
		t.Fatalf("final error: status %s", it2.Status)
	}

	// Nor after the last automatic attempt.
	m.processOverride = func(ctx context.Context, it *Item, workDir string) (string, error) {
		return "", errors.New("provider answered HTTP 502")
	}
	it3 := &Item{ID: "c", MediaId: 1, EpisodeNumber: 9, Status: StatusQueued, Attempts: maxAutoAttempts - 1}
	m.items = append(m.items, it3)
	m.run(it3)
	if it3.Status != StatusFailed {
		t.Fatalf("last attempt: status %s", it3.Status)
	}
}

// TestStorageErrorHoldsTheQueue: a read-only or full disk fails every episode it touches. The
// episode must go back to the queue without using an attempt, and the queue says why it waits.
func TestStorageErrorHoldsTheQueue(t *testing.T) {
	logger := zerolog.Nop()
	m := NewManager(NewManagerOptions{Logger: &logger, WorkDir: t.TempDir(), LibraryPath: func() string { return "x" }, holdQueue: true})
	m.processOverride = func(ctx context.Context, it *Item, workDir string) (string, error) {
		return "", &os.PathError{Op: "mkdir", Path: "/home/user/.config/Seanime/cache/x", Err: syscall.EROFS}
	}
	it := &Item{ID: "a", MediaId: 1, EpisodeNumber: 5, Status: StatusQueued}
	m.items = []*Item{it}
	m.run(it)
	if it.Status != StatusQueued || it.Attempts != 0 {
		t.Fatalf("status %s, attempts %d", it.Status, it.Attempts)
	}
	if q := m.GetQueue(); q.Blocked == "" {
		t.Fatal("the queue does not say it is waiting for the disk")
	}

	if !isStorageError(errors.New("open x: no space left on device")) || isStorageError(errors.New("HTTP 403")) {
		t.Fatal("storage error detection")
	}
}

// TestSkipSeries: when neither provider has the series, the episode and the series' other waiting
// episodes leave the queue, and other series are left alone.
func TestSkipSeries(t *testing.T) {
	logger := zerolog.Nop()
	m := NewManager(NewManagerOptions{Logger: &logger, WorkDir: t.TempDir(), LibraryPath: func() string { return "x" }, holdQueue: true})
	m.processOverride = func(ctx context.Context, it *Item, workDir string) (string, error) {
		return "", skipSeriesError{errors.New("not available on kickassanime and not found on AnimeHeaven")}
	}
	a := &Item{ID: "a", MediaId: 1, EpisodeNumber: 1, Status: StatusQueued}
	b := &Item{ID: "b", MediaId: 1, EpisodeNumber: 2, Status: StatusQueued}
	c := &Item{ID: "c", MediaId: 2, EpisodeNumber: 1, Status: StatusQueued}
	m.items = []*Item{a, b, c}
	m.run(a)
	if len(m.items) != 1 || m.items[0] != c || c.Status != StatusQueued {
		t.Fatalf("the skipped series should leave the queue, the other stay: %d items", len(m.items))
	}
}

func TestIsNoSource(t *testing.T) {
	for _, msg := range []string{
		"no episode servers found, provider returned: 'no source found for episode: video source not found'",
		"anime not found",
	} {
		if !isNoSource(errors.New(msg)) {
			t.Fatalf("%q should count as no source", msg)
		}
	}
	if isNoSource(errors.New("dial tcp: i/o timeout")) {
		t.Fatal("a network error is not a missing source")
	}
}
