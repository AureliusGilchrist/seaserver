package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetCharacterFavoriteIDs returns all favorite character IDs.
func (db *Database) GetCharacterFavoriteIDs() ([]int, error) {
	var favs []models.CharacterFavorite
	if err := db.gormdb.Order("added_at desc").Find(&favs).Error; err != nil {
		return nil, err
	}
	ids := make([]int, len(favs))
	for i, f := range favs {
		ids[i] = f.CharacterID
	}
	return ids, nil
}

// ToggleCharacterFavorite adds or removes a character from favorites.
// Returns true if the character is now favorited, false if removed.
func (db *Database) ToggleCharacterFavorite(characterID int) (bool, error) {
	var existing models.CharacterFavorite
	err := db.gormdb.Where("character_id = ?", characterID).First(&existing).Error
	if err == nil {
		if err := db.gormdb.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	fav := models.CharacterFavorite{
		CharacterID: characterID,
		AddedAt:     time.Now(),
	}
	if err := db.gormdb.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}
