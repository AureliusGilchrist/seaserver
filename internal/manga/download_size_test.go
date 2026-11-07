package manga

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func waitForDownloadSize(t *testing.T, d *Downloader) (uint64, error) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		size, ready, err := d.DownloadDirectorySize()
		if ready {
			return size, err
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("download size scan did not finish")
	return 0, nil
}

func TestDownloadDirectorySize(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "page"), []byte("12345"), 0600); err != nil {
		t.Fatal(err)
	}
	d := &Downloader{downloadDir: dir}
	size, err := waitForDownloadSize(t, d)
	if err != nil || size != 5 {
		t.Fatalf("got size %d, error %v; want 5", size, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "second-page"), []byte("123"), 0600); err != nil {
		t.Fatal(err)
	}
	size, err = waitForDownloadSize(t, d)
	if err != nil || size != 5 {
		t.Fatalf("cached size = %d, error %v; want 5", size, err)
	}
	d.sizeMu.Lock()
	d.sizeCheckedAt = time.Now().Add(-6 * time.Minute)
	d.sizeMu.Unlock()
	size, err = waitForDownloadSize(t, d)
	if err != nil || size != 8 {
		t.Fatalf("refreshed size = %d, error %v; want 8", size, err)
	}
}

func TestDownloadDirectorySizeReportsErrors(t *testing.T) {
	d := &Downloader{downloadDir: filepath.Join(t.TempDir(), "missing")}
	_, err := waitForDownloadSize(t, d)
	if err == nil {
		t.Fatal("expected an error for an unreadable download directory")
	}
}
