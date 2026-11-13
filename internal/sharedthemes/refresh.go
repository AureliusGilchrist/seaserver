// Package sharedthemes keeps installed (downloaded) themes in step with the marketplace.
//
// Installing a theme copies its folder from the marketplace (the seanime-themes repo) into
// <datadir>/themes/<id>, and the app reads that copy first. Without a refresh, a theme installed
// once never saw later marketplace changes — new sidebar names, icons, player icon sets.
package sharedthemes

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// One refresh per theme at a time; concurrent requests for the same theme wait for it.
var locks sync.Map // id → *sync.Mutex

func lockFor(id string) *sync.Mutex {
	m, _ := locks.LoadOrStore(id, &sync.Mutex{})
	return m.(*sync.Mutex)
}

// ValidID reports whether id is a plain folder name (no separators or traversal).
func ValidID(id string) bool {
	return id != "" && id != "." && id != ".." && !strings.ContainsAny(id, `/\:*?"<>|`) && !strings.Contains(id, "..")
}

// Refresh re-copies an installed theme from the marketplace when the marketplace's theme.json is
// newer than the installed one and its content differs. It returns whether files were copied.
//
// Nothing happens when the marketplace isn't configured, the theme isn't installed, or the
// marketplace has no theme with that id (so themes from elsewhere are never touched).
//
// The check costs two stats; files are only read when the marketplace copy is newer. Copying
// stamps the installed file with the current time, so the next check is a no-op until the
// marketplace changes again.
func Refresh(marketplaceDir, sharedDir, id string) (bool, error) {
	if marketplaceDir == "" || !ValidID(id) {
		return false, nil
	}
	srcDir := filepath.Join(marketplaceDir, "themes", id)
	dstDir := filepath.Join(sharedDir, id)
	srcJSON := filepath.Join(srcDir, "theme.json")
	dstJSON := filepath.Join(dstDir, "theme.json")

	srcInfo, err := os.Stat(srcJSON)
	if err != nil {
		return false, nil // not a marketplace theme
	}
	dstInfo, err := os.Stat(dstJSON)
	if err != nil {
		return false, nil // not installed
	}
	if !srcInfo.ModTime().After(dstInfo.ModTime()) {
		return false, nil
	}

	mu := lockFor(id)
	mu.Lock()
	defer mu.Unlock()

	// Re-check under the lock: another request may have just refreshed it.
	if dstInfo, err = os.Stat(dstJSON); err != nil || !srcInfo.ModTime().After(dstInfo.ModTime()) {
		return false, nil
	}

	same, err := sameContent(srcJSON, dstJSON)
	if err != nil {
		return false, err
	}
	if same {
		// Touch so the next check is cheap again.
		now := dstInfo.ModTime()
		if srcInfo.ModTime().After(now) {
			now = srcInfo.ModTime()
		}
		_ = os.Chtimes(dstJSON, now, now)
		return false, nil
	}

	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return false, err
	}
	// theme.json last, so a reader never sees new metadata pointing at files not yet copied.
	for _, e := range entries {
		if e.IsDir() || e.Name() == "theme.json" {
			continue
		}
		if err := copyAtomic(filepath.Join(srcDir, e.Name()), filepath.Join(dstDir, e.Name())); err != nil {
			return false, err
		}
	}
	if err := copyAtomic(srcJSON, dstJSON); err != nil {
		return false, err
	}
	return true, nil
}

func sameContent(a, b string) (bool, error) {
	ab, err := os.ReadFile(a)
	if err != nil {
		return false, err
	}
	bb, err := os.ReadFile(b)
	if err != nil {
		return false, err
	}
	return bytes.Equal(ab, bb), nil
}

// copyAtomic writes to a temp file beside dst and renames it into place, so a request served
// mid-copy gets either the old file or the new one, never half of one.
func copyAtomic(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	tmp, err := os.CreateTemp(filepath.Dir(dst), "."+filepath.Base(dst)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := io.Copy(tmp, in); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, dst); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}
