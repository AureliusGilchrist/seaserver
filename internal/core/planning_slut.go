package core

import (
	"context"
	"errors"
	"seanime/internal/connectivity"
	"seanime/internal/util/filecache"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/events"
)

// The "planning slut" is a single shared AniList account that stands in for the server's own view of
// what it owns and wants, independent of whoever happens to be signed in. Matching adds to its
// PLANNING list, and the library screen merges it in — so it, not the current profile's list, is the
// account that actually describes this server's library.
//
// Anything that has to reason about the server rather than about a person reads from here.

// planningSlutCollectionTTL is how long a fetched collection is reused.
//
// It exists because the callers are loops: Enqueue Future asks once per anime it prepares, and
// re-fetching a whole AniList collection per item would spend the entire rate-limit budget on the
// same answer over and over.
const planningSlutCollectionTTL = 5 * time.Minute

type planningSlutCache struct {
	mu        sync.Mutex
	col       *anilist.AnimeCollection
	fetchedAt time.Time
}

var planningSlutAnimeCol planningSlutCache

// The account's last known lists, kept on disk. Without them every library load waits on AniList and
// then loses whatever only this account knows about, which with no internet is most of the library.
var planningSlutBucket = filecache.NewPermanentBucket("planning-slut-collections")

const (
	planningSlutAnimeKey = "anime"
	planningSlutMangaKey = "manga"
)

// SavePlanningSlutAnimeCollection keeps a copy for when AniList can't be reached.
func (a *App) SavePlanningSlutAnimeCollection(col *anilist.AnimeCollection) {
	if col != nil {
		_ = a.FileCacher.SetPerm(planningSlutBucket, planningSlutAnimeKey, col)
	}
}

// SavePlanningSlutMangaCollection keeps a copy for when AniList can't be reached.
func (a *App) SavePlanningSlutMangaCollection(col *anilist.MangaCollection) {
	if col != nil {
		_ = a.FileCacher.SetPerm(planningSlutBucket, planningSlutMangaKey, col)
	}
}

// StoredPlanningSlutAnimeCollection returns the copy on disk, if there is one.
func (a *App) StoredPlanningSlutAnimeCollection() (*anilist.AnimeCollection, bool) {
	var col anilist.AnimeCollection
	found, err := a.FileCacher.GetPerm(planningSlutBucket, planningSlutAnimeKey, &col)
	return &col, found && err == nil
}

// StoredPlanningSlutMangaCollection returns the copy on disk, if there is one.
func (a *App) StoredPlanningSlutMangaCollection() (*anilist.MangaCollection, bool) {
	var col anilist.MangaCollection
	found, err := a.FileCacher.GetPerm(planningSlutBucket, planningSlutMangaKey, &col)
	return &col, found && err == nil
}

// GetPlanningSlutToken returns the configured shared-account token, or "" when there is none.
func (a *App) GetPlanningSlutToken() string {
	settings, err := a.Database.GetSettings()
	if err != nil || settings == nil || settings.Library == nil {
		return ""
	}
	return strings.TrimSpace(settings.Library.PlanningSlutToken)
}

// GetPlanningSlutClient builds an AniList client for the shared account.
func (a *App) GetPlanningSlutClient() (*anilist.AnilistClientImpl, error) {
	token := a.GetPlanningSlutToken()
	if token == "" {
		return nil, errors.New("planning slut token not configured")
	}

	// One client per token rather than one per call: each new client brings its own HTTP client, so
	// every call started its connections to AniList from scratch.
	planningSlutClientMu.Lock()
	defer planningSlutClientMu.Unlock()
	if planningSlutClient != nil && planningSlutClientToken == token {
		return planningSlutClient, nil
	}

	client := anilist.NewAnilistClient(token, a.AnilistCacheDir)
	if a.WSEventManager != nil {
		client.SetWSEventManager(a.WSEventManager)
		client.SetTokenExpiredEvent(events.AnilistPlanningSlutTokenExpired)
	}
	planningSlutClient, planningSlutClientToken = client, token
	return client, nil
}

var (
	planningSlutClientMu    sync.Mutex
	planningSlutClient      *anilist.AnilistClientImpl
	planningSlutClientToken string
)

// GetPlanningSlutAnimeCollection returns the shared account's anime collection, cached for
// planningSlutCollectionTTL. Pass bypassCache to force a fetch.
func (a *App) GetPlanningSlutAnimeCollection(ctx context.Context, bypassCache bool) (*anilist.AnimeCollection, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	planningSlutAnimeCol.mu.Lock()
	if !bypassCache && planningSlutAnimeCol.col != nil &&
		time.Since(planningSlutAnimeCol.fetchedAt) < planningSlutCollectionTTL {
		col := planningSlutAnimeCol.col
		planningSlutAnimeCol.mu.Unlock()
		return col, nil
	}
	planningSlutAnimeCol.mu.Unlock()

	if !connectivity.IsAniListAllowed() {
		if col, ok := a.StoredPlanningSlutAnimeCollection(); ok {
			return col, nil
		}
		return nil, anilist.ErrOffline
	}

	client, err := a.GetPlanningSlutClient()
	if err != nil {
		return nil, err
	}

	viewer, err := client.GetViewer(ctx)
	if err != nil {
		if col, ok := a.StoredPlanningSlutAnimeCollection(); ok {
			return col, nil
		}
		return nil, err
	}
	if viewer == nil || viewer.Viewer == nil {
		return nil, errors.New("failed to fetch planning slut viewer")
	}
	name := viewer.Viewer.Name

	col, err := client.AnimeCollection(ctx, &name)
	if err != nil {
		if stored, ok := a.StoredPlanningSlutAnimeCollection(); ok {
			return stored, nil
		}
		return nil, err
	}
	a.SavePlanningSlutAnimeCollection(col)

	planningSlutAnimeCol.mu.Lock()
	planningSlutAnimeCol.col = col
	planningSlutAnimeCol.fetchedAt = time.Now()
	planningSlutAnimeCol.mu.Unlock()

	return col, nil
}

// InvalidatePlanningSlutAnimeCollection drops the cached collection, so the next read refetches.
// Call after adding an anime to the shared account's list.
func (a *App) InvalidatePlanningSlutAnimeCollection() {
	planningSlutAnimeCol.mu.Lock()
	planningSlutAnimeCol.col = nil
	planningSlutAnimeCol.fetchedAt = time.Time{}
	planningSlutAnimeCol.mu.Unlock()
}
