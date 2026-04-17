package db

import (
	"encoding/json"
	"seanime/internal/database/models"
	"time"
)

// RecordActivityEvent inserts a new granular activity event.
// metadata should be a map or struct; it will be JSON-encoded.
func (db *Database) RecordActivityEvent(eventType string, mediaId int, metadata interface{}) error {
	metaBytes, err := json.Marshal(metadata)
	if err != nil {
		metaBytes = []byte("{}")
	}

	event := models.ActivityEvent{
		EventType: eventType,
		MediaId:   mediaId,
		Metadata:  string(metaBytes),
	}
	return db.gormdb.Create(&event).Error
}

// GetActivityEvents returns activity events within the given time range, newest first.
// If limit <= 0, all matching events are returned.
// If eventType is non-empty, only events of that type are returned.
func (db *Database) GetActivityEvents(since time.Time, limit int, eventType string) ([]*models.ActivityEvent, error) {
	var events []*models.ActivityEvent
	q := db.gormdb.Where("created_at >= ?", since).Order("created_at DESC")
	if eventType != "" {
		q = q.Where("event_type = ?", eventType)
	}
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.Find(&events).Error
	return events, err
}

// PruneActivityEvents deletes activity events older than the given duration.
func (db *Database) PruneActivityEvents(maxAge time.Duration) error {
	cutoff := time.Now().Add(-maxAge)
	return db.gormdb.Where("created_at < ?", cutoff).Delete(&models.ActivityEvent{}).Error
}
