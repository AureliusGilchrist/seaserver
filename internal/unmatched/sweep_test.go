package unmatched

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// writeSidecar writes a metadata sidecar into dir, backdated by age.
func writeSidecar(t *testing.T, dir string, age time.Duration) string {
	t.Helper()
	path := filepath.Join(dir, metadataFileName)
	if err := os.WriteFile(path, []byte(`{"animeId":1}`), 0644); err != nil {
		t.Fatalf("write sidecar: %v", err)
	}
	if age > 0 {
		when := time.Now().Add(-age)
		if err := os.Chtimes(path, when, when); err != nil {
			t.Fatalf("backdate sidecar: %v", err)
		}
	}
	return path
}

func TestHoldsNoFiles(t *testing.T) {
	t.Run("empty directory", func(t *testing.T) {
		if !holdsNoFiles(t.TempDir()) {
			t.Error("expected an empty directory to report no files")
		}
	})

	t.Run("only empty subdirectories", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.MkdirAll(filepath.Join(dir, "Season 1", "nested"), 0755); err != nil {
			t.Fatal(err)
		}
		if !holdsNoFiles(dir) {
			t.Error("expected nested empty directories to report no files")
		}
	})

	// The reason this helper exists rather than reusing onlyHoldsMetadata: a
	// directory whose only content is a sidecar belongs to a torrent that has not
	// written its files yet. Sweeping it destroys the only record of the anime.
	t.Run("metadata sidecar counts as content", func(t *testing.T) {
		dir := t.TempDir()
		writeSidecar(t, dir, 0)
		if holdsNoFiles(dir) {
			t.Error("expected a directory holding a sidecar to be preserved")
		}
	})

	t.Run("video file", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		if holdsNoFiles(dir) {
			t.Error("expected a directory holding a video to be preserved")
		}
	})
}

func TestMetadataWrittenWithin(t *testing.T) {
	t.Run("freshly added torrent is protected", func(t *testing.T) {
		dir := t.TempDir()
		writeSidecar(t, dir, 0)
		if !metadataWrittenWithin(dir, metadataSweepGracePeriod) {
			t.Error("expected a new sidecar to be within the grace period")
		}
	})

	t.Run("old leftover is sweepable", func(t *testing.T) {
		dir := t.TempDir()
		writeSidecar(t, dir, metadataSweepGracePeriod+time.Hour)
		if metadataWrittenWithin(dir, metadataSweepGracePeriod) {
			t.Error("expected an aged sidecar to fall outside the grace period")
		}
	})

	t.Run("no sidecar", func(t *testing.T) {
		if metadataWrittenWithin(t.TempDir(), metadataSweepGracePeriod) {
			t.Error("expected a directory with no sidecar to report false")
		}
	})
}
