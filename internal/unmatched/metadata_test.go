package unmatched

import (
	"os"
	"path/filepath"
	"testing"
)

// What a download is for is stored in the database, not beside the files. The folder the torrent
// client writes into cannot hold it: it does not exist until the first byte arrives, it may be
// somewhere this server cannot see, and matching deletes it.
func TestTorrentMetadataStore(t *testing.T) {
	t.Run("stores and reads back a record without touching the Unmatched folder", func(t *testing.T) {
		r, base := stageBaseWithDB(t)

		metadata := TorrentMetadata{
			AnimeID:               42,
			AnimeTitleRomaji:      "Some Show",
			AnimeFormat:           "TV",
			AnimeStartYear:        2021,
			AnimeExpectedEpisodes: 12,
			AutoMatch:             true,
			EpisodeTitles:         map[string]string{"1": "First", "2": "Second"},
		}

		if err := r.SaveTorrentMetadataRecord("Some Release", metadata); err != nil {
			t.Fatalf("save: %v", err)
		}

		got := r.GetTorrentMetadata("Some Release")
		if got == nil {
			t.Fatal("expected the record to be readable")
		}
		if got.AnimeID != 42 || got.AnimeExpectedEpisodes != 12 || !got.AutoMatch {
			t.Errorf("record came back wrong: %+v", got)
		}
		if got.EpisodeTitle(2) != "Second" {
			t.Errorf("expected the episode titles to round-trip, got %q", got.EpisodeTitle(2))
		}

		// Nothing may be created in the staging area — not the folder, not a sidecar.
		if entries, err := os.ReadDir(base); err != nil || len(entries) != 0 {
			t.Errorf("expected the Unmatched folder to be untouched, found %v (%v)", entries, err)
		}
	})

	// The download folder is created from the sanitized name, so a caller holding either spelling
	// has to find the same record — this is what joins a torrent to its staging folder.
	t.Run("finds a record by the name its folder is created from", func(t *testing.T) {
		r, _ := stageBaseWithDB(t)

		rawName := "SubGroup/Show"
		if err := r.SaveTorrentMetadataRecord(rawName, TorrentMetadata{AnimeID: 7}); err != nil {
			t.Fatalf("save: %v", err)
		}

		folderName := filepath.Base(DestinationFor(rawName))
		if got := r.GetTorrentMetadata(folderName); got == nil || got.AnimeID != 7 {
			t.Errorf("expected the folder name to find the record, got %+v", got)
		}
		if got := r.GetTorrentMetadata(rawName); got == nil || got.AnimeID != 7 {
			t.Errorf("expected the raw name to find the record, got %+v", got)
		}
	})

	// Where the client is writing is not a guess, and is what makes the "Downloading" badge work
	// when the client's name for a torrent differs from the release title it was queued under.
	t.Run("finds a record from the path the client is writing to", func(t *testing.T) {
		r, base := stageBaseWithDB(t)

		if err := r.SaveTorrentMetadataRecord("Release As Queued", TorrentMetadata{AnimeID: 9}); err != nil {
			t.Fatalf("save: %v", err)
		}

		savePath := filepath.Join(base, "Release As Queued", "Release Root Folder")
		if got := r.MetadataForTorrent("a.completely.different.name", savePath); got == nil || got.AnimeID != 9 {
			t.Errorf("expected the save path to find the record, got %+v", got)
		}
	})

	// Deleting a download must take its record with it, or a later re-download of the same release
	// silently inherits the anime it used to be matched to.
	t.Run("deleting a torrent drops its record", func(t *testing.T) {
		r, base := stageBaseWithDB(t)

		dir := filepath.Join(base, "Release")
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := r.SaveTorrentMetadataRecord("Release", TorrentMetadata{AnimeID: 3}); err != nil {
			t.Fatalf("save: %v", err)
		}

		if err := r.DeleteTorrent("Release"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		if got := r.GetTorrentMetadata("Release"); got != nil {
			t.Errorf("expected the record to be gone, got %+v", got)
		}
	})

	// Records written before this moved into the database still have to work.
	t.Run("falls back to a legacy sidecar", func(t *testing.T) {
		r, base := stageBaseWithDB(t)

		dir := filepath.Join(base, "Old Release")
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, metadataFileName), []byte(`{"animeId":123,"animeTitleRomaji":"Old"}`), 0644); err != nil {
			t.Fatal(err)
		}

		got := r.GetTorrentMetadata("Old Release")
		if got == nil || got.AnimeID != 123 {
			t.Errorf("expected the legacy sidecar to still be read, got %+v", got)
		}
	})

	// The screen reads its anime from the record, not from the folder. Missing this is what would
	// have every queued download listed with nothing attached.
	t.Run("the listing picks up the anime from the record", func(t *testing.T) {
		r, base := stageBaseWithDB(t)

		dir := filepath.Join(base, "Some Release")
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "ep01.mkv"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := r.SaveTorrentMetadataRecord("Some Release", TorrentMetadata{
			AnimeID:               55,
			AnimeTitleRomaji:      "Some Show",
			AnimeExpectedEpisodes: 12,
			AutoMatch:             true,
			EpisodeTitles:         map[string]string{"1": "First"},
		}); err != nil {
			t.Fatalf("save: %v", err)
		}

		torrents, err := r.GetUnmatchedTorrents()
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(torrents) != 1 {
			t.Fatalf("expected one torrent listed, got %d", len(torrents))
		}
		listed := torrents[0]
		if listed.AnimeID != 55 || listed.AnimeTitleRomaji != "Some Show" {
			t.Errorf("expected the listed torrent to carry its anime, got %+v", listed)
		}
		if listed.AnimeExpectedEpisodes != 12 {
			t.Errorf("expected the episode count from the record, got %d", listed.AnimeExpectedEpisodes)
		}
		if !listed.AutoMatch {
			t.Error("expected auto-match to be carried through to the listing")
		}
	})

	t.Run("a torrent with no record reads as nothing", func(t *testing.T) {
		r, _ := stageBaseWithDB(t)

		if got := r.GetTorrentMetadata("Never Seen"); got != nil {
			t.Errorf("expected nil, got %+v", got)
		}
	})
}

