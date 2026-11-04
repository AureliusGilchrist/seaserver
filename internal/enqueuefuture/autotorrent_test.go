package enqueuefuture

import (
	"testing"
	"time"

	hibiketorrent "seanime/internal/extension/hibike/torrent"

	"github.com/rs/zerolog"
)

func newTestAutoTorrentRepo(t *testing.T, dir string) *Repository {
	t.Helper()
	logger := zerolog.Nop()
	r := &Repository{logger: &logger, dataDir: dir, pacer: newPacer(ItemsPerMinute, RateBurst)}
	r.autoTorrent = newAutoTorrent(r)
	// Background searches keep saving into dir; stop them before the test's temp dir is removed.
	t.Cleanup(func() {
		r.EndAutoTorrent()
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			r.autoTorrent.mu.Lock()
			idle := !r.autoTorrent.picking && !r.autoTorrent.adding
			r.autoTorrent.mu.Unlock()
			if idle {
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
	})
	return r
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func ids(n int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = i + 1
	}
	return out
}

// A session works through its anime forty at a time, prefetches the next batch, and is still there,
// at the same place, after the server restarts.
func TestAutoTorrentSessionBatchesAndSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	r := newTestAutoTorrentRepo(t, dir)
	r.SetAutoTorrentHooks(AutoTorrentHooks{})

	v, err := r.StartAutoTorrent(append(ids(90), 3, 0, -1)) // duplicates and junk are dropped
	if err != nil {
		t.Fatal(err)
	}
	if v.Total != 90 || len(v.Batch) != 40 || v.BatchNumber != 1 || v.TotalBatches != 3 {
		t.Fatalf("unexpected first view: total=%d batch=%d n=%d of %d", v.Total, len(v.Batch), v.BatchNumber, v.TotalBatches)
	}
	if _, err := r.StartAutoTorrent(ids(5)); err != ErrAutoTorrentActive {
		t.Fatalf("a second session should be refused, got %v", err)
	}

	waitFor(t, "first batch and the next one to be picked", func() bool {
		v := r.AutoTorrentStatus()
		return !v.Picking && v.NextReady
	})

	r.EditAutoTorrent([]int{1, 2, 999}, []int{3})
	if v := r.AutoTorrentStatus(); len(v.Removed) != 2 || len(v.AutoMatchOff) != 1 {
		t.Fatalf("edits outside the batch should be dropped: %+v %+v", v.Removed, v.AutoMatchOff)
	}

	// Restart: a fresh repository reads the same file.
	r2 := newTestAutoTorrentRepo(t, dir)
	v = r2.AutoTorrentStatus()
	if !v.Active || v.BatchNumber != 1 || len(v.Removed) != 2 || !v.NextReady {
		t.Fatalf("session not restored: %+v", v)
	}
	r2.SetAutoTorrentHooks(AutoTorrentHooks{})

	// Confirming lands straight on the prefetched batch.
	v, err = r2.ConfirmAutoTorrent(false)
	if err != nil {
		t.Fatal(err)
	}
	if v.Picking || v.BatchNumber != 2 || v.Batch[0] != 41 || v.Reviewed != 40 || len(v.Removed) != 0 {
		t.Fatalf("expected the prefetched second batch: %+v", v)
	}

	waitFor(t, "third batch prefetch", func() bool { return r2.AutoTorrentStatus().NextReady })
	if _, err := r2.ConfirmAutoTorrent(false); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "third batch", func() bool { return !r2.AutoTorrentStatus().Picking })
	v = r2.AutoTorrentStatus()
	if len(v.Batch) != 10 || v.MoreAfter != 0 || v.NextReady {
		t.Fatalf("expected the last ten: %+v", v)
	}
	if v, _ = r2.ConfirmAutoTorrent(false); !v.Done {
		t.Fatalf("expected the session to be done: %+v", v)
	}

	if v = r2.EndAutoTorrent(); v.Active {
		t.Fatal("session should be closed")
	}
	if _, err := r2.StartAutoTorrent(ids(3)); err != nil {
		t.Fatalf("a new session should open after ending: %v", err)
	}
}

// Confirmed picks waiting to be sent survive a restart and are sent once the client is wired in.
func TestAutoTorrentAddsResumeAfterRestart(t *testing.T) {
	dir := t.TempDir()
	r := newTestAutoTorrentRepo(t, dir)
	r.autoTorrent.mu.Lock()
	r.autoTorrent.state.Adds = []AutoTorrentJob{
		{MediaID: 1, Torrent: hibiketorrent.AnimeTorrent{Name: "a"}},
	}
	r.autoTorrent.saveLocked()
	r.autoTorrent.mu.Unlock()

	r2 := newTestAutoTorrentRepo(t, dir)
	if v := r2.AutoTorrentStatus(); v.Adds.Pending != 1 {
		t.Fatalf("pending add not restored: %+v", v.Adds)
	}
	sent := make(chan string, 1)
	r2.SetAutoTorrentHooks(AutoTorrentHooks{
		Add: func(job AutoTorrentJob) (bool, error) {
			sent <- job.Torrent.Name
			return true, nil
		},
	})
	select {
	case name := <-sent:
		if name != "a" {
			t.Fatalf("sent %q", name)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("pending add was not sent after restart")
	}
	waitFor(t, "add to be recorded", func() bool {
		v := r2.AutoTorrentStatus()
		return v.Adds.Pending == 0 && v.Adds.Added == 1
	})
}
