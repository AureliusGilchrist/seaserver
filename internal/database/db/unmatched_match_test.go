package db

import (
	"path/filepath"
	"seanime/internal/database/models"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog"
	"gorm.io/gorm"
)

// testDatabase returns a Database backed by a temporary SQLite file with the tables migrated.
func testDatabase(t *testing.T) *Database {
	t.Helper()

	g, err := gorm.Open(sqlite.Open(sqliteDSN(filepath.Join(t.TempDir(), "test.db"))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	closeWhenDone(t, g)

	if err := g.AutoMigrate(&models.UnmatchedMatchRecord{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	logger := zerolog.Nop()
	return &Database{gormdb: g, Logger: &logger}
}

func TestUnmatchedMatchRecords(t *testing.T) {
	t.Run("stores and reads back a match, newest first", func(t *testing.T) {
		db := testDatabase(t)

		for _, name := range []string{"first", "second", "third"} {
			if _, err := db.InsertUnmatchedMatchRecord(&models.UnmatchedMatchRecord{
				TorrentName: name,
				AnimeID:     1,
				AnimeTitle:  "Show",
				Destination: "/library/Show",
				FileCount:   2,
				Value:       []byte(`{"torrentName":"` + name + `"}`),
			}); err != nil {
				t.Fatalf("insert %q: %v", name, err)
			}
		}

		records, err := db.GetUnmatchedMatchRecords(0)
		if err != nil {
			t.Fatalf("read records: %v", err)
		}
		if len(records) != 3 {
			t.Fatalf("expected 3 records, got %d", len(records))
		}
		if records[0].TorrentName != "third" {
			t.Errorf("expected the newest record first, got %q", records[0].TorrentName)
		}
		if records[0].RevertedAt != nil {
			t.Error("a fresh record must not look reverted")
		}
	})

	t.Run("marks a record reverted", func(t *testing.T) {
		db := testDatabase(t)

		record, err := db.InsertUnmatchedMatchRecord(&models.UnmatchedMatchRecord{
			TorrentName: "Release",
			Value:       []byte(`{}`),
		})
		if err != nil {
			t.Fatalf("insert: %v", err)
		}

		when := time.Now()
		if err := db.MarkUnmatchedMatchRecordReverted(record.ID, when, []byte(`{"revert":{}}`)); err != nil {
			t.Fatalf("mark reverted: %v", err)
		}

		reloaded, err := db.GetUnmatchedMatchRecord(record.ID)
		if err != nil {
			t.Fatalf("reload: %v", err)
		}
		if reloaded.RevertedAt == nil {
			t.Fatal("expected the record to be marked reverted")
		}
		if string(reloaded.Value) != `{"revert":{}}` {
			t.Errorf("expected the revert outcome to be stored, got %s", reloaded.Value)
		}
	})

	t.Run("keeps the history bounded", func(t *testing.T) {
		db := testDatabase(t)

		for i := 0; i < unmatchedMatchHistoryLimit+15; i++ {
			if _, err := db.InsertUnmatchedMatchRecord(&models.UnmatchedMatchRecord{
				TorrentName: "Release",
				Value:       []byte(`{}`),
			}); err != nil {
				t.Fatalf("insert %d: %v", i, err)
			}
		}

		records, err := db.GetUnmatchedMatchRecords(0)
		if err != nil {
			t.Fatalf("read records: %v", err)
		}
		if len(records) > unmatchedMatchHistoryLimit {
			t.Errorf("expected at most %d records, got %d", unmatchedMatchHistoryLimit, len(records))
		}
	})

	t.Run("dismissing a record drops it", func(t *testing.T) {
		db := testDatabase(t)

		record, err := db.InsertUnmatchedMatchRecord(&models.UnmatchedMatchRecord{TorrentName: "Release", Value: []byte(`{}`)})
		if err != nil {
			t.Fatalf("insert: %v", err)
		}
		if err := db.DeleteUnmatchedMatchRecord(record.ID); err != nil {
			t.Fatalf("delete: %v", err)
		}
		if _, err := db.GetUnmatchedMatchRecord(record.ID); err == nil {
			t.Error("expected the record to be gone")
		}
	})
}
