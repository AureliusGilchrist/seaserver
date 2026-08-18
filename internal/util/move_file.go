package util

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// Moving a file into the library used to mean renaming it where possible and copying it where not,
// and in both cases the file's fate rested on a single copy of it. A copy takes as long as the file
// is big — minutes, for an episode — and it was written straight at the final path under the final
// name, so a server stopped halfway through left a fraction of an episode that nothing downstream
// could tell from a whole one. It was scanned, matched, and only found to be broken when someone
// tried to play it.
//
// Two things fix that, and both are deliberate.
//
// A move is always a copy. Even when source and destination share a filesystem and a rename would be
// instant, the file is copied, the copy is measured against the original, and only then is the
// original deleted. Until that check succeeds there are two copies of every file and at least one of
// them is known to be good, which is the property renaming cannot offer.
//
// And a copy in flight says so. A small record is written before the first byte and removed after the
// last, naming the source, the destination, and the size the destination has to reach. While that
// record exists the destination is understood to be unfinished: the scanners skip it, and on the next
// start the copy is done again from the source, which is still there precisely because the source
// outlives the copy. An abrupt shutdown therefore costs the time to copy one file again, and nothing
// else.

// moveRecord is one copy in flight.
type moveRecord struct {
	Src       string    `json:"src"`
	Dest      string    `json:"dest"`
	Size      int64     `json:"size"`
	StartedAt time.Time `json:"startedAt"`
	// Move distinguishes a move (delete the source once the destination is verified) from a copy.
	Move bool `json:"move"`
}

var (
	moveJournalMu  sync.RWMutex
	moveJournalDir string
	// inFlight mirrors the journal for the current process, so the scanners can ask about a path
	// without touching the disk on every file they walk.
	inFlight = make(map[string]struct{})
)

// SetMoveJournalDir tells this package where to keep its in-flight records. Called once at startup;
// until it is, journaled moves still work — they just cannot be recovered after a crash, which is
// the correct behaviour for a process that has nowhere durable to write.
func SetMoveJournalDir(dir string) {
	moveJournalMu.Lock()
	moveJournalDir = dir
	moveJournalMu.Unlock()
	if dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}
}

func journalDir() string {
	moveJournalMu.RLock()
	defer moveJournalMu.RUnlock()
	return moveJournalDir
}

// journalPathFor names a record after its destination, so one destination has exactly one record no
// matter how many times it is attempted, and so recovery needs no index.
func journalPathFor(dest string) string {
	dir := journalDir()
	if dir == "" {
		return ""
	}
	sum := sha1.Sum([]byte(filepath.Clean(dest)))
	return filepath.Join(dir, hex.EncodeToString(sum[:])+".json")
}

func markInFlight(dest string, rec moveRecord) {
	moveJournalMu.Lock()
	inFlight[filepath.Clean(dest)] = struct{}{}
	moveJournalMu.Unlock()

	path := journalPathFor(dest)
	if path == "" {
		return
	}
	data, err := json.Marshal(rec)
	if err != nil {
		return
	}
	// The record has to survive the same power loss it describes, so it is written whole and
	// flushed before the copy it guards begins.
	_ = WriteFileCrashSafe(path, data, 0o644)
}

func clearInFlight(dest string) {
	moveJournalMu.Lock()
	delete(inFlight, filepath.Clean(dest))
	moveJournalMu.Unlock()

	if path := journalPathFor(dest); path != "" {
		_ = os.Remove(path)
	}
}

// IsMoveInFlight reports whether path is the destination of a copy that has not finished. The
// scanners consult it so a file that is still being written is not picked up, matched, or handed to
// a player as though it were complete.
func IsMoveInFlight(path string) bool {
	moveJournalMu.RLock()
	_, ok := inFlight[filepath.Clean(path)]
	moveJournalMu.RUnlock()
	return ok
}

