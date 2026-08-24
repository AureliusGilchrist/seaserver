package kitsu_platform

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"seanime/internal/api/kitsu"
	"seanime/internal/database/models"
)

// KitsuClientManager is the top-level wiring that the rest of the app talks to when it wants
// Kitsu data. One instance lives on the App struct for the server lifecycle.
//
// It owns:
//   - the shared "planning-slut" Kitsu account (a.k.a. the data grabber's Kitsu sibling);
//   - the per-profile authenticated Kitsu clients, looked up by `profileID`.
//
// Locking strategy: a single RWMutex guarding both maps. We expect a tiny constant number of
// profiles and a single shared account, so write traffic is rare. Keeping one lock avoids the
// foot-gun of two locks that might consistently be taken in the wrong order.
type KitsuClientManager struct {
	DB dber

	mu sync.RWMutex

	// sharedPlanningSlut is the server-wide planning-slut Kitsu account. May be nil when not set.
	sharedPlanningSlut *KitsuPlatform

	// profilePlatforms maps a profileID to its per-user KitsuPlatform. Lazily constructed on
	// first access and destroyed when the account is unlinked.
	profilePlatforms map[uint]*KitsuPlatform

	// mappingResolver is the shared resolver used to populate KitsuIDMapping rows. Lazily
	// installed by SetDatabase — nil before that, but the manager never builds a platform
	// before SetDatabase so the order is safe.
	mappingResolver *MappingResolver
}

// dber is the minimal slice of *db.Database the manager needs. Decoupling via this interface lets
// tests inject a fake without dragging the whole db package into fixtures.
type dber interface {
	GetKitsuPlanningSlut() (*models.KitsuPlanningSlut, error)
	SaveKitsuPlanningSlut(in *models.KitsuPlanningSlut) (*models.KitsuPlanningSlut, error)
	DeleteKitsuPlanningSlut() error
	GetKitsuAccountByProfileID(profileID uint) (*models.KitsuAccount, error)
	SaveKitsuAccount(in *models.KitsuAccount) (*models.KitsuAccount, error)
	DeleteKitsuAccount(profileID uint) error
	// Mapping-table accessors — also used by the MappingResolver so a `*db.Database` satisfies
	// both SourceDB and dber at the same time.
	GetKitsuMappingByKitsuID(kitsuID string) (*models.KitsuIDMapping, error)
	UpsertKitsuIDMapping(m *models.KitsuIDMapping) (*models.KitsuIDMapping, error)
}

// NewKitsuClientManager constructs an empty manager. The shared planning-slut account is not
// loaded until SetDatabase + LoadPlanningSlut are called, mirroring the AniList side's runtime
// hydration.
func NewKitsuClientManager() *KitsuClientManager {
	return &KitsuClientManager{
		profilePlatforms: make(map[uint]*KitsuPlatform),
	}
}

// SetDatabase attaches the underlying SQLite handle. Calling it twice replaces (the previous ref).
func (m *KitsuClientManager) SetDatabase(database dber) {
	m.mu.Lock()
	m.DB = database
	m.mu.Unlock()
}

// SetMappingResolver wires a shared resolver onto the manager. Subsequent platform creations
// pick it up automatically. Calling with nil removes the resolver.
func (m *KitsuClientManager) SetMappingResolver(r *MappingResolver) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mappingResolver = r
	if r != nil {
		r.Install()
	}
}

// attachMappingSource connects a freshly-built platform to the shared mapping resolver. The
// helper is a no-op until SetMappingResolver has run — before that, library fetches still
// return the rows, just without populating the mapping table.
func (m *KitsuClientManager) attachMappingSource(p *KitsuPlatform) {
	if p == nil {
		return
	}
	m.mu.RLock()
	r := m.mappingResolver
	m.mu.RUnlock()
	if r == nil {
		return
	}
	src := &MappingSource{
		DB:       m.DB,
		Client:   p.Client,
		Resolver: r,
	}
	p.SetMappingSource(src)
}

// LoadPlanningSlut hydrates the shared planning-slut account from the database. Returns nil when
// no row exists or the database is nil, so callers can fall back to AniList or surface an
// "unconfigured" state.
func (m *KitsuClientManager) LoadPlanningSlut() (*KitsuPlatform, error) {
	if m.DB == nil {
		return nil, nil
	}
	row, err := m.DB.GetKitsuPlanningSlut()
	if err != nil {
		return nil, fmt.Errorf("kitsu: load planning slut: %w", err)
	}
	if row == nil {
		m.mu.Lock()
		m.sharedPlanningSlut = nil
		m.mu.Unlock()
		return nil, nil
	}
	platform := NewKitsuPlatform(KitsuPlatformOptions{
		Token:        row.Token,
		RefreshToken: row.RefreshToken,
		Username:     row.Username,
		UserID:       row.UserID,
	})
	m.attachMappingSource(platform)
	m.mu.Lock()
	m.sharedPlanningSlut = platform
	m.mu.Unlock()
	return platform, nil
}

