package handlers

import (
	"context"
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/connectivity"
	"seanime/internal/util/filecache"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// The library's "Missed sequels" tab needs relations, which the collection the library renders from
// does not carry. They come from one AnimeCollectionWithRelations query per account — a single
// request, but a heavy one — so it is fetched at most once per libraryMissedSequelsTTL per profile,
// kept on disk across restarts, and never per anime. List statuses are then read from the regular
// (already cached) collection, so starting a sequel removes it from the tab without a refetch.
const libraryMissedSequelsTTL = 12 * time.Hour

var libraryMissedSequelsBucket = filecache.NewBucket("library-missed-sequels-relations", 24*time.Hour)

type relationsCacheEntry struct {
	col       *anilist.AnimeCollectionWithRelations
	fetchedAt time.Time
}

var (
	libraryMissedSequelsMu    sync.Mutex // also collapses concurrent fetches for the same profile
	libraryMissedSequelsCache = make(map[uint]relationsCacheEntry)
)

// HandleGetLibraryMissedSequels
//
//	@summary returns completed anime whose released sequel the user has not started.
//	@desc Each item is a completed show and its sequel. Sequels that are not yet released, or that are
//	@desc already on a list other than Planning, are left out.
//	@route /api/v1/library/missed-sequels [GET]
//	@returns []anilist.MissedSequel
func (h *Handler) HandleGetLibraryMissedSequels(c echo.Context) error {
	profileID := h.GetProfileID(c)

	withRelations, err := h.getCollectionWithRelationsCached(profileID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	var current *anilist.AnimeCollection
	if profileID > 0 {
		current, _ = h.App.AnilistClientManager.GetAnimeCollection(profileID)
	}
	if current == nil {
		current, _ = h.App.GetAnimeCollection(false)
	}

	return h.RespondWithData(c, anilist.FindMissedSequels(withRelations, current))
}

func (h *Handler) getCollectionWithRelationsCached(profileID uint) (*anilist.AnimeCollectionWithRelations, error) {
	libraryMissedSequelsMu.Lock()
	defer libraryMissedSequelsMu.Unlock()

	if entry, ok := libraryMissedSequelsCache[profileID]; ok && time.Since(entry.fetchedAt) < libraryMissedSequelsTTL {
		return entry.col, nil
	}

	diskKey := fmt.Sprintf("profile-%d", profileID)
	var stored anilist.AnimeCollectionWithRelations
	found, _ := h.App.FileCacher.Get(libraryMissedSequelsBucket, diskKey, &stored)
	if found && stored.MediaListCollection != nil {
		// A disk copy younger than the bucket's TTL is good enough to start from; it is promoted to
		// memory so the next calls skip the disk read.
		libraryMissedSequelsCache[profileID] = relationsCacheEntry{col: &stored, fetchedAt: time.Now()}
		return &stored, nil
	}

	if !connectivity.IsAniListAllowed() {
		return nil, anilist.ErrOffline
	}

	// Background, budget-waiting request: one heavy query that should wait its turn rather than
	// crowd out what the user is actively loading, and not be cancelled by leaving the page.
	ctx, cancel := context.WithTimeout(anilist.WithBudgetWait(context.Background()), 2*time.Minute)
	defer cancel()

	var col *anilist.AnimeCollectionWithRelations
	var err error
	if profileID > 0 {
		if username := h.App.AnilistClientManager.GetUsername(profileID); username != "" {
			col, err = h.App.AnilistClientManager.GetClient(profileID).AnimeCollectionWithRelations(ctx, &username)
		}
	}
	if col == nil && err == nil {
		col, err = h.App.AnilistPlatformRef.Get().GetAnimeCollectionWithRelations(ctx)
	}
	if err != nil {
		return nil, err
	}
	if col == nil {
		return &anilist.AnimeCollectionWithRelations{}, nil
	}

	libraryMissedSequelsCache[profileID] = relationsCacheEntry{col: col, fetchedAt: time.Now()}
	_ = h.App.FileCacher.Set(libraryMissedSequelsBucket, diskKey, col)
	return col, nil
}
