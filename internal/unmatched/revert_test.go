package unmatched

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// stageLibrary points FallbackAnimeBasePath — the library path a repository with no database
// resolves to — at a temporary directory, and returns it.
func stageLibrary(t *testing.T) string {
	t.Helper()

	lib := t.TempDir()
	original := FallbackAnimeBasePath
	FallbackAnimeBasePath = lib
	t.Cleanup(func() { FallbackAnimeBasePath = original })
	return lib
}

// sortedRelPaths lists what a revert restored, in a stable order.
func sortedRelPaths(files []RestoredFile) []string {
	out := make([]string, 0, len(files))
	for _, f := range files {
		out = append(out, f.OriginalRelPath)
	}
	sort.Strings(out)
	return out
}

// matchedFile creates a file at the path a match would have moved it to, and returns the record
// of that move. src is the relative path it had in the staging directory.
func matchedFile(t *testing.T, stagingPath, relPath, destination, newName string) MatchHistoryFile {
	t.Helper()

	if err := os.MkdirAll(destination, 0755); err != nil {
		t.Fatalf("create destination: %v", err)
	}
	newPath := filepath.Join(destination, newName)
	if err := os.WriteFile(newPath, []byte(relPath), 0644); err != nil {
		t.Fatalf("write matched file: %v", err)
	}

	return MatchHistoryFile{
		OriginalName:    filepath.Base(relPath),
		OriginalRelPath: relPath,
		OriginalPath:    filepath.Join(stagingPath, filepath.FromSlash(relPath)),
		NewName:         newName,
		NewPath:         newPath,
	}
}

