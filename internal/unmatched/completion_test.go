package unmatched

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

// stageScanner returns a scanner writing into a temporary staging directory.
func stageScanner(t *testing.T) (*Scanner, string) {
	t.Helper()

	repo, base := stageBase(t)
	logger := zerolog.Nop()
	return NewScanner(&logger, repo), base
}

func TestStagingDirName(t *testing.T) {
	_, base := stageBase(t)

	cases := []struct {
		path string
		want string
		ok   bool
	}{
		// The save path itself, and anything below it, belong to the same torrent.
		{filepath.Join(base, "Some Release"), "Some Release", true},
		{filepath.Join(base, "Some Release", "Season 1", "ep01.mkv"), "Some Release", true},
		// The base itself belongs to no torrent, and neither does anything outside it.
		{base, "", false},
		{filepath.Dir(base), "", false},
		{filepath.Join(filepath.Dir(base), "Elsewhere", "ep01.mkv"), "", false},
		{"", "", false},
	}

	for _, c := range cases {
		got, ok := StagingDirName(c.path)
		if ok != c.ok || got != c.want {
			t.Errorf("StagingDirName(%q) = %q,%v — want %q,%v", c.path, got, ok, c.want, c.ok)
		}
	}
}

// A download in progress is indistinguishable from a finished one on disk under the default
// configuration of every supported client, so the client's own report has to be what decides.
// Getting this wrong matches a partial download into the library and deletes the staging folder.
func TestCompletionState(t *testing.T) {
	t.Run("trusts the client over the filesystem", func(t *testing.T) {
		s, base := stageScanner(t)

		s.SetTorrentStateSource(func() ([]TorrentState, bool) {
			return []TorrentState{
				{Name: "Downloading Release", SavePath: filepath.Join(base, "Downloading Release"), Finished: false},
				{Name: "Finished Release", SavePath: filepath.Join(base, "Finished Release"), Finished: true},
			}, true
		})

		if got := s.completionState("Downloading Release"); got != CompletionDownloading {
			t.Errorf("expected %q, got %q", CompletionDownloading, got)
		}
		if got := s.completionState("Finished Release"); got != CompletionFinished {
			t.Errorf("expected %q, got %q", CompletionFinished, got)
		}
		if got := s.completionState("Never Heard Of It"); got != CompletionUnknown {
			t.Errorf("expected %q for a torrent the client has no record of, got %q", CompletionUnknown, got)
		}
	})

	// The client names a torrent from its own metadata, which need not match the release title
	// the staging directory was created from. Where it is writing is not a guess.
	t.Run("matches on save path when the name differs", func(t *testing.T) {
		s, base := stageScanner(t)

		s.SetTorrentStateSource(func() ([]TorrentState, bool) {
			return []TorrentState{{
				Name:     "some.other.name.the.client.uses",
				SavePath: filepath.Join(base, "Release As Queued", "Release Root Folder"),
				Finished: false,
			}}, true
		})

		if got := s.completionState("Release As Queued"); got != CompletionDownloading {
			t.Errorf("expected the torrent to be matched by save path, got %q", got)
		}
	})

	// An unreachable client is not a client reporting nothing, and the difference is the whole
	// safety of this feature: "unknown" is allowed to fall through to the settle check and be
	// matched, so reporting an unreachable client as unknown is what moved partial downloads into
	// the library whenever qBittorrent was restarting or the network hiccuped.
	t.Run("an unreachable client is unreachable, not unknown", func(t *testing.T) {
		s, _ := stageScanner(t)

		s.SetTorrentStateSource(func() ([]TorrentState, bool) { return nil, false })

		if got := s.completionState("Anything"); got != CompletionUnreachable {
			t.Errorf("expected %q, got %q", CompletionUnreachable, got)
		}
	})

	t.Run("no source configured is unreachable", func(t *testing.T) {
		s, _ := stageScanner(t)

		if got := s.completionState("Anything"); got != CompletionUnreachable {
			t.Errorf("expected %q, got %q", CompletionUnreachable, got)
		}
	})

	// A client that answers with an empty list moments after the backend started is far more likely
	// to be still loading its session than to be genuinely empty — the two come back together after
	// a reboot. Believing it would mark every download in progress as one the client has forgotten.
	t.Run("an empty report during startup is not evidence", func(t *testing.T) {
		s, _ := stageScanner(t)
		s.startedAt = time.Now()
		s.SetTorrentStateSource(func() ([]TorrentState, bool) { return nil, true })

		if got := s.completionState("Anything"); got != CompletionUnreachable {
			t.Errorf("expected %q during the startup grace, got %q", CompletionUnreachable, got)
		}
	})

	t.Run("an empty report is believed once the client has been seen loaded", func(t *testing.T) {
		s, _ := stageScanner(t)
		s.startedAt = time.Now()
		s.sawTorrents = true
		s.SetTorrentStateSource(func() ([]TorrentState, bool) { return nil, true })

		if got := s.completionState("Anything"); got != CompletionUnknown {
			t.Errorf("expected %q once the client is known to be up, got %q", CompletionUnknown, got)
		}
	})

	t.Run("an empty report is believed after the startup grace has passed", func(t *testing.T) {
		s, _ := stageScanner(t)
		s.startedAt = time.Now().Add(-2 * clientStartupGrace)
		s.SetTorrentStateSource(func() ([]TorrentState, bool) { return nil, true })

		if got := s.completionState("Anything"); got != CompletionUnknown {
			t.Errorf("expected %q after the grace period, got %q", CompletionUnknown, got)
		}
	})
}

func TestLooksSettled(t *testing.T) {
	s, base := stageScanner(t)

	dir := filepath.Join(base, "Release")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("partial"), 0644); err != nil {
		t.Fatal(err)
	}

	// First sighting is never enough — a torrent gets at least one full window either way.
	if s.looksSettled("Release", dir) {
		t.Error("expected the first measurement to never count as settled")
	}

	// Backdate the recorded fingerprint to simulate the window having passed.
	s.mu.Lock()
	fp := s.fingerprints["Release"]
	fp.since = time.Now().Add(-settleWindow - time.Second)
	s.fingerprints["Release"] = fp
	s.mu.Unlock()

	if !s.looksSettled("Release", dir) {
		t.Error("expected an unchanged directory to settle once the window has passed")
	}

	// A file still growing resets the clock.
	if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("partial plus more"), 0644); err != nil {
		t.Fatal(err)
	}
	if s.looksSettled("Release", dir) {
		t.Error("expected a directory that just changed to be unsettled")
	}

	// So does a new file appearing at the same total size — count is part of the measure.
	s.mu.Lock()
	fp = s.fingerprints["Release"]
	fp.since = time.Now().Add(-settleWindow - time.Second)
	s.fingerprints["Release"] = fp
	s.mu.Unlock()
	if err := os.WriteFile(filepath.Join(dir, "ep02.mkv"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if s.looksSettled("Release", dir) {
		t.Error("expected a new file to reset the settle window")
	}
}

// ClearCompletedTorrent runs when a torrent is matched, deleted or its match undone. Whatever it
// used to measure is meaningless by then, and keeping it would let a re-download inherit a
// fingerprint old enough to count as settled immediately.
func TestClearCompletedTorrentForgetsFingerprint(t *testing.T) {
	s, base := stageScanner(t)

	dir := filepath.Join(base, "Release")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	s.looksSettled("Release", dir)
	s.ClearCompletedTorrent("Release")

	s.mu.Lock()
	_, still := s.fingerprints["Release"]
	s.mu.Unlock()
	if still {
		t.Error("expected the fingerprint to be dropped along with the completed record")
	}
}
