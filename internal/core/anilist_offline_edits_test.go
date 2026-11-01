package core

import (
	"testing"

	"seanime/internal/api/anilist"
)

func animeCollectionWith(ids ...int) *anilist.AnimeCollection {
	entries := make([]*anilist.AnimeCollection_MediaListCollection_Lists_Entries, 0, len(ids))
	for _, id := range ids {
		entries = append(entries, &anilist.AnimeCollection_MediaListCollection_Lists_Entries{
			ID:    id * 10,
			Media: &anilist.BaseAnime{ID: id},
		})
	}
	return &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
			Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{{Entries: entries}},
		},
	}
}

func TestRemovingAnEntryReturnsItsAniListID(t *testing.T) {
	col := animeCollectionWith(1, 2, 3)

	entryID, found := removeAnimeListEntry(col, 2)
	if !found || entryID != 20 {
		t.Fatalf("got %d, %v", entryID, found)
	}
	entries := col.MediaListCollection.Lists[0].Entries
	if len(entries) != 2 || entries[0].Media.ID != 1 || entries[1].Media.ID != 3 {
		t.Fatalf("left %+v", entries)
	}
	if _, found := removeAnimeListEntry(col, 2); found {
		t.Fatal("removed the same entry twice")
	}
}
