package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetMangaFavoriteIDs returns all favorite manga media IDs.
func (db *Database) GetMangaFavoriteIDs() ([]int, error) {
	var favs []models.MangaFavorite
	if err := db.gormdb.Order("added_at desc").Find(&favs).Error; err != nil {
		return nil, err
	}
	ids := make([]int, len(favs))
	for i, f := range favs {
		ids[i] = f.MediaID
	}
	return ids, nil
}

// ToggleMangaFavorite adds or removes a manga from favorites.
// Returns true if the manga is now favorited, false if removed.
func (db *Database) ToggleMangaFavorite(mediaID int) (bool, error) {
	var existing models.MangaFavorite
	err := db.gormdb.Where("media_id = ?", mediaID).First(&existing).Error
	if err == nil {
		// Already exists — remove it
		if err := db.gormdb.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	// Not found — add it
	fav := models.MangaFavorite{
		MediaID: mediaID,
		AddedAt: time.Now(),
	}
	if err := db.gormdb.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}

// BulkAddMangaFavorites adds multiple manga IDs as favorites (skips existing).
// Used for migrating from localStorage.
func (db *Database) BulkAddMangaFavorites(mediaIDs []int) error {
	for _, id := range mediaIDs {
		var count int64
		db.gormdb.Model(&models.MangaFavorite{}).Where("media_id = ?", id).Count(&count)
		if count > 0 {
			continue
		}
		fav := models.MangaFavorite{
			MediaID: id,
			AddedAt: time.Now(),
		}
		if err := db.gormdb.Create(&fav).Error; err != nil {
			return err
		}
	}
	return nil
}
