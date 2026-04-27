package db

import "seanime/internal/database/models"

// SaveMangaIDMapping stores a mapping from synthetic ID to AniList ID
func (db *Database) SaveMangaIDMapping(syntheticID, anilistID int, providerID string) error {
	// Check if mapping already exists
	var existing models.MangaIDMapping
	err := retryOnBusy(func() error {
		return db.gormdb.Where("synthetic_id = ?", syntheticID).First(&existing).Error
	})
	
	if err == nil {
		// Mapping exists, update it
		existing.AnilistID = anilistID
		existing.ProviderID = providerID
		return retryOnBusy(func() error {
			return db.gormdb.Save(&existing).Error
		})
	}
	
	// Mapping doesn't exist, create new one
	mapping := &models.MangaIDMapping{
		SyntheticID: syntheticID,
		AnilistID:   anilistID,
		ProviderID:  providerID,
	}
	
	return retryOnBusy(func() error {
		return db.gormdb.Create(mapping).Error
	})
}

// GetMangaIDMapping retrieves the AniList ID for a given synthetic ID
// Returns the AniList ID and true if found, 0 and false otherwise
func (db *Database) GetMangaIDMapping(syntheticID int) (int, bool) {
	var mapping models.MangaIDMapping
	err := retryOnBusy(func() error {
		return db.gormdb.Where("synthetic_id = ?", syntheticID).First(&mapping).Error
	})
	if err != nil {
		return 0, false
	}
	return mapping.AnilistID, true
}

// GetReverseMangaIDMapping retrieves the synthetic ID for a given AniList ID
// Returns the synthetic ID and true if found, 0 and false otherwise
func (db *Database) GetReverseMangaIDMapping(anilistID int) (int, bool) {
	var mapping models.MangaIDMapping
	err := retryOnBusy(func() error {
		return db.gormdb.Where("anilist_id = ?", anilistID).First(&mapping).Error
	})
	if err != nil {
		return 0, false
	}
	return mapping.SyntheticID, true
}

// GetAllMangaIDMappings returns all ID mappings
func (db *Database) GetAllMangaIDMappings() ([]*models.MangaIDMapping, error) {
	var mappings []*models.MangaIDMapping
	err := retryOnBusy(func() error {
		return db.gormdb.Find(&mappings).Error
	})
	return mappings, err
}

// DeleteMangaIDMapping removes a mapping
func (db *Database) DeleteMangaIDMapping(syntheticID int) error {
	return retryOnBusy(func() error {
		return db.gormdb.Where("synthetic_id = ?", syntheticID).Delete(&models.MangaIDMapping{}).Error
	})
}

// ResolveMangaID takes a media ID and returns the mapped AniList ID if it exists,
// otherwise returns the original ID. This is the main conversion layer.
func (db *Database) ResolveMangaID(mediaID int) int {
	// If it's not a synthetic ID (negative), return as-is
	if mediaID >= 0 {
		return mediaID
	}
	
	// Try to get the mapping
	if anilistID, found := db.GetMangaIDMapping(mediaID); found {
		return anilistID
	}
	
	// No mapping found, return original
	return mediaID
}