// SavePlanningSlut writes a token row and refreshes the in-memory client. Returns the constructed
// platform so handlers can immediately read the viewer record without a round trip.
func (m *KitsuClientManager) SavePlanningSlut(account *models.KitsuPlanningSlut) (*KitsuPlatform, error) {
	if account == nil || account.Token == "" {
		return nil, errors.New("kitsu: planning-slut account missing token")
	}
	if m.DB == nil {
		return nil, errors.New("kitsu: database not attached")
	}
	if _, err := m.DB.SaveKitsuPlanningSlut(account); err != nil {
		return nil, fmt.Errorf("kitsu: save planning slut: %w", err)
	}
	platform := NewKitsuPlatform(KitsuPlatformOptions{
		Token:        account.Token,
		RefreshToken: account.RefreshToken,
		Username:     account.Username,
		UserID:       account.UserID,
	})
	m.attachMappingSource(platform)
	m.mu.Lock()
	m.sharedPlanningSlut = platform
	m.mu.Unlock()
	return platform, nil
}

// DeletePlanningSlut clears the row from the database and pin-the in-memory pointer to nil.
func (m *KitsuClientManager) DeletePlanningSlut() error {
	if m.DB == nil {
		return nil
	}
	if err := m.DB.DeleteKitsuPlanningSlut(); err != nil {
		return fmt.Errorf("kitsu: delete planning slut: %w", err)
	}
	m.mu.Lock()
	m.sharedPlanningSlut = nil
	m.mu.Unlock()
	return nil
}

// GetPlanningSlut returns the currently loaded planning-slut platform, or nil if none is bound.
func (m *KitsuClientManager) GetPlanningSlut() *KitsuPlatform {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sharedPlanningSlut
}

// HasPlanningSlut is a tiny convenience for handlers that only need to know whether a planning
// slut account is currently bound.
func (m *KitsuClientManager) HasPlanningSlut() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sharedPlanningSlut != nil
}

// LoadProfileAccount hydrates the per-profile Kitsu account from the DB into a platform. Re-running
// this on top of an existing entry refreshes the cached platform with the latest token row.
func (m *KitsuClientManager) LoadProfileAccount(profileID uint) (*KitsuPlatform, error) {
	if m.DB == nil {
		return nil, nil
	}
	row, err := m.DB.GetKitsuAccountByProfileID(profileID)
	if err != nil {
		return nil, fmt.Errorf("kitsu: load profile account %d: %w", profileID, err)
	}
	if row == nil {
		m.mu.Lock()
		delete(m.profilePlatforms, profileID)
		m.mu.Unlock()
		return nil, nil
	}
	platform := NewKitsuPlatform(KitsuPlatformOptions{
		Token:        row.Token,
		RefreshToken: row.RefreshToken,
		Username:     row.Username,
		UserID:       row.UserID,
	})
	m.attachMappingSource(platform)
	m.mu.Lock()
	m.profilePlatforms[profileID] = platform
	m.mu.Unlock()
	return platform, nil
}

// SaveProfileAccount persists a per-profile token and updates the in-memory platform.
func (m *KitsuClientManager) SaveProfileAccount(account *models.KitsuAccount) (*KitsuPlatform, error) {
	if account == nil || account.ProfileID == 0 || account.Token == "" {
		return nil, errors.New("kitsu: profile account missing profile id or token")
	}
	if m.DB == nil {
		return nil, errors.New("kitsu: database not attached")
	}
	if _, err := m.DB.SaveKitsuAccount(account); err != nil {
		return nil, fmt.Errorf("kitsu: save profile account: %w", err)
	}
	platform := NewKitsuPlatform(KitsuPlatformOptions{
		Token:        account.Token,
		RefreshToken: account.RefreshToken,
		Username:     account.Username,
		UserID:       account.UserID,
	})
	m.attachMappingSource(platform)
	m.mu.Lock()
	m.profilePlatforms[account.ProfileID] = platform
	m.mu.Unlock()
	return platform, nil
}

// DeleteProfileAccount removes a per-profile account from storage and memory.
func (m *KitsuClientManager) DeleteProfileAccount(profileID uint) error {
	if m.DB == nil {
		return nil
	}
	if err := m.DB.DeleteKitsuAccount(profileID); err != nil {
		return fmt.Errorf("kitsu: delete profile account: %w", err)
	}
	m.mu.Lock()
	delete(m.profilePlatforms, profileID)
	m.mu.Unlock()
	return nil
}

// GetProfileAccount returns the in-memory platform, hydrating from the DB on first access.
func (m *KitsuClientManager) GetProfileAccount(profileID uint) (*KitsuPlatform, error) {
	m.mu.RLock()
	if p, ok := m.profilePlatforms[profileID]; ok && p != nil {
		m.mu.RUnlock()
		return p, nil
	}
	m.mu.RUnlock()
	return m.LoadProfileAccount(profileID)
}

// RefreshAllTokens iterates over every bound platform and triggers a token refresh.
//
// Errors from individual platforms are swallowed: the platform's own Refresh hook emits a
// KitsuTokenExpired event when an underlying token is gone, and the next SaveToken call will
// heal the row. This function exists so cron-style startup can call it without needing to know
// the list.
func (m *KitsuClientManager) RefreshAllTokens() {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.sharedPlanningSlut != nil {
		cfg := kitsu.DefaultOAuthConfig()
		rt := m.sharedPlanningSlut.RefreshToken
		if rt != "" {
			_, _ = m.sharedPlanningSlut.Client.RefreshAccessToken(context.Background(), cfg, rt)
		}
	}
}

// ClearProfileCache is called from the profile-settings handler when the user signs out. It
// discards the in-memory platform without deleting the persisted row, which lets the next
// LoadProfileAccount call rebuild with fresh state if the user signs back in.
func (m *KitsuClientManager) ClearProfileCache(profileID uint) {
	m.mu.Lock()
	delete(m.profilePlatforms, profileID)
	m.mu.Unlock()
}
