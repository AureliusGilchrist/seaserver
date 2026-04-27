package db

import (
	"seanime/internal/database/models"

	"gorm.io/gorm/clause"
)

var CurrPrivacySettings *models.PrivacySettings

func (db *Database) UpsertPrivacySettings(settings *models.PrivacySettings) (*models.PrivacySettings, error) {
	err := db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}).Create(settings).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to save privacy settings")
		return nil, err
	}
	CurrPrivacySettings = settings
	db.Logger.Debug().Msg("db: Privacy settings saved")
	return settings, nil
}

func (db *Database) GetPrivacySettings() (*models.PrivacySettings, error) {
	if CurrPrivacySettings != nil {
		return CurrPrivacySettings, nil
	}
	var settings models.PrivacySettings
	err := db.gormdb.Where("id = ?", 1).Find(&settings).Error
	if err != nil {
		return nil, err
	}
	return &settings, nil
}
