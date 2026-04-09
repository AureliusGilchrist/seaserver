package db

import (
	"seanime/internal/database/models"
	"time"
)

// RecordAnimeActivity increments the anime episode count and minutes for today's activity log.
func (db *Database) RecordAnimeActivity(episodes int, minutes int) error {
	today := time.Now().Format("2006-01-02")

	var log models.ActivityLog
	result := db.gormdb.Where("date = ?", today).First(&log)
	if result.Error != nil {
		// Create new row for today
		log = models.ActivityLog{
			Date:          today,
			AnimeEpisodes: episodes,
			MangaChapters: 0,
			AnimeMinutes:  minutes,
		}
		return db.gormdb.Create(&log).Error
	}

	// Update existing row
	return db.gormdb.Model(&log).Updates(map[string]interface{}{
		"anime_episodes": log.AnimeEpisodes + episodes,
		"anime_minutes":  log.AnimeMinutes + minutes,
	}).Error
}

// RecordMangaActivity increments the manga chapter count for today's activity log.
func (db *Database) RecordMangaActivity(chapters int) error {
	today := time.Now().Format("2006-01-02")

	var log models.ActivityLog
	result := db.gormdb.Where("date = ?", today).First(&log)
	if result.Error != nil {
		// Create new row for today
		log = models.ActivityLog{
			Date:          today,
			AnimeEpisodes: 0,
			MangaChapters: chapters,
			AnimeMinutes:  0,
		}
		return db.gormdb.Create(&log).Error
	}

	// Update existing row
	return db.gormdb.Model(&log).Updates(map[string]interface{}{
		"manga_chapters": log.MangaChapters + chapters,
	}).Error
}

// GetActivityLogs returns activity logs between startDate and endDate (inclusive), ordered by date ascending.
func (db *Database) GetActivityLogs(startDate, endDate string) ([]*models.ActivityLog, error) {
	var logs []*models.ActivityLog
	err := db.gormdb.
		Where("date >= ? AND date <= ?", startDate, endDate).
		Order("date ASC").
		Find(&logs).Error
	return logs, err
}

// GetAllActivityLogs returns all activity logs ordered by date ascending.
func (db *Database) GetAllActivityLogs() ([]*models.ActivityLog, error) {
	var logs []*models.ActivityLog
	err := db.gormdb.Order("date ASC").Find(&logs).Error
	return logs, err
}
