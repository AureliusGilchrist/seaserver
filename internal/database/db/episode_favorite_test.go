package db

import (
	"testing"

	"seanime/internal/util"
)

func TestEpisodeFavorites(t *testing.T) {
	database, err := NewDatabase(t.TempDir(), "episode-favorites", util.NewLogger())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if sqlDB, err := database.Gorm().DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	// Same anime, two episodes; and the same episode number on another anime.
	for _, ep := range []struct{ media, num int }{{21, 1}, {21, 2}, {30, 1}} {
		on, err := database.ToggleEpisodeFavorite(ep.media, ep.num, "Title", "img.png")
		if err != nil || !on {
			t.Fatalf("add %v: on=%v err=%v", ep, on, err)
		}
	}

	favs, err := database.GetEpisodeFavorites()
	if err != nil || len(favs) != 3 {
		t.Fatalf("got %d favourites, err=%v; want 3", len(favs), err)
	}

	// Ranking by row id: put the last one first.
	if err := database.ReorderFavorites("episode", []int{int(favs[2].ID), int(favs[0].ID), int(favs[1].ID)}); err != nil {
		t.Fatal(err)
	}
	ordered, _ := database.GetEpisodeFavorites()
	if ordered[0].ID != favs[2].ID {
		t.Fatalf("first after reorder = %d, want %d", ordered[0].ID, favs[2].ID)
	}

	// Toggling again removes only that episode.
	on, err := database.ToggleEpisodeFavorite(21, 1, "", "")
	if err != nil || on {
		t.Fatalf("remove: on=%v err=%v", on, err)
	}
	left, _ := database.GetEpisodeFavorites()
	if len(left) != 2 {
		t.Fatalf("after removal got %d, want 2", len(left))
	}
	for _, f := range left {
		if f.MediaID == 21 && f.EpisodeNumber == 1 {
			t.Fatal("episode 1 of 21 should be gone")
		}
	}
}