// CoversMatch decides whether a match can skip fetching episode metadata. Getting it wrong either
// wastes a network round trip in the middle of moving files, or names the files after the wrong
// anime's episodes.
func TestCoversMatch(t *testing.T) {
	withTitles := &TorrentMetadata{AnimeID: 42, EpisodeTitles: map[string]string{"1": "First"}}

	if !withTitles.CoversMatch(42) {
		t.Error("expected a record with episode titles to cover a match to its own anime")
	}
	// The stored titles belong to the anime the download was queued for. Matching to a different
	// one has to fetch, or every file is named after the wrong episode.
	if withTitles.CoversMatch(99) {
		t.Error("expected a record NOT to cover a match to a different anime")
	}
	if withTitles.CoversMatch(0) {
		t.Error("expected an unspecified anime not to be covered")
	}

	// A movie is one file named after the entry, so it has no episode titles to be missing.
	movie := &TorrentMetadata{AnimeID: 7, AnimeFormat: "MOVIE"}
	if !movie.CoversMatch(7) {
		t.Error("expected a movie record to cover its own match")
	}

	// A record from before the metadata was captured has to fetch.
	bare := &TorrentMetadata{AnimeID: 42}
	if bare.CoversMatch(42) {
		t.Error("expected a record with no episode titles not to cover a match")
	}

	var missing *TorrentMetadata
	if missing.CoversMatch(42) {
		t.Error("expected no record at all not to cover a match")
	}
	if missing.EpisodeTitle(1) != "" {
		t.Error("expected no record at all to have no episode title")
	}
}
