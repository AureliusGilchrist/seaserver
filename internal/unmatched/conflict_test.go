package unmatched

import (
	"encoding/json"
	"os"
	"path/filepath"
	"seanime/internal/database/models"
	"testing"
)

// plan builds the planned moves for a set of destination names, creating the source files so the
// incoming sizes are readable.
func plan(t *testing.T, staging, destination string, names ...string) []plannedMove {
	t.Helper()

	if err := os.MkdirAll(staging, 0755); err != nil {
		t.Fatalf("create staging: %v", err)
	}
	moves := make([]plannedMove, 0, len(names))
	for _, name := range names {
		src := filepath.Join(staging, name)
		if err := os.WriteFile(src, []byte("incoming "+name), 0644); err != nil {
			t.Fatalf("write source: %v", err)
		}
		moves = append(moves, plannedMove{
			src:     src,
			dest:    filepath.Join(destination, name),
			newName: name,
			relPath: name,
		})
	}
	return moves
}

// occupy puts a file at a destination, as an earlier match would have left it.
func occupy(t *testing.T, destination, name string) string {
	t.Helper()

	if err := os.MkdirAll(destination, 0755); err != nil {
		t.Fatalf("create destination: %v", err)
	}
	path := filepath.Join(destination, name)
	if err := os.WriteFile(path, []byte("already here, and longer than the incoming file"), 0644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	return path
}

// recordMatchOf stores a match record claiming that torrentName moved files to the given paths.
func recordMatchOf(t *testing.T, r *Repository, torrentName, destination string, newPaths ...string) {
	t.Helper()

	files := make([]MatchHistoryFile, 0, len(newPaths))
	for _, p := range newPaths {
		files = append(files, MatchHistoryFile{
			NewName: filepath.Base(p),
			NewPath: p,
		})
	}
	value, err := json.Marshal(&MatchHistoryDetails{
		TorrentName: torrentName,
		Destination: destination,
		Files:       files,
	})
	if err != nil {
		t.Fatalf("marshal details: %v", err)
	}
	if _, err := r.database.InsertUnmatchedMatchRecord(&models.UnmatchedMatchRecord{
		TorrentName: torrentName,
		Destination: destination,
		FileCount:   len(files),
		Value:       value,
	}); err != nil {
		t.Fatalf("insert match record: %v", err)
	}
}

func TestDetectConflictsClearDestination(t *testing.T) {
	r, base := stageBase(t)
	destination := filepath.Join(t.TempDir(), "Some Anime")

	moves := plan(t, filepath.Join(base, "torrent"), destination, "Ep 001.mkv", "Ep 002.mkv")

	if got := r.detectConflicts("torrent", destination, moves); got != nil {
		t.Fatalf("expected no conflict for an empty destination, got %+v", got)
	}
}

func TestDetectConflictsReportsOccupiedDestinations(t *testing.T) {
	r, base := stageBase(t)
	destination := filepath.Join(t.TempDir(), "Some Anime")

	moves := plan(t, filepath.Join(base, "torrent"), destination, "Ep 001.mkv", "Ep 002.mkv", "Ep 003.mkv")
	occupy(t, destination, "Ep 002.mkv")

	conflict := r.detectConflicts("torrent", destination, moves)
	if conflict == nil {
		t.Fatal("expected a conflict when a destination is already occupied")
	}
	if len(conflict.Files) != 1 {
		t.Fatalf("expected 1 conflicting file, got %d", len(conflict.Files))
	}
	if conflict.Files[0].NewName != "Ep 002.mkv" {
		t.Errorf("conflicting file = %q, want %q", conflict.Files[0].NewName, "Ep 002.mkv")
	}
	if conflict.TotalPlanned != 3 {
		t.Errorf("TotalPlanned = %d, want 3", conflict.TotalPlanned)
	}
	if conflict.Files[0].ExistingSize == 0 || conflict.Files[0].IncomingSize == 0 {
		t.Errorf("expected both sizes to be reported, got existing=%d incoming=%d",
			conflict.Files[0].ExistingSize, conflict.Files[0].IncomingSize)
	}
	// With no match record behind the existing file, it cannot be claimed as this torrent's own.
	if conflict.SameTorrent {
		t.Error("SameTorrent = true with no match record to attribute the file to")
	}
}

func TestDetectConflictsAttributesADifferentTorrent(t *testing.T) {
	r, base := stageBaseWithDB(t)
	destination := filepath.Join(t.TempDir(), "Some Anime")

	moves := plan(t, filepath.Join(base, "new torrent"), destination, "Ep 001.mkv")
	existing := occupy(t, destination, "Ep 001.mkv")
	recordMatchOf(t, r, "the original torrent", destination, existing)

	conflict := r.detectConflicts("new torrent", destination, moves)
	if conflict == nil {
		t.Fatal("expected a conflict")
	}
	if conflict.SameTorrent {
		t.Error("SameTorrent = true, want false for a file another torrent put there")
	}
	if got := conflict.Files[0].SourceTorrent; got != "the original torrent" {
		t.Errorf("SourceTorrent = %q, want %q", got, "the original torrent")
	}
	if len(conflict.SourceTorrents) != 1 || conflict.SourceTorrents[0] != "the original torrent" {
		t.Errorf("SourceTorrents = %v, want [the original torrent]", conflict.SourceTorrents)
	}
}

func TestDetectConflictsRecognisesTheSameTorrentRerun(t *testing.T) {
	r, base := stageBaseWithDB(t)
	destination := filepath.Join(t.TempDir(), "Some Anime")

	moves := plan(t, filepath.Join(base, "torrent"), destination, "Ep 001.mkv")
	existing := occupy(t, destination, "Ep 001.mkv")
	recordMatchOf(t, r, "torrent", destination, existing)

	conflict := r.detectConflicts("torrent", destination, moves)
	if conflict == nil {
		t.Fatal("expected a conflict")
	}
	if !conflict.SameTorrent {
		t.Error("SameTorrent = false, want true when the same torrent already matched these files")
	}
}

// A reverted match moved its files back out of the library, so it no longer owns those paths and
// must not be named as the source of something else sitting there.
func TestDetectConflictsIgnoresRevertedRecords(t *testing.T) {
	r, base := stageBaseWithDB(t)
	destination := filepath.Join(t.TempDir(), "Some Anime")

	moves := plan(t, filepath.Join(base, "torrent"), destination, "Ep 001.mkv")
	existing := occupy(t, destination, "Ep 001.mkv")

	value, err := json.Marshal(&MatchHistoryDetails{
		TorrentName: "a reverted torrent",
		Destination: destination,
		Files:       []MatchHistoryFile{{NewName: "Ep 001.mkv", NewPath: existing}},
		Revert:      &RevertOutcome{Restored: []string{"Ep 001.mkv"}},
	})
	if err != nil {
		t.Fatalf("marshal details: %v", err)
	}
	if _, err := r.database.InsertUnmatchedMatchRecord(&models.UnmatchedMatchRecord{
		TorrentName: "a reverted torrent",
		Destination: destination,
		FileCount:   1,
		Value:       value,
	}); err != nil {
		t.Fatalf("insert match record: %v", err)
	}

	conflict := r.detectConflicts("torrent", destination, moves)
	if conflict == nil {
		t.Fatal("expected a conflict — the file is still on disk")
	}
	if got := conflict.Files[0].SourceTorrent; got != "" {
		t.Errorf("SourceTorrent = %q, want empty for a reverted record", got)
	}
}

// The newest record wins: a path matched twice reports the match that produced what is on disk.
func TestDetectConflictsPrefersTheNewestRecord(t *testing.T) {
	r, base := stageBaseWithDB(t)
	destination := filepath.Join(t.TempDir(), "Some Anime")

	moves := plan(t, filepath.Join(base, "third torrent"), destination, "Ep 001.mkv")
	existing := occupy(t, destination, "Ep 001.mkv")
	recordMatchOf(t, r, "first torrent", destination, existing)
	recordMatchOf(t, r, "second torrent", destination, existing)

	conflict := r.detectConflicts("third torrent", destination, moves)
	if conflict == nil {
		t.Fatal("expected a conflict")
	}
	if got := conflict.Files[0].SourceTorrent; got != "second torrent" {
		t.Errorf("SourceTorrent = %q, want %q (the most recent match)", got, "second torrent")
	}
}
