package core

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/platforms/shared_platform"
	"seanime/internal/util/filecache"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"golang.org/x/sync/singleflight"
)

// profileCollectionCacheTTL controls how long a per-profile collection is
// served from memory before a fresh fetch is triggered.
// The collection carries each entry's episode count, airing status and nextAiringEpisode,
// so a long TTL means newly aired episodes of ongoing series stay invisible. Keep it short;
// the disk cache still provides a permanent offline fallback, and ServiceRunner refreshes
// every collection once a day regardless.
const profileCollectionCacheTTL = 30 * time.Minute

// profileMangaCollectionCacheTTL keeps the original long-lived manga behaviour. Manga
// entries don't gain "episodes" week to week the way airing anime do, so there is nothing
// to gain from refetching often — and the manga library is left exactly as it was before
// the anime staleness work.
const profileMangaCollectionCacheTTL = 7 * 24 * time.Hour

// profileAnimeCache is a time-stamped cache entry for an anime collection.
type profileAnimeCache struct {
	data      *anilist.AnimeCollection
	fetchedAt time.Time
}

// profileMangaCache is a time-stamped cache entry for a manga collection.
type profileMangaCache struct {
	data      *anilist.MangaCollection
	fetchedAt time.Time
}

// AnilistClientManager manages per-profile AniList API clients.
// Each profile has its own AniList token stored in its per-profile database,
// and this manager lazily creates and caches clients keyed by profile ID.
//
// Profile ID 0 (or admin) falls back to the global App.AnilistClientRef.
type AnilistClientManager struct {
	clients   map[uint]anilist.AnilistClient
	usernames map[uint]string // cached viewer usernames per profile
	mu        sync.RWMutex

	// Per-profile collection cache (keyed by profileID). Protected by colMu.
	animeColCache map[uint]*profileAnimeCache
	mangaColCache map[uint]*profileMangaCache
	colMu         sync.RWMutex

	// Singleflight groups collapse concurrent fetches for the same profile
	// into one in-flight request so we never send duplicates to AniList.
	animeSfg singleflight.Group
	mangaSfg singleflight.Group

	app      *App
	logger   *zerolog.Logger
	cacheDir string

	// Disk-backed cache for offline resilience.
	fileCacher       *filecache.Cacher
	animeColBucket   filecache.PermanentBucket
	mangaColBucket   filecache.PermanentBucket

	// Per-profile pending-mutation queues. When a profile's progress update can't reach
	// AniList (API down / network outage), the update is queued here and replayed once the
	// API is reachable again, so the user's true last-watched episode is never lost.
	// The admin/global path already has this via the shared_platform cache layer; profile
	// clients are raw clients, so they need their own queues.
	pendingStores map[uint]*shared_platform.PendingMutationStore
	pendingMu     sync.Mutex
}

func NewAnilistClientManager(app *App) *AnilistClientManager {
	profileCacheDir := filepath.Join(app.Config.Cache.Dir, "profile-collections")
	fc, err := filecache.NewCacher(profileCacheDir)
	if err != nil {
		app.Logger.Warn().Err(err).Msg("anilist_client_manager: Failed to init disk cache, offline fallback disabled")
	}

	return &AnilistClientManager{
		clients:        make(map[uint]anilist.AnilistClient),
		usernames:      make(map[uint]string),
		animeColCache:  make(map[uint]*profileAnimeCache),
		mangaColCache:  make(map[uint]*profileMangaCache),
		app:            app,
		logger:         app.Logger,
		cacheDir:       app.AnilistCacheDir,
		fileCacher:     fc,
		animeColBucket: filecache.NewPermanentBucket("profile-anime-collection"),
		mangaColBucket: filecache.NewPermanentBucket("profile-manga-collection"),
		pendingStores:  make(map[uint]*shared_platform.PendingMutationStore),
	}
}

// getPendingStore lazily creates the per-profile pending-mutation queue. Each profile gets
// its own JSON file under a profile-scoped subdirectory of the AniList cache dir.
func (m *AnilistClientManager) getPendingStore(profileID uint) *shared_platform.PendingMutationStore {
	m.pendingMu.Lock()
	defer m.pendingMu.Unlock()
	if store, ok := m.pendingStores[profileID]; ok {
		return store
	}
	dir := filepath.Join(m.cacheDir, "pending-mutations", "profile-"+strconv.FormatUint(uint64(profileID), 10))
	store := shared_platform.NewPendingMutationStore(dir, m.logger)
	m.pendingStores[profileID] = store
	return store
}

