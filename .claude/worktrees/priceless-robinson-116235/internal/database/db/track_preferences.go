package db

import (
	"seanime/internal/database/models"

	"gorm.io/gorm/clause"
)

// GetAllTrackPreferences returns all per-media track preferences.
func (db *Database) GetAllTrackPreferences() ([]*models.TrackPreference, error) {
	var prefs []*models.TrackPreference
	err := db.gormdb.Find(&prefs).Error
	return prefs, err
}

// UpsertTrackPreference creates or updates a track preference for a given media ID.
func (db *Database) UpsertTrackPreference(pref *models.TrackPreference) error {
	return db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "media_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"audio_language", "audio_codec_id", "subtitle_language", "subtitle_codec_id", "updated_at"}),
	}).Create(pref).Error
}

// DeleteTrackPreference removes a track preference by media ID.
func (db *Database) DeleteTrackPreference(mediaID string) error {
	return db.gormdb.Where("media_id = ?", mediaID).Delete(&models.TrackPreference{}).Error
}
