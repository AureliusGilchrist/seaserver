package db

import (
	"path/filepath"
	"seanime/internal/database/models"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog"
	"gorm.io/gorm"
)

type legacyToWatchItem struct {
	models.BaseModel
	ProfileID uint   `gorm:"column:profile_id;index"`
	AnimeID   int    `gorm:"column:anime_id;index"`
	Position  int    `gorm:"column:position;index"`
	Value     []byte `gorm:"column:value"`
}

func (legacyToWatchItem) TableName() string {
	return "to_watch_items"
}

func TestToWatchMediaTypesAndLegacyRows(t *testing.T) {
	g, err := gorm.Open(sqlite.Open(sqliteDSN(filepath.Join(t.TempDir(), "to-watch.db"))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	closeWhenDone(t, g)

	if err := g.AutoMigrate(&legacyToWatchItem{}); err != nil {
		t.Fatalf("migrate legacy table: %v", err)
	}
	legacy := &legacyToWatchItem{ProfileID: 7, AnimeID: 42, Position: 1, Value: []byte(`{"animeId":42,"title":"Legacy anime"}`)}
	if err := g.Create(legacy).Error; err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}
	if err := g.AutoMigrate(&models.ToWatchItem{}); err != nil {
		t.Fatalf("migrate current table: %v", err)
	}

	logger := zerolog.Nop()
	database := &Database{gormdb: g, Logger: &logger}

	legacyRows, err := database.GetToWatchItems(7)
	if err != nil {
		t.Fatalf("read migrated row: %v", err)
	}
	if len(legacyRows) != 1 || legacyRows[0].MediaType != "ANIME" {
		t.Fatalf("expected legacy row to migrate as anime, got %+v", legacyRows)
	}

	for i, mediaType := range []string{"ANIME", "MANGA"} {
		err := database.InsertToWatchItem(&models.ToWatchItem{
			ProfileID: 8,
			AnimeID:   42,
			MediaType: mediaType,
			Position:  i + 1,
			Value:     []byte(`{"title":"Shared ID"}`),
		})
		if err != nil {
			t.Fatalf("insert %s with overlapping ID: %v", mediaType, err)
		}
	}
	if err := database.InsertToWatchItem(&models.ToWatchItem{ProfileID: 8, AnimeID: 42, MediaType: "ANIME"}); err == nil {
		t.Fatal("expected duplicate anime entry to be rejected")
	}

	items, err := database.GetToWatchItems(8)
	if err != nil {
		t.Fatalf("read mixed list: %v", err)
	}
	if len(items) != 2 || items[0].MediaType != "ANIME" || items[1].MediaType != "MANGA" {
		t.Fatalf("expected separate anime and manga rows, got %+v", items)
	}

	if err := database.SetToWatchOrder(8, []*models.ToWatchItem{
		{AnimeID: 42, MediaType: "MANGA"},
		{AnimeID: 42, MediaType: "ANIME"},
	}); err != nil {
		t.Fatalf("reorder mixed list: %v", err)
	}
	items, err = database.GetToWatchItems(8)
	if err != nil {
		t.Fatalf("read reordered list: %v", err)
	}
	if items[0].MediaType != "MANGA" || items[1].MediaType != "ANIME" {
		t.Fatalf("expected media-type-aware ordering, got %+v", items)
	}

	if err := database.DeleteToWatchItem(8, 42, "MANGA"); err != nil {
		t.Fatalf("remove manga: %v", err)
	}
	items, err = database.GetToWatchItems(8)
	if err != nil {
		t.Fatalf("read list after removing manga: %v", err)
	}
	if len(items) != 1 || items[0].MediaType != "ANIME" {
		t.Fatalf("expected anime row to remain after removing manga, got %+v", items)
	}
}
