package onlinestream_download

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"syscall"
)

// minFreeBytes is the space a download needs before it starts: the segments of one episode (a
// Japanese stream and a dub can pass 2 GB together) plus room for everything else on the disk.
// Filling the disk that also holds the database is what turns a full disk into a broken server.
const minFreeBytes = 5 << 30

// isStorageError reports a failure of the disk rather than of the download: the filesystem is
// read-only or full. Retrying the episode cannot fix it and failing it wastes it; the queue
// waits instead.
func isStorageError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, syscall.EROFS) || errors.Is(err, syscall.ENOSPC) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "read-only file system") ||
		strings.Contains(msg, "no space left on device") ||
		strings.Contains(msg, "disk quota exceeded") ||
		strings.Contains(msg, "not enough space on the disk")
}

// checkStorage returns why downloads cannot run right now, or "" when they can: the work folder
// must be writable and have room on its disk.
func (m *Manager) checkStorage() string {
	dir := m.opts.WorkDir
	if dir == "" {
		return ""
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return storageMessage(dir, err)
	}
	probe, err := os.CreateTemp(dir, ".write-check-*")
	if err != nil {
		return storageMessage(dir, err)
	}
	name := probe.Name()
	_ = probe.Close()
	_ = os.Remove(name)

	if free, err := freeBytes(dir); err == nil && free < minFreeBytes {
		return fmt.Sprintf("Only %.1f GB is free on the disk that holds %s. Downloads wait until at least %d GB is free.",
			float64(free)/(1<<30), dir, minFreeBytes>>30)
	}
	return ""
}

func storageMessage(dir string, err error) string {
	if isStorageError(err) {
		if strings.Contains(strings.ToLower(err.Error()), "read-only") {
			return fmt.Sprintf("The disk that holds %s has become read-only, so nothing can be saved there. Downloads wait until it is writable again (check the server's disk; a restart or remount usually clears it).", dir)
		}
		return fmt.Sprintf("The disk that holds %s is full. Downloads wait until there is space again.", dir)
	}
	return fmt.Sprintf("Downloads cannot write to %s: %v", dir, err)
}
