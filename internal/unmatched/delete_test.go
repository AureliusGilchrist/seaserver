package unmatched

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
)

// stageBase points UnmatchedBasePath at a temporary directory for the duration of a test and
// returns a repository writing into it.
func stageBase(t *testing.T) (*Repository, string) {
	t.Helper()

	base := t.TempDir()
	original := UnmatchedBasePath
	UnmatchedBasePath = base
	t.Cleanup(func() { UnmatchedBasePath = original })

	logger := zerolog.Nop()
	return NewRepository(&logger, nil), base
}

// remaining lists what is left inside the staging directory, deepest paths included.
func remaining(t *testing.T, base string) []string {
	t.Helper()

	var left []string
	err := filepath.Walk(base, func(p string, info os.FileInfo, err error) error {
		if err != nil || p == base {
			return nil
		}
		rel, relErr := filepath.Rel(base, p)
		if relErr != nil {
			return nil
		}
		left = append(left, rel)
		return nil
	})
	if err != nil {
		t.Fatalf("walk staging directory: %v", err)
	}
	return left
}

func TestDeleteTorrent(t *testing.T) {
	t.Run("removes the whole torrent directory", func(t *testing.T) {
		r, base := stageBase(t)

		dir := filepath.Join(base, "Some Release")
		if err := os.MkdirAll(filepath.Join(dir, "Season 1"), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "Season 1", "ep01.mkv"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		writeSidecar(t, dir, 0)

		if err := r.DeleteTorrent("Some Release"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		if left := remaining(t, base); len(left) > 0 {
			t.Errorf("expected an empty staging directory, found %v", left)
		}
	})

	// A torrent's directory is created from the sanitized name, so a caller holding the
	// torrent's own name used to delete nothing at all and report "torrent not found".
	t.Run("finds the directory under its sanitized name", func(t *testing.T) {
		r, base := stageBase(t)

		// A slash in a release name is what sanitizing rewrites, and it is also what turns the
		// raw name into a nested path that does not exist on disk.
		rawName := "SubGroup/Show"
		dir := DestinationFor(rawName)
		if dir == filepath.Join(base, rawName) {
			t.Fatal("expected the sanitized directory name to differ from the raw name")
		}
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}

		if err := r.DeleteTorrent(rawName); err != nil {
			t.Fatalf("delete: %v", err)
		}
		if left := remaining(t, base); len(left) > 0 {
			t.Errorf("expected an empty staging directory, found %v", left)
		}
	})

	// Partial files sit next to the torrent rather than inside it, so removing only the
	// directory left them in the staging folder for good.
	t.Run("removes partial download leftovers beside the torrent", func(t *testing.T) {
		r, base := stageBase(t)

		dir := filepath.Join(base, "Release")
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		for _, leftover := range []string{"Release.!qB", "Release.part"} {
			if err := os.WriteFile(filepath.Join(base, leftover), []byte("x"), 0644); err != nil {
				t.Fatal(err)
			}
		}
		// An unrelated torrent's leftover must survive.
		if err := os.WriteFile(filepath.Join(base, "Other.!qB"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}

		if err := r.DeleteTorrent("Release"); err != nil {
			t.Fatalf("delete: %v", err)
		}

		left := remaining(t, base)
		if len(left) != 1 || left[0] != "Other.!qB" {
			t.Errorf("expected only the unrelated leftover to survive, found %v", left)
		}
	})

	t.Run("deletes a single-file torrent", func(t *testing.T) {
		r, base := stageBase(t)

		if err := os.WriteFile(filepath.Join(base, "Movie.mkv"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}

		if err := r.DeleteTorrent("Movie.mkv"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		if left := remaining(t, base); len(left) > 0 {
			t.Errorf("expected an empty staging directory, found %v", left)
		}
	})

	t.Run("refuses to escape the staging directory", func(t *testing.T) {
		r, base := stageBase(t)

		outside := filepath.Join(filepath.Dir(base), "outside.txt")
		if err := os.WriteFile(outside, []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Remove(outside) })

		if err := r.DeleteTorrent(filepath.Join("..", "outside.txt")); err == nil {
			t.Error("expected a traversing name to be rejected")
		}
		if _, err := os.Stat(outside); err != nil {
			t.Errorf("expected the file outside the staging directory to survive: %v", err)
		}
	})

	t.Run("reports a torrent that is not there", func(t *testing.T) {
		r, _ := stageBase(t)

		if err := r.DeleteTorrent("Nothing Here"); err == nil {
			t.Error("expected an error for a missing torrent")
		}
	})
}
