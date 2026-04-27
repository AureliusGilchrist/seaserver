package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetAnimeFavoriteIDs returns all favorite anime media IDs.
func (db *Database) GetAnimeFavoriteIDs() ([]int, error) {
	var favs []models.AnimeFavorite
	if err := db.gormdb.Order("added_at desc").Find(&favs).Error; err != nil {
		return nil, err
	}
	ids := make([]int, len(favs))
	for i, f := range favs {
		ids[i] = f.MediaID
	}
	return ids, nil
}

// ToggleAnimeFavorite adds or removes an anime from favorites.
// Returns true if the anime is now favorited, false if removed.
func (db *Database) ToggleAnimeFavorite(mediaID int) (bool, error) {
	var existing models.AnimeFavorite
	err := db.gormdb.Where("media_id = ?", mediaID).First(&existing).Error
	if err == nil {
		// Already exists — remove it
		if err := db.gormdb.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	// Not found — add it
	fav := models.AnimeFavorite{
		MediaID: mediaID,
		AddedAt: time.Now(),
	}
	if err := db.gormdb.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}

// BulkAddAnimeFavorites adds multiple anime IDs as favorites (skips existing).
// Used for migrating from localStorage.
func (db *Database) BulkAddAnimeFavorites(mediaIDs []int) error {
	for _, id := range mediaIDs {
		var count int64
		db.gormdb.Model(&models.AnimeFavorite{}).Where("media_id = ?", id).Count(&count)
		if count > 0 {
			continue
		}
		fav := models.AnimeFavorite{
			MediaID: id,
			AddedAt: time.Now(),
		}
		if err := db.gormdb.Create(&fav).Error; err != nil {
			return err
		}
	}
	return nil
}
