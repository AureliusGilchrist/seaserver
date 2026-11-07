package db

import (
	"reflect"
	"testing"

	"seanime/internal/util"
)

func TestReorderFavorites(t *testing.T) {
	database, err := NewDatabase(t.TempDir(), "favorites", util.NewLogger())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if sqlDB, err := database.Gorm().DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	for _, id := range []int{1, 2, 3} {
		if _, err := database.ToggleAnimeFavorite(id); err != nil {
			t.Fatal(err)
		}
	}
	if err := database.ReorderFavorites("anime", []int{2, 3, 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ToggleAnimeFavorite(4); err != nil {
		t.Fatal(err)
	}
	ids, err := database.GetAnimeFavoriteIDs()
	if err != nil {
		t.Fatal(err)
	}
	if want := []int{2, 3, 1, 4}; !reflect.DeepEqual(ids, want) {
		t.Fatalf("order = %v, want %v (ranked first, a new one last)", ids, want)
	}
	if err := database.ReorderFavorites("nonsense", []int{1}); err == nil {
		t.Fatal("unknown type should be refused")
	}
}
