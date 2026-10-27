package db

import (
	"seanime/internal/database/models"
	"strconv"
	"time"

	"gorm.io/gorm"
)

// AppendAchievementLog stores log rows for the achievement rules.
func (db *Database) AppendAchievementLog(entries ...models.AchievementLogEntry) error {
	if len(entries) == 0 {
		return nil
	}
	return db.gormdb.CreateInBatches(entries, 500).Error
}

// GetAchievementLog returns every log row, oldest first.
func (db *Database) GetAchievementLog() ([]models.AchievementLogEntry, error) {
	var rows []models.AchievementLogEntry
	err := db.gormdb.Order("at ASC, id ASC").Find(&rows).Error
	return rows, err
}

// AchievementLogCount reports how many log rows exist.
func (db *Database) AchievementLogCount() int64 {
	var n int64
	db.gormdb.Model(&models.AchievementLogEntry{}).Count(&n)
	return n
}

// HasAchievementLogEntry reports whether a row of this kind for this media and number was logged
// at or after the given time (deduplication across the several paths that report one watch).
func (db *Database) HasAchievementLogEntry(kind, mediaType string, mediaID, number int, since time.Time) bool {
	var n int64
	db.gormdb.Model(&models.AchievementLogEntry{}).
		Where("kind = ? AND media_type = ? AND media_id = ? AND number = ? AND at >= ?", kind, mediaType, mediaID, number, since.Unix()).
		Count(&n)
	return n > 0
}

// GetAchievementListSnapshot returns the last-seen list state, keyed by "<type>:<id>".
func (db *Database) GetAchievementListSnapshot() (map[string]models.AchievementListSnapshot, error) {
	var rows []models.AchievementListSnapshot
	if err := db.gormdb.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[string]models.AchievementListSnapshot, len(rows))
	for _, r := range rows {
		out[snapshotKey(r.MediaType, r.MediaID)] = r
	}
	return out, nil
}

// ReplaceAchievementListSnapshot replaces the stored list state of one media type.
func (db *Database) ReplaceAchievementListSnapshot(mediaType string, rows []models.AchievementListSnapshot) error {
	return db.gormdb.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("media_type = ?", mediaType).Delete(&models.AchievementListSnapshot{}).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		return tx.CreateInBatches(rows, 500).Error
	})
}

func snapshotKey(mediaType string, id int) string {
	return mediaType + ":" + strconv.Itoa(id)
}

// GetAllActivityEventsAsc returns every activity event still on record, oldest first.
func (db *Database) GetAllActivityEventsAsc() ([]*models.ActivityEvent, error) {
	var events []*models.ActivityEvent
	err := db.gormdb.Order("created_at ASC").Find(&events).Error
	return events, err
}

// FavoriteCounts returns how many anime and manga this profile has favourited.
func (db *Database) FavoriteCounts() (anime int, manga int) {
	var a, m int64
	db.gormdb.Model(&models.AnimeFavorite{}).Count(&a)
	db.gormdb.Model(&models.MangaFavorite{}).Count(&m)
	return int(a), int(m)
}

// UpsertAchievementListSnapshot writes the last-seen state of one entry.
func (db *Database) UpsertAchievementListSnapshot(row models.AchievementListSnapshot) error {
	return db.gormdb.Save(&row).Error
}
