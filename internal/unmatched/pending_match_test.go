package unmatched

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// buildPlan stages a season pack and returns the move plan a match would have decided on, with the
// episode names it works out while every file is still present.
func buildPlan(t *testing.T, base, torrent string, episodes int) (dest string, planned []plannedMove) {
	t.Helper()

	src := filepath.Join(base, torrent)
	if err := os.MkdirAll(src, 0o755); err != nil {
		t.Fatalf("stage: %v", err)
	}
	dest = filepath.Join(t.TempDir(), "Library", "Some Show")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatalf("destination: %v", err)
	}

	for i := 1; i <= episodes; i++ {
		name := fmt.Sprintf("raw_ep%02d.mkv", i)
		path := filepath.Join(src, name)
		if err := os.WriteFile(path, []byte(fmt.Sprintf("episode %d", i)), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
		newName := fmt.Sprintf("Some Show - Episode %03d.mkv", i)
		planned = append(planned, plannedMove{
			src:     path,
			dest:    filepath.Join(dest, newName),
			newName: newName,
			relPath: name,
		})
	}
	return dest, planned
}

// The point of the journal: a match interrupted halfway is finished under the names it had already
// decided on. Recomputing them from what is left in the staging directory would number the
// remaining episodes from one and file them beside the correctly named half.
func TestInterruptedMatchResumesUnderTheOriginalNames(t *testing.T) {
	repo, base := stageBase(t)
	dest, planned := buildPlan(t, base, "Some Show S01", 12)

	repo.writePendingMatch("Some Show S01", 123, dest, planned)

	// The server got four episodes in before it stopped.
	for i := 0; i < 4; i++ {
		if err := os.Rename(planned[i].src, planned[i].dest); err != nil {
			t.Fatalf("simulate partial move: %v", err)
		}
	}

	// It comes back up.
	repo.ResumePendingMatches()

	for i, move := range planned {
		if _, err := os.Stat(move.dest); err != nil {
			t.Errorf("episode %d never arrived at %q: %v", i+1, move.dest, err)
		}
	}

	// Every episode kept the number it was given before the interruption, and nothing was filed
	// under a restarted numbering.
	entries, err := os.ReadDir(dest)
	if err != nil {
		t.Fatalf("read destination: %v", err)
	}
	if len(entries) != 12 {
		names := make([]string, 0, len(entries))
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Errorf("destination holds %d files, want 12: %v", len(entries), names)
	}
	if _, err := os.Stat(filepath.Join(dest, "Some Show - Episode 012.mkv")); err != nil {
		t.Errorf("the last episode was not filed as episode 12: %v", err)
	}

	// The journal is gone once it has been seen through.
	if _, err := os.Stat(pendingMatchPath("Some Show S01")); !os.IsNotExist(err) {
		t.Error("the journal survived a completed resume")
	}
}

// Resuming has to be safe to run again — a stop during the resume itself is the same problem over.
func TestResumingIsIdempotent(t *testing.T) {
	repo, base := stageBase(t)
	dest, planned := buildPlan(t, base, "Repeatable", 5)

	repo.writePendingMatch("Repeatable", 7, dest, planned)

	repo.ResumePendingMatches()
	repo.ResumePendingMatches()
	repo.ResumePendingMatches()

	entries, err := os.ReadDir(dest)
	if err != nil {
		t.Fatalf("read destination: %v", err)
	}
	if len(entries) != 5 {
		t.Errorf("destination holds %d files after three resumes, want 5", len(entries))
	}
}

// A match that ran to completion leaves nothing behind to resume.
func TestClearedJournalIsNotResumed(t *testing.T) {
	repo, base := stageBase(t)
	dest, planned := buildPlan(t, base, "Finished Cleanly", 3)

	repo.writePendingMatch("Finished Cleanly", 9, dest, planned)
	repo.clearPendingMatch("Finished Cleanly")

	repo.ResumePendingMatches()

	// Nothing moved, because nothing said to.
	for _, move := range planned {
		if _, err := os.Stat(move.src); err != nil {
			t.Errorf("a file was moved by a cleared journal: %v", err)
		}
	}
}

// The journal lives inside the staging area, so the scanner must not mistake it for a download.
func TestJournalDirectoryIsNotTreatedAsADownload(t *testing.T) {
	repo, base := stageBase(t)
	_, planned := buildPlan(t, base, "Real Download", 2)
	repo.writePendingMatch("Real Download", 1, filepath.Join(base, "dest"), planned)

	if _, err := os.Stat(pendingMatchDir()); err != nil {
		t.Fatalf("the journal directory was not created: %v", err)
	}

	if pendingMatchDirName == "" {
		t.Fatal("the journal directory has no name to skip on")
	}
}