// EnqueueProgressUpdate queues a progress update for a profile when AniList is unreachable.
// It is replayed automatically once the API becomes available again (see startPendingFlusher).
func (m *AnilistClientManager) EnqueueProgressUpdate(
	profileID uint,
	mediaID int,
	progress int,
	status *anilist.MediaListStatus,
	startedAt *anilist.FuzzyDateInput,
	completedAt *anilist.FuzzyDateInput,
) {
	if profileID == 0 {
		return // admin path already queues via the shared cache layer
	}
	mid := mediaID
	prog := progress
	m.getPendingStore(profileID).Enqueue(&shared_platform.PendingMutation{
		Kind:        shared_platform.PendingKindUpdateEntryProgress,
		MediaID:     &mid,
		Progress:    &prog,
		Status:      status,
		StartedAt:   startedAt,
		CompletedAt: completedAt,
	})
}

// EnqueueStatusUpdate queues a list-status change for a profile when AniList is unreachable,
// so it is replayed automatically once the API is available again.
//
// Only Status is set on the queued mutation: score, progress and dates are deliberately left
// nil so the replay uses the status-only mutation and can't overwrite them.
func (m *AnilistClientManager) EnqueueStatusUpdate(profileID uint, mediaID int, status anilist.MediaListStatus) {
	if profileID == 0 {
		return // admin path already queues via the shared cache layer
	}
	mid := mediaID
	st := status
	m.getPendingStore(profileID).Enqueue(&shared_platform.PendingMutation{
		Kind:    shared_platform.PendingKindUpdateEntry,
		MediaID: &mid,
		Status:  &st,
	})
}

// PendingProgressCount returns how many progress updates are queued for a profile.
func (m *AnilistClientManager) PendingProgressCount(profileID uint) int {
	if profileID == 0 {
		return 0
	}
	m.pendingMu.Lock()
	store, ok := m.pendingStores[profileID]
	m.pendingMu.Unlock()
	if !ok {
		// Touch the store so a queue persisted from a previous run is loaded/counted.
		store = m.getPendingStore(profileID)
	}
	return store.Len()
}

// FlushPending attempts to replay a profile's queued mutations against its AniList client.
func (m *AnilistClientManager) FlushPending(ctx context.Context, profileID uint) {
	if profileID == 0 {
		return
	}
	client := m.GetClient(profileID)
	if client == nil || !client.IsAuthenticated() {
		return
	}
	store := m.getPendingStore(profileID)
	if store.Len() == 0 {
		return
	}
	store.Flush(ctx, client)
	// Refresh the profile's cached collection so the UI reflects the synced progress.
	m.InvalidateAnimeCollection(profileID)
}

// loadPersistedStores scans the pending-mutations directory for profile queues persisted by a
// previous run and registers a store for each, so they are flushed even before any new enqueue.
func (m *AnilistClientManager) loadPersistedStores() {
	base := filepath.Join(m.cacheDir, "pending-mutations")
	entries, err := os.ReadDir(base)
	if err != nil {
		return // no persisted queues yet
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		const prefix = "profile-"
		if len(name) <= len(prefix) || name[:len(prefix)] != prefix {
			continue
		}
		id, err := strconv.ParseUint(name[len(prefix):], 10, 64)
		if err != nil {
			continue
		}
		_ = m.getPendingStore(uint(id)) // registers + lazily loads on first Len()
	}
}

// StartPendingFlusher launches a background goroutine that periodically retries every
// profile's queued progress updates. It stops when ctx is cancelled. Each flush stops at
// the first failure, so a still-down API simply leaves the queue for the next tick.
func (m *AnilistClientManager) StartPendingFlusher(ctx context.Context) {
	m.loadPersistedStores()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.pendingMu.Lock()
				ids := make([]uint, 0, len(m.pendingStores))
				for id, store := range m.pendingStores {
					if store.Len() > 0 {
						ids = append(ids, id)
					}
				}
				m.pendingMu.Unlock()
				for _, id := range ids {
					m.FlushPending(ctx, id)
				}
			}
		}
	}()
}