func TestApplyRevert(t *testing.T) {
	// The whole point of the feature: every file goes back to the exact path and name it had,
	// season folders included, and the anime folder the match created disappears with it.
	t.Run("restores every file to its original path and name", func(t *testing.T) {
		r, base := stageBase(t)
		lib := stageLibrary(t)

		staging := filepath.Join(base, "Some Release")
		destination := filepath.Join(lib, "Some Show")

		details := &MatchHistoryDetails{
			TorrentName: "Some Release",
			StagingPath: staging,
			AnimeID:     123,
			AnimeTitle:  "Some Show",
			Destination: destination,
			Files: []MatchHistoryFile{
				matchedFile(t, staging, "Season 1/raw ep01.mkv", destination, "Some Show - Episode 001.mkv"),
				matchedFile(t, staging, "Season 1/raw ep02.mkv", destination, "Some Show - Episode 002.mkv"),
				matchedFile(t, staging, "raw ep03.mkv", destination, "Some Show - Episode 003.mkv"),
			},
			Metadata: &TorrentMetadata{AnimeID: 123, AnimeTitleRomaji: "Some Show", AutoMatch: true},
		}

		result := r.applyRevert(details)

		if !result.Success || len(result.Failed) > 0 {
			t.Fatalf("expected a clean revert, got %+v", result)
		}
		if got := sortedRelPaths(result.Restored); !reflect.DeepEqual(got, []string{"Season 1/raw ep01.mkv", "Season 1/raw ep02.mkv", "raw ep03.mkv"}) {
			t.Errorf("restored the wrong files: %v", got)
		}
		for _, f := range details.Files {
			if _, err := os.Stat(f.OriginalPath); err != nil {
				t.Errorf("expected %q to be restored: %v", f.OriginalRelPath, err)
			}
			if _, err := os.Stat(f.NewPath); err == nil {
				t.Errorf("expected %q to be gone from the library", f.NewName)
			}
		}
		if !result.DestinationRemoved {
			t.Error("expected the emptied destination folder to be removed")
		}
		if _, err := os.Stat(destination); err == nil {
			t.Error("expected the destination folder to be gone")
		}
	})

	// The stored record is the only thing saying which anime a download came from. Restoring it
	// with auto-match still on would have the scanner re-match the torrent seconds later.
	t.Run("puts the torrent's metadata back with auto-match off", func(t *testing.T) {
		r, base := stageBaseWithDB(t)
		lib := stageLibrary(t)

		staging := filepath.Join(base, "Release")
		destination := filepath.Join(lib, "Show")

		details := &MatchHistoryDetails{
			TorrentName: "Release",
			StagingPath: staging,
			Destination: destination,
			Files:       []MatchHistoryFile{matchedFile(t, staging, "ep01.mkv", destination, "Show - Episode 001.mkv")},
			Metadata: &TorrentMetadata{
				AnimeID:          42,
				AnimeTitleRomaji: "Show",
				AutoMatch:        true,
				EpisodeTitles:    map[string]string{"1": "The First One"},
			},
		}

		r.applyRevert(details)

		restored := r.GetTorrentMetadata("Release")
		if restored == nil {
			t.Fatal("expected the torrent's metadata to be restored")
		}
		if restored.AnimeID != 42 {
			t.Errorf("expected the anime id to survive, got %d", restored.AnimeID)
		}
		if restored.EpisodeTitle(1) != "The First One" {
			t.Errorf("expected the episode titles to survive, got %q", restored.EpisodeTitle(1))
		}
		if restored.AutoMatch {
			t.Error("expected auto-match to be cleared, or the scanner re-matches the restored files immediately")
		}
		// And nothing was written into the staging folder to carry it.
		if _, err := os.Stat(filepath.Join(staging, metadataFileName)); err == nil {
			t.Error("expected no metadata file to be written into the Unmatched folder")
		}
	})

	// A file the user has since renamed, moved or deleted cannot be put back — that has to be
	// reported rather than silently counted as restored.
	t.Run("reports files that are no longer where the match left them", func(t *testing.T) {
		r, base := stageBase(t)
		lib := stageLibrary(t)

		staging := filepath.Join(base, "Release")
		destination := filepath.Join(lib, "Show")

		present := matchedFile(t, staging, "ep01.mkv", destination, "Show - Episode 001.mkv")
		gone := matchedFile(t, staging, "ep02.mkv", destination, "Show - Episode 002.mkv")
		if err := os.Remove(gone.NewPath); err != nil {
			t.Fatal(err)
		}

		result := r.applyRevert(&MatchHistoryDetails{
			TorrentName: "Release",
			StagingPath: staging,
			Destination: destination,
			Files:       []MatchHistoryFile{present, gone},
		})

		if len(result.Restored) != 1 || result.Restored[0].OriginalRelPath != "ep01.mkv" {
			t.Errorf("expected only the present file to be restored, got %+v", result.Restored)
		}
		if !reflect.DeepEqual(result.Missing, []string{"Show - Episode 002.mkv"}) {
			t.Errorf("expected the deleted file to be reported as missing, got %v", result.Missing)
		}
	})

	// Restoring must never write over whatever is sitting at the original path — that file is
	// not the one the match moved, and overwriting it would destroy it.
	t.Run("refuses to overwrite a file sitting at the original path", func(t *testing.T) {
		r, base := stageBase(t)
		lib := stageLibrary(t)

		staging := filepath.Join(base, "Release")
		destination := filepath.Join(lib, "Show")
		file := matchedFile(t, staging, "ep01.mkv", destination, "Show - Episode 001.mkv")

		if err := os.MkdirAll(staging, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file.OriginalPath, []byte("something else"), 0644); err != nil {
			t.Fatal(err)
		}

		result := r.applyRevert(&MatchHistoryDetails{
			TorrentName: "Release",
			StagingPath: staging,
			Destination: destination,
			Files:       []MatchHistoryFile{file},
		})

		if len(result.Restored) != 0 || len(result.Failed) != 1 {
			t.Fatalf("expected the restore to be refused, got %+v", result)
		}
		content, err := os.ReadFile(file.OriginalPath)
		if err != nil || string(content) != "something else" {
			t.Errorf("expected the file in the way to survive untouched, got %q (%v)", content, err)
		}
		if _, err := os.Stat(file.NewPath); err != nil {
			t.Errorf("expected the matched file to be left in the library: %v", err)
		}
	})

	// The destination folder belongs to the user once anything else is in it — another release's
	// episodes, artwork, subtitles they added by hand.
	t.Run("leaves a destination folder that still holds other files", func(t *testing.T) {
		r, base := stageBase(t)
		lib := stageLibrary(t)

		staging := filepath.Join(base, "Release")
		destination := filepath.Join(lib, "Show")
		file := matchedFile(t, staging, "ep01.mkv", destination, "Show - Episode 001.mkv")

		keep := filepath.Join(destination, "Show - Episode 099.mkv")
		if err := os.WriteFile(keep, []byte("from another release"), 0644); err != nil {
			t.Fatal(err)
		}

		result := r.applyRevert(&MatchHistoryDetails{
			TorrentName: "Release",
			StagingPath: staging,
			Destination: destination,
			Files:       []MatchHistoryFile{file},
		})

		if result.DestinationRemoved {
			t.Error("expected a destination holding other files to be left alone")
		}
		if _, err := os.Stat(keep); err != nil {
			t.Errorf("expected the unrelated file to survive: %v", err)
		}
	})

	// A record whose original path points outside the staging directory would let a revert write
	// anywhere on disk.
	t.Run("refuses to restore outside the unmatched folder", func(t *testing.T) {
		r, base := stageBase(t)
		lib := stageLibrary(t)

		destination := filepath.Join(lib, "Show")
		outside := filepath.Join(t.TempDir(), "escaped.mkv")

		file := matchedFile(t, filepath.Join(base, "Release"), "ep01.mkv", destination, "Show - Episode 001.mkv")
		file.OriginalPath = outside

		result := r.applyRevert(&MatchHistoryDetails{
			TorrentName: "Release",
			StagingPath: filepath.Join(base, "Release"),
			Destination: destination,
			Files:       []MatchHistoryFile{file},
		})

		if len(result.Restored) != 0 || len(result.Failed) != 1 {
			t.Fatalf("expected the traversing record to be refused, got %+v", result)
		}
		if _, err := os.Stat(outside); err == nil {
			t.Error("expected nothing to be written outside the staging directory")
		}
	})
}

func TestFileRevertStatus(t *testing.T) {
	_, base := stageBase(t)
	lib := stageLibrary(t)

	staging := filepath.Join(base, "Release")
	destination := filepath.Join(lib, "Show")

	ready := matchedFile(t, staging, "ep01.mkv", destination, "Show - Episode 001.mkv")
	if got := fileRevertStatus(ready); got != RevertStatusReady {
		t.Errorf("expected %q, got %q", RevertStatusReady, got)
	}

	missing := matchedFile(t, staging, "ep02.mkv", destination, "Show - Episode 002.mkv")
	if err := os.Remove(missing.NewPath); err != nil {
		t.Fatal(err)
	}
	if got := fileRevertStatus(missing); got != RevertStatusMissing {
		t.Errorf("expected %q, got %q", RevertStatusMissing, got)
	}

	blocked := matchedFile(t, staging, "ep03.mkv", destination, "Show - Episode 003.mkv")
	if err := os.MkdirAll(staging, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(blocked.OriginalPath, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if got := fileRevertStatus(blocked); got != RevertStatusBlocked {
		t.Errorf("expected %q, got %q", RevertStatusBlocked, got)
	}
}
