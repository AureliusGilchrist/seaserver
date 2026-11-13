package db

import (
	"seanime/internal/database/models"
)

// InsertWatchPartyHistory stores one watch party episode for this profile.
func (db *Database) InsertWatchPartyHistory(entry *models.WatchPartyHistory) error {
	return db.gormdb.Create(entry).Error
}

// GetWatchPartyHistory returns this profile's watch party episodes, newest first.
func (db *Database) GetWatchPartyHistory(limit int) ([]*models.WatchPartyHistory, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var out []*models.WatchPartyHistory
	err := db.gormdb.Order("watched_at desc").Limit(limit).Find(&out).Error
	return out, err
}
