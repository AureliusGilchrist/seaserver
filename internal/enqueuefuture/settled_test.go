package enqueuefuture

import (
	"testing"

	"seanime/internal/database/db"
	"seanime/internal/database/models"

	"github.com/rs/zerolog"
)

// repositoryWithDB builds a repository with nothing but a real database behind it, which is all the
// queue-hygiene paths touch: no platform, no torrent provider, no network.
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

func queuedIDs(t *testing.T, r *Repository) map[int]bool {
	t.Helper()
	items, err := r.database.GetAllEnqueueFutureListItems()
	if err != nil {
		t.Fatalf("read queue: %v", err)
	}
	ids := make(map[int]bool, len(items))
	for _, item := range items {
		ids[item.MediaID] = true
	}
	return ids
}

// The queue is only worth working through while everything in it still needs a decision. An anime
// you have since downloaded or matched needs none.
func TestPurgeSettledItems(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 10, "Still worth asking about")
	queueItem(t, r, 11, "Downloading now")
	queueItem(t, r, 12, "Downloaded, waiting to be matched")
	queueItem(t, r, 13, "Matched into the library")

	if err := r.database.SetAnimeDownloadState(11, db.AnimeDownloadStateDownloading); err != nil {
		t.Fatalf("set downloading: %v", err)
	}
	if err := r.database.SetAnimeDownloadState(12, db.AnimeDownloadStateDownloaded); err != nil {
		t.Fatalf("set downloaded: %v", err)
	}
	if err := r.database.SetAnimeDownloadState(13, db.AnimeDownloadStateMatched); err != nil {
		t.Fatalf("set matched: %v", err)
	}

	if removed := r.purgeSettledItems(); removed != 3 {
		t.Fatalf("removed %d, want 3", removed)
	}

	remaining := queuedIDs(t, r)
	if !remaining[10] {
		t.Error("the untouched anime was removed from the queue")
	}
	for _, mediaID := range []int{11, 12, 13} {
		if remaining[mediaID] {
			t.Errorf("media %d is settled but is still in the queue", mediaID)
		}
	}
}

// Nothing settled means nothing removed — the normal case, and the one that has to stay cheap and
// harmless.
func TestPurgeSettledItemsLeavesAnUntouchedQueueAlone(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 20, "One")
	queueItem(t, r, 21, "Two")

	if removed := r.purgeSettledItems(); removed != 0 {
		t.Fatalf("removed %d from a queue with nothing settled, want 0", removed)
	}
	if len(queuedIDs(t, r)) != 2 {
		t.Error("the queue lost an item it should have kept")
	}
}

// A badge on an anime that was never queued is not a reason to do anything.
func TestPurgeSettledItemsIgnoresAnimeNotInTheQueue(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 30, "Queued")
	if err := r.database.SetAnimeDownloadState(999, db.AnimeDownloadStateMatched); err != nil {
		t.Fatalf("set matched: %v", err)
	}

	if removed := r.purgeSettledItems(); removed != 0 {
		t.Fatalf("removed %d, want 0", removed)
	}
	if !queuedIDs(t, r)[30] {
		t.Error("the queued anime was removed")
	}
}

// The same rule that empties the queue keeps things out of it in the first place.
func TestDownloadStateReason(t *testing.T) {
	r := repositoryWithDB(t)

	tests := []struct {
		mediaID int
		state   string
		want    string
	}{
		{mediaID: 40, state: "", want: ""},
		{mediaID: 41, state: db.AnimeDownloadStateDownloading, want: "already downloading"},
		{mediaID: 42, state: db.AnimeDownloadStateDownloaded, want: "already downloaded"},
		{mediaID: 43, state: db.AnimeDownloadStateMatched, want: "already matched into the library"},
	}

	for _, tt := range tests {
		if tt.state != "" {
			if err := r.database.SetAnimeDownloadState(tt.mediaID, tt.state); err != nil {
				t.Fatalf("set state %q: %v", tt.state, err)
			}
		}
		if got := r.downloadStateReason(tt.mediaID); got != tt.want {
			t.Errorf("downloadStateReason(%d) with state %q = %q, want %q", tt.mediaID, tt.state, got, tt.want)
		}
	}
}

// shouldSkip is what discovery actually calls, so the badge has to reach it — not just the helper
// underneath.
func TestShouldSkipRejectsSettledAnime(t *testing.T) {
	r := repositoryWithDB(t)

	if err := r.database.SetAnimeDownloadState(50, db.AnimeDownloadStateMatched); err != nil {
		t.Fatalf("set matched: %v", err)
	}

	skip, reason := r.shouldSkip(recommendation{mediaID: 50, title: "Matched", episodes: 12})
	if !skip {
		t.Fatal("a matched anime was not skipped")
	}
	if reason != "already matched into the library" {
		t.Errorf("reason = %q", reason)
	}

	if skip, _ := r.shouldSkip(recommendation{mediaID: 51, title: "Untouched", episodes: 12}); skip {
		t.Error("an untouched anime was skipped")
	}
}
