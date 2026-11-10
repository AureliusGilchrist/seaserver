package memwatch

import (
	"errors"
	"testing"
	"time"
)

const mb = 1 << 20

func testWatcher(usage *Usage, opts Options) *Watcher {
	w := newWatcher(opts)
	w.read = func() Usage { return *usage }
	w.started = time.Now().Add(-time.Hour) // past minUptime
	return w
}

func TestReleasesCachesWhenHigh(t *testing.T) {
	lastPlayback.Store(0)
	u := Usage{InUse: 700 * mb, HeapAlloc: 300 * mb, Limit: 1000 * mb}
	released := 0
	w := testWatcher(&u, Options{ReleaseCaches: func() { released++; u.InUse = 300 * mb }})

	now := time.Now()
	w.check(now)
	if released != 1 {
		t.Fatalf("released %d times, want 1", released)
	}
	// Cooldown: high again a minute later does not release again.
	u.InUse = 700 * mb
	w.check(now.Add(time.Minute))
	if released != 1 {
		t.Fatalf("released during cooldown")
	}
	w.check(now.Add(releaseCooldown + time.Minute))
	if released != 2 {
		t.Fatalf("did not release after cooldown")
	}
}

func TestNoActionWhenLow(t *testing.T) {
	u := Usage{InUse: 200 * mb, HeapAlloc: 100 * mb, Limit: 1000 * mb}
	called := false
	w := testWatcher(&u, Options{
		ReleaseCaches: func() { called = true },
		Restart:       func(string) error { called = true; return nil },
	})
	w.check(time.Now())
	if called {
		t.Fatal("acted on low memory")
	}
}

func TestRestartsOnlyWhenSustainedAndIdle(t *testing.T) {
	lastPlayback.Store(0)
	u := Usage{InUse: 950 * mb, HeapAlloc: 900 * mb, Limit: 1000 * mb}
	restarts := 0
	w := testWatcher(&u, Options{Restart: func(string) error { restarts++; return nil }})

	start := time.Now()
	w.check(start)
	w.check(start.Add(5 * time.Minute))
	if restarts != 0 {
		t.Fatal("restarted before the high stretch was sustained")
	}

	// Someone is watching: no restart even once sustained.
	lastPlayback.Store(start.Add(restartAfter).UnixNano())
	w.check(start.Add(restartAfter + time.Minute))
	if restarts != 0 {
		t.Fatal("restarted during playback")
	}

	// Playback stopped long enough ago.
	w.check(start.Add(restartAfter + idleFor + 2*time.Minute))
	if restarts != 1 {
		t.Fatalf("restarts = %d, want 1", restarts)
	}
	// Once restarting, never twice.
	w.check(start.Add(restartAfter + idleFor + 3*time.Minute))
	if restarts != 1 {
		t.Fatal("restarted twice")
	}
}

func TestDropBelowResetsTheStretch(t *testing.T) {
	lastPlayback.Store(0)
	u := Usage{InUse: 950 * mb, HeapAlloc: 900 * mb, Limit: 1000 * mb}
	restarts := 0
	w := testWatcher(&u, Options{Restart: func(string) error { restarts++; return nil }})
	start := time.Now()
	w.check(start)
	u.HeapAlloc = 400 * mb
	w.check(start.Add(5 * time.Minute))
	u.HeapAlloc = 900 * mb
	w.check(start.Add(restartAfter + time.Minute)) // new stretch starts here
	if restarts != 0 {
		t.Fatal("a dip below the threshold did not reset the stretch")
	}
}

func TestFailedRestartTriesAgainLater(t *testing.T) {
	lastPlayback.Store(0)
	u := Usage{InUse: 950 * mb, HeapAlloc: 900 * mb, Limit: 1000 * mb}
	attempts := 0
	w := testWatcher(&u, Options{Restart: func(string) error { attempts++; return errors.New("nope") }})
	start := time.Now()
	w.check(start)
	w.check(start.Add(restartAfter + time.Minute))
	if attempts != 1 {
		t.Fatalf("attempts = %d", attempts)
	}
	w.check(start.Add(restartAfter + 2*time.Minute)) // stretch was reset
	if attempts != 1 {
		t.Fatal("retried immediately")
	}
}

func TestNoteRequestOnlyTracksPlayback(t *testing.T) {
	lastPlayback.Store(0)
	NoteRequest("/api/v1/library/collection")
	if lastPlayback.Load() != 0 {
		t.Fatal("non-playback route counted")
	}
	NoteRequest("/api/v1/mediastream/transcode/abc/index.m3u8")
	if lastPlayback.Load() == 0 {
		t.Fatal("playback route not counted")
	}
}
