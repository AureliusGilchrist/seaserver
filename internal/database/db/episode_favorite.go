package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetEpisodeFavorites returns all favourite episodes, in the order the user arranged them.
func (db *Database) GetEpisodeFavorites() ([]models.EpisodeFavorite, error) {
	var favs []models.EpisodeFavorite
	if err := db.gormdb.Order(favoriteOrder).Find(&favs).Error; err != nil {
		return nil, err
	}
	return favs, nil
}

// ToggleEpisodeFavorite adds or removes an episode from favourites. title and image are stored as
// a snapshot when the episode is added. Returns true if the episode is now a favourite.
func (db *Database) ToggleEpisodeFavorite(mediaID, episodeNumber int, title, image string) (bool, error) {
	var existing models.EpisodeFavorite
	err := db.gormdb.Where("media_id = ? AND episode_number = ?", mediaID, episodeNumber).First(&existing).Error
	if err == nil {
		if err := db.gormdb.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	fav := models.EpisodeFavorite{
		MediaID:       mediaID,
		EpisodeNumber: episodeNumber,
		Title:         title,
		Image:         image,
		AddedAt:       time.Now(),
	}
	if err := db.gormdb.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}
