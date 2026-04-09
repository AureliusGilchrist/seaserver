package core

import (
	"path/filepath"
)

// ProfilePathResolver provides profile-aware path resolution.
// When profiles are active, extensions and manga use shared directories,
// while database, cache, and logs use per-profile directories.
type ProfilePathResolver struct {
	profileManager *ProfileManager
	baseDataDir    string
}

// NewProfilePathResolver creates a new path resolver.
func NewProfilePathResolver(pm *ProfileManager, baseDataDir string) *ProfilePathResolver {
	return &ProfilePathResolver{
		profileManager: pm,
		baseDataDir:    baseDataDir,
	}
}

// GetExtensionsDir returns the extensions directory.
// When profiles exist, extensions are shared across all profiles.
func (r *ProfilePathResolver) GetExtensionsDir(defaultDir string) string {
	if r.profileManager != nil && r.profileManager.HasProfiles() {
		return r.profileManager.GetSharedExtensionsDir()
	}
	return defaultDir
}

// GetMangaDownloadDir returns the manga download directory.
// When profiles exist, manga downloads are shared.
func (r *ProfilePathResolver) GetMangaDownloadDir(defaultDir string) string {
	if r.profileManager != nil && r.profileManager.HasProfiles() {
		return r.profileManager.GetSharedMangaDir()
	}
	return defaultDir
}

// GetMangaLocalDir returns the manga local directory.
// When profiles exist, manga local files are shared.
func (r *ProfilePathResolver) GetMangaLocalDir(defaultDir string) string {
	if r.profileManager != nil && r.profileManager.HasProfiles() {
		return r.profileManager.GetSharedMangaDir()
	}
	return defaultDir
}

// GetProfileDBPath returns the database path for a given profile.
// Falls back to the default database location if no profile is specified.
func (r *ProfilePathResolver) GetProfileDBPath(profileID uint) string {
	if profileID > 0 && r.profileManager != nil {
		return r.profileManager.GetProfileDBPath(profileID)
	}
	return filepath.Join(r.baseDataDir, "seanime.db")
}

// GetProfileCacheDir returns the cache directory for a given profile.
func (r *ProfilePathResolver) GetProfileCacheDir(profileID uint, defaultDir string) string {
	if profileID > 0 && r.profileManager != nil {
		return r.profileManager.GetProfileCacheDir(profileID)
	}
	return defaultDir
}

// GetProfileLogsDir returns the logs directory for a given profile.
func (r *ProfilePathResolver) GetProfileLogsDir(profileID uint, defaultDir string) string {
	if profileID > 0 && r.profileManager != nil {
		return r.profileManager.GetProfileLogsDir(profileID)
	}
	return defaultDir
}

// GetSharedDownloadsDir returns the shared downloads directory.
func (r *ProfilePathResolver) GetSharedDownloadsDir() string {
	if r.profileManager != nil {
		return r.profileManager.GetSharedDownloadsDir()
	}
	return filepath.Join(r.baseDataDir, "downloads")
}
