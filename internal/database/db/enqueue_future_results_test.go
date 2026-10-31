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

func enqueueFutureResultsTestDatabase(t *testing.T) (*Database, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	return openEnqueueFutureResultsDatabase(t, path), path
}

func openEnqueueFutureResultsDatabase(t *testing.T, path string) *Database {
	t.Helper()

	g, err := gorm.Open(sqlite.Open(sqliteDSN(path)), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	closeWhenDone(t, g)

	if err := g.AutoMigrate(&models.EnqueueFutureDroppedItem{}, &models.EnqueueFutureLastRun{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	logger := zerolog.Nop()
	return &Database{gormdb: g, Logger: &logger}
}

func TestEnqueueFutureDroppedItems(t *testing.T) {
	t.Run("survives reopening the database, snapshot included", func(t *testing.T) {
		db, path := enqueueFutureResultsTestDatabase(t)

		if err := db.SaveEnqueueFutureDroppedItem(&models.EnqueueFutureDroppedItem{
			MediaID: 1, Title: "One", Reason: "best torrent has 3 seeders", Torrents: 2, BestSeeders: 3,
			Value: []byte(`{"providerId":"x"}`),
		}); err != nil {
			t.Fatalf("save: %v", err)
		}

		reopened := openEnqueueFutureResultsDatabase(t, path)
		item, err := reopened.GetEnqueueFutureDroppedItem(1)
		if err != nil || item == nil {
			t.Fatalf("expected the row back, got %v, %v", item, err)
		}
		if item.Reason != "best torrent has 3 seeders" || item.BestSeeders != 3 || string(item.Value) != `{"providerId":"x"}` {
			t.Fatalf("row did not round trip: %+v", item)
		}
	})

	t.Run("dropping the same anime again replaces its row", func(t *testing.T) {
		db, _ := enqueueFutureResultsTestDatabase(t)

		for _, seeders := range []int{1, 4} {
			if err := db.SaveEnqueueFutureDroppedItem(&models.EnqueueFutureDroppedItem{MediaID: 1, BestSeeders: seeders}); err != nil {
				t.Fatalf("save: %v", err)
			}
		}

		items, err := db.GetEnqueueFutureDroppedItems()
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(items) != 1 || items[0].BestSeeders != 4 {
			t.Fatalf("expected one row with the latest figure, got %d rows", len(items))
		}
	})

	t.Run("the list leaves the snapshots out", func(t *testing.T) {
		db, _ := enqueueFutureResultsTestDatabase(t)

		if err := db.SaveEnqueueFutureDroppedItem(&models.EnqueueFutureDroppedItem{MediaID: 1, Value: []byte("blob")}); err != nil {
			t.Fatalf("save: %v", err)
		}

		items, err := db.GetEnqueueFutureDroppedItems()
		if err != nil || len(items) != 1 {
			t.Fatalf("list: %v, %d rows", err, len(items))
		}
		if items[0].Value != nil {
			t.Fatalf("expected no snapshot on the list, got %d bytes", len(items[0].Value))
		}
	})

	t.Run("old rows lose their snapshot first, then go", func(t *testing.T) {
		db, _ := enqueueFutureResultsTestDatabase(t)

		// Written directly so the test does not pay for a prune per row.
		base := time.Now().Add(-time.Hour)
		total := EnqueueFutureDroppedRowLimit + 5
		rows := make([]*models.EnqueueFutureDroppedItem, 0, total)
		for i := 1; i <= total; i++ {
			row := &models.EnqueueFutureDroppedItem{MediaID: i, Value: []byte("blob")}
			row.UpdatedAt = base.Add(time.Duration(i) * time.Second)
			rows = append(rows, row)
		}
		if err := db.gormdb.CreateInBatches(rows, 200).Error; err != nil {
			t.Fatalf("seed: %v", err)
		}

		if err := db.SaveEnqueueFutureDroppedItem(&models.EnqueueFutureDroppedItem{MediaID: total + 1, Value: []byte("blob")}); err != nil {
			t.Fatalf("save: %v", err)
		}

		var count, withSnapshot int64
		db.gormdb.Model(&models.EnqueueFutureDroppedItem{}).Count(&count)
		db.gormdb.Model(&models.EnqueueFutureDroppedItem{}).Where("value IS NOT NULL").Count(&withSnapshot)
		if count != EnqueueFutureDroppedRowLimit {
			t.Fatalf("expected %d rows, got %d", EnqueueFutureDroppedRowLimit, count)
		}
		if withSnapshot != EnqueueFutureDroppedSnapshotLimit {
			t.Fatalf("expected %d snapshots, got %d", EnqueueFutureDroppedSnapshotLimit, withSnapshot)
		}

		// The oldest row is the one that went; the newest kept everything.
		if gone, _ := db.GetEnqueueFutureDroppedItem(1); gone != nil {
			t.Fatalf("expected the oldest row to be gone")
		}
		newest, _ := db.GetEnqueueFutureDroppedItem(total + 1)
		if newest == nil || newest.Value == nil {
			t.Fatalf("expected the newest row to keep its snapshot")
		}
	})

	t.Run("delete and clear", func(t *testing.T) {
		db, _ := enqueueFutureResultsTestDatabase(t)

		for _, id := range []int{1, 2, 3} {
			if err := db.SaveEnqueueFutureDroppedItem(&models.EnqueueFutureDroppedItem{MediaID: id}); err != nil {
				t.Fatalf("save: %v", err)
			}
		}
		if err := db.DeleteEnqueueFutureDroppedItem(2); err != nil {
			t.Fatalf("delete: %v", err)
		}
		items, _ := db.GetEnqueueFutureDroppedItems()
		if len(items) != 2 {
			t.Fatalf("expected 2 rows, got %d", len(items))
		}
		if err := db.ClearEnqueueFutureDroppedItems(); err != nil {
			t.Fatalf("clear: %v", err)
		}
		items, _ = db.GetEnqueueFutureDroppedItems()
		if len(items) != 0 {
			t.Fatalf("expected no rows, got %d", len(items))
		}
	})
}

func TestEnqueueFutureLastRun(t *testing.T) {
	db, path := enqueueFutureResultsTestDatabase(t)

	if run, err := db.GetEnqueueFutureLastRun(); err != nil || run != nil {
		t.Fatalf("expected nothing yet, got %v, %v", run, err)
	}

	for _, prepared := range []int{5, 9} {
		if err := db.SaveEnqueueFutureLastRun(&models.EnqueueFutureLastRun{
			RootMediaID: 1, RootTitle: "Root", Prepared: prepared, FinishedAt: time.Now(),
		}); err != nil {
			t.Fatalf("save: %v", err)
		}
	}

	var count int64
	db.gormdb.Model(&models.EnqueueFutureLastRun{}).Count(&count)
	if count != 1 {
		t.Fatalf("expected one row, got %d", count)
	}

	run, err := openEnqueueFutureResultsDatabase(t, path).GetEnqueueFutureLastRun()
	if err != nil || run == nil {
		t.Fatalf("expected the run back, got %v, %v", run, err)
	}
	if run.Prepared != 9 || run.RootTitle != "Root" || run.FinishedAt.IsZero() {
		t.Fatalf("run did not round trip: %+v", run)
	}

	if err := db.ClearEnqueueFutureLastRun(); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if run, _ := db.GetEnqueueFutureLastRun(); run != nil {
		t.Fatalf("expected nothing after clear")
	}
}
