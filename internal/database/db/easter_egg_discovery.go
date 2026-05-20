package db

import (
	"errors"
	"seanime/internal/database/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GetEasterEggDiscoveries returns all discovered easter-egg IDs for the active profile.
func (db *Database) GetEasterEggDiscoveries() ([]string, error) {
	var discoveries []models.EasterEggDiscovery
	if err := db.gormdb.Find(&discoveries).Error; err != nil {
		return nil, err
	}
	out := make([]string, 0, len(discoveries))
	for _, d := range discoveries {
		out = append(out, d.EggID)
	}
	return out, nil
}

// HasEasterEggDiscovery returns true if the given egg has already been recorded
// for the active profile.
func (db *Database) HasEasterEggDiscovery(eggID string) (bool, error) {
	var d models.EasterEggDiscovery
	err := db.gormdb.Where("egg_id = ?", eggID).First(&d).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// AddEasterEggDiscovery records a discovery for the active profile.
// Idempotent: if a row with the same egg_id already exists, no error is returned and
// (alreadyExisted=true) is reported so the caller can skip XP grants.
func (db *Database) AddEasterEggDiscovery(eggID string) (alreadyExisted bool, err error) {
	d := &models.EasterEggDiscovery{EggID: eggID}
	res := db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "egg_id"}},
		DoNothing: true,
	}).Create(d)
	if res.Error != nil {
		return false, res.Error
	}
	// RowsAffected == 0 on conflict (DoNothing) => row already existed.
	return res.RowsAffected == 0, nil
}
