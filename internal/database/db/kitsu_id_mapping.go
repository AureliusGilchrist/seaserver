package db

import (
	"errors"
	"seanime/internal/database/models"
)

// UpsertKitsuIDMapping writes a row that pairs a Kitsu slug with the cross-platform ids we know
// for the same media. KitsuID is the unique key, so if a row already exists for that Kitsu slug
// the cross-platform ids are extended in place rather than overwritten with zeros — AniList might
// have arrived on a different lookup, and the merge keeps both halves of the join.
//
// An empty `MediaType` would let the cross-id column pick up rows for any media-type, which is
// almost never what a caller wants, so it is rejected up front.
func (db *Database) UpsertKitsuIDMapping(m *models.KitsuIDMapping) (*models.KitsuIDMapping, error) {
	if m == nil {
		return nil, errors.New("db: nil kitsu id mapping")
	}
	if m.KitsuID == "" {
		return nil, errors.New("db: kitsu id required")
	}
	if m.MediaType == "" {
		return nil, errors.New("db: media type required")
	}

	var existing models.KitsuIDMapping
	err := db.gormdb.Where("kitsu_id = ?", m.KitsuID).First(&existing).Error

	if err != nil {
		if m.AnilistID == 0 && m.MalID == 0 && m.KitsuSlug == "" {
			// Nothing to write — let the caller decide whether erroring is right.
			return nil, errors.New("db: kitsu id mapping has no cross-platform values")
		}
		err = db.gormdb.Create(m).Error
		if err != nil {
			return nil, err
		}
		return m, nil
	}

	// Existing row: only overwrite the columns that have a non-zero value in the incoming request,
	// so a later lookup that finds the AniList half does not wipe a previously-found MalID.
	if m.AnilistID != 0 {
		existing.AnilistID = m.AnilistID
	}
	if m.MalID != 0 {
		existing.MalID = m.MalID
	}
	if m.KitsuSlug != "" {
		existing.KitsuSlug = m.KitsuSlug
	}
	if m.CanonicalTitle != "" {
		existing.CanonicalTitle = m.CanonicalTitle
	}
	existing.LastResolvedAt = m.LastResolvedAt

	err = db.gormdb.Save(&existing).Error
	if err != nil {
		return nil, err
	}
	return &existing, nil
}

// GetKitsuMappingByKitsuID fetches the mapping row for a Kitsu slug, or returns (nil, nil) if there
// is no row yet (the resolver treats this as "no upstream cache" rather than an error).
func (db *Database) GetKitsuMappingByKitsuID(kitsuID string) (*models.KitsuIDMapping, error) {
	if kitsuID == "" {
		return nil, nil
	}
	var m models.KitsuIDMapping
	err := db.gormdb.Where("kitsu_id = ?", kitsuID).First(&m).Error
	if err != nil {
		return nil, nil
	}
	return &m, nil
}

// GetKitsuMappingByAnilistID is the reverse lookup — used when a caller only has an AniList ID and
// wants to find whether we already know a Kitsu slug for it. Returns the single row that matches
// the AniList ID for the supplied media type. Match on (anilist_id, media_type) rather than just
// anilist_id, because the same AniList id space is disjoint between anime and manga and we don't
// want a cross-type hit.
func (db *Database) GetKitsuMappingByAnilistID(anilistID int, mediaType string) (*models.KitsuIDMapping, error) {
	if anilistID == 0 {
		return nil, nil
	}
	var m models.KitsuIDMapping
	err := db.gormdb.Where("anilist_id = ? AND media_type = ?", anilistID, mediaType).First(&m).Error
	if err != nil {
		return nil, nil
	}
	return &m, nil
}

// GetAllKitsuIDMappings returns every cached mapping. Used by the synthetic-id resolver when it
// needs to ask "do we already have a mapping for this id?" in bulk — for instance, when warming
// the in-memory cache from a cold disk read.
func (db *Database) GetAllKitsuIDMappings() ([]*models.KitsuIDMapping, error) {
	var out []*models.KitsuIDMapping
	err := db.gormdb.Find(&out).Error
	if err != nil {
		return nil, err
	}
	return out, nil
}

// DeleteKitsuMapping removes a row by Kitsu id. Used by the cleanup pass when a Kitsu lookup
// surfaces a 404 (the upstream no longer has a record and we should not keep serving the slug).
func (db *Database) DeleteKitsuMapping(kitsuID string) error {
	return db.gormdb.Where("kitsu_id = ?", kitsuID).Delete(&models.KitsuIDMapping{}).Error
}
