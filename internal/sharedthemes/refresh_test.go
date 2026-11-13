package sharedthemes

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func setup(t *testing.T, market, installed string) (mDir, sDir string) {
	t.Helper()
	root := t.TempDir()
	mDir = filepath.Join(root, "market")
	sDir = filepath.Join(root, "shared")
	write(t, filepath.Join(mDir, "themes", "bleach", "theme.json"), market)
	write(t, filepath.Join(sDir, "bleach", "theme.json"), installed)
	return
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func setMtime(t *testing.T, path string, at time.Time) {
	t.Helper()
	if err := os.Chtimes(path, at, at); err != nil {
		t.Fatal(err)
	}
}

func read(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestRefreshCopiesNewerMarketplaceTheme(t *testing.T) {
	m, s := setup(t, `{"v":2}`, `{"v":1}`)
	write(t, filepath.Join(m, "themes", "bleach", "bg.png"), "img")
	old := time.Now().Add(-time.Hour)
	setMtime(t, filepath.Join(s, "bleach", "theme.json"), old)

	copied, err := Refresh(m, s, "bleach")
	if err != nil || !copied {
		t.Fatalf("copied=%v err=%v, want a copy", copied, err)
	}
	if got := read(t, filepath.Join(s, "bleach", "theme.json")); got != `{"v":2}` {
		t.Fatalf("installed theme.json = %s", got)
	}
	if got := read(t, filepath.Join(s, "bleach", "bg.png")); got != "img" {
		t.Fatalf("supporting file not copied: %q", got)
	}

	// Second call is a no-op: the installed copy is now the newer one.
	copied, err = Refresh(m, s, "bleach")
	if err != nil || copied {
		t.Fatalf("second refresh copied=%v err=%v, want no-op", copied, err)
	}
}

func TestRefreshLeavesNewerInstalledCopy(t *testing.T) {
	m, s := setup(t, `{"v":2}`, `{"v":1}`)
	setMtime(t, filepath.Join(m, "themes", "bleach", "theme.json"), time.Now().Add(-time.Hour))

	copied, err := Refresh(m, s, "bleach")
	if err != nil || copied {
		t.Fatalf("copied=%v err=%v, want no copy", copied, err)
	}
	if got := read(t, filepath.Join(s, "bleach", "theme.json")); got != `{"v":1}` {
		t.Fatalf("installed theme.json changed to %s", got)
	}
}

func TestRefreshIgnoresUnknownAndUnsafeIDs(t *testing.T) {
	m, s := setup(t, `{}`, `{}`)
	for _, id := range []string{"not-in-marketplace", "../bleach", "a/b", ""} {
		if copied, err := Refresh(m, s, id); err != nil || copied {
			t.Fatalf("id %q: copied=%v err=%v", id, copied, err)
		}
	}
	if copied, err := Refresh("", s, "bleach"); err != nil || copied {
		t.Fatalf("no marketplace: copied=%v err=%v", copied, err)
	}
}

func TestRefreshSameContentOnlyTouches(t *testing.T) {
	m, s := setup(t, `{"v":1}`, `{"v":1}`)
	dst := filepath.Join(s, "bleach", "theme.json")
	setMtime(t, dst, time.Now().Add(-time.Hour))

	copied, err := Refresh(m, s, "bleach")
	if err != nil || copied {
		t.Fatalf("copied=%v err=%v, want no copy", copied, err)
	}
	info, _ := os.Stat(dst)
	src, _ := os.Stat(filepath.Join(m, "themes", "bleach", "theme.json"))
	if info.ModTime().Before(src.ModTime()) {
		t.Fatal("installed copy not touched; every request would re-read both files")
	}
}
