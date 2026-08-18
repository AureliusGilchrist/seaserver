package core

import (
	"testing"

	"seanime/internal/api/anilist"
)

func planning() *anilist.MediaListStatus {
	s := anilist.MediaListStatusPlanning
	return &s
}

func current() *anilist.MediaListStatus {
	s := anilist.MediaListStatusCurrent
	return &s
}

func mangaCollectionWith(lists ...*anilist.MangaCollection_MediaListCollection_Lists) *anilist.MangaCollection {
	return &anilist.MangaCollection{
		MediaListCollection: &anilist.MangaCollection_MediaListCollection{Lists: lists},
	}
}

func findMangaEntry(col *anilist.MangaCollection, mediaID int) (*anilist.MangaCollection_MediaListCollection_Lists_Entries, int) {
	var found *anilist.MangaCollection_MediaListCollection_Lists_Entries
	count := 0
	for _, list := range col.MediaListCollection.Lists {
		for _, entry := range list.Entries {
			if entry != nil && entry.Media != nil && entry.Media.ID == mediaID {
				found = entry
				count++
			}
		}
	}
	return found, count
}

// Pressing "+" on a manga that is on none of your lists is the case that was broken: the addition
// went to AniList and the screen came back with no list data, so the card showed no status and
// 0 chapters read, exactly as though nothing had happened.
func TestApplyMangaEditAddsAMangaNotOnAnyList(t *testing.T) {
	col := mangaCollectionWith()

	edit := &mangaListEdit{
		mediaID: 42,
		media:   &anilist.BaseManga{ID: 42},
		status:  planning(),
	}

	if !applyMangaEditToCollection(col, edit) {
		t.Fatal("the addition was not applied")
	}

	entry, count := findMangaEntry(col, 42)
	if entry == nil {
		t.Fatal("the manga is not in the collection")
	}
	if count != 1 {
		t.Errorf("the manga appears %d times, want once", count)
	}
	if entry.Status == nil || *entry.Status != anilist.MediaListStatusPlanning {
		t.Errorf("status = %v, want PLANNING", entry.Status)
	}
	// Nil progress reads as "nothing recorded" rather than as zero, which is what shows a freshly
	// added manga as a blank card.
	if entry.Progress == nil || *entry.Progress != 0 {
		t.Errorf("progress = %v, want 0", entry.Progress)
	}
}

// Without the media there is nothing to build an entry from, and inventing one would put a card in
// the library for a manga nothing can describe.
func TestApplyMangaEditWillNotInventAnEntry(t *testing.T) {
	col := mangaCollectionWith()

	if applyMangaEditToCollection(col, &mangaListEdit{mediaID: 42, status: planning()}) {
		t.Error("an entry was created with no media to create it from")
	}
}

// Changing the status has to move the entry, not copy it: a manga under two headings at once is one
// the library counts twice and shows twice.
func TestApplyMangaEditMovesTheEntryBetweenLists(t *testing.T) {
	entry := &anilist.MangaCollection_MediaListCollection_Lists_Entries{
		Media:  &anilist.BaseManga{ID: 7},
		Status: planning(),
	}
	name := "Planning"
	col := mangaCollectionWith(&anilist.MangaCollection_MediaListCollection_Lists{
		Status:  planning(),
		Name:    &name,
		Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{entry},
	})

	if !applyMangaEditToCollection(col, &mangaListEdit{mediaID: 7, status: current()}) {
		t.Fatal("the edit was not applied")
	}

	moved, count := findMangaEntry(col, 7)
	if count != 1 {
		t.Fatalf("the manga appears %d times, want once", count)
	}
	if moved.Status == nil || *moved.Status != anilist.MediaListStatusCurrent {
		t.Errorf("status = %v, want CURRENT", moved.Status)
	}

	for _, list := range col.MediaListCollection.Lists {
		if list.Status != nil && *list.Status == anilist.MediaListStatusCurrent && len(list.Entries) == 1 {
			return
		}
	}
	t.Error("the entry is not under the heading its new status belongs to")
}

// AniList answers a collection query with pre-edit data for a few seconds after accepting a
// mutation. An edit is only worth defending until the answer catches up with it.
func TestMangaCollectionAgreesWith(t *testing.T) {
	progress := 12
	entry := &anilist.MangaCollection_MediaListCollection_Lists_Entries{
		Media:    &anilist.BaseManga{ID: 7},
		Status:   current(),
		Progress: &progress,
	}
	col := mangaCollectionWith(&anilist.MangaCollection_MediaListCollection_Lists{
		Status:  current(),
		Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{entry},
	})

	if !mangaCollectionAgreesWith(col, &mangaListEdit{mediaID: 7, status: current(), progress: &progress}) {
		t.Error("the collection already says this, so the edit should be considered caught up")
	}

	other := 3
	if mangaCollectionAgreesWith(col, &mangaListEdit{mediaID: 7, progress: &other}) {
		t.Error("the collection disagrees, so the edit still needs defending")
	}
	if mangaCollectionAgreesWith(col, &mangaListEdit{mediaID: 99, status: current()}) {
		t.Error("a manga that is not in the collection cannot agree with anything")
	}
}

// The collection handed to a replay is usually the shared cached copy that other requests are
// reading at the same time. Rewriting it from inside a read is a data race and a way for one
// profile's edit to leak into another's view.
func TestCloneMangaCollectionLeavesTheOriginalAlone(t *testing.T) {
	entry := &anilist.MangaCollection_MediaListCollection_Lists_Entries{
		Media:  &anilist.BaseManga{ID: 7},
		Status: planning(),
	}
	col := mangaCollectionWith(&anilist.MangaCollection_MediaListCollection_Lists{
		Status:  planning(),
		Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{entry},
	})

	clone := cloneMangaCollection(col)
	if !applyMangaEditToCollection(clone, &mangaListEdit{mediaID: 7, status: current()}) {
		t.Fatal("the edit was not applied to the clone")
	}

	if entry.Status == nil || *entry.Status != anilist.MediaListStatusPlanning {
		t.Error("the original entry was modified")
	}
	if len(col.MediaListCollection.Lists) != 1 || len(col.MediaListCollection.Lists[0].Entries) != 1 {
		t.Error("the original collection was restructured")
	}
}