// MoveFileJournaled moves src to dest by copying it, checking that the copy is the size the original
// was, and only then deleting the source.
//
// Deliberately a copy even when a rename would do. A rename is instantaneous and atomic and would be
// the cheaper move by far, but it also means the file exists in exactly one place at every instant:
// if anything is wrong with it afterwards there is nothing left to compare against and nothing left
// to redo it from. Copying keeps the original until the copy has been measured, so the source is only
// given up once its replacement is known to be complete.
//
// The cost is real — a same-filesystem match now copies every episode instead of renaming it — and
// it buys the property that a match can never leave you with one damaged copy of a file and no way
// back.
func MoveFileJournaled(src, dest string) error {
	return transfer(src, dest, true)
}

// CopyFileJournaled is MoveFileJournaled without removing the source.
func CopyFileJournaled(src, dest string) error {
	return transfer(src, dest, false)
}

func transfer(src, dest string, isMove bool) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}

	rec := moveRecord{Src: src, Dest: dest, Size: srcInfo.Size(), StartedAt: time.Now(), Move: isMove}
	markInFlight(dest, rec)

	if err := copyContents(src, dest, srcInfo.Size()); err != nil {
		// The record is deliberately left in place: the destination is unfinished or unverified, the
		// source is untouched, and the next start is expected to redo this. Callers that treat the
		// error as final are still safe, because recovery checks the source before doing anything.
		return err
	}

	if isMove {
		// Only now is the source expendable. Losing this delete costs a duplicate; doing it earlier
		// could cost the file.
		if err := os.Remove(src); err != nil {
			clearInFlight(dest)
			return err
		}
	}

	clearInFlight(dest)
	return nil
}

// copyContents writes the source bytes to dest, replacing whatever is there, and does not return
// until they are on the device and the destination is the size it should be.
//
// The size is taken from the destination as the filesystem reports it, not from the number of bytes
// handed to the write calls: the question being answered is what is on the disk, and a count held in
// memory cannot answer it. A truncated write, a disk that filled up, a network share that dropped
// halfway — each leaves a destination shorter than the original, and each is caught here, before the
// original is deleted.
func copyContents(src, dest string, wantSize int64) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	destFile, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}

	written, copyErr := io.Copy(destFile, srcFile)
	if copyErr == nil {
		// Force the bytes out of the OS page cache and onto the device before anything is measured or
		// deleted. Without this a power loss just after the copy "finished" leaves a file of the right
		// length full of zeroes.
		copyErr = destFile.Sync()
	}
	if closeErr := destFile.Close(); copyErr == nil {
		copyErr = closeErr
	}
	if copyErr != nil {
		return copyErr
	}

	if written != wantSize {
		return fmt.Errorf("short copy: wrote %d of %d bytes to %s", written, wantSize, dest)
	}
	info, err := os.Stat(dest)
	if err != nil {
		return fmt.Errorf("could not verify %s: %w", dest, err)
	}
	if info.Size() != wantSize {
		return fmt.Errorf("the copy of %s is %d bytes, the original is %d", src, info.Size(), wantSize)
	}

	syncDir(filepath.Dir(dest))
	return nil
}

// MoveOutcome is what recovery did with one interrupted transfer.
type MoveOutcome struct {
	Src  string
	Dest string
	// Status is one of "resumed" (copied again and finished), "completed" (it had in fact finished),
	// "lost" (the source is gone and the destination is unusable), or "failed" (it will be tried
	// again on the next start).
	Status string
	Err    error
}

