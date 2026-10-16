package enmasse

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveProgressFilePathUsesAppDataWhenLegacyFileIsMissing(t *testing.T) {
	appDataDir := t.TempDir()
	legacyPath := filepath.Join(t.TempDir(), "legacy", "progress.json")

	got := resolveProgressFilePath(appDataDir, legacyPath)
	want := filepath.Join(appDataDir, "progress.json")
	if got != want {
		t.Fatalf("resolveProgressFilePath() = %q, want %q", got, want)
	}
}

func TestResolveProgressFilePathPreservesExistingLegacyFile(t *testing.T) {
	legacyPath := filepath.Join(t.TempDir(), "progress.json")
	if err := os.WriteFile(legacyPath, []byte("{}"), 0600); err != nil {
		t.Fatalf("create legacy progress file: %v", err)
	}

	got := resolveProgressFilePath(t.TempDir(), legacyPath)
	if got != legacyPath {
		t.Fatalf("resolveProgressFilePath() = %q, want existing legacy path %q", got, legacyPath)
	}
}

func TestMangaDownloaderWritesResumeMarkerToAppDataDir(t *testing.T) {
	appDataDir := t.TempDir()
	downloader := NewMangaDownloader(&NewMangaDownloaderOptions{AppDataDir: appDataDir})

	if err := downloader.writeResumeOnStartupMarker(true); err != nil {
		t.Fatalf("write resume marker: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(appDataDir, filepath.Base(MangaProgressFilePath)))
	if err != nil {
		t.Fatalf("read resume marker: %v", err)
	}

	var progress MangaDownloaderProgress
	if err := json.Unmarshal(data, &progress); err != nil {
		t.Fatalf("decode resume marker: %v", err)
	}
	if !progress.ResumeOnStartup {
		t.Fatal("resume marker was not persisted")
	}
}
