package db

import (
	"errors"
	"seanime/internal/database/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GetClientPrefs returns all client preferences stored for the active database (per-profile).
func (db *Database) GetClientPrefs() ([]*models.ClientPref, error) {
	var prefs []*models.ClientPref
	if err := db.gormdb.Find(&prefs).Error; err != nil {
		return nil, err
	}
	return prefs, nil
}

// GetClientPref returns a single client preference by key, or (nil, nil) if absent.
func (db *Database) GetClientPref(key string) (*models.ClientPref, error) {
	var pref models.ClientPref
	err := db.gormdb.Where("key = ?", key).First(&pref).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &pref, nil
}

// UpsertClientPref creates or updates a client preference for the active database (per-profile).
// The Value is opaque JSON-encoded text owned by the client.
func (db *Database) UpsertClientPref(key string, value string) (*models.ClientPref, error) {
	pref := &models.ClientPref{
		Key:   key,
		Value: value,
	}
	err := db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(pref).Error
	if err != nil {
		db.Logger.Error().Err(err).Str("key", key).Msg("Failed to upsert client preference")
		return nil, err
	}
	return pref, nil
}

// DeleteClientPref removes a client preference by key.
func (db *Database) DeleteClientPref(key string) error {
	if err := db.gormdb.Where("key = ?", key).Delete(&models.ClientPref{}).Error; err != nil {
		db.Logger.Error().Err(err).Str("key", key).Msg("Failed to delete client preference")
		return err
	}
	return nil
}
