package core

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/util/filecache"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"golang.org/x/sync/singleflight"
)

// profileCollectionCacheTTL controls how long a per-profile collection is
// served from memory before a fresh fetch is triggered.
const profileCollectionCacheTTL = 5 * time.Minute

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
	}
}

// GetClient returns the AniList client for the given profile.
// If profileID is 0, returns the global (admin) client.
// Lazily loads the token from the profile's database on first access.
func (m *AnilistClientManager) GetClient(profileID uint) anilist.AnilistClient {
	if profileID == 0 {
		return m.app.AnilistClientRef.Get()
	}

	m.mu.RLock()
	if client, ok := m.clients[profileID]; ok {
		m.mu.RUnlock()
		return client
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if client, ok := m.clients[profileID]; ok {
		return client
	}

	// Load token from profile's database
	profileDB, err := m.app.ProfileDatabaseManager.GetDatabase(profileID)
	if err != nil {
		m.logger.Error().Err(err).Uint("profileID", profileID).Msg("anilist_client_manager: Failed to get profile DB, returning unauthenticated client")
		client := anilist.NewAnilistClient("", m.cacheDir)
		m.clients[profileID] = client
		return client
	}
	token := profileDB.GetAnilistToken()

	client := anilist.NewAnilistClient(token, m.cacheDir)
	m.clients[profileID] = client

	m.logger.Debug().Uint("profileID", profileID).Bool("authenticated", client.IsAuthenticated()).Msg("anilist_client_manager: Loaded client for profile")

	return client
}

// UpdateClient creates a new AniList client with the given token for a profile
// and caches it. Called when a profile logs in to AniList.
func (m *AnilistClientManager) UpdateClient(profileID uint, token string) {
	client := anilist.NewAnilistClient(token, m.cacheDir)

	m.mu.Lock()
	m.clients[profileID] = client
	m.mu.Unlock()

	// If this is the admin profile, also update the global client ref
	// so background subsystems (auto-downloader, playback manager, etc.) use it
	if m.isAdminProfile(profileID) {
		m.app.UpdateAnilistClientToken(token)
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
			return nil, anilist.ErrNotAuthenticated
		}
		username := m.GetUsername(profileID)
		if username == "" {
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
	if entry, ok := m.mangaColCache[profileID]; ok && time.Since(entry.fetchedAt) < profileCollectionCacheTTL {
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
