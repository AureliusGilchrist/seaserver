package core

import (
	"fmt"
	"os"
	"seanime/internal/database/db"
	"sync"

	"github.com/rs/zerolog"
)

// ProfileDatabaseManager manages per-profile database connections.
// Each profile gets its own seanime.db at profiles/{id}/seanime.db.
// Connections are lazily opened and cached for the lifetime of the process.
type ProfileDatabaseManager struct {
	profileManager *ProfileManager
	logger         *zerolog.Logger
	fallbackDB     *db.Database // Global DB used when no profile is active

	mu    sync.RWMutex
	conns map[uint]*db.Database // profileID -> open database connection
}

// NewProfileDatabaseManager creates a new manager.
// fallbackDB is the default database used when profiles are not active or no profile context exists.
func NewProfileDatabaseManager(pm *ProfileManager, fallbackDB *db.Database, logger *zerolog.Logger) *ProfileDatabaseManager {
	return &ProfileDatabaseManager{
		profileManager: pm,
		logger:         logger,
		fallbackDB:     fallbackDB,
		conns:          make(map[uint]*db.Database),
	}
}

// GetDatabase returns the database for the given profile ID.
// If profileID is 0 or the profile system is not active, returns the fallback (global) database.
// The connection is cached and reused on subsequent calls.
func (m *ProfileDatabaseManager) GetDatabase(profileID uint) (*db.Database, error) {
	if profileID == 0 || m.profileManager == nil || !m.profileManager.HasProfiles() {
		return m.fallbackDB, nil
	}

	// Fast path: check if already open
	m.mu.RLock()
	if conn, ok := m.conns[profileID]; ok {
		m.mu.RUnlock()
		return conn, nil
	}
	m.mu.RUnlock()

	// Slow path: open a new connection
	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if conn, ok := m.conns[profileID]; ok {
		return conn, nil
	}

	dbPath := m.profileManager.GetProfileDBPath(profileID)

	// Ensure the profile directory exists
	profileDir := m.profileManager.GetProfileDir(profileID)
	if err := os.MkdirAll(profileDir, 0700); err != nil {
		return nil, fmt.Errorf("profile_db: failed to create profile dir for %d: %w", profileID, err)
	}

	// Open the per-profile database (this will also auto-migrate tables)
	database, err := db.NewDatabase(profileDir, "seanime", m.logger)
	if err != nil {
		return nil, fmt.Errorf("profile_db: failed to open database for profile %d: %w", profileID, err)
	}

	m.conns[profileID] = database
	m.logger.Info().Uint("profileID", profileID).Str("path", dbPath).Msg("profile_db: Opened per-profile database")

	return database, nil
}

// GetFallbackDatabase returns the global fallback database.
func (m *ProfileDatabaseManager) GetFallbackDatabase() *db.Database {
	return m.fallbackDB
}

// GetAllOpenDatabases returns all currently open per-profile database connections.
// Used by cron jobs to perform maintenance across all active profiles.
func (m *ProfileDatabaseManager) GetAllOpenDatabases() []*db.Database {
	m.mu.RLock()
	defer m.mu.RUnlock()

	dbs := make([]*db.Database, 0, len(m.conns))
	for _, conn := range m.conns {
		dbs = append(dbs, conn)
	}
	return dbs
}

// CloseProfile closes and removes the cached connection for a specific profile.
// Called when a profile is deleted.
func (m *ProfileDatabaseManager) CloseProfile(profileID uint) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, ok := m.conns[profileID]; ok {
		if sqlDB, err := conn.Gorm().DB(); err == nil {
			_ = sqlDB.Close()
		}
		delete(m.conns, profileID)
		m.logger.Info().Uint("profileID", profileID).Msg("profile_db: Closed per-profile database")
	}
}

// CloseAll closes all cached per-profile database connections.
// Called during app shutdown.
func (m *ProfileDatabaseManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, conn := range m.conns {
		if sqlDB, err := conn.Gorm().DB(); err == nil {
			_ = sqlDB.Close()
		}
		m.logger.Debug().Uint("profileID", id).Msg("profile_db: Closed per-profile database on shutdown")
	}
	m.conns = make(map[uint]*db.Database)
}

// MigrateExistingDataToProfile copies reading history and watch history from the global
// database to the specified profile's database. Used during initial migration to assign
// pre-existing data to the admin profile.
func (m *ProfileDatabaseManager) MigrateExistingDataToProfile(profileID uint) error {
	profileDB, err := m.GetDatabase(profileID)
	if err != nil {
		return fmt.Errorf("profile_db: failed to get profile database for migration: %w", err)
	}

	globalDB := m.fallbackDB

	// Migrate MangaReadingHistory
	var readingHistory []map[string]interface{}
	if err := globalDB.Gorm().Table("manga_reading_histories").Find(&readingHistory).Error; err == nil && len(readingHistory) > 0 {
		for _, entry := range readingHistory {
			// Use Save to handle potential conflicts
			profileDB.Gorm().Table("manga_reading_histories").Create(entry)
		}
		m.logger.Info().Uint("profileID", profileID).Int("count", len(readingHistory)).Msg("profile_db: Migrated manga reading history")
	}

	// Migrate Account (AniList token)
	var accounts []map[string]interface{}
	if err := globalDB.Gorm().Table("accounts").Find(&accounts).Error; err == nil && len(accounts) > 0 {
		for _, account := range accounts {
			profileDB.Gorm().Table("accounts").Create(account)
		}
		m.logger.Info().Uint("profileID", profileID).Int("count", len(accounts)).Msg("profile_db: Migrated account data")
	}

	return nil
}
