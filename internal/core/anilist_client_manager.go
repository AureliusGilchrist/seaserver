package core

import (
	"fmt"
	"seanime/internal/api/anilist"
	"sync"

	"github.com/rs/zerolog"
)

// AnilistClientManager manages per-profile AniList API clients.
// Each profile has its own AniList token stored in its per-profile database,
// and this manager lazily creates and caches clients keyed by profile ID.
//
// Profile ID 0 (or admin) falls back to the global App.AnilistClientRef.
type AnilistClientManager struct {
	clients  map[uint]anilist.AnilistClient
	mu       sync.RWMutex
	app      *App
	logger   *zerolog.Logger
	cacheDir string
}

func NewAnilistClientManager(app *App) *AnilistClientManager {
	return &AnilistClientManager{
		clients:  make(map[uint]anilist.AnilistClient),
		app:      app,
		logger:   app.Logger,
		cacheDir: app.AnilistCacheDir,
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
	m.mu.Unlock()
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

// String returns a debug representation.
func (m *AnilistClientManager) String() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return fmt.Sprintf("AnilistClientManager{profiles=%d}", len(m.clients))
}
