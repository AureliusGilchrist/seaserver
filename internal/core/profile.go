package core

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// Profile represents a user profile in the system.
// Stored in the global profiles.db, NOT in a per-profile database.
type Profile struct {
	ID              uint      `gorm:"primarykey" json:"id"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	Name            string    `gorm:"column:name;not null" json:"name"`
	PINHash         string    `gorm:"column:pin_hash;not null" json:"-"`
	PINSalt         string    `gorm:"column:pin_salt;not null" json:"-"`
	IsAdmin         bool      `gorm:"column:is_admin;default:false" json:"isAdmin"`
	AniListUsername string    `gorm:"column:anilist_username" json:"anilistUsername"`
	AniListAvatar   string    `gorm:"column:anilist_avatar" json:"anilistAvatar"`
	AvatarPath      string    `gorm:"column:avatar_path" json:"avatarPath"`
	Bio             string    `gorm:"column:bio;type:text" json:"bio"`
	BannerImage     string    `gorm:"column:banner_image" json:"bannerImage"`
}

// ProfileSummary is a safe projection of Profile for API responses (never includes PIN data).
type ProfileSummary struct {
	ID              uint      `json:"id"`
	Name            string    `json:"name"`
	IsAdmin         bool      `json:"isAdmin"`
	AniListUsername string    `json:"anilistUsername"`
	AniListAvatar   string    `json:"anilistAvatar"`
	AvatarPath      string    `json:"avatarPath"`
	Bio             string    `json:"bio"`
	BannerImage     string    `json:"bannerImage"`
	CreatedAt       time.Time `json:"createdAt"`
	HasPIN          bool      `json:"hasPIN"`
}

func (p *Profile) ToSummary() *ProfileSummary {
	return &ProfileSummary{
		ID:              p.ID,
		Name:            p.Name,
		IsAdmin:         p.IsAdmin,
		AniListUsername: p.AniListUsername,
		AniListAvatar:   p.AniListAvatar,
		AvatarPath:      p.AvatarPath,
		Bio:             p.Bio,
		BannerImage:     p.BannerImage,
		CreatedAt:       p.CreatedAt,
		HasPIN:          p.PINHash != "",
	}
}

// AllowedLibraryPaths is stored in the global profiles.db.
// Admin sets these; regular users pick from the list.
type AllowedLibraryPaths struct {
	ID    uint   `gorm:"primarykey" json:"id"`
	Value string `gorm:"column:value;type:text" json:"value"` // JSON array of paths
}

// ProfileManager manages the global profile registry.
type ProfileManager struct {
	db      *gorm.DB
	dataDir string // root data directory (e.g. ./data/)
	logger  *zerolog.Logger
	mu      sync.RWMutex

	// JWT signing key for profile sessions
	jwtSecret []byte
}

// NewProfileManager opens (or creates) the profiles.db and returns a ProfileManager.
func NewProfileManager(dataDir string, logger *zerolog.Logger) (*ProfileManager, error) {
	profilesDir := filepath.Join(dataDir, "profiles")
	if err := os.MkdirAll(profilesDir, 0700); err != nil {
		return nil, fmt.Errorf("profile: failed to create profiles dir: %w", err)
	}

	sharedDir := filepath.Join(dataDir, "shared")
	for _, sub := range []string{"downloads", "manga", "extensions"} {
		if err := os.MkdirAll(filepath.Join(sharedDir, sub), 0700); err != nil {
			return nil, fmt.Errorf("profile: failed to create shared/%s dir: %w", sub, err)
		}
	}

	dbPath := filepath.Join(dataDir, "profiles.db")
	gormDB, err := gorm.Open(sqlite.Open(dbPath+"?_busy_timeout=30000&_journal_mode=WAL&_synchronous=NORMAL&_foreign_keys=on"), &gorm.Config{
		Logger: gormlogger.New(
			logger,
			gormlogger.Config{
				SlowThreshold:             time.Second,
				LogLevel:                  gormlogger.Error,
				IgnoreRecordNotFoundError: true,
				Colorful:                  true,
			},
		),
	})
	if err != nil {
		return nil, fmt.Errorf("profile: failed to open profiles.db: %w", err)
	}

	sqlDB, _ := gormDB.DB()
	sqlDB.SetMaxOpenConns(2)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if err := gormDB.AutoMigrate(&Profile{}, &AllowedLibraryPaths{}); err != nil {
		return nil, fmt.Errorf("profile: failed to migrate: %w", err)
	}

	// Generate or load JWT signing secret
	jwtSecret, err := loadOrCreateJWTSecret(dataDir)
	if err != nil {
		return nil, fmt.Errorf("profile: failed to init JWT secret: %w", err)
	}

	pm := &ProfileManager{
		db:        gormDB,
		dataDir:   dataDir,
		logger:    logger,
		jwtSecret: jwtSecret,
	}

	logger.Info().Str("path", dbPath).Msg("profile: Profile registry initialized")
	return pm, nil
}

// loadOrCreateJWTSecret reads a 32-byte secret from disk, creating one if it doesn't exist.
func loadOrCreateJWTSecret(dataDir string) ([]byte, error) {
	secretPath := filepath.Join(dataDir, ".jwt_secret")
	data, err := os.ReadFile(secretPath)
	if err == nil && len(data) == 64 { // hex-encoded 32 bytes
		return hexDecode(data)
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	encoded := hex.EncodeToString(secret)
	if err := os.WriteFile(secretPath, []byte(encoded), 0600); err != nil {
		return nil, err
	}
	return secret, nil
}

func hexDecode(data []byte) ([]byte, error) {
	dst := make([]byte, hex.DecodedLen(len(data)))
	_, err := hex.Decode(dst, data)
	return dst, err
}

// ──────────────────────────────────────────────
// PIN hashing (HMAC-SHA256 with random salt)
// ──────────────────────────────────────────────

func hashPIN(pin string) (hash string, salt string, err error) {
	saltBytes := make([]byte, 16)
	if _, err = rand.Read(saltBytes); err != nil {
		return "", "", err
	}
	salt = hex.EncodeToString(saltBytes)
	hash = computePINHash(pin, salt)
	return hash, salt, nil
}

func computePINHash(pin, salt string) string {
	mac := hmac.New(sha256.New, []byte(salt))
	mac.Write([]byte(pin))
	return hex.EncodeToString(mac.Sum(nil))
}

func verifyPIN(pin, storedHash, storedSalt string) bool {
	return hmac.Equal([]byte(computePINHash(pin, storedSalt)), []byte(storedHash))
}

// ──────────────────────────────────────────────
// Profile CRUD
// ──────────────────────────────────────────────

func (pm *ProfileManager) CreateProfile(name, pin string, isAdmin bool) (*Profile, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if len(pin) < 4 || len(pin) > 8 {
		return nil, errors.New("PIN must be 4-8 digits")
	}
	for _, c := range pin {
		if c < '0' || c > '9' {
			return nil, errors.New("PIN must contain only digits")
		}
	}

	pinHash, pinSalt, err := hashPIN(pin)
	if err != nil {
		return nil, fmt.Errorf("failed to hash PIN: %w", err)
	}

	profile := &Profile{
		Name:    name,
		PINHash: pinHash,
		PINSalt: pinSalt,
		IsAdmin: isAdmin,
	}

	if err := pm.db.Create(profile).Error; err != nil {
		return nil, err
	}

	// Create profile data directories
	profileDir := pm.GetProfileDir(profile.ID)
	for _, sub := range []string{"cache", "cache/anilist", "logs"} {
		if err := os.MkdirAll(filepath.Join(profileDir, sub), 0700); err != nil {
			return nil, fmt.Errorf("failed to create profile dir: %w", err)
		}
	}

	pm.logger.Info().Uint("id", profile.ID).Str("name", name).Bool("admin", isAdmin).Msg("profile: Created profile")
	return profile, nil
}

func (pm *ProfileManager) GetProfile(id uint) (*Profile, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var profile Profile
	if err := pm.db.First(&profile, id).Error; err != nil {
		return nil, err
	}
	return &profile, nil
}

func (pm *ProfileManager) GetAllProfiles() ([]*Profile, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var profiles []*Profile
	if err := pm.db.Order("id asc").Find(&profiles).Error; err != nil {
		return nil, err
	}
	return profiles, nil
}

func (pm *ProfileManager) UpdateProfile(id uint, updates map[string]interface{}) (*Profile, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if err := pm.db.Model(&Profile{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}

	var profile Profile
	if err := pm.db.First(&profile, id).Error; err != nil {
		return nil, err
	}
	return &profile, nil
}

func (pm *ProfileManager) UpdateProfilePIN(id uint, newPIN string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if len(newPIN) < 4 || len(newPIN) > 8 {
		return errors.New("PIN must be 4-8 digits")
	}
	for _, c := range newPIN {
		if c < '0' || c > '9' {
			return errors.New("PIN must contain only digits")
		}
	}

	pinHash, pinSalt, err := hashPIN(newPIN)
	if err != nil {
		return err
	}

	return pm.db.Model(&Profile{}).Where("id = ?", id).Updates(map[string]interface{}{
		"pin_hash": pinHash,
		"pin_salt": pinSalt,
	}).Error
}

func (pm *ProfileManager) DeleteProfile(id uint) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	// Prevent deleting last admin
	var adminCount int64
	pm.db.Model(&Profile{}).Where("is_admin = ?", true).Count(&adminCount)

	var profile Profile
	if err := pm.db.First(&profile, id).Error; err != nil {
		return err
	}
	if profile.IsAdmin && adminCount <= 1 {
		return errors.New("cannot delete the last admin profile")
	}

	if err := pm.db.Delete(&Profile{}, id).Error; err != nil {
		return err
	}

	// Remove profile data directory
	profileDir := pm.GetProfileDir(id)
	if err := os.RemoveAll(profileDir); err != nil {
		pm.logger.Warn().Err(err).Uint("id", id).Msg("profile: Failed to remove profile directory")
	}

	pm.logger.Info().Uint("id", id).Msg("profile: Deleted profile")
	return nil
}

func (pm *ProfileManager) ValidatePIN(id uint, pin string) (*Profile, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var profile Profile
	if err := pm.db.First(&profile, id).Error; err != nil {
		return nil, errors.New("profile not found")
	}

	// Allow login without PIN if profile has no PIN set
	if profile.PINHash == "" && pin == "" {
		return &profile, nil
	}

	if !verifyPIN(pin, profile.PINHash, profile.PINSalt) {
		return nil, errors.New("incorrect PIN")
	}
	return &profile, nil
}

func (pm *ProfileManager) HasProfiles() bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var count int64
	pm.db.Model(&Profile{}).Count(&count)
	return count > 0
}

func (pm *ProfileManager) ProfileCount() int64 {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var count int64
	pm.db.Model(&Profile{}).Count(&count)
	return count
}

// ──────────────────────────────────────────────
// Allowed Library Paths (admin-managed)
// ──────────────────────────────────────────────

func (pm *ProfileManager) GetAllowedLibraryPaths() ([]string, error) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var entry AllowedLibraryPaths
	if err := pm.db.First(&entry, 1).Error; err != nil {
		return []string{}, nil
	}
	if entry.Value == "" {
		return []string{}, nil
	}
	// Simple comma-separated storage
	paths := splitAndTrim(entry.Value)
	return paths, nil
}

func (pm *ProfileManager) SetAllowedLibraryPaths(paths []string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	value := joinPaths(paths)
	entry := AllowedLibraryPaths{ID: 1, Value: value}
	return pm.db.Save(&entry).Error
}

func splitAndTrim(s string) []string {
	parts := []string{}
	for _, p := range splitOnPipe(s) {
		p = trimSpace(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func splitOnPipe(s string) []string {
	result := []string{}
	current := ""
	for _, c := range s {
		if c == '|' {
			result = append(result, current)
			current = ""
		} else {
			current += string(c)
		}
	}
	result = append(result, current)
	return result
}

func joinPaths(paths []string) string {
	result := ""
	for i, p := range paths {
		if i > 0 {
			result += "|"
		}
		result += p
	}
	return result
}

func trimSpace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

// ──────────────────────────────────────────────
// Directory helpers
// ──────────────────────────────────────────────

func (pm *ProfileManager) GetProfileDir(profileID uint) string {
	return filepath.Join(pm.dataDir, "profiles", fmt.Sprintf("%d", profileID))
}

func (pm *ProfileManager) GetProfileDBPath(profileID uint) string {
	return filepath.Join(pm.GetProfileDir(profileID), "seanime.db")
}

func (pm *ProfileManager) GetProfileCacheDir(profileID uint) string {
	return filepath.Join(pm.GetProfileDir(profileID), "cache")
}

func (pm *ProfileManager) GetProfileLogsDir(profileID uint) string {
	return filepath.Join(pm.GetProfileDir(profileID), "logs")
}

func (pm *ProfileManager) GetSharedDownloadsDir() string {
	return filepath.Join(pm.dataDir, "shared", "downloads")
}

func (pm *ProfileManager) GetSharedMangaDir() string {
	return filepath.Join(pm.dataDir, "shared", "manga")
}

func (pm *ProfileManager) GetSharedExtensionsDir() string {
	return filepath.Join(pm.dataDir, "shared", "extensions")
}

func (pm *ProfileManager) GetDataDir() string {
	return pm.dataDir
}

func (pm *ProfileManager) GetJWTSecret() []byte {
	return pm.jwtSecret
}

// Close closes the profiles database.
func (pm *ProfileManager) Close() error {
	sqlDB, err := pm.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
