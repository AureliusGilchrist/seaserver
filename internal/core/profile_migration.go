package core

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/rs/zerolog"
)

// MigrationStatus tracks the state of the single-user → multi-profile migration.
type MigrationStatus struct {
	NeedsMigration bool   `json:"needsMigration"`
	Step           string `json:"step"`           // current step description
	Progress       int    `json:"progress"`       // 0-100
	Error          string `json:"error,omitempty"` // if migration failed
	Complete       bool   `json:"complete"`
}

// ProfileMigrator handles migrating an existing single-user installation to the
// multi-profile directory structure.
type ProfileMigrator struct {
	oldDataDir string // existing data dir (e.g. ~/.config/Seanime or ./data/)
	newDataDir string // new data dir root where profiles.db and profiles/ live
	logger     *zerolog.Logger
	mu         sync.Mutex
	status     MigrationStatus
}

func NewProfileMigrator(oldDataDir, newDataDir string, logger *zerolog.Logger) *ProfileMigrator {
	return &ProfileMigrator{
		oldDataDir: oldDataDir,
		newDataDir: newDataDir,
		logger:     logger,
	}
}

// NeedsMigration checks if there's an old seanime.db at the root data dir
// that hasn't been migrated yet.
func (m *ProfileMigrator) NeedsMigration() bool {
	markerPath := filepath.Join(m.newDataDir, ".profiles_migrated")
	if _, err := os.Stat(markerPath); err == nil {
		return false // already migrated
	}

	// Check if old DB exists at the root data dir
	oldDB := filepath.Join(m.oldDataDir, "seanime.db")
	if _, err := os.Stat(oldDB); err == nil {
		return true
	}
	return false
}

// GetStatus returns the current migration status.
func (m *ProfileMigrator) GetStatus() MigrationStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}

func (m *ProfileMigrator) setStatus(step string, progress int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status.Step = step
	m.status.Progress = progress
	m.status.NeedsMigration = true
}

func (m *ProfileMigrator) setError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status.Error = err.Error()
}

// RunMigration executes the full migration to move the old single-user data into
// the first admin profile. This is called from the migration wizard API endpoint.
// profileName and pin are provided by the user through the wizard UI.
func (m *ProfileMigrator) RunMigration(pm *ProfileManager, profileName string, pin string) error {
	m.mu.Lock()
	m.status = MigrationStatus{NeedsMigration: true}
	m.mu.Unlock()

	m.logger.Info().Msg("migration: Starting single-user → multi-profile migration")

	// Step 1: Create the first admin profile
	m.setStatus("Creating admin profile...", 10)
	profile, err := pm.CreateProfile(profileName, pin, true)
	if err != nil {
		m.setError(err)
		return fmt.Errorf("migration: failed to create admin profile: %w", err)
	}
	m.logger.Info().Uint("profileID", profile.ID).Msg("migration: Created admin profile")

	profileDir := pm.GetProfileDir(profile.ID)

	// Step 2: Copy seanime.db → profiles/<id>/seanime.db
	m.setStatus("Migrating database...", 25)
	oldDB := filepath.Join(m.oldDataDir, "seanime.db")
	newDB := filepath.Join(profileDir, "seanime.db")
	if err := copyFile(oldDB, newDB); err != nil {
		m.setError(err)
		return fmt.Errorf("migration: failed to copy database: %w", err)
	}
	// Also copy WAL and SHM files if they exist
	for _, suffix := range []string{"-wal", "-shm"} {
		src := oldDB + suffix
		if _, err := os.Stat(src); err == nil {
			_ = copyFile(src, newDB+suffix)
		}
	}
	m.logger.Info().Msg("migration: Database copied")

	// Step 3: Copy cache directory
	m.setStatus("Migrating cache...", 45)
	oldCache := filepath.Join(m.oldDataDir, "cache")
	newCache := filepath.Join(profileDir, "cache")
	if dirExists(oldCache) {
		if err := copyDir(oldCache, newCache); err != nil {
			m.logger.Warn().Err(err).Msg("migration: Failed to copy cache (non-fatal)")
		}
	}

	// Step 4: Copy logs
	m.setStatus("Migrating logs...", 55)
	oldLogs := filepath.Join(m.oldDataDir, "logs")
	newLogs := filepath.Join(profileDir, "logs")
	if dirExists(oldLogs) {
		if err := copyDir(oldLogs, newLogs); err != nil {
			m.logger.Warn().Err(err).Msg("migration: Failed to copy logs (non-fatal)")
		}
	}

	// Step 5: Move extensions to shared
	m.setStatus("Migrating extensions to shared...", 65)
	oldExtensions := filepath.Join(m.oldDataDir, "extensions")
	sharedExtensions := pm.GetSharedExtensionsDir()
	if dirExists(oldExtensions) {
		if err := copyDir(oldExtensions, sharedExtensions); err != nil {
			m.logger.Warn().Err(err).Msg("migration: Failed to copy extensions (non-fatal)")
		}
	}

	// Step 6: Copy offline data
	m.setStatus("Migrating offline data...", 75)
	oldOffline := filepath.Join(m.oldDataDir, "offline")
	newOffline := filepath.Join(profileDir, "offline")
	if dirExists(oldOffline) {
		if err := copyDir(oldOffline, newOffline); err != nil {
			m.logger.Warn().Err(err).Msg("migration: Failed to copy offline data (non-fatal)")
		}
	}

	// Step 7: Copy assets
	m.setStatus("Migrating assets...", 85)
	oldAssets := filepath.Join(m.oldDataDir, "assets")
	newAssets := filepath.Join(profileDir, "assets")
	if dirExists(oldAssets) {
		if err := copyDir(oldAssets, newAssets); err != nil {
			m.logger.Warn().Err(err).Msg("migration: Failed to copy assets (non-fatal)")
		}
	}

	// Step 8: Write migration marker
	m.setStatus("Finalizing...", 95)
	markerPath := filepath.Join(m.newDataDir, ".profiles_migrated")
	if err := os.WriteFile(markerPath, []byte(fmt.Sprintf("migrated_at=%d\nprofile_id=%d\n", 
		profile.CreatedAt.Unix(), profile.ID)), 0644); err != nil {
		m.setError(err)
		return fmt.Errorf("migration: failed to write marker: %w", err)
	}

	m.mu.Lock()
	m.status.Step = "Migration complete"
	m.status.Progress = 100
	m.status.Complete = true
	m.mu.Unlock()

	m.logger.Info().Uint("profileID", profile.ID).Msg("migration: Migration completed successfully")
	return nil
}

// SkipMigration marks migration as complete without moving any data.
// Used when this is a fresh install with no existing data.
func (m *ProfileMigrator) SkipMigration() error {
	markerPath := filepath.Join(m.newDataDir, ".profiles_migrated")
	return os.WriteFile(markerPath, []byte("fresh_install=true\n"), 0644)
}

// ──────────────────────────────────────────────
// File/directory helpers
// ──────────────────────────────────────────────

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0700); err != nil {
		return err
	}

	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	srcInfo, err := srcFile.Stat()
	if err != nil {
		return err
	}
	if srcInfo.IsDir() {
		return errors.New("source is a directory")
	}

	dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return err
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	return err
}

func copyDir(src, dst string) error {
	srcInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !srcInfo.IsDir() {
		return errors.New("source is not a directory")
	}

	if err := os.MkdirAll(dst, srcInfo.Mode()); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(srcPath, dstPath); err != nil {
				return err
			}
		}
	}
	return nil
}
