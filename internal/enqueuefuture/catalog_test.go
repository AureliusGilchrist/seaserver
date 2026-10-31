package enqueuefuture

import (
	"context"
	"testing"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
)

func catalogAnime(id int, title string) catalogMedia {
	mediaType := anilist.MediaTypeAnime
	format := anilist.MediaFormatTv
	status := anilist.MediaStatusFinished
	episodes := 12
	m := catalogMedia{ID: id, Type: &mediaType, Format: &format, Status: &status, Episodes: &episodes}
	m.Title.Romaji = &title
	return m
}

func catalogRepository(t *testing.T) *Repository {
	t.Helper()
	r := restartableRepository(t, t.TempDir())
	r.dataDir = t.TempDir()
	r.defaultProviderFunc = func() string { return "seadex" }
	return r
}

func TestQueueCatalogMedia(t *testing.T) {
	r := catalogRepository(t)

	if !r.queueCatalogMedia(catalogAnime(1, "Show")) {
		t.Fatalf("expected a plain anime to be queued")
	}
	if r.queueCatalogMedia(catalogAnime(1, "Show")) {
		t.Fatalf("expected a queued anime to be passed over")
	}

	airing := catalogAnime(2, "Airing")
	status := anilist.MediaStatusReleasing
	airing.Status = &status
	if r.queueCatalogMedia(airing) {
		t.Fatalf("expected the walk's filters to apply")
	}

	if err := r.database.SaveEnqueueFutureDroppedItem(&models.EnqueueFutureDroppedItem{MediaID: 3}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if r.queueCatalogMedia(catalogAnime(3, "Dropped")) {
		t.Fatalf("expected a dropped anime not to be searched again")
	}
}

func TestCatalogRowsWaitBehindEverythingElse(t *testing.T) {
	r := catalogRepository(t)
	r.queueCatalogMedia(catalogAnime(1, "Catalog"))
	queueItem(t, r, 2, "Asked For")

	next, err := r.database.GetNextPendingEnqueueFutureItemOutsideCatalog()
	if err != nil || next == nil || next.MediaID != 2 {
		t.Fatalf("expected the asked-for row, got %+v, %v", next, err)
	}

	if err := r.database.SetEnqueueFutureItemStatus(2, db.EnqueueFutureStatusReady, ""); err != nil {
		t.Fatalf("set status: %v", err)
	}
	if next, _ := r.database.GetNextPendingEnqueueFutureItemOutsideCatalog(); next != nil {
		t.Fatalf("expected a walk to stop at catalog rows, got %+v", next)
	}

	// A walk that reaches a waiting row takes it.
	if err := r.database.AdoptEnqueueFutureCatalogItem(1, 50); err != nil {
		t.Fatalf("adopt: %v", err)
	}
	if next, _ := r.database.GetNextPendingEnqueueFutureItemOutsideCatalog(); next == nil || next.MediaID != 1 {
		t.Fatalf("expected the adopted row, got %+v", next)
	}
}

func TestListLeavesOutWaitingCatalogRows(t *testing.T) {
	r := catalogRepository(t)
	r.queueCatalogMedia(catalogAnime(1, "Catalog"))

	items, err := r.database.GetEnqueueFutureListItems()
	if err != nil || len(items) != 0 {
		t.Fatalf("expected nothing listed yet, got %d, %v", len(items), err)
	}

	if err := r.database.SetEnqueueFutureItemStatus(1, db.EnqueueFutureStatusReady, ""); err != nil {
		t.Fatalf("set status: %v", err)
	}
	items, err = r.database.GetEnqueueFutureListItems()
	if err != nil || len(items) != 1 {
		t.Fatalf("expected it listed once prepared, got %d, %v", len(items), err)
	}
}

func TestCatalogStatusCountsPreparedRows(t *testing.T) {
	r := catalogRepository(t)
	r.saveCatalogState(&catalogState{Enabled: true, NextID: 1})
	r.queueCatalogMedia(catalogAnime(1, "One"))
	r.queueCatalogMedia(catalogAnime(2, "Two"))
	r.queueCatalogMedia(catalogAnime(3, "Three"))

	if err := r.database.SetEnqueueFutureItemStatus(1, db.EnqueueFutureStatusReady, ""); err != nil {
		t.Fatalf("set status: %v", err)
	}
	// Given up on, so neither waiting nor prepared.
	if err := r.database.SetEnqueueFutureItemStatus(2, db.EnqueueFutureStatusFailed, "no"); err != nil {
		t.Fatalf("set status: %v", err)
	}

	if status := r.catalogStatus(); status == nil || status.Waiting != 1 || status.Prepared != 1 {
		t.Fatalf("got %+v", status)
	}
}

func TestQueueCatalogMediaKeepsTheCover(t *testing.T) {
	r := catalogRepository(t)

	cover := "https://example.test/cover.jpg"
	m := catalogAnime(1, "Show")
	m.CoverImage.Large = &cover
	r.queueCatalogMedia(m)

	item, _ := r.database.GetEnqueueFutureItem(1)
	if item == nil || item.CoverImage != cover {
		t.Fatalf("expected the cover on the row: %+v", item)
	}
}

func TestListWaitingCatalogItems(t *testing.T) {
	r := repositoryWithDB(t)
	for id := 1; id <= 3; id++ {
		r.queueCatalogMedia(catalogAnime(id, "Show"))
	}
	if err := r.database.SetAnimeDownloadState(2, db.AnimeDownloadStateDownloading); err != nil {
		t.Fatalf("set state: %v", err)
	}

	first, err := r.ListWaitingCatalogItems(0, "", 2)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(first.Items) != 2 || first.Total != 3 || first.NextPosition != first.Items[1].Position {
		t.Fatalf("first page: %+v", first)
	}
	if first.Items[1].DownloadState != db.AnimeDownloadStateDownloading {
		t.Fatalf("expected the download state on the row: %+v", first.Items[1])
	}

	last, err := r.ListWaitingCatalogItems(first.NextPosition, "", 2)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(last.Items) != 1 || last.Items[0].MediaID != 3 || last.NextPosition != 0 {
		t.Fatalf("last page: %+v", last)
	}
}

// A row you downloaded while it waited is passed over. Nothing behind this repository can prepare
// anything, so a row the worker did take would come back failed or pending, never ready.
func TestRunSkipsRowsThatAlreadyHaveADownload(t *testing.T) {
	r := repositoryWithDB(t)
	r.queueCatalogMedia(catalogAnime(1, "Downloading"))
	r.queueCatalogMedia(catalogAnime(2, "Downloaded"))
	if err := r.database.SetAnimeDownloadState(1, db.AnimeDownloadStateDownloading); err != nil {
		t.Fatalf("set state: %v", err)
	}
	if err := r.database.SetAnimeDownloadState(2, db.AnimeDownloadStateDownloaded); err != nil {
		t.Fatalf("set state: %v", err)
	}

	r.mu.Lock()
	r.running = true
	r.mu.Unlock()
	r.run(context.Background(), &RunProgress{RootMediaID: db.EnqueueFutureCatalogRootID, RootWalked: true})

	for _, id := range []int{1, 2} {
		item, _ := r.database.GetEnqueueFutureItem(id)
		if item == nil || item.Status != db.EnqueueFutureStatusReady || len(item.Value) != 0 {
			t.Fatalf("media %d: expected ready with nothing prepared: %+v", id, item)
		}
	}
}

func TestSettleDownloadedItem(t *testing.T) {
	r := repositoryWithDB(t)
	r.queueCatalogMedia(catalogAnime(1, "Untouched"))
	r.queueCatalogMedia(catalogAnime(2, "Downloading"))
	if err := r.database.SetAnimeDownloadState(2, db.AnimeDownloadStateDownloading); err != nil {
		t.Fatalf("set state: %v", err)
	}

	untouched, _ := r.database.GetEnqueueFutureItem(1)
	if r.settleDownloadedItem(untouched) {
		t.Fatalf("expected a row with no download to be left to the worker")
	}

	// A family edge is walked whether you own it or not, or the franchise ends there.
	edge, _ := r.database.GetEnqueueFutureItem(2)
	edge.ParentMediaID = 1
	if r.settleDownloadedItem(edge) {
		t.Fatalf("expected a family edge to be left to the worker")
	}

	edge.ParentMediaID = 0
	if !r.settleDownloadedItem(edge) {
		t.Fatalf("expected a downloading row to be settled")
	}
}

func TestCatalogStateSurvivesARestart(t *testing.T) {
	r := catalogRepository(t)
	r.saveCatalogState(&catalogState{Enabled: true, NextID: 41001, MaxID: 219237, Queued: 900})

	reopened := restartableRepository(t, t.TempDir())
	reopened.dataDir = r.dataDir
	status := reopened.catalogStatus()
	if status == nil || !status.Active || status.NextID != 41001 || status.Queued != 900 {
		t.Fatalf("scan did not come back: %+v", status)
	}

	reopened.StopCatalogWalk()
	if status := reopened.catalogStatus(); status == nil || status.Active || status.NextID != 41001 {
		t.Fatalf("expected a stop to keep its place: %+v", status)
	}
}

func TestRequeueSeaDexDropsOnce(t *testing.T) {
	r := catalogRepository(t)
	r.defaultProviderFunc = func() string { return "animetosho" }

	for _, dropped := range []*models.EnqueueFutureDroppedItem{
		{MediaID: 1, ProviderID: "seadex", Title: "Off The List"},
		{MediaID: 2, ProviderID: "seadex", Torrents: 2, BestSeeders: 3},
		{MediaID: 3, ProviderID: "animetosho"},
	} {
		if err := r.database.SaveEnqueueFutureDroppedItem(dropped); err != nil {
			t.Fatalf("save: %v", err)
		}
	}

	r.requeueSeaDexDropsOnce()

	item, _ := r.database.GetEnqueueFutureItem(1)
	if item == nil || item.Status != db.EnqueueFutureStatusPending {
		t.Fatalf("expected the SeaDex miss back on the queue: %+v", item)
	}
	if r.database.HasEnqueueFutureItem(2) || r.database.HasEnqueueFutureItem(3) {
		t.Fatalf("expected real answers to stay dropped")
	}

	// Once only: dropped again, it stays dropped.
	if err := r.database.DeleteEnqueueFutureItem(1); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if err := r.database.SaveEnqueueFutureDroppedItem(&models.EnqueueFutureDroppedItem{MediaID: 1, ProviderID: "seadex"}); err != nil {
		t.Fatalf("save: %v", err)
	}
	r.requeueSeaDexDropsOnce()
	if r.database.HasEnqueueFutureItem(1) {
		t.Fatalf("expected the requeue to run once")
	}
}

func TestFallbackQueueProvider(t *testing.T) {
	r := catalogRepository(t)

	r.defaultProviderFunc = func() string { return "animetosho" }
	if id, ok := r.fallbackQueueProvider("seadex"); !ok || id != "animetosho" {
		t.Fatalf("expected the configured default, got %q, %v", id, ok)
	}

	r.useConfiguredProviderFunc = func() bool { return true }
	if _, ok := r.fallbackQueueProvider("seadex"); ok {
		t.Fatalf("expected the single-provider switch to be honoured")
	}
}
