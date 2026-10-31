package enqueuefuture

import (
	"testing"
	"time"

	"seanime/internal/database/db"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrents/torrent"

	"github.com/rs/zerolog"
)

// restartableRepository opens a repository on a database file a second one can reopen, because what
// is under test is what is left once the process that wrote it has gone.
func restartableRepository(t *testing.T, dir string) *Repository {
	t.Helper()

	logger := zerolog.Nop()
	database, err := db.NewDatabase(dir, "test", &logger)
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

func preparedWithSeeders(title string, seeders ...int) *prepared {
	data := &torrent.SearchData{}
	for _, s := range seeders {
		data.Torrents = append(data.Torrents, &hibiketorrent.AnimeTorrent{Seeders: s})
	}
	return &prepared{
		title:      title,
		coverImage: "cover.jpg",
		snapshot:   &Snapshot{SearchData: data, ProviderID: "nyaa"},
	}
}

func TestDroppedResultsSurviveARestart(t *testing.T) {
	dir := t.TempDir()
	r := restartableRepository(t, dir)

	queueItem(t, r, 10, "Quiet Show")
	queueItem(t, r, 11, "Nobody Has This")
	r.storeSnapshot(10, preparedWithSeeders("Quiet Show", 3, 1))
	r.storeSnapshot(11, preparedWithSeeders("Nobody Has This"))

	if r.database.HasEnqueueFutureItem(10) {
		t.Fatalf("expected the entry off the queue, so a later run can find it again")
	}

	reopened := restartableRepository(t, dir)
	dropped, err := reopened.ListDropped()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(dropped) != 2 {
		t.Fatalf("expected both drops back, got %d", len(dropped))
	}

	byID := map[int]*DroppedItem{}
	for _, item := range dropped {
		byID[item.MediaID] = item
	}
	quiet := byID[10]
	if quiet == nil || quiet.Reason != "best torrent has 3 seeders" || quiet.BestSeeders != 3 || quiet.Torrents != 2 ||
		quiet.Title != "Quiet Show" || quiet.ProviderID != "nyaa" {
		t.Fatalf("drop did not come back whole: %+v", quiet)
	}
	if none := byID[11]; none == nil || none.Reason != "no torrents found" {
		t.Fatalf("expected the empty search on record: %+v", none)
	}
}

func TestRestoreDropped(t *testing.T) {
	t.Run("comes back ready with the torrents it was dropped with", func(t *testing.T) {
		r := repositoryWithDB(t)
		queueItem(t, r, 10, "Quiet Show")
		r.storeSnapshot(10, preparedWithSeeders("Quiet Show", 3, 1))

		restored, err := r.RestoreDropped(10)
		if err != nil || !restored {
			t.Fatalf("restore: %v, %v", restored, err)
		}

		item, err := r.GetItem(10)
		if err != nil || item == nil {
			t.Fatalf("expected the item back: %v, %v", item, err)
		}
		if item.Status != db.EnqueueFutureStatusReady || item.FamilyID != 10 || item.TotalSeeders != 4 {
			t.Fatalf("restored wrongly: %+v", item)
		}
		if item.Snapshot == nil || len(item.Snapshot.SearchData.Torrents) != 2 {
			t.Fatalf("expected the stored torrents back, got %+v", item.Snapshot)
		}

		if dropped, _ := r.ListDropped(); len(dropped) != 0 {
			t.Fatalf("expected the record gone, got %d", len(dropped))
		}
	})

	t.Run("nothing on record is not an error", func(t *testing.T) {
		r := repositoryWithDB(t)
		if restored, err := r.RestoreDropped(99); err != nil || restored {
			t.Fatalf("expected false, nil, got %v, %v", restored, err)
		}
	})

	t.Run("a newer queue row is left alone", func(t *testing.T) {
		r := repositoryWithDB(t)
		queueItem(t, r, 10, "Quiet Show")
		r.storeSnapshot(10, preparedWithSeeders("Quiet Show", 3))
		queueItem(t, r, 10, "Queued Again")

		if restored, err := r.RestoreDropped(10); err != nil || !restored {
			t.Fatalf("restore: %v, %v", restored, err)
		}
		item, _ := r.GetItem(10)
		if item == nil || item.Status != db.EnqueueFutureStatusPending {
			t.Fatalf("expected the newer row untouched: %+v", item)
		}
	})
}

func TestReadyEntryClearsItsOldDrop(t *testing.T) {
	r := repositoryWithDB(t)
	queueItem(t, r, 10, "Quiet Show")
	r.storeSnapshot(10, preparedWithSeeders("Quiet Show", 3))

	queueItem(t, r, 10, "Quiet Show")
	r.storeSnapshot(10, preparedWithSeeders("Quiet Show", 50))

	if dropped, _ := r.ListDropped(); len(dropped) != 0 {
		t.Fatalf("expected the old drop gone once it became downloadable, got %d", len(dropped))
	}
}

func TestLastRunSurvivesARestart(t *testing.T) {
	dir := t.TempDir()
	r := restartableRepository(t, dir)

	finishedAt := time.Now()
	r.saveLastRun(Status{
		RootMediaID: 5, RootTitle: "Root", Discovered: 40, Prepared: 30, Failed: 2, Skipped: 8, Families: 12,
		LastError: "rate limited", StartedAt: finishedAt.Add(-time.Hour), FinishedAt: finishedAt,
	})

	reopened := restartableRepository(t, dir)
	if got := reopened.Status(); got.RootMediaID != 0 {
		t.Fatalf("expected nothing before the restore, got %+v", got)
	}
	reopened.RestoreLastRun()

	got := reopened.Status()
	if got.Running || got.RootTitle != "Root" || got.Prepared != 30 || got.Failed != 2 || got.Skipped != 8 ||
		got.Families != 12 || got.LastError != "rate limited" || !got.FinishedAt.Equal(finishedAt) {
		t.Fatalf("run did not come back: %+v", got)
	}
}

func TestClearTakesTheRecordsWithIt(t *testing.T) {
	r := repositoryWithDB(t)
	queueItem(t, r, 10, "Quiet Show")
	r.storeSnapshot(10, preparedWithSeeders("Quiet Show", 3))
	r.saveLastRun(Status{RootMediaID: 5, FinishedAt: time.Now()})
	r.RestoreLastRun()

	if err := r.Clear(); err != nil {
		t.Fatalf("clear: %v", err)
	}

	if dropped, _ := r.ListDropped(); len(dropped) != 0 {
		t.Fatalf("expected no drops, got %d", len(dropped))
	}
	if run, _ := r.database.GetEnqueueFutureLastRun(); run != nil {
		t.Fatalf("expected no last run: %+v", run)
	}
	if status := r.Status(); status.RootMediaID != 0 {
		t.Fatalf("expected a blank status: %+v", status)
	}
}
