package unmatched

import (
	"fmt"
	"github.com/rs/zerolog"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// stagedDownload creates a staging directory holding what a part-finished season pack looks like on
// disk: some episodes written, no temp-file suffix to give it away. qBittorrent's ".!qB" suffix is
// off by default, so this is exactly what an in-progress download looks like in a normal setup.
func stagedDownload(t *testing.T, base, name string, episodes int) string {
	t.Helper()

	dir := filepath.Join(base, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create staging dir: %v", err)
	}
	for i := 1; i <= episodes; i++ {
		path := filepath.Join(dir, fmt.Sprintf("episode%02d.mkv", i))
		if err := os.WriteFile(path, []byte("video"), 0o644); err != nil {
			t.Fatalf("write episode: %v", err)
		}
	}
	return dir
}

// waitForScan gives the verification goroutines time to run and finish.
func waitForScan() { time.Sleep(150 * time.Millisecond) }

// waitUntilCompleted waits for a directory to be accepted as finished, so the positive case is
// pinned by an outcome rather than by a guess at how long the verification takes.
func waitUntilCompleted(t *testing.T, s *Scanner, name string) bool {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if s.IsMarkedCompleted(name) {
			return true
		}
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

// The bug this pins: a download still running was declared finished whenever the torrent client
// could not be reached, its part-written files were moved into the library, and the rest of the
// download was deleted out from under the client. What you saw afterwards was a season pack with
// four of its episodes in it.
func TestScanNeverCompletesWhileTheClientIsUnreachable(t *testing.T) {
	s, base := stageScanner(t)
	s.verifyDelay = 10 * time.Millisecond
	s.startedAt = time.Now().Add(-2 * clientStartupGrace) // past the startup grace, to isolate the cause

	stagedDownload(t, base, "Partly Downloaded Pack", 4)

	// The client cannot be answered for — restarting, network down, or not yet wired up after the
	// backend came back.
	s.SetTorrentStateSource(func() ([]TorrentState, bool) { return nil, false })

	// Several passes, and a directory that never changes between them — which is precisely what
	// used to satisfy the settle check.
	for i := 0; i < 3; i++ {
		s.scanForCompletedDownloads()
		waitForScan()
	}

	if s.IsMarkedCompleted("Partly Downloaded Pack") {
		t.Error("a download was accepted as complete while the torrent client could not be asked")
	}
}

// The same directory, with the client reachable and saying it is still going.
func TestScanNeverCompletesWhileTheClientSaysDownloading(t *testing.T) {
	s, base := stageScanner(t)
	s.verifyDelay = 10 * time.Millisecond
	s.startedAt = time.Now().Add(-2 * clientStartupGrace)

	stagedDownload(t, base, "Still Going", 4)
	s.SetTorrentStateSource(func() ([]TorrentState, bool) {
		return []TorrentState{{Name: "Still Going", SavePath: filepath.Join(base, "Still Going"), Finished: false}}, true
	})

	for i := 0; i < 3; i++ {
		s.scanForCompletedDownloads()
		waitForScan()
	}

	if s.IsMarkedCompleted("Still Going") {
		t.Error("a download the client reports as unfinished was accepted as complete")
	}
}

// Just after the backend restarts, a torrent client coming up alongside it answers with an empty
// list before it has loaded its session. That must not read as "the client has forgotten this
// download", which is the verdict that allows it to be matched.
func TestScanNeverCompletesOnAnEmptyClientDuringStartup(t *testing.T) {
	s, base := stageScanner(t)
	s.verifyDelay = 10 * time.Millisecond
	s.startedAt = time.Now() // just started, as after a restart

	stagedDownload(t, base, "Mid Download At Restart", 4)
	s.SetTorrentStateSource(func() ([]TorrentState, bool) { return nil, true })

	for i := 0; i < 3; i++ {
		s.scanForCompletedDownloads()
		waitForScan()
	}

	if s.IsMarkedCompleted("Mid Download At Restart") {
		t.Error("a download was accepted as complete on an empty report from a client that had only just started")
	}
}

// And the case that must still work: the client is up and says this one is done.
//
// Built without a repository so accepting the download does not go on to move any files: what is
// being pinned here is the decision, and the matching that follows it has its own tests. It also
// keeps the auto-match goroutine, which outlives the scan, from running past the end of the test.
func TestScanCompletesWhenTheClientSaysFinished(t *testing.T) {
	_, base := stageBase(t)
	logger := zerolog.Nop()
	s := NewScanner(&logger, nil)
	s.verifyDelay = 10 * time.Millisecond
	s.startedAt = time.Now().Add(-2 * clientStartupGrace)

	stagedDownload(t, base, "All Done", 12)
	s.SetTorrentStateSource(func() ([]TorrentState, bool) {
		return []TorrentState{{Name: "All Done", SavePath: filepath.Join(base, "All Done"), Finished: true}}, true
	})

	s.scanForCompletedDownloads()

	if !waitUntilCompleted(t, s, "All Done") {
		t.Error("a download the client reports as finished was not accepted")
	}
}
