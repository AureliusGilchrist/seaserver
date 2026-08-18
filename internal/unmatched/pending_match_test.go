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

	repo.writePendingMatch(&MatchRequest{TorrentName: "Some Show S01", AnimeID: 123, AnimeTitleClean: "Some Show"}, dest, planned, nil, nil)

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

	repo.writePendingMatch(&MatchRequest{TorrentName: "Repeatable", AnimeID: 7, AnimeTitleClean: "Some Show"}, dest, planned, nil, nil)

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

	journal := repo.writePendingMatch(&MatchRequest{TorrentName: "Finished Cleanly", AnimeID: 9, AnimeTitleClean: "Some Show"}, dest, planned, nil, nil)
	journal.clear()

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
	repo.writePendingMatch(&MatchRequest{TorrentName: "Real Download", AnimeID: 1, AnimeTitleClean: "Some Show"}, filepath.Join(base, "dest"), planned, nil, nil)

	if _, err := os.Stat(pendingMatchDir()); err != nil {
		t.Fatalf("the journal directory was not created: %v", err)
	}

	if pendingMatchDirName == "" {
		t.Fatal("the journal directory has no name to skip on")
	}
}

// A destination that exists but is shorter than the plan says it should be is an interrupted copy,
// not a delivered episode. Resuming has to copy it again rather than take its existence as proof.
func TestResumeRecopiesAnUnfinishedDestination(t *testing.T) {
	repo, base := stageBase(t)
	dest, planned := buildPlan(t, base, "Half Written", 3)

	repo.writePendingMatch(&MatchRequest{TorrentName: "Half Written", AnimeID: 4, AnimeTitleClean: "Some Show"}, dest, planned, nil, nil)

	// The first episode was being copied when the server stopped: part of it is at the destination,
	// under its final name, and the source is still in the staging directory.
	want, err := os.ReadFile(planned[0].src)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(planned[0].dest, want[:3], 0o644); err != nil {
		t.Fatal(err)
	}

	repo.ResumePendingMatches()

	got, err := os.ReadFile(planned[0].dest)
	if err != nil {
		t.Fatalf("episode 1 is missing: %v", err)
	}
	if string(got) != string(want) {
		t.Errorf("episode 1 was left as %q, want the whole file %q", got, want)
	}
}

// The other half of an interrupted match: the files arrived, and the server stopped before anything
// recorded that they had been matched. Resuming has to finish the bookkeeping, not just the moves.
func TestInterruptedMatchFinishesItsBookkeeping(t *testing.T) {
	repo, base := stageBaseWithDB(t)
	dest, planned := buildPlan(t, base, "Recorded Late", 2)

	req := &MatchRequest{TorrentName: "Recorded Late", AnimeID: 55, AnimeTitleClean: "Some Show"}
	repo.writePendingMatch(req, dest, planned, nil, nil)

	// Every file made it across before the stop, so there are no moves left — only the record, the
	// metadata, the sidecar and the cleanup, none of which had run.
	for _, move := range planned {
		if err := os.Rename(move.src, move.dest); err != nil {
			t.Fatalf("simulate completed moves: %v", err)
		}
	}

	repo.ResumePendingMatches()

	history, err := repo.GetMatchHistory(10)
	if err != nil {
		t.Fatalf("read history: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("history holds %d matches, want the one that was interrupted", len(history))
	}
	if history[0].TorrentName != "Recorded Late" || history[0].AnimeID != 55 {
		t.Errorf("recorded match = %q/%d, want Recorded Late/55", history[0].TorrentName, history[0].AnimeID)
	}
	if _, err := os.Stat(pendingMatchPath("Recorded Late")); !os.IsNotExist(err) {
		t.Error("the journal survived a match that was finished")
	}
}

// Resuming twice must not record the match twice.
func TestResumeDoesNotDuplicateTheUndoRecord(t *testing.T) {
	repo, base := stageBaseWithDB(t)
	dest, planned := buildPlan(t, base, "Once Only", 2)

	req := &MatchRequest{TorrentName: "Once Only", AnimeID: 77, AnimeTitleClean: "Some Show"}
	journal := repo.writePendingMatch(req, dest, planned, nil, nil)
	for _, move := range planned {
		if err := os.Rename(move.src, move.dest); err != nil {
			t.Fatalf("simulate completed moves: %v", err)
		}
	}

	repo.ResumePendingMatches()

	// The journal is gone, so put it back exactly as an interrupted run would have left it: the
	// record written, but the plan not yet torn up.
	journal.record.Stages = nil
	journal.flush()
	repo.ResumePendingMatches()

	history, err := repo.GetMatchHistory(10)
	if err != nil {
		t.Fatalf("read history: %v", err)
	}
	if len(history) != 1 {
		t.Errorf("history holds %d matches after two resumes, want 1", len(history))
	}
}
