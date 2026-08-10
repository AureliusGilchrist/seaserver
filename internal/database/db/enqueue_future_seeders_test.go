package db

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog"
	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// legacyEnqueueFutureItem is the queue row as it was before the seeder total existed: same table,
// no total_seeders column. Migrating over the top of it is what a real upgrade does, and it is the
// only way to reproduce what an existing queue actually looks like afterwards.
type legacyEnqueueFutureItem struct {
	ID       uint   `gorm:"primarykey"`
	MediaID  int    `gorm:"column:media_id;uniqueIndex"`
	Status   string `gorm:"column:status"`
	Value    []byte `gorm:"column:value"`
	Position int    `gorm:"column:position"`
}

func (legacyEnqueueFutureItem) TableName() string { return "enqueue_future_items" }

// The queue is ranked by seeders, and every row that predates the column has to be measured before
// that ranking means anything. This is the test for the part that goes wrong silently.
func TestEnqueueFutureSeederBackfillReachesUpgradedRows(t *testing.T) {
	g, err := gorm.Open(sqlite.Open(sqliteDSN(filepath.Join(t.TempDir(), "test.db"))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	closeWhenDone(t, g)

	// A queue built before the upgrade...
	if err := g.AutoMigrate(&legacyEnqueueFutureItem{}); err != nil {
		t.Fatalf("migrate legacy: %v", err)
	}
	for _, row := range []legacyEnqueueFutureItem{
		{MediaID: 1, Status: EnqueueFutureStatusReady, Value: []byte(`{"providerId":"nyaa"}`), Position: 1},
		{MediaID: 2, Status: EnqueueFutureStatusReady, Value: []byte(`{"providerId":"nyaa"}`), Position: 2},
		{MediaID: 3, Status: EnqueueFutureStatusPending, Position: 3},
	} {
		if err := g.Create(&row).Error; err != nil {
			t.Fatalf("seed %d: %v", row.MediaID, err)
		}
	}

	// ...and then the upgrade itself.
	if err := g.AutoMigrate(&models.EnqueueFutureItem{}); err != nil {
		t.Fatalf("migrate current: %v", err)
	}

	logger := zerolog.Nop()
	database := &Database{gormdb: g, Logger: &logger}

	// The rows added before the column exists carry NULL in it, not zero. A backfill that looked
	// only for zero matched none of them, every item stayed unmeasured, and the queue screen — which
	// ranks on this number — came out in its old order with nothing to say why.
	var visited []int
	if err := database.ForEachEnqueueFutureItemMissingSeeders(func(mediaID int, value []byte) {
		visited = append(visited, mediaID)
	}); err != nil {
		t.Fatalf("scan: %v", err)
	}

	if len(visited) != 2 {
		t.Fatalf("backfill visited %v, want the two prepared rows (1 and 2)", visited)
	}
	for _, want := range []int{1, 2} {
		found := false
		for _, got := range visited {
			if got == want {
				found = true
			}
		}
		if !found {
			t.Errorf("media %d was never visited: %v", want, visited)
		}
	}

	// An item with no snapshot has nothing to recover a figure from, so it is left alone rather than
	// being written as a zero that would look measured.
	for _, got := range visited {
		if got == 3 {
			t.Error("an unprepared row was visited; it has no snapshot to measure")
		}
	}

	// And the write goes through and reads back, which is what the sort consumes.
	if err := database.SetEnqueueFutureItemSeeders(1, 1234); err != nil {
		t.Fatalf("set seeders: %v", err)
	}
	items, err := database.GetEnqueueFutureListItems()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, item := range items {
		if item.MediaID == 1 && item.TotalSeeders != 1234 {
			t.Errorf("total seeders = %d, want 1234", item.TotalSeeders)
		}
	}

	// Once measured, a row is not visited again — the repair is one-time, not work repeated on
	// every poll.
	visited = nil
	if err := database.ForEachEnqueueFutureItemMissingSeeders(func(mediaID int, value []byte) {
		visited = append(visited, mediaID)
	}); err != nil {
		t.Fatalf("second scan: %v", err)
	}
	for _, got := range visited {
		if got == 1 {
			t.Error("a row that already has its total was visited again")
		}
	}
}
