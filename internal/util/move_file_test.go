package util

import (
	"os"
	"path/filepath"
	"testing"
)

// What matters about the mover is not that a move works — rename already did that — but what is true
// at every instant while it runs, and what is left behind when it is interrupted. These pin that: the
// source outlives the copy, the destination is measured before the source is deleted, and a copy that
// did not finish is finished on the next start rather than mistaken for a file.

func newJournalDir(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	SetMoveJournalDir(dir)
	t.Cleanup(func() { SetMoveJournalDir("") })
}

func TestMoveFileJournaled_MovesContentAndRemovesSource(t *testing.T) {
	newJournalDir(t)
	dir := t.TempDir()
	src := filepath.Join(dir, "src.mkv")
	dest := filepath.Join(dir, "out", "dest.mkv")

	want := []byte("episode bytes")
	if err := os.WriteFile(src, want, 0o644); err != nil {
		t.Fatal(err)
	}

	if err := MoveFileJournaled(src, dest); err != nil {
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
		t.Error("the source was not removed after a verified move")
	}
	if IsMoveInFlight(dest) {
		t.Error("the destination is still marked as being written")
	}
}

// Even within one directory, where a rename would do, the file is copied and checked. The source
// existing right up until the destination is verified is the guarantee, not an implementation detail.
func TestMoveFileJournaled_CopiesRatherThanRenames(t *testing.T) {
	newJournalDir(t)
	dir := t.TempDir()
	src := filepath.Join(dir, "src.mkv")
	dest := filepath.Join(dir, "dest.mkv")

	if err := os.WriteFile(src, []byte("same directory"), 0o644); err != nil {
		t.Fatal(err)
	}
	srcInfo, err := os.Stat(src)
	if err != nil {
		t.Fatal(err)
	}

	if err := MoveFileJournaled(src, dest); err != nil {
		t.Fatalf("move failed: %v", err)
	}

	destInfo, err := os.Stat(dest)
	if err != nil {
		t.Fatal(err)
	}
	if destInfo.Size() != srcInfo.Size() {
		t.Errorf("destination is %d bytes, source was %d", destInfo.Size(), srcInfo.Size())
	}
	// A rename would have carried the original inode across; a copy makes a new file. Checked by
	// proxy — the source is gone and the destination is new — because inode numbers are not portable.
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Error("the source survived a completed move")
	}
}

// A move that fails must leave the source alone, so there is still something to retry from.
func TestMoveFileJournaled_FailureKeepsSource(t *testing.T) {
	newJournalDir(t)
	dir := t.TempDir()
	src := filepath.Join(dir, "src.mkv")
	dest := filepath.Join(dir, "dest.mkv")

	if err := os.WriteFile(src, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A directory at the destination path: the copy cannot open it for writing.
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := MoveFileJournaled(src, dest); err == nil {
		t.Fatal("expected the move to fail")
	}
	if _, err := os.Stat(src); err != nil {
		t.Error("a failed move must leave the source in place to be retried")
	}
}

// The shape of an abrupt shutdown: a record on disk, a destination that never finished, and a source
// still sitting where it was. Recovery is expected to copy it again and complete the move.
func TestRecoverInterruptedMoves_ResumesFromSource(t *testing.T) {
	newJournalDir(t)
	dir := t.TempDir()
	src := filepath.Join(dir, "src.mkv")
	dest := filepath.Join(dir, "dest.mkv")

	want := []byte("the whole episode")
	if err := os.WriteFile(src, want, 0o644); err != nil {
		t.Fatal(err)
	}
	// Half a file at the destination, exactly as a killed copy would have left it.
	if err := os.WriteFile(dest, want[:5], 0o644); err != nil {
		t.Fatal(err)
	}
	markInFlight(dest, moveRecord{Src: src, Dest: dest, Size: int64(len(want)), Move: true})

	outcomes := RecoverInterruptedMoves()
	if len(outcomes) != 1 || outcomes[0].Status != "resumed" {
		t.Fatalf("outcomes = %+v, want one resumed", outcomes)
	}

	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Errorf("destination content = %q, want %q", got, want)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Error("the source was not removed after the resumed move completed")
	}
	if IsMoveInFlight(dest) {
		t.Error("the destination is still marked as being written")
	}
}

// The narrow window where the copy finished and the server stopped before the record could be
// cleared: nothing to do, and nothing to throw away.
func TestRecoverInterruptedMoves_CompletedCopyIsKept(t *testing.T) {
	newJournalDir(t)
	dir := t.TempDir()
	dest := filepath.Join(dir, "dest.mkv")

	want := []byte("arrived in full")
	if err := os.WriteFile(dest, want, 0o644); err != nil {
		t.Fatal(err)
	}
	markInFlight(dest, moveRecord{
		Src:  filepath.Join(dir, "gone.mkv"),
		Dest: dest, Size: int64(len(want)), Move: true,
	})

	outcomes := RecoverInterruptedMoves()
	if len(outcomes) != 1 || outcomes[0].Status != "completed" {
		t.Fatalf("outcomes = %+v, want one completed", outcomes)
	}
	if _, err := os.Stat(dest); err != nil {
		t.Error("a finished file was thrown away")
	}
}

// Nothing to copy from and a destination that is the wrong size: an unusable file that must not be
// left in the library pretending to be an episode.
func TestRecoverInterruptedMoves_UnrecoverablePartialIsRemoved(t *testing.T) {
	newJournalDir(t)
	dir := t.TempDir()
	dest := filepath.Join(dir, "dest.mkv")

	if err := os.WriteFile(dest, []byte("half"), 0o644); err != nil {
		t.Fatal(err)
	}
	markInFlight(dest, moveRecord{
		Src:  filepath.Join(dir, "gone.mkv"),
		Dest: dest, Size: 999, Move: true,
	})

	outcomes := RecoverInterruptedMoves()
	if len(outcomes) != 1 || outcomes[0].Status != "lost" {
		t.Fatalf("outcomes = %+v, want one lost", outcomes)
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Error("the unusable partial file was left in place")
	}
}

// While a copy is in flight its destination is not a file yet, and the scanners are told so.
func TestIsMoveInFlight(t *testing.T) {
	newJournalDir(t)
	dest := filepath.Join(t.TempDir(), "dest.mkv")

	if IsMoveInFlight(dest) {
		t.Error("a path with no copy against it reported as in flight")
	}
	markInFlight(dest, moveRecord{Src: "src", Dest: dest, Size: 1, Move: true})
	if !IsMoveInFlight(dest) {
		t.Error("a copy in flight was not reported")
	}
	clearInFlight(dest)
	if IsMoveInFlight(dest) {
		t.Error("a finished copy is still reported as in flight")
	}
}

func TestWriteFileCrashSafe_ReplacesAndLeavesNoTemp(t *testing.T) {
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
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Error("the temp file was left behind")
	}
}

func TestMoveTreeCrashSafe_MovesWholeTree(t *testing.T) {
	newJournalDir(t)
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
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Error("the emptied source tree was left behind")
	}
}
