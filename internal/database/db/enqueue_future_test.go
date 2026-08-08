package db

import (
	"path/filepath"
	"seanime/internal/database/models"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog"
	"gorm.io/gorm"
)

// enqueueFutureTestDatabase returns a Database with only the queue table migrated.
func enqueueFutureTestDatabase(t *testing.T) *Database {
	t.Helper()

	g, err := gorm.Open(sqlite.Open(sqliteDSN(filepath.Join(t.TempDir(), "test.db"))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	closeWhenDone(t, g)

	if err := g.AutoMigrate(&models.EnqueueFutureItem{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	logger := zerolog.Nop()
	return &Database{gormdb: g, Logger: &logger}
}

func insertItem(t *testing.T, db *Database, mediaID int) bool {
	t.Helper()
	inserted, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
		ProfileID:   1,
		MediaID:     mediaID,
		RootMediaID: 100,
		Status:      EnqueueFutureStatusPending,
	})
	if err != nil {
		t.Fatalf("insert %d: %v", mediaID, err)
	}
	return inserted
}

func TestEnqueueFutureQueue(t *testing.T) {
	t.Run("inserts in discovery order and hands them back the same way", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		for _, id := range []int{30, 10, 20} {
			insertItem(t, db, id)
		}

		items, err := db.GetEnqueueFutureItems()
		if err != nil {
			t.Fatalf("read queue: %v", err)
		}
		if len(items) != 3 {
			t.Fatalf("expected 3 items, got %d", len(items))
		}
		// Discovery order, not media-ID order — the queue reads as rings out from the root.
		for i, want := range []int{30, 10, 20} {
			if items[i].MediaID != want {
				t.Errorf("position %d: got media %d, want %d", i, items[i].MediaID, want)
			}
			if items[i].Position != i+1 {
				t.Errorf("media %d: got position %d, want %d", items[i].MediaID, items[i].Position, i+1)
			}
		}
	})

	t.Run("refuses a duplicate without treating it as an error", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		if !insertItem(t, db, 42) {
			t.Fatal("the first insert should have gone in")
		}
		if insertItem(t, db, 42) {
			t.Error("the same anime was queued twice")
		}

		items, _ := db.GetEnqueueFutureItems()
		if len(items) != 1 {
			t.Errorf("expected 1 item after the duplicate, got %d", len(items))
		}
	})

	t.Run("counts a duplicate as present even once it is terminal", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 7)
		if err := db.SetEnqueueFutureItemStatus(7, EnqueueFutureStatusDownloaded, ""); err != nil {
			t.Fatalf("set status: %v", err)
		}

		// Downloading it is precisely why it must not be rediscovered.
		if !db.HasEnqueueFutureItem(7) {
			t.Error("a downloaded anime should still count as queued")
		}
		if insertItem(t, db, 7) {
			t.Error("a downloaded anime was queued again")
		}
	})

	t.Run("an ignored show never comes back", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 11)
		if err := db.SetEnqueueFutureItemStatus(11, EnqueueFutureStatusIgnored, ""); err != nil {
			t.Fatalf("set status: %v", err)
		}

		// The row is kept rather than deleted precisely so a later run rediscovering this anime
		// through some other recommendation chain does not put it back on the queue.
		if insertItem(t, db, 11) {
			t.Error("an ignored show was queued again")
		}

		item, _ := db.GetEnqueueFutureItem(11)
		if item == nil || item.Status != EnqueueFutureStatusIgnored {
			t.Errorf("expected the ignored row to survive, got %+v", item)
		}
	})

	t.Run("folds two halves of a franchise into one family", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		// A franchise reached from two directions starts as two groups; the merge is what makes it
		// show up in the queue as one bundle rather than two.
		for _, spec := range []struct{ mediaID, familyID int }{
			{100, 100}, {101, 100}, {200, 200}, {201, 200},
		} {
			if _, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
				ProfileID: 1, MediaID: spec.mediaID, RootMediaID: 100,
				FamilyID: spec.familyID, Status: EnqueueFutureStatusPending,
			}); err != nil {
				t.Fatalf("insert %d: %v", spec.mediaID, err)
			}
		}

		if err := db.MergeEnqueueFutureFamily(200, 100); err != nil {
			t.Fatalf("merge: %v", err)
		}

		items, _ := db.GetEnqueueFutureItems()
		for _, item := range items {
			if item.FamilyID != 100 {
				t.Errorf("media %d is in family %d, want 100", item.MediaID, item.FamilyID)
			}
		}
	})

	// The queue is shared by the whole server, so a merge covers every member of the family
	// regardless of which profile's run happened to discover each one.
	t.Run("a family merge covers members discovered by other profiles", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		if _, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID: 2, MediaID: 300, FamilyID: 200, Status: EnqueueFutureStatusPending,
		}); err != nil {
			t.Fatalf("insert: %v", err)
		}

		if err := db.MergeEnqueueFutureFamily(200, 100); err != nil {
			t.Fatalf("merge: %v", err)
		}

		item, _ := db.GetEnqueueFutureItem(300)
		if item.FamilyID != 100 {
			t.Errorf("family is %d, want 100 — the merge should cover the whole shared queue", item.FamilyID)
		}
	})

	// One queue for the server, not one per profile: a recommendation graph is the same graph
	// whoever is looking at it, and an anime dealt with once has to stay dealt with.
	t.Run("shares one queue across profiles", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 5)
		if _, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID: 2,
			MediaID:   6,
			Status:    EnqueueFutureStatusPending,
		}); err != nil {
			t.Fatalf("insert for the second profile: %v", err)
		}

		items, _ := db.GetEnqueueFutureItems()
		if len(items) != 2 {
			t.Fatalf("got %d items, want both profiles' items in the one queue", len(items))
		}
		for _, want := range []int{5, 6} {
			if !db.HasEnqueueFutureItem(want) {
				t.Errorf("media %d is missing from the shared queue", want)
			}
		}
	})

	// The old schema made media_id globally unique while every read was scoped per profile, so the
	// second profile's insert failed the constraint and its item was dropped from the run entirely.
	// Now it is simply recognised as already queued.
	t.Run("treats an anime another profile queued as already present", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		if _, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID: 1, MediaID: 100749, RootMediaID: 5081, Status: EnqueueFutureStatusPending,
		}); err != nil {
			t.Fatalf("first insert: %v", err)
		}

		inserted, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID: 2, MediaID: 100749, RootMediaID: 5081, Status: EnqueueFutureStatusPending,
		})
		if err != nil {
			t.Fatalf("the second profile's insert must not error, got %v", err)
		}
		if inserted {
			t.Error("the same anime was queued twice")
		}
	})

	t.Run("serves pending items oldest first and stops when there are none", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 1)
		insertItem(t, db, 2)

		next, err := db.GetNextPendingEnqueueFutureItem()
		if err != nil || next == nil || next.MediaID != 1 {
			t.Fatalf("expected media 1 first, got %+v (err %v)", next, err)
		}

		_ = db.SetEnqueueFutureItemStatus(1, EnqueueFutureStatusReady, "")
		_ = db.SetEnqueueFutureItemStatus(2, EnqueueFutureStatusReady, "")

		next, err = db.GetNextPendingEnqueueFutureItem()
		if err != nil {
			t.Fatalf("read next: %v", err)
		}
		if next != nil {
			t.Errorf("expected nothing pending, got media %d", next.MediaID)
		}
	})

	t.Run("stores a snapshot and leaves it out of the list view", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 9)
		blob := []byte(`{"providerId":"nyaa"}`)
		if err := db.SaveEnqueueFutureItemSnapshot(9, EnqueueFutureStatusReady, "Some Anime", "cover.jpg", blob); err != nil {
			t.Fatalf("save snapshot: %v", err)
		}

		full, err := db.GetEnqueueFutureItem(9)
		if err != nil || full == nil {
			t.Fatalf("read item: %+v (err %v)", full, err)
		}
		if string(full.Value) != string(blob) {
			t.Errorf("got snapshot %q, want %q", full.Value, blob)
		}
		if full.Title != "Some Anime" || full.CoverImage != "cover.jpg" {
			t.Errorf("display fields not stored: %q / %q", full.Title, full.CoverImage)
		}

		list, err := db.GetEnqueueFutureListItems()
		if err != nil || len(list) != 1 {
			t.Fatalf("read list: %d items (err %v)", len(list), err)
		}
		// The blobs are the reason the list view has its own query at all.
		if len(list[0].Value) != 0 {
			t.Error("the list view loaded the snapshot blob")
		}
		if list[0].Title != "Some Anime" {
			t.Errorf("the list view lost the title: %q", list[0].Title)
		}
	})

	// The queue screen has no use for rows already dealt with, and they accumulate forever — sending
	// the whole history to the browser, and re-sending it every few seconds during a run, made opening
	// the screen a wait that grew with the table.
	t.Run("the list view leaves terminal rows out", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		unresolved := map[int]string{
			1: EnqueueFutureStatusPending,
			2: EnqueueFutureStatusPreparing,
			3: EnqueueFutureStatusReady,
		}
		terminal := map[int]string{
			5: EnqueueFutureStatusDownloaded,
			6: EnqueueFutureStatusSkipped,
			7: EnqueueFutureStatusIgnored,
			8: EnqueueFutureStatusFailed,
			// Nothing writes this any more — an entry with nothing downloadable is dropped outright —
			// so rows carrying it are leftovers and the screen has no use for them either.
			9: EnqueueFutureStatusNoResults,
		}
		for id, status := range unresolved {
			insertItem(t, db, id)
			if err := db.SetEnqueueFutureItemStatus(id, status, ""); err != nil {
				t.Fatalf("set status: %v", err)
			}
		}
		for id, status := range terminal {
			insertItem(t, db, id)
			if err := db.SetEnqueueFutureItemStatus(id, status, ""); err != nil {
				t.Fatalf("set status: %v", err)
			}
		}

		list, err := db.GetEnqueueFutureListItems()
		if err != nil {
			t.Fatalf("read list: %v", err)
		}
		if len(list) != len(unresolved) {
			ids := make([]int, 0, len(list))
			for _, item := range list {
				ids = append(ids, item.MediaID)
			}
			t.Fatalf("list view returned %v, want only the unresolved rows %v", ids, []int{1, 2, 3, 4})
		}
		for _, item := range list {
			if _, ok := unresolved[item.MediaID]; !ok {
				t.Errorf("media %d (%s) should not be in the list view", item.MediaID, item.Status)
			}
		}

		// The purge has to reach terminal rows, so it gets the unfiltered read.
		all, err := db.GetAllEnqueueFutureListItems()
		if err != nil {
			t.Fatalf("read all: %v", err)
		}
		if len(all) != len(unresolved)+len(terminal) {
			t.Errorf("got %d rows unfiltered, want %d", len(all), len(unresolved)+len(terminal))
		}
	})

	t.Run("counts franchises rather than anime for the cap", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		// One franchise with four entries, plus two standalone shows: three franchises, six anime.
		for _, spec := range []struct{ mediaID, familyID int }{
			{1, 1}, {2, 1}, {3, 1}, {4, 1},
			{5, 5},
			{6, 6},
		} {
			if _, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
				ProfileID: 1, MediaID: spec.mediaID, RootMediaID: 100,
				FamilyID: spec.familyID, Status: EnqueueFutureStatusPending,
			}); err != nil {
				t.Fatalf("insert %d: %v", spec.mediaID, err)
			}
		}

		families, err := db.CountEnqueueFutureFamiliesForRoot(100)
		if err != nil {
			t.Fatalf("count families: %v", err)
		}
		// The whole point: four seasons of one show cost one slot between them, not four.
		if families != 3 {
			t.Errorf("got %d franchises, want 3", families)
		}

		items, _ := db.CountEnqueueFutureItemsForRoot(100)
		if items != 6 {
			t.Errorf("got %d items, want 6", items)
		}
	})

	t.Run("recognises a franchise that is already queued", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		if _, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID: 1, MediaID: 1, RootMediaID: 100, FamilyID: 42, Status: EnqueueFutureStatusPending,
		}); err != nil {
			t.Fatalf("insert: %v", err)
		}

		// A later season joining this franchise is free even when the run is full.
		if !db.HasEnqueueFutureFamily(42) {
			t.Error("an already-queued franchise was not recognised")
		}
		if db.HasEnqueueFutureFamily(99) {
			t.Error("an unknown franchise was reported as queued")
		}
		if db.HasEnqueueFutureFamily(0) {
			t.Error("a zero family id should never count as queued")
		}
	})

	t.Run("counts a run's items so the cap can be enforced", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 1)
		insertItem(t, db, 2)
		if _, err := db.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID: 1, MediaID: 3, RootMediaID: 999, Status: EnqueueFutureStatusPending,
		}); err != nil {
			t.Fatalf("insert for the other run: %v", err)
		}

		count, err := db.CountEnqueueFutureItemsForRoot(100)
		if err != nil {
			t.Fatalf("count: %v", err)
		}
		if count != 2 {
			t.Errorf("got %d items for the run, want 2 (the third belongs to another run)", count)
		}
	})

	t.Run("counts attempts across restarts", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 4)
		for i := 0; i < 3; i++ {
			if err := db.IncrementEnqueueFutureItemAttempts(4, "rate limited"); err != nil {
				t.Fatalf("increment: %v", err)
			}
		}

		item, _ := db.GetEnqueueFutureItem(4)
		if item.Attempts != 3 {
			t.Errorf("got %d attempts, want 3", item.Attempts)
		}
		if item.LastError != "rate limited" {
			t.Errorf("got last error %q, want %q", item.LastError, "rate limited")
		}
	})

	t.Run("releases items a dead worker was holding", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 8)
		_ = db.SetEnqueueFutureItemStatus(8, EnqueueFutureStatusPreparing, "")

		// Without this, a server killed mid-run leaves one item claimed forever and the queue
		// never gets past it.
		if err := db.ResetPreparingEnqueueFutureItems(); err != nil {
			t.Fatalf("reset: %v", err)
		}

		item, _ := db.GetEnqueueFutureItem(8)
		if item.Status != EnqueueFutureStatusPending {
			t.Errorf("got status %q, want %q", item.Status, EnqueueFutureStatusPending)
		}
	})

	t.Run("deletes one item and clears the rest", func(t *testing.T) {
		db := enqueueFutureTestDatabase(t)

		insertItem(t, db, 1)
		insertItem(t, db, 2)

		if err := db.DeleteEnqueueFutureItem(1); err != nil {
			t.Fatalf("delete: %v", err)
		}
		if db.HasEnqueueFutureItem(1) {
			t.Error("the deleted item is still queued")
		}
		// A deleted item gives its slot back, which is what lets discovery keep filling to the cap.
		if count, _ := db.CountEnqueueFutureItemsForRoot(100); count != 1 {
			t.Errorf("got %d items after the delete, want 1", count)
		}

		if err := db.ClearEnqueueFutureItems(); err != nil {
			t.Fatalf("clear: %v", err)
		}
		items, _ := db.GetEnqueueFutureItems()
		if len(items) != 0 {
			t.Errorf("got %d items after clearing, want 0", len(items))
		}
	})
}
