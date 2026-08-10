package db_bridge

import (
	"sync"
	"testing"

	"github.com/rs/zerolog"

	"seanime/internal/database/db"
	"seanime/internal/library/anime"
)

func testDatabase(t *testing.T, name string) *db.Database {
	t.Helper()
	logger := zerolog.Nop()
	database, err := db.NewDatabase(t.TempDir(), name, &logger)
	if err != nil {
		t.Fatalf("open %s: %v", name, err)
	}
	// Registered after TempDir's own cleanup and so run before it: Windows will not remove a file
	// that still has an open handle, and an unclosed sqlite connection fails the test on tidy-up
	// alone.
	t.Cleanup(func() {
		if sqlDB, err := database.Gorm().DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return database
}

func files(paths ...string) []*anime.LocalFile {
	out := make([]*anime.LocalFile, 0, len(paths))
	for _, path := range paths {
		out = append(out, &anime.LocalFile{Path: path})
	}
	return out
}

// Each profile has its own database and its own library. The cache in front of it has to be keyed
// the same way, or whichever profile asks second is handed the files belonging to whichever asked
// first — and a save made against that borrowed list writes one profile's library into the other's.
func TestLocalFilesCacheIsPerDatabase(t *testing.T) {
	ClearLocalFilesCache()
	t.Cleanup(ClearLocalFilesCache)

	first := testDatabase(t, "first")
	second := testDatabase(t, "second")

	if _, err := InsertLocalFiles(first, files("/one/a.mkv", "/one/b.mkv")); err != nil {
		t.Fatalf("insert into first: %v", err)
	}
	if _, err := InsertLocalFiles(second, files("/two/a.mkv")); err != nil {
		t.Fatalf("insert into second: %v", err)
	}

	firstFiles, _, err := GetLocalFiles(first)
	if err != nil {
		t.Fatalf("read first: %v", err)
	}
	secondFiles, _, err := GetLocalFiles(second)
	if err != nil {
		t.Fatalf("read second: %v", err)
	}

	if len(firstFiles) != 2 {
		t.Errorf("first database returned %d files, want its own 2", len(firstFiles))
	}
	if len(secondFiles) != 1 {
		t.Errorf("second database returned %d files, want its own 1 — it was handed the other library",
			len(secondFiles))
	}
	if len(secondFiles) > 0 && secondFiles[0].Path != "/two/a.mkv" {
		t.Errorf("second database returned %q, which belongs to the first", secondFiles[0].Path)
	}
}

// The library is read by handlers, the scanner, playback and the auto-downloader, all on different
// goroutines. This is the test that fails under -race if the cache goes back to being an
// unsynchronised package variable.
func TestLocalFilesCacheConcurrentAccess(t *testing.T) {
	ClearLocalFilesCache()
	t.Cleanup(ClearLocalFilesCache)

	database := testDatabase(t, "concurrent")
	saved, err := InsertLocalFiles(database, files("/lib/a.mkv"))
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	_ = saved

	_, id, err := GetLocalFiles(database)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for n := 0; n < 25; n++ {
				if _, _, err := GetLocalFiles(database); err != nil {
					t.Errorf("read: %v", err)
					return
				}
			}
		}()
	}
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for r := 0; r < 10; r++ {
				if _, err := SaveLocalFiles(database, id, files("/lib/a.mkv", "/lib/b.mkv")); err != nil {
					t.Errorf("save: %v", err)
					return
				}
			}
		}(i)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for n := 0; n < 20; n++ {
			ClearLocalFilesCache()
		}
	}()

	wg.Wait()
}
