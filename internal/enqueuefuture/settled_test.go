package enqueuefuture

import (
	"testing"

	"seanime/internal/database/db"
	"seanime/internal/database/models"

	"github.com/rs/zerolog"
)

// repositoryWithDB builds a repository with nothing but a real database behind it, which is all the
// queue-listing paths touch: no platform, no torrent provider, no network.
func repositoryWithDB(t *testing.T) *Repository {
	t.Helper()

	logger := zerolog.Nop()
	database, err := db.NewDatabase(t.TempDir(), "test", &logger)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, dbErr := database.Gorm().DB(); dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	return NewRepository(&NewRepositoryOptions{Logger: &logger, Database: database})
}

func queueItem(t *testing.T, r *Repository, mediaID int, title string) {
	t.Helper()
	inserted, err := r.database.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
		MediaID:     mediaID,
		RootMediaID: 1,
		FamilyID:    mediaID,
		Title:       title,
		Status:      db.EnqueueFutureStatusPending,
	})
	if err != nil || !inserted {
		t.Fatalf("queue %d: inserted=%v err=%v", mediaID, inserted, err)
	}
}

// An anime you have already dealt with stays in the queue and carries what happened to it. Removing
// it would take a season out of the middle of its franchise, and a group with a hole in it reads as
// a walk that failed rather than as work already done.
func TestListItemsCarriesTheDownloadState(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 10, "Nothing done with this one")
	queueItem(t, r, 11, "Downloading now")
	queueItem(t, r, 12, "Downloaded, waiting to be matched")
	queueItem(t, r, 13, "Matched into the library")

	for mediaID, state := range map[int]string{
		11: db.AnimeDownloadStateDownloading,
		12: db.AnimeDownloadStateDownloaded,
		13: db.AnimeDownloadStateMatched,
	} {
		if err := r.database.SetAnimeDownloadState(mediaID, state); err != nil {
			t.Fatalf("set state %q: %v", state, err)
		}
	}

	items, err := r.ListItems()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 4 {
		t.Fatalf("got %d items, want all 4 — none of them should have been removed", len(items))
	}

	want := map[int]string{
		10: "",
		11: db.AnimeDownloadStateDownloading,
		12: db.AnimeDownloadStateDownloaded,
		13: db.AnimeDownloadStateMatched,
	}
	for _, item := range items {
		if item.DownloadState != want[item.MediaID] {
			t.Errorf("media %d: downloadState = %q, want %q", item.MediaID, item.DownloadState, want[item.MediaID])
		}
	}
}

// A queue where nothing has been downloaded reports nothing, which is the normal case and the one
// that has to stay cheap.
func TestListItemsWithNoDownloadStates(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 20, "One")
	queueItem(t, r, 21, "Two")

	items, err := r.ListItems()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("got %d items, want 2", len(items))
	}
	for _, item := range items {
		if item.DownloadState != "" {
			t.Errorf("media %d carries state %q with nothing recorded", item.MediaID, item.DownloadState)
		}
	}
}

// A badge for an anime that was never queued must not invent a row.
func TestListItemsIgnoresStatesForAnimeNotInTheQueue(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 30, "Queued")
	if err := r.database.SetAnimeDownloadState(999, db.AnimeDownloadStateMatched); err != nil {
		t.Fatalf("set matched: %v", err)
	}

	items, err := r.ListItems()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 || items[0].MediaID != 30 {
		t.Fatalf("got %+v, want just the queued anime", items)
	}
}

// The single-item read is what the queue screen loads when you open a row, and it has to agree with
// the list about what has happened to it.
func TestGetItemCarriesTheDownloadState(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 40, "Matched")
	if err := r.database.SetAnimeDownloadState(40, db.AnimeDownloadStateMatched); err != nil {
		t.Fatalf("set matched: %v", err)
	}

	item, err := r.GetItem(40)
	if err != nil || item == nil {
		t.Fatalf("get: item=%v err=%v", item, err)
	}
	if item.DownloadState != db.AnimeDownloadStateMatched {
		t.Errorf("downloadState = %q, want %q", item.DownloadState, db.AnimeDownloadStateMatched)
	}
}

// Discovery no longer turns these away: an anime you have downloaded is still queued, greyed out,
// so its franchise stays whole.
func TestShouldSkipDoesNotRejectDownloadedAnime(t *testing.T) {
	r := repositoryWithDB(t)

	if err := r.database.SetAnimeDownloadState(50, db.AnimeDownloadStateMatched); err != nil {
		t.Fatalf("set matched: %v", err)
	}

	if skip, reason := r.shouldSkip(recommendation{mediaID: 50, title: "Matched", episodes: 12}); skip {
		t.Errorf("a matched anime was skipped at discovery (%q) — it should be queued and greyed out", reason)
	}
}
