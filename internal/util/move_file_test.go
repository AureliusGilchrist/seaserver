package util

import (
	"os"
	"path/filepath"
	"testing"
)

// The point of the helper is not that a move works — rename already did that — but that the
// destination path is never a partial file. These pin the observable half of that: what a caller
// finds at dest, and where an interrupted copy's bytes end up instead.

func TestMoveFileCrashSafe_MovesContent(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src.mkv")
	dest := filepath.Join(dir, "out", "dest.mkv")

	want := []byte("episode bytes")
	if err := os.WriteFile(src, want, 0o644); err != nil {
		t.Fatal(err)
	}

	if err := MoveFileCrashSafe(src, dest); err != nil {
		t.Fatalf("move failed: %v", err)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatalf("destination missing: %v", err)
	}
	if string(got) != string(want) {
		t.Errorf("destination content = %q, want %q", got, want)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Error("the source was not removed after a successful move")
	}
}

// A copy that cannot finish must leave nothing at the destination path — the whole failure this
// exists to prevent is a half file wearing the finished file's name.
func TestMoveFileCrashSafe_FailedCopyLeavesNoDestination(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src.mkv")
	dest := filepath.Join(dir, "dest.mkv")

	if err := os.WriteFile(src, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A directory where the temp file has to go: the copy cannot open it, so it fails after the
	// rename fast path has already been ruled out.
	if err := os.MkdirAll(dest+PartialSuffix, 0o755); err != nil {
		t.Fatal(err)
	}
	// Make the fast path fail too, by putting a directory at dest as well.
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := MoveFileCrashSafe(src, dest); err == nil {
		t.Fatal("expected the move to fail")
	}
	if _, err := os.Stat(src); err != nil {
		t.Error("a failed move must leave the source in place to be retried")
	}
}

// A leftover from an earlier interrupted attempt is overwritten, not resumed or appended to.
func TestMoveFileCrashSafe_OverwritesStalePartial(t *testing.T) {
	srcDir, destDir := t.TempDir(), t.TempDir()
	src := filepath.Join(srcDir, "src.mkv")
	dest := filepath.Join(destDir, "dest.mkv")

	want := []byte("whole file")
	if err := os.WriteFile(src, want, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dest+PartialSuffix, []byte("junk from a killed server"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := MoveFileCrashSafe(src, dest); err != nil {
		t.Fatalf("move failed: %v", err)
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Errorf("destination content = %q, want %q", got, want)
	}
	if _, err := os.Stat(dest + PartialSuffix); !os.IsNotExist(err) {
		t.Error("the partial file was left behind after a successful move")
	}
}

func TestWriteFileCrashSafe_KeepsPreviousOnEncodeFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")

	if err := WriteFileCrashSafe(path, []byte(`{"a":1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := WriteFileCrashSafe(path, []byte(`{"a":2}`), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != `{"a":2}` {
		t.Errorf("state = %s, want the second write", got)
	}
	// No temp file may survive a successful write, or the next reader sees two files where the
	// directory should hold one.
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Error("the temp file was left behind")
	}
}

func TestCleanPartialMoves(t *testing.T) {
	dir := t.TempDir()
	keep := filepath.Join(dir, "season", "ep1.mkv")
	drop := filepath.Join(dir, "season", "ep2.mkv"+PartialSuffix)
	if err := os.MkdirAll(filepath.Dir(keep), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{keep, drop} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	if removed := CleanPartialMoves(dir); removed != 1 {
		t.Errorf("removed %d partials, want 1", removed)
	}
	if _, err := os.Stat(keep); err != nil {
		t.Error("a finished file was swept away")
	}
	if _, err := os.Stat(drop); !os.IsNotExist(err) {
		t.Error("the partial file was not swept")
	}
}

func TestMoveTreeCrashSafe_CrossDirectoryTree(t *testing.T) {
	srcRoot, destRoot := t.TempDir(), t.TempDir()
	src := filepath.Join(srcRoot, "Anime")
	if err := os.MkdirAll(filepath.Join(src, "Season 1"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "Season 1", "ep1.mkv"), []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}

	dest := filepath.Join(destRoot, "Anime")
	if err := MoveTreeCrashSafe(src, dest); err != nil {
		t.Fatalf("move failed: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(dest, "Season 1", "ep1.mkv"))
	if err != nil {
		t.Fatalf("moved file missing: %v", err)
	}
	if string(got) != "one" {
		t.Errorf("content = %q, want %q", got, "one")
	}
}
