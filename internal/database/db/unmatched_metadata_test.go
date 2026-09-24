package db

import (
	"testing"
)

func TestUnmatchedTorrentMetadataAnimeIDByName(t *testing.T) {
	t.Run("maps each staged torrent's name to its anime", func(t *testing.T) {
		db := testDatabase(t)

		if err := db.UpsertUnmatchedTorrentMetadata("Show.S01E01", 1, []byte(`{}`)); err != nil {
			t.Fatalf("upsert first: %v", err)
		}
		if err := db.UpsertUnmatchedTorrentMetadata("Other.Show.S01E01", 2, []byte(`{}`)); err != nil {
			t.Fatalf("upsert second: %v", err)
		}

		byName, err := db.UnmatchedTorrentMetadataAnimeIDByName()
		if err != nil {
			t.Fatalf("read map: %v", err)
		}
		if len(byName) != 2 {
			t.Fatalf("expected 2 entries, got %d", len(byName))
		}
		if byName["Show.S01E01"] != 1 {
			t.Errorf("expected anime 1 for %q, got %d", "Show.S01E01", byName["Show.S01E01"])
		}
		if byName["Other.Show.S01E01"] != 2 {
			t.Errorf("expected anime 2 for %q, got %d", "Other.Show.S01E01", byName["Other.Show.S01E01"])
		}
	})

	t.Run("empty when nothing is staged", func(t *testing.T) {
		db := testDatabase(t)

		byName, err := db.UnmatchedTorrentMetadataAnimeIDByName()
		if err != nil {
			t.Fatalf("read map: %v", err)
		}
		if len(byName) != 0 {
			t.Errorf("expected an empty map, got %d entries", len(byName))
		}
	})

	t.Run("ignores rows with no anime resolved yet", func(t *testing.T) {
		db := testDatabase(t)

		if err := db.UpsertUnmatchedTorrentMetadata("Unresolved.S01E01", 0, []byte(`{}`)); err != nil {
			t.Fatalf("upsert: %v", err)
		}

		byName, err := db.UnmatchedTorrentMetadataAnimeIDByName()
		if err != nil {
			t.Fatalf("read map: %v", err)
		}
		if len(byName) != 0 {
			t.Errorf("expected the unresolved row to be excluded, got %d entries", len(byName))
		}
	})
}
