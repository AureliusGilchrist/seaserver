package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetStudioFavoriteIDs returns all favorite studio IDs.
func (db *Database) GetStudioFavoriteIDs() ([]int, error) {
	var favs []models.StudioFavorite
	if err := db.gormdb.Order("added_at desc").Find(&favs).Error; err != nil {
		return nil, err
	}
	ids := make([]int, len(favs))
	for i, f := range favs {
		ids[i] = f.StudioID
	}
	return ids, nil
}

// ToggleStudioFavorite adds or removes a studio from favorites.
// Returns true if the studio is now favorited, false if removed.
func (db *Database) ToggleStudioFavorite(studioID int) (bool, error) {
	var existing models.StudioFavorite
	err := db.gormdb.Where("studio_id = ?", studioID).First(&existing).Error
	if err == nil {
		if err := db.gormdb.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	fav := models.StudioFavorite{
		StudioID: studioID,
		AddedAt:  time.Now(),
	}
	if err := db.gormdb.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}