// RecoverInterruptedMoves finishes the copies that were in flight when the server last stopped.
//
// Run this at startup before anything scans the library, so a destination left unfinished is either
// made whole or removed before it can be mistaken for an episode.
//
// Three cases, and each has one right answer:
//   - the source is still there — copy it again over the unfinished destination, then delete it. A
//     recopy costs time; trusting a partial file costs the episode.
//   - the source is gone and the destination is the right size — it did finish, and the server
//     stopped between the last byte and clearing the record. Nothing to do.
//   - the source is gone and the destination is not the right size — nothing can rebuild it. The
//     unusable file is deleted rather than left in the library pretending to be an episode.
func RecoverInterruptedMoves() []MoveOutcome {
	dir := journalDir()
	if dir == "" {
		return nil
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	outcomes := make([]MoveOutcome, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		path := filepath.Join(dir, entry.Name())

		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var rec moveRecord
		if err := json.Unmarshal(data, &rec); err != nil || rec.Dest == "" {
			_ = os.Remove(path)
			continue
		}

		outcomes = append(outcomes, recoverOne(rec, path))
	}
	return outcomes
}

func recoverOne(rec moveRecord, journal string) MoveOutcome {
	out := MoveOutcome{Src: rec.Src, Dest: rec.Dest}

	if info, err := os.Stat(rec.Src); err == nil && !info.IsDir() {
		// Redo it from the source, which is the only thing known to be whole. The copy verifies
		// itself the same way it would have the first time, so a resumed move is no less checked
		// than an uninterrupted one.
		markInFlight(rec.Dest, rec)
		if err := copyContents(rec.Src, rec.Dest, info.Size()); err != nil {
			out.Status, out.Err = "failed", err
			return out // the record is kept, so the next start tries again
		}
		if rec.Move {
			_ = os.Remove(rec.Src)
		}
		clearInFlight(rec.Dest)
		out.Status = "resumed"
		return out
	}

	// No source left. The destination is trusted only if it is the size the record says the finished
	// file has to be — which is the case where the server stopped between the last byte and clearing
	// the record. Anything else is an interrupted copy that nothing can now complete.
	if info, err := os.Stat(rec.Dest); err == nil && info.Size() == rec.Size {
		clearInFlight(rec.Dest)
		out.Status = "completed"
		return out
	}

	// Neither a source to copy from nor a destination worth keeping.
	_ = os.Remove(rec.Dest)
	clearInFlight(rec.Dest)
	_ = os.Remove(journal)
	out.Status = "lost"
	return out
}

// MoveTreeCrashSafe moves a file or a whole directory tree to dest, one verified file at a time.
//
// Every file goes through MoveFileJournaled, so the tree is copied and checked rather than renamed,
// and an interruption anywhere in it leaves both sides intact for recovery to finish.
func MoveTreeCrashSafe(src, dest string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return MoveFileJournaled(src, dest)
	}

	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if err := MoveTreeCrashSafe(filepath.Join(src, entry.Name()), filepath.Join(dest, entry.Name())); err != nil {
			return err
		}
	}

	// Only the emptied directories go, and only if they are empty: anything the moves could not take
	// is left where it is rather than deleted along with the directory holding it.
	_ = os.Remove(src)
	return nil
}

// WriteFileCrashSafe writes data to path through a sibling temp file and renames it into place, so a
// process that stops mid-write leaves the previous contents rather than a truncated file.
//
// This is for the small state files — queues, progress, registries, the move records above — that
// the server rewrites while it runs and reads back when it starts. Media files are not written this
// way: they go straight to their destination path, under their own name, and are covered by the
// journal instead.
func WriteFileCrashSafe(path string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	// Beside the target on purpose: rename is only atomic within a filesystem, and the OS temp
	// directory is regularly on a different one.
	tmp := path + ".tmp"

	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	_, writeErr := f.Write(data)
	if writeErr == nil {
		writeErr = f.Sync()
	}
	if closeErr := f.Close(); writeErr == nil {
		writeErr = closeErr
	}
	if writeErr != nil {
		_ = os.Remove(tmp)
		return writeErr
	}

	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	syncDir(filepath.Dir(path))
	return nil
}

// syncDir flushes a directory entry so a rename survives a power loss, not just a process kill.
// Windows has no equivalent and cannot open a directory as a file, so it is skipped there; NTFS
// journals the rename itself, which covers the same ground.
func syncDir(dir string) {
	if runtime.GOOS == "windows" {
		return
	}
	d, err := os.Open(dir)
	if err != nil {
		return
	}
	_ = d.Sync()
	_ = d.Close()
}
