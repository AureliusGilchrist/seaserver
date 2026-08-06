package db

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"seanime/internal/database/models"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog"
	"github.com/samber/mo"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

type Database struct {
	gormdb           *gorm.DB
	Logger           *zerolog.Logger
	CurrMediaFillers mo.Option[map[int]*MediaFillerItem]
	cleanupManager   *CleanupManager
	accountCache     *models.Account
}

func (db *Database) Gorm() *gorm.DB {
	return db.gormdb
}

// sqlitePragmas are applied to every connection in the pool.
//
// These MUST use the driver's "_pragma=" spelling. The driver here is github.com/glebarez/sqlite,
// the pure-Go (modernc) one, and it only honours _pragma, _time_format and _txlock in the DSN —
// every other parameter is parsed and silently discarded. The mattn/go-sqlite3 spelling that used
// to be here ("?_busy_timeout=30000&_journal_mode=WAL&...") therefore did nothing at all, which
// left the database in SQLite's default DELETE journal mode, where a single writer locks out every
// reader, and on the driver's hardcoded 5-second default busy timeout. That is exactly what the
// "database is locked (SQLITE_BUSY)" failures were: queries giving up after ~5000ms.
var sqlitePragmas = []string{
	"busy_timeout(30000)",
	"journal_mode(WAL)",   // readers and the writer stop blocking each other
	"synchronous(NORMAL)", // safe under WAL, and holds the write lock for much less time
	"cache_size(1000)",
	"foreign_keys(on)",
}

// sqliteDSN builds the connection string for path.
func sqliteDSN(path string) string {
	params := make([]string, 0, len(sqlitePragmas)+1)
	for _, pragma := range sqlitePragmas {
		params = append(params, "_pragma="+url.QueryEscape(pragma))
	}
	// Take the write lock when a transaction begins rather than when it first writes. A deferred
	// transaction that upgrades to a write half way through fails outright with SQLITE_BUSY —
	// the busy timeout cannot help it, because backing off would mean reading a stale snapshot.
	params = append(params, "_txlock=immediate")

	return path + "?" + strings.Join(params, "&")
}

// verifySQLiteSettings reports the settings that actually took effect. The pragmas above fail
// silently if a driver change breaks the DSN spelling again, and the only symptom would be the
// intermittent lock failures coming back, so the values are logged at startup and a database
// that is not in WAL mode is called out loudly.
func verifySQLiteSettings(db *gorm.DB, sqlitePath string, logger *zerolog.Logger) {
	var journalMode string
	if err := db.Raw("PRAGMA journal_mode").Scan(&journalMode).Error; err != nil {
		logger.Warn().Err(err).Msg("db: Could not read journal_mode")
		return
	}

	var busyTimeout int
	if err := db.Raw("PRAGMA busy_timeout").Scan(&busyTimeout).Error; err != nil {
		logger.Warn().Err(err).Msg("db: Could not read busy_timeout")
		return
	}

	logger.Info().
		Str("journalMode", journalMode).
		Int("busyTimeoutMs", busyTimeout).
		Msg("db: SQLite settings applied")

	// An in-memory database has no journal to put into WAL mode, so it is expected to differ.
	if sqlitePath != ":memory:" && !strings.EqualFold(journalMode, "wal") {
		logger.Error().
			Str("journalMode", journalMode).
			Msg("db: Database is NOT in WAL mode — expect 'database is locked' errors under concurrent use")
	}
}

func NewDatabase(appDataDir, dbName string, logger *zerolog.Logger) (*Database, error) {

	// Set the SQLite database path
	var sqlitePath string
	if os.Getenv("TEST_ENV") == "true" || appDataDir == "" {
		sqlitePath = ":memory:"
	} else {
		sqlitePath = filepath.Join(appDataDir, dbName+".db")
	}

	// Connect to the SQLite database with optimized settings
	db, err := gorm.Open(sqlite.Open(sqliteDSN(sqlitePath)), &gorm.Config{
		Logger: gormlogger.New(
			logger,
			gormlogger.Config{
				SlowThreshold:             time.Second,
				LogLevel:                  gormlogger.Error,
				IgnoreRecordNotFoundError: true,
				ParameterizedQueries:      false,
				Colorful:                  true,
			},
		),
	})
	if err != nil {
		return nil, err
	}

	// Configure connection pool
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxOpenConns(3)
	sqlDB.SetMaxIdleConns(2)
	sqlDB.SetConnMaxLifetime(time.Hour)

	verifySQLiteSettings(db, sqlitePath, logger)

	// Migrate tables
	err = migrateTables(db)
	if err != nil {
		logger.Fatal().Err(err).Msg("db: Failed to perform auto migration")
		return nil, err
	}

	logger.Info().Str("name", fmt.Sprintf("%s.db", dbName)).Msg("db: Database instantiated")

	database := &Database{
		gormdb:           db,
		Logger:           logger,
		CurrMediaFillers: mo.None[map[int]*MediaFillerItem](),
	}

	// Initialize cleanup manager
	database.cleanupManager = NewCleanupManager(database.gormdb, database.Logger)

	return database, nil
}

// MigrateTables performs auto migration on the database
func migrateTables(db *gorm.DB) error {
	err := db.AutoMigrate(
		&models.LocalFiles{},
		&models.ShelvedLocalFiles{},
		&models.Settings{},
		&models.Account{},
		&models.Mal{},
		&models.ScanSummary{},
		&models.AutoSelectProfile{},
		&models.AutoDownloaderRule{},
		&models.AutoDownloaderProfile{},
		&models.AutoDownloaderItem{},
		&models.SilencedMediaEntry{},
		&models.Theme{},
		&models.PlaylistEntry{}, // Legacy playlists
		&models.Playlist{},
		&models.ChapterDownloadQueueItem{},
		&models.TorrentstreamSettings{},
		&models.TorrentstreamHistory{},
		&models.MediastreamSettings{},
		&models.MediaFiller{},
		&models.MangaMapping{},
		&models.OnlinestreamMapping{},
		&models.DebridSettings{},
		&models.DebridTorrentItem{},
		&models.PluginData{},
		&models.CustomSourceCollection{},
		&models.CustomSourceIdentifier{},
		&models.MediaMetadataParent{},
		&models.SyntheticManga{},
		&models.MangaReadingHistory{},
		&models.SyntheticAnime{},
		&models.MangaChapterContainer{},
		&models.MangaIDMapping{},
		&models.DownloadedMangaMetadata{},
		&models.PrivacySettings{},
		&models.Comment{},
		&models.CommentVote{},
		&models.MangaFavorite{},
		&models.AnimeFavorite{},
		&models.CharacterFavorite{},
		&models.StaffFavorite{},
		&models.StudioFavorite{},
		&models.Notification{},
		&models.Achievement{},
		&models.AchievementShowcase{},
		&models.ActivityLog{},
		&models.ActivityEvent{},
		&models.LevelProgress{},
		&models.AdminAnnouncement{},
		&models.TrackPreference{},
		&models.GlobalMilestone{},
		&models.MediaCacheEntry{},
		&models.ClientPref{},
		&models.EasterEggDiscovery{},
		&models.BuiltinTorrentItem{},
	)
	if err != nil {

		return err
	}

	return nil
}

// RunDatabaseCleanup runs all database cleanup operations
func (db *Database) RunDatabaseCleanup() {
	db.cleanupManager.RunAllCleanupOperations()
}
