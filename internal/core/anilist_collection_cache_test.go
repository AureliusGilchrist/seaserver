package core

import (
	"strconv"
	"testing"
	"time"

	"github.com/rs/zerolog"

	"seanime/internal/api/anilist"
	"seanime/internal/util/filecache"
)

// cacheOnlyManager is a manager with just enough wired up to exercise the disk cache.
func cacheOnlyManager(t *testing.T) *AnilistClientManager {
	t.Helper()
	cacher, err := filecache.NewCacher(t.TempDir())
	if err != nil {
		t.Fatalf("cacher: %v", err)
	}
	logger := zerolog.Nop()
	return &AnilistClientManager{
		logger:         &logger,
		fileCacher:     cacher,
		animeColBucket: filecache.NewPermanentBucket("profile-anime-collection"),
	}
}

func collectionWithLists(n int) *anilist.AnimeCollection {
	lists := make([]*anilist.AnimeCollection_MediaListCollection_Lists, 0, n)
	for i := 0; i < n; i++ {
		name := "list-" + strconv.Itoa(i)
		lists = append(lists, &anilist.AnimeCollection_MediaListCollection_Lists{Name: &name})
	}
	return &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{Lists: lists},
	}
}

// The cache never expires, and it knows how old it is — the second part is what makes the first
// part safe to serve.
func TestStoredCollectionKeepsItsDate(t *testing.T) {
	m := cacheOnlyManager(t)

	before := time.Now()
	m.saveAnimeCollectionToDisk(3, collectionWithLists(4))

	col, fetchedAt := m.loadAnimeCollectionFromDiskDated(3)
	if col == nil {
		t.Fatal("the stored collection did not come back")
	}
	if got := len(col.MediaListCollection.Lists); got != 4 {
		t.Errorf("got %d lists, want 4", got)
	}
	if fetchedAt.Before(before.Add(-time.Second)) || fetchedAt.After(time.Now().Add(time.Second)) {
		t.Errorf("fetchedAt = %v, which is not when it was written", fetchedAt)
	}
}

// A copy written before dates existed is still perfectly good data. Discarding it because its
// envelope changed shape would empty a library on upgrade.
func TestUndatedStoredCollectionIsStillRead(t *testing.T) {
	m := cacheOnlyManager(t)

	// Written the old way: the collection itself, with no envelope around it.
	if err := m.fileCacher.SetPerm(m.animeColBucket, "profile-7", collectionWithLists(2)); err != nil {
		t.Fatalf("seed: %v", err)
	}

	col, fetchedAt := m.loadAnimeCollectionFromDiskDated(7)
	if col == nil {
		t.Fatal("an undated collection was discarded")
	}
	if got := len(col.MediaListCollection.Lists); got != 2 {
		t.Errorf("got %d lists, want 2", got)
	}
	if !fetchedAt.IsZero() {
		t.Errorf("fetchedAt = %v, want the zero time to mark it as of unknown age", fetchedAt)
	}
}

func TestMissingStoredCollectionReportsNothing(t *testing.T) {
	m := cacheOnlyManager(t)
	if col, _ := m.loadAnimeCollectionFromDiskDated(99); col != nil {
		t.Error("a collection was returned for a profile that has none")
	}
}

// Age is measured, not assumed: an old copy is still served, it is simply due a refresh.
func TestAgeDecidesRefreshNotAvailability(t *testing.T) {
	m := cacheOnlyManager(t)

	stale := datedAnimeCollection{
		Data:      collectionWithLists(3),
		FetchedAt: time.Now().Add(-72 * time.Hour),
	}
	if err := m.fileCacher.SetPerm(m.animeColBucket, "profile-5", stale); err != nil {
		t.Fatalf("seed: %v", err)
	}

	col, fetchedAt := m.loadAnimeCollectionFromDiskDated(5)
	if col == nil {
		t.Fatal("a three-day-old collection was withheld; age must not decide availability")
	}
	if time.Since(fetchedAt) < AnimeCollectionRefreshInterval {
		t.Errorf("age = %v, expected it to read as due a refresh", time.Since(fetchedAt))
	}
}