// GetClient returns the AniList client for the given profile.
// If profileID is 0, returns the global (admin) client.
// Lazily loads the token from the profile's database on first access.
func (m *AnilistClientManager) GetClient(profileID uint) anilist.AnilistClient {
	if profileID == 0 {
		return m.app.AnilistClientRef.Get()
	}

	// Only short-circuit on a cached AUTHENTICATED client. A cached unauthenticated
	// client may simply have been created before the profile's token was readable
	// (startup ordering after a crash/restart, transient DB error) — pinning that
	// state until the next restart made every AniList update fail with
	// "profile AniList account not authenticated" despite a valid linked token.
	// Instead, retry the token load whenever the cached client isn't authenticated.
	m.mu.RLock()
	if client, ok := m.clients[profileID]; ok && client.IsAuthenticated() {
		m.mu.RUnlock()
		return client
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if client, ok := m.clients[profileID]; ok && client.IsAuthenticated() {
		return client
	}

	// (Re)load token from profile's database
	token := ""
	profileDB, err := m.app.ProfileDatabaseManager.GetDatabase(profileID)
	if err != nil {
		m.logger.Error().Err(err).Uint("profileID", profileID).Msg("anilist_client_manager: Failed to get profile DB, returning unauthenticated client")
	} else {
		token = profileDB.GetAnilistToken()
	}

	if token == "" {
		// Keep (or cache) an unauthenticated client so callers get a usable object,
		// but the authenticated-only cache check above guarantees the token is
		// re-read from the DB on the next request.
		if client, ok := m.clients[profileID]; ok {
			return client
		}
		client := anilist.NewAnilistClient("", m.cacheDir)
		client.SetWSEventManager(m.app.WSEventManager)
		m.clients[profileID] = client
		return client
	}

	client := anilist.NewAnilistClient(token, m.cacheDir)
	client.SetWSEventManager(m.app.WSEventManager)
	m.clients[profileID] = client

	m.logger.Debug().Uint("profileID", profileID).Bool("authenticated", client.IsAuthenticated()).Msg("anilist_client_manager: Loaded client for profile")

	return client
}

// ResolveClientForWrites returns the AniList client that list updates (progress, status)
// should be written with, along with the profile it belongs to.
//
// Resolution order, most specific first:
//  1. The profile that initiated the action, if its AniList client is authenticated.
//  2. The only linked profile account, if exactly one profile has one.
//  3. The admin profile's linked account.
//  4. The global account client — this holds the owner's own AniList token from the
//     account row, so it is a valid write target on installs where the token was never
//     copied into a per-profile database. Without this step those setups reported
//     "not authenticated" on every update despite being visibly logged in.
//
// Returns (nil, 0) only when no AniList account is linked anywhere.
func (m *AnilistClientManager) ResolveClientForWrites(profileID uint) (anilist.AnilistClient, uint) {
	// Preferred: the profile that actually initiated playback.
	if profileID > 0 {
		if client := m.GetClient(profileID); client != nil && client.IsAuthenticated() {
			return client, profileID
		}
	}

	if m.app.ProfileManager != nil {
		profiles, err := m.app.ProfileManager.GetAllProfiles()
		if err != nil {
			m.logger.Warn().Err(err).Msg("anilist_client_manager: Failed to list profiles while resolving write client")
		}

		var linked []*Profile
		var admin *Profile
		for _, p := range profiles {
			if p == nil {
				continue
			}
			client := m.GetClient(p.ID)
			if client == nil || !client.IsAuthenticated() {
				continue
			}
			linked = append(linked, p)
			if p.IsAdmin && admin == nil {
				admin = p
			}
		}

		// Exactly one linked account — unambiguous, use it.
		if len(linked) == 1 {
			return m.GetClient(linked[0].ID), linked[0].ID
		}
		// Several linked accounts — the admin's is the owner's own account.
		if admin != nil {
			return m.GetClient(admin.ID), admin.ID
		}
	}

	// Last resort: the global account client (the owner's own AniList token).
	if m.app.AnilistClientRef != nil && m.app.AnilistClientRef.IsPresent() {
		if global := m.app.AnilistClientRef.Get(); global != nil && global.IsAuthenticated() {
			return global, 0
		}
	}

	return nil, 0
}

// UpdateClient creates a new AniList client with the given token for a profile
// and caches it. Called when a profile logs in to AniList.
func (m *AnilistClientManager) UpdateClient(profileID uint, token string) {
	client := anilist.NewAnilistClient(token, m.cacheDir)
	client.SetWSEventManager(m.app.WSEventManager)

	m.mu.Lock()
	m.clients[profileID] = client
	m.mu.Unlock()

	// If this is the admin profile, also update the global client ref
	// so background subsystems (auto-downloader, playback manager, etc.) use it
	if m.isAdminProfile(profileID) {
		m.app.UpdateAnilistClientToken(token)
	}

	// A fresh login is a good moment to flush any progress queued while logged out / offline.
	if client.IsAuthenticated() {
		go m.FlushPending(context.Background(), profileID)
	}

	m.logger.Info().Uint("profileID", profileID).Bool("authenticated", client.IsAuthenticated()).Msg("anilist_client_manager: Updated client for profile")
}

// RemoveClient removes a cached client for a profile.
// Called when a profile logs out or is deleted.
func (m *AnilistClientManager) RemoveClient(profileID uint) {
	m.mu.Lock()
	delete(m.clients, profileID)
	delete(m.usernames, profileID)
	m.mu.Unlock()
	m.InvalidateAnimeCollection(profileID)
	m.InvalidateMangaCollection(profileID)
}

// GetUsername returns the cached AniList username for a profile.
// On first call it queries the Viewer endpoint and caches the result.
// Returns empty string on failure.
func (m *AnilistClientManager) GetUsername(profileID uint) string {
	if profileID == 0 {
		return ""
	}

	m.mu.RLock()
	if name, ok := m.usernames[profileID]; ok {
		m.mu.RUnlock()
		return name
	}
	m.mu.RUnlock()

	client := m.GetClient(profileID)
	if !client.IsAuthenticated() {
		return ""
	}

	viewer, err := client.GetViewer(context.Background())
	if err != nil || viewer == nil || viewer.Viewer == nil {
		m.logger.Error().Err(err).Uint("profileID", profileID).Msg("anilist_client_manager: Failed to get viewer for profile")
		return ""
	}

	m.mu.Lock()
	m.usernames[profileID] = viewer.Viewer.Name
	m.mu.Unlock()

	m.logger.Debug().Uint("profileID", profileID).Str("username", viewer.Viewer.Name).Msg("anilist_client_manager: Cached username for profile")
	return viewer.Viewer.Name
}

// IsAuthenticated checks if the given profile has an authenticated AniList client.
func (m *AnilistClientManager) IsAuthenticated(profileID uint) bool {
	client := m.GetClient(profileID)
	return client.IsAuthenticated()
}

// isAdminProfile checks if a profile is an admin by looking it up in ProfileManager.
func (m *AnilistClientManager) isAdminProfile(profileID uint) bool {
	if m.app.ProfileManager == nil {
		return true // no profile system = single user = admin
	}
	profile, err := m.app.ProfileManager.GetProfile(profileID)
	if err != nil {
		return false
	}
	return profile.IsAdmin
}

// CloseAll clears all cached clients.
func (m *AnilistClientManager) CloseAll() {
	m.mu.Lock()
	m.clients = make(map[uint]anilist.AnilistClient)
	m.mu.Unlock()
}

// IsAniListUsernameUsedByOtherProfile checks all profiles (except excludeProfileID)
// to see if any already have the given AniList username linked.
// Returns the profile name that owns it, or empty string if unused.
func (m *AnilistClientManager) IsAniListUsernameUsedByOtherProfile(username string, excludeProfileID uint) string {
	if m.app.ProfileManager == nil || username == "" {
		return ""
	}
	profiles, err := m.app.ProfileManager.GetAllProfiles()
	if err != nil {
		return ""
	}
	for _, p := range profiles {
		if p.ID == excludeProfileID {
			continue
		}
		if p.AniListUsername != "" && p.AniListUsername == username {
			return p.Name
		}
	}
	return ""
}

// Warm pre-loads the AniList client for a given profile.
// Useful after app startup to ensure admin's client is cached.
func (m *AnilistClientManager) Warm(profileID uint) {
	_ = m.GetClient(profileID)
}

func init() {
	// Ensure AnilistClientManager implements the expected contract at compile time.
	// No interface to check against, but this prevents dead code elimination.
	_ = (*AnilistClientManager)(nil)
}

// GetAnimeCollection returns the cached anime collection for a profile, or fetches
// it from AniList if the cache is missing or expired. Concurrent calls for the same
// profileID are collapsed into a single in-flight HTTP request via singleflight.
// On successful fetch the collection is persisted to disk so it can be served when
// the AniList API is unreachable (offline / internet outage).
func (m *AnilistClientManager) GetAnimeCollection(profileID uint) (*anilist.AnimeCollection, error) {
	// Fast path: return from cache if still fresh.
	m.colMu.RLock()
	if entry, ok := m.animeColCache[profileID]; ok && time.Since(entry.fetchedAt) < profileCollectionCacheTTL {
		col := entry.data
		m.colMu.RUnlock()
		return col, nil
	}
	m.colMu.RUnlock()

	// Slow path: fetch (deduplicated per profileID).
	key := fmt.Sprintf("anime-%d", profileID)
	result, err, _ := m.animeSfg.Do(key, func() (interface{}, error) {
		client := m.GetClient(profileID)
		if !client.IsAuthenticated() {
			// Serve the last known collection rather than nothing: a token that is
			// momentarily unreadable must not empty the user's library.
			if diskCol := m.loadAnimeCollectionFromDisk(profileID); diskCol != nil {
				m.logger.Warn().Uint("profileID", profileID).Msg("anilist_client_manager: Not authenticated, serving anime collection from disk cache")
				return diskCol, nil
			}
			return nil, anilist.ErrNotAuthenticated
		}
		// GetUsername performs a Viewer request, so it fails on a rate limit or a network
		// blip. Falling through to the disk cache here keeps the library populated; without
		// it this path bypassed the offline fallback entirely and returned an error.
		username := m.GetUsername(profileID)
		if username == "" {
			if diskCol := m.loadAnimeCollectionFromDisk(profileID); diskCol != nil {
				m.logger.Warn().Uint("profileID", profileID).Msg("anilist_client_manager: No username, serving anime collection from disk cache")
				return diskCol, nil
			}
			return nil, errors.New("anilist: no username for profile")
		}
		col, err := client.AnimeCollection(context.Background(), &username)
		if err != nil {
			// Network/API failed — try disk cache.
			if diskCol := m.loadAnimeCollectionFromDisk(profileID); diskCol != nil {
				m.logger.Info().Uint("profileID", profileID).Msg("anilist_client_manager: Serving anime collection from disk cache (API unreachable)")
				m.colMu.Lock()
				m.animeColCache[profileID] = &profileAnimeCache{data: diskCol, fetchedAt: time.Now()}
				m.colMu.Unlock()
				return diskCol, nil
			}
			return nil, err
		}
		// Filter out custom lists (lists whose status is nil) to match platform behaviour.
		if col != nil && col.MediaListCollection != nil {
			lists := col.MediaListCollection.Lists
			filtered := make([]*anilist.AnimeCollection_MediaListCollection_Lists, 0, len(lists))
			for _, l := range lists {
				if l.Status != nil {
					filtered = append(filtered, l)
				}
			}
			col.MediaListCollection.Lists = filtered
		}
		m.colMu.Lock()
		m.animeColCache[profileID] = &profileAnimeCache{data: col, fetchedAt: time.Now()}
		m.colMu.Unlock()
		// Write-through to disk for offline resilience.
		m.saveAnimeCollectionToDisk(profileID, col)
		return col, nil
	})
	if err != nil {
		return nil, err
	}
	return result.(*anilist.AnimeCollection), nil
}

// InvalidateAnimeCollection evicts the in-memory cached anime collection for a
// profile so the next call fetches fresh data. The disk cache is intentionally
// kept as a safety net for offline scenarios.
func (m *AnilistClientManager) InvalidateAnimeCollection(profileID uint) {
	m.colMu.Lock()
	delete(m.animeColCache, profileID)
	m.colMu.Unlock()
}

// saveAnimeCollectionToDisk persists the collection to the file cache.
func (m *AnilistClientManager) saveAnimeCollectionToDisk(profileID uint, col *anilist.AnimeCollection) {
	if m.fileCacher == nil || col == nil {
		return
	}
	diskKey := "profile-" + strconv.FormatUint(uint64(profileID), 10)
	if err := m.fileCacher.SetPerm(m.animeColBucket, diskKey, col); err != nil {
		m.logger.Warn().Err(err).Uint("profileID", profileID).Msg("anilist_client_manager: Failed to persist anime collection to disk")
	}
}

// loadAnimeCollectionFromDisk loads a previously cached collection from disk.
func (m *AnilistClientManager) loadAnimeCollectionFromDisk(profileID uint) *anilist.AnimeCollection {
	if m.fileCacher == nil {
		return nil
	}
	diskKey := "profile-" + strconv.FormatUint(uint64(profileID), 10)
	var col anilist.AnimeCollection
	found, err := m.fileCacher.GetPerm(m.animeColBucket, diskKey, &col)
	if err != nil || !found {
		return nil
	}
	return &col
}

// GetMangaCollection returns the cached manga collection for a profile, or fetches
// it from AniList if the cache is missing or expired. Concurrent calls are collapsed
// into a single in-flight request via singleflight.
// On successful fetch the collection is persisted to disk for offline resilience.
func (m *AnilistClientManager) GetMangaCollection(profileID uint) (*anilist.MangaCollection, error) {
	// Fast path.
	m.colMu.RLock()
	if entry, ok := m.mangaColCache[profileID]; ok && time.Since(entry.fetchedAt) < profileMangaCollectionCacheTTL {
		col := entry.data
		m.colMu.RUnlock()
		return col, nil
	}
	m.colMu.RUnlock()

	// Slow path.
	key := fmt.Sprintf("manga-%d", profileID)
	result, err, _ := m.mangaSfg.Do(key, func() (interface{}, error) {
		client := m.GetClient(profileID)
		if !client.IsAuthenticated() {
			return nil, anilist.ErrNotAuthenticated
		}
		username := m.GetUsername(profileID)
		if username == "" {
			return nil, errors.New("anilist: no username for profile")
		}
		col, err := client.MangaCollection(context.Background(), &username)
		if err != nil {
			// Network/API failed — try disk cache.
			if diskCol := m.loadMangaCollectionFromDisk(profileID); diskCol != nil {
				m.logger.Info().Uint("profileID", profileID).Msg("anilist_client_manager: Serving manga collection from disk cache (API unreachable)")
				m.colMu.Lock()
				m.mangaColCache[profileID] = &profileMangaCache{data: diskCol, fetchedAt: time.Now()}
				m.colMu.Unlock()
				return diskCol, nil
			}
			return nil, err
		}
		// Filter out custom lists and novels to match platform behaviour.
		if col != nil && col.MediaListCollection != nil {
			lists := col.MediaListCollection.Lists
			filtered := make([]*anilist.MangaCollection_MediaListCollection_Lists, 0, len(lists))
			for _, l := range lists {
				if l.Status != nil {
					filtered = append(filtered, l)
				}
			}
			col.MediaListCollection.Lists = filtered
		}
		m.colMu.Lock()
		m.mangaColCache[profileID] = &profileMangaCache{data: col, fetchedAt: time.Now()}
		m.colMu.Unlock()
		// Write-through to disk for offline resilience.
		m.saveMangaCollectionToDisk(profileID, col)
		return col, nil
	})
	if err != nil {
		return nil, err
	}
	return result.(*anilist.MangaCollection), nil
}

// InvalidateMangaCollection evicts the in-memory cached manga collection for a
// profile. The disk cache is intentionally kept as a safety net for offline scenarios.
func (m *AnilistClientManager) InvalidateMangaCollection(profileID uint) {
	m.colMu.Lock()
	delete(m.mangaColCache, profileID)
	m.colMu.Unlock()
}

// saveMangaCollectionToDisk persists the collection to the file cache.
func (m *AnilistClientManager) saveMangaCollectionToDisk(profileID uint, col *anilist.MangaCollection) {
	if m.fileCacher == nil || col == nil {
		return
	}
	diskKey := "profile-" + strconv.FormatUint(uint64(profileID), 10)
	if err := m.fileCacher.SetPerm(m.mangaColBucket, diskKey, col); err != nil {
		m.logger.Warn().Err(err).Uint("profileID", profileID).Msg("anilist_client_manager: Failed to persist manga collection to disk")
	}
}

// loadMangaCollectionFromDisk loads a previously cached manga collection from disk.
func (m *AnilistClientManager) loadMangaCollectionFromDisk(profileID uint) *anilist.MangaCollection {
	if m.fileCacher == nil {
		return nil
	}
	diskKey := "profile-" + strconv.FormatUint(uint64(profileID), 10)
	var col anilist.MangaCollection
	found, err := m.fileCacher.GetPerm(m.mangaColBucket, diskKey, &col)
	if err != nil || !found {
		return nil
	}
	return &col
}

// String returns a debug representation.
func (m *AnilistClientManager) String() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return fmt.Sprintf("AnilistClientManager{profiles=%d}", len(m.clients))
}
