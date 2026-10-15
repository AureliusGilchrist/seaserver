package db

import (
	"encoding/json"
	"errors"
	"seanime/internal/database/models"
	"sync"
	"time"

	"gorm.io/gorm"
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

// GetActivityEventsPaginated returns activity events with offset-based pagination, newest first.
// Returns events and total count for has-more calculation.
func (db *Database) GetActivityEventsPaginated(page, pageSize int) ([]*models.ActivityEvent, int64, error) {
	var total int64
	db.gormdb.Model(&models.ActivityEvent{}).Count(&total)

	var events []*models.ActivityEvent
	offset := (page - 1) * pageSize
	err := db.gormdb.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&events).Error
	return events, total, err
}

// HasRecentEpisodeWatchedEvent reports whether an episode_watched event for the same
// (media, episode) pair was already recorded within the given window. Multiple code paths
// can record the same watch (the direct-stream server-side auto-update and the client's
// update-progress call both fire at completion), which duplicated timeline entries and
// double-counted daily stats.
func (db *Database) HasRecentEpisodeWatchedEvent(mediaId int, episode int, window time.Duration) bool {
	var events []*models.ActivityEvent
	since := time.Now().Add(-window)
	err := db.gormdb.
		Where("event_type = ? AND media_id = ? AND created_at >= ?", models.ActivityEventEpisodeWatched, mediaId, since).
		Find(&events).Error
	if err != nil {
		return false
	}
	for _, ev := range events {
		var m map[string]interface{}
		if json.Unmarshal([]byte(ev.Metadata), &m) == nil {
			if e, ok := m["episode"].(float64); ok && int(e) == episode {
				return true
			}
		}
	}
	return false
}

var episodeWatchedMu sync.Mutex
var mangaChapterReadMu sync.Mutex

// RecordMangaChapterRead records a completed chapter once, including the daily aggregate
// and granular event used by streaks and achievements.
func (db *Database) RecordMangaChapterRead(mediaId int, chapter int, minutes int, metadata interface{}) (recorded bool, firstChapter bool, monthlyChapters int, err error) {
	mangaChapterReadMu.Lock()
	defer mangaChapterReadMu.Unlock()

	if mediaId == 0 || chapter <= 0 {
		return false, false, 0, errors.New("media ID and chapter number must be valid")
	}

	now := time.Now()
	eventMetadata, err := json.Marshal(metadata)
	if err != nil {
		return false, false, 0, err
	}

	err = db.gormdb.Transaction(func(tx *gorm.DB) error {
		var recentEvents []models.ActivityEvent
		err := tx.
			Where("event_type = ? AND media_id = ? AND created_at >= ?", models.ActivityEventMangaChapterRead, mediaId, now.Add(-12*time.Hour)).
			Find(&recentEvents).Error
		if err != nil {
			return err
		}
		for _, event := range recentEvents {
			var eventData struct {
				Chapter int `json:"chapter"`
			}
			if json.Unmarshal([]byte(event.Metadata), &eventData) == nil && eventData.Chapter == chapter {
				return nil
			}
		}

		var chaptersRead int64
		if err := tx.Model(&models.ActivityLog{}).
			Select("COALESCE(SUM(manga_chapters), 0)").
			Scan(&chaptersRead).Error; err != nil {
			return err
		}
		firstChapter = chaptersRead == 0

		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Format("2006-01-02")
		today := now.Format("2006-01-02")
		var currentMonthChapters int64
		if err := tx.Model(&models.ActivityLog{}).
			Where("date >= ? AND date <= ?", monthStart, today).
			Select("COALESCE(SUM(manga_chapters), 0)").
			Scan(&currentMonthChapters).Error; err != nil {
			return err
		}
		monthlyChapters = int(currentMonthChapters) + 1

		var activityLog models.ActivityLog
		result := tx.Where("date = ?", today).First(&activityLog)
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			if err := tx.Create(&models.ActivityLog{
				Date:          today,
				MangaChapters: 1,
				MangaMinutes:  max(minutes, 0),
			}).Error; err != nil {
				return err
			}
		} else if result.Error != nil {
			return result.Error
		} else {
			updates := map[string]interface{}{
				"manga_chapters": gorm.Expr("manga_chapters + ?", 1),
			}
			if minutes > 0 {
				updates["manga_minutes"] = gorm.Expr("manga_minutes + ?", minutes)
			}
			if err := tx.Model(&activityLog).Updates(updates).Error; err != nil {
				return err
			}
		}

		if err := tx.Create(&models.ActivityEvent{
			EventType: models.ActivityEventMangaChapterRead,
			MediaId:   mediaId,
			Metadata:  string(eventMetadata),
		}).Error; err != nil {
			return err
		}
		recorded = true
		return nil
	})
	if err != nil {
		return false, false, 0, err
	}
	return recorded, firstChapter, monthlyChapters, nil
}

// RecordEpisodeWatched records both the daily aggregate and the granular event for a
// watched episode, skipping both when the same (media, episode) was already recorded in
// the last 12 hours (see HasRecentEpisodeWatchedEvent).
func (db *Database) RecordEpisodeWatched(mediaId int, episode int, totalEpisodes int, minutes int) error {
	// The check and the insert must be one step: several paths report the same completion at once.
	episodeWatchedMu.Lock()
	defer episodeWatchedMu.Unlock()
	if db.HasRecentEpisodeWatchedEvent(mediaId, episode, 12*time.Hour) {
		return nil
	}
	_ = db.RecordAnimeActivity(1, minutes)
	return db.RecordActivityEvent(models.ActivityEventEpisodeWatched, mediaId, map[string]interface{}{
		"episode":       episode,
		"totalEpisodes": totalEpisodes,
		"duration":      minutes,
	})
}

// GetActivityEventTimes returns the timestamps of all events of the given type, ascending.
// Used for streak computation with a sub-day dead period.
func (db *Database) GetActivityEventTimes(eventType string) ([]time.Time, error) {
	var times []time.Time
	err := db.gormdb.Model(&models.ActivityEvent{}).
		Where("event_type = ?", eventType).
		Order("created_at ASC").
		Pluck("created_at", &times).Error
	return times, err
}

// PruneActivityEvents deletes activity events older than the given duration.
func (db *Database) PruneActivityEvents(maxAge time.Duration) error {
	cutoff := time.Now().Add(-maxAge)
	return db.gormdb.Where("created_at < ?", cutoff).Delete(&models.ActivityEvent{}).Error
}
