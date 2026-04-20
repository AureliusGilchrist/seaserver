package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetStaffFavoriteIDs returns all favorite staff IDs.
func (db *Database) GetStaffFavoriteIDs() ([]int, error) {
	var favs []models.StaffFavorite
	if err := db.gormdb.Order("added_at desc").Find(&favs).Error; err != nil {
		return nil, err
	}
	ids := make([]int, len(favs))
	for i, f := range favs {
		ids[i] = f.StaffID
	}
	return ids, nil
}

// ToggleStaffFavorite adds or removes a staff member from favorites.
// Returns true if the staff is now favorited, false if removed.
func (db *Database) ToggleStaffFavorite(staffID int) (bool, error) {
	var existing models.StaffFavorite
	err := db.gormdb.Where("staff_id = ?", staffID).First(&existing).Error
	if err == nil {
		if err := db.gormdb.Delete(&existing).Error; err != nil {
			return false, err
		}
		return false, nil
	}

	fav := models.StaffFavorite{
		StaffID: staffID,
		AddedAt: time.Now(),
	}
	if err := db.gormdb.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}
