package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetThemeFavorites returns all favourite openings and endings, in the order the user arranged them.
func (db *Database) GetThemeFavorites() ([]models.ThemeFavorite, error) {
	var favs []models.ThemeFavorite
	if err := db.gormdb.Order(favoriteOrder).Find(&favs).Error; err != nil {
		return nil, err
	}
	return favs, nil
}

// ToggleThemeFavorite adds or removes a theme from favourites. fav carries the snapshot stored when
// it is added. Returns true if the theme is now a favourite.
func (db *Database) ToggleThemeFavorite(fav models.ThemeFavorite) (bool, error) {
	var existing models.ThemeFavorite
	err := db.gormdb.Where("media_id = ? AND theme_slug = ?", fav.MediaID, fav.ThemeSlug).First(&existing).Error
	if err == nil {
		if err := db.gormdb.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}
	fav.ID = 0
	fav.AddedAt = time.Now()
	fav.Rank = 0
	if err := db.gormdb.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}
