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

// A badge for an anime that was never queued now registers it.
//
// The queue is meant to be a record of what you have dealt with, and an anime you downloaded through
// the anime page — or before any of this existed — was invisible here, which made a franchise show
// the season the walk reached and not the two you already own. The badge table is the cheap source
// for that: one read, no walking, no AniList.
func TestListItemsRegistersBadgedAnime(t *testing.T) {
	r := repositoryWithDB(t)

	queueItem(t, r, 30, "Queued")
	if err := r.database.SetAnimeDownloadState(999, db.AnimeDownloadStateMatched); err != nil {
		t.Fatalf("set matched: %v", err)
	}

	items, err := r.ListItems()
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	byID := make(map[int]*Item, len(items))
	for _, item := range items {
		byID[item.MediaID] = item
	}
	if byID[30] == nil {
		t.Error("the queued anime went missing")
	}
	registered := byID[999]
	if registered == nil {
		t.Fatal("a matched anime was not registered into the queue")
	}
	if registered.DownloadState != db.AnimeDownloadStateMatched {
		t.Errorf("registered row carries state %q, want %q", registered.DownloadState, db.AnimeDownloadStateMatched)
	}
	if registered.Status != db.EnqueueFutureStatusReady {
		t.Errorf("registered row has status %q, want %q — it must never be picked up for preparation",
			registered.Status, db.EnqueueFutureStatusReady)
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

// The missing-seasons bug: the walk only extends through anime it queues, so an entry skipped for
// being in your library never had its own relations walked — and everything behind it in the
// franchise was never found. Family edges are therefore queued whatever you already have.
func TestShouldSkipKeepsFamilyEdgesYouAlreadyHave(t *testing.T) {
	r := repositoryWithDB(t)

	// Downloading, which for a recommendation is a reason to skip.
	if err := r.database.SetAnimeDownloadState(60, db.AnimeDownloadStateDownloading); err != nil {
		t.Fatalf("set downloading: %v", err)
	}

	family := recommendation{mediaID: 60, title: "Season 2", episodes: 12, isFamily: true}
	if skip, reason := r.shouldSkip(family); skip {
		t.Errorf("a family edge was skipped (%q) — the franchise would stop here", reason)
	}

	// Still queued a second time? No: something already in the queue stays out of it.
	queueItem(t, r, 61, "Already queued")
	if skip, _ := r.shouldSkip(recommendation{mediaID: 61, isFamily: true}); !skip {
		t.Error("an anime already in the queue was queued again")
	}

	// And an unreleased one is still refused, family or not — there is nothing to download.
	if skip, _ := r.shouldSkip(recommendation{mediaID: 62, isFamily: true, notYetReleased: true}); !skip {
		t.Error("an unreleased family edge was queued")
	}
}

// Everything in the library counts as matched, whether or not this server watched it happen.
//
// The recorded states only cover downloads this server saw. Anything imported by hand or scanned in
// has no row at all — which is why the queue was showing series as actionable that every other
// screen in the app already badged as matched.
func TestDownloadStatesIncludeTheLibrary(t *testing.T) {
	r := repositoryWithDB(t)

	// Recorded as downloading, and also has files: downloading wins, because another season coming
	// down is the fact that decides what you do next.
	if err := r.database.SetAnimeDownloadState(70, db.AnimeDownloadStateDownloading); err != nil {
		t.Fatalf("set downloading: %v", err)
	}

	states := r.downloadStatesByMediaID()
	if states[70] != db.AnimeDownloadStateDownloading {
		t.Errorf("media 70 = %q, want %q", states[70], db.AnimeDownloadStateDownloading)
	}
	// An anime with neither a record nor files has no badge at all.
	if states[71] != "" {
		t.Errorf("media 71 = %q, want no badge", states[71])
	}
}

// The three states come from three different facts, and they have an order.
//
// Deliberately not from the badge table alone: that only knows about downloads this server watched
// happen. Files in the library mean matched, a record in staging means downloaded, and a recorded
// "downloading" outranks both — it is the one that says something is still on its way.
func TestDownloadStatesDeriveDownloadedFromStaging(t *testing.T) {
	r := repositoryWithDB(t)

	// Staged, nothing else known: downloaded.
	if err := r.database.UpsertUnmatchedTorrentMetadata("Some.Release", 80, []byte("{}")); err != nil {
		t.Fatalf("stage: %v", err)
	}

	// Staged *and* recorded as downloading: still downloading.
	if err := r.database.UpsertUnmatchedTorrentMetadata("Other.Release", 81, []byte("{}")); err != nil {
		t.Fatalf("stage: %v", err)
	}
	if err := r.database.SetAnimeDownloadState(81, db.AnimeDownloadStateDownloading); err != nil {
		t.Fatalf("set downloading: %v", err)
	}

	states := r.downloadStatesByMediaID()
	if states[80] != db.AnimeDownloadStateDownloaded {
		t.Errorf("media 80 = %q, want %q", states[80], db.AnimeDownloadStateDownloaded)
	}
	if states[81] != db.AnimeDownloadStateDownloading {
		t.Errorf("media 81 = %q, want %q — downloading outranks a staged file", states[81], db.AnimeDownloadStateDownloading)
	}
}
