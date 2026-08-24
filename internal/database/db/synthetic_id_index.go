package db

import (
	"errors"
	"seanime/internal/database/models"
	"time"
)

const syntheticIDStart = -1
const syntheticIDCounterRowID = 1

// initSyntheticIDCounter makes sure the counter row exists with the starting value, then returns
// the row. Called from NextSyntheticID and from migrations on startup.
func (db *Database) initSyntheticIDCounter() error {
	var c models.SyntheticIDCounter
	err := db.gormdb.First(&c, syntheticIDCounterRowID).Error
	if err == nil {
		return nil
	}
	c = models.SyntheticIDCounter{ID: syntheticIDCounterRowID, Value: syntheticIDStart}
	return db.gormdb.Create(&c).Error
}

// NextSyntheticID returns a fresh negative integer for a newly-discovered media entry. Throws if
// the counter cannot be read or incremented — there is no recovery from that, since the alternative
// (returning zero) would collide with the AniList range.
//
// Reads and writes happen under the same transaction at the GORM level, and the driver flushes on
// every state move (the app already uses SetMaxOpenConns(3)), so two callers cannot concurrently
// receive the same value.
func (db *Database) NextSyntheticID() (int, error) {
	if err := db.initSyntheticIDCounter(); err != nil {
		return 0, err
	}

	tx := db.gormdb.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var c models.SyntheticIDCounter
	if err := tx.First(&c, syntheticIDCounterRowID).Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	c.Value--
	if err := tx.Save(&c).Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	if err := tx.Commit().Error; err != nil {
		return 0, err
	}
	return c.Value, nil
}

// UpsertSyntheticIDIndex writes (or refreshes) a synthetic-id row. SyntheticID is the unique key,
// so a second lookup that arrives with a cross-platform id we have already seen re-targets the
// existing row rather than allocating a new one.
//
// An empty SyntheticID is rejected because the row would then have no identity.
func (db *Database) UpsertSyntheticIDIndex(m *models.SyntheticIDIndex) (*models.SyntheticIDIndex, error) {
	if m == nil {
		return nil, errors.New("db: nil synthetic id index")
	}
	if m.SyntheticID == 0 {
		return nil, errors.New("db: synthetic id must be non-zero")
	}

	m.LastSeenAt = time.Now()
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now()
	}

	var existing models.SyntheticIDIndex
	err := db.gormdb.Where("synthetic_id = ?", m.SyntheticID).First(&existing).Error

	if err != nil {
		err = db.gormdb.Create(m).Error
		if err != nil {
			return nil, err
		}
		return m, nil
	}

	// Bring the existing row's stale fields up to date. We only overwrite a column when the
	// incoming row has a non-zero/non-empty value for it, mirroring the KitsuIDMapping merge.
	if m.Name != "" {
		existing.Name = m.Name
	}
	if m.KitsuID != "" {
		existing.KitsuID = m.KitsuID
	}
	if m.KitsuSlug != "" {
		existing.KitsuSlug = m.KitsuSlug
	}
	if m.AnilistID != 0 {
		existing.AnilistID = m.AnilistID
	}
	if m.MalID != 0 {
		existing.MalID = m.MalID
	}
	if m.CoverImage != "" {
		existing.CoverImage = m.CoverImage
	}
	if m.MediaType != "" {
		existing.MediaType = m.MediaType
	}
	existing.LastSeenAt = m.LastSeenAt

	err = db.gormdb.Save(&existing).Error
	if err != nil {
		return nil, err
	}
	return &existing, nil
}

// GetSyntheticIDIndex fetches by synthetic id (negative integer). Returns (nil, nil) when missing —
// callers treat that as "not yet indexed" rather than a database error.
func (db *Database) GetSyntheticIDIndex(syntheticID int) (*models.SyntheticIDIndex, error) {
	if syntheticID >= 0 {
		// The synthetic range is negative; a positive id would never match the index, and asking
		// for one is almost always a caller bug.
		return nil, nil
	}
	var m models.SyntheticIDIndex
	err := db.gormdb.Where("synthetic_id = ?", syntheticID).First(&m).Error
	if err != nil {
		return nil, nil
	}
	return &m, nil
}

// GetSyntheticIDByAnilistID does the reverse lookup used by the en-masse downloader when a torrent
// arrives keyed by AniList id but the caller wants to render with a cached name.
func (db *Database) GetSyntheticIDByAnilistID(anilistID int) (*models.SyntheticIDIndex, error) {
	if anilistID == 0 {
		return nil, nil
	}
	var m models.SyntheticIDIndex
	err := db.gormdb.Where("anilist_id = ?", anilistID).First(&m).Error
	if err != nil {
		return nil, nil
	}
	return &m, nil
}

// GetSyntheticIDByKitsuSlug looks up by Kitsu slug. Used at the dispatcher in front of every
// Kitsu-resolution path so a name-with-cover is read from a row rather than refetched.
func (db *Database) GetSyntheticIDByKitsuSlug(slug string) (*models.SyntheticIDIndex, error) {
	if slug == "" {
		return nil, nil
	}
	var m models.SyntheticIDIndex
	err := db.gormdb.Where("kitsu_slug = ?", slug).First(&m).Error
	if err != nil {
		return nil, nil
	}
	return &m, nil
}

// DeleteSyntheticIDIndex removes a row. The cleanup pass uses this when a media id has not been
// referenced for so long that it is no longer worth keeping around — currently only manual.
func (db *Database) DeleteSyntheticIDIndex(syntheticID int) error {
	return db.gormdb.Where("synthetic_id = ?", syntheticID).Delete(&models.SyntheticIDIndex{}).Error
}
