package db

import (
	"errors"
	"gorm.io/gorm"
	"seanime/internal/database/models"
)

func (db *Database) GetChapterDownloadQueue() ([]*models.ChapterDownloadQueueItem, error) {
	var res []*models.ChapterDownloadQueueItem
	// Order by id only to maintain strict insertion order (FIFO)
	err := db.gormdb.Order("id ASC").Find(&res).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get chapter download queue")
		return nil, err
	}

	return res, nil
}

func (db *Database) GetNextChapterDownloadQueueItem() (*models.ChapterDownloadQueueItem, error) {
	var res models.ChapterDownloadQueueItem
	// Order by id only to maintain strict insertion order (FIFO)
	// This ensures new manga chapters go to the end of the queue
	err := db.gormdb.Where("status = ?", "not_started").Order("id ASC").First(&res).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			db.Logger.Error().Err(err).Msg("db: Failed to get next chapter download queue item")
		}
		return nil, nil
	}

	return &res, nil
}

func (db *Database) DequeueChapterDownloadQueueItem() (*models.ChapterDownloadQueueItem, error) {
	// Pop the first item from the queue
	var res models.ChapterDownloadQueueItem
	err := db.gormdb.Where("status = ?", "downloading").First(&res).Error
	if err != nil {
		return nil, err
	}

	err = db.gormdb.Delete(&res).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to delete chapter download queue item")
		return nil, err
	}

	return &res, nil
}

// MaxQueuedSeries is the maximum number of unique manga series allowed in the download queue at once.
// Chapters per series are unlimited.
const MaxQueuedSeries = 50

func (db *Database) InsertChapterDownloadQueueItem(item *models.ChapterDownloadQueueItem) error {

	// Check if the item already exists
	var existingItem models.ChapterDownloadQueueItem
	err := db.gormdb.Where("provider = ? AND media_id = ? AND chapter_id = ?", item.Provider, item.MediaID, item.ChapterID).First(&existingItem).Error
	if err == nil {
		db.Logger.Debug().Msg("db: Chapter download queue item already exists")
		return errors.New("chapter is already in the download queue")
	}

	// Check if this media is already in the queue (if so, allow adding more chapters)
	var existingMediaItem models.ChapterDownloadQueueItem
	mediaAlreadyInQueue := db.gormdb.Where("media_id = ?", item.MediaID).First(&existingMediaItem).Error == nil

	// If this is a new series, check the series limit
	if !mediaAlreadyInQueue {
		var uniqueSeriesCount int64
		db.gormdb.Model(&models.ChapterDownloadQueueItem{}).Distinct("media_id").Count(&uniqueSeriesCount)
		if uniqueSeriesCount >= MaxQueuedSeries {
			db.Logger.Debug().Int64("currentCount", uniqueSeriesCount).Int("max", MaxQueuedSeries).Msg("db: Maximum queued series limit reached")
			return errors.New("maximum of 50 series allowed in the download queue at once")
		}
	}

	if item.ChapterID == "" {
		return errors.New("chapter ID is empty")
	}
	if item.Provider == "" {
		return errors.New("provider is empty")
	}
	if item.MediaID == 0 {
		return errors.New("media ID is empty")
	}
	if item.ChapterNumber == "" {
		return errors.New("chapter number is empty")
	}

	err = db.gormdb.Create(item).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to insert chapter download queue item")
		return err
	}
	return nil
}

func (db *Database) UpdateChapterDownloadQueueItemStatus(provider string, mId int, chapterId string, status string) error {
	err := db.gormdb.Model(&models.ChapterDownloadQueueItem{}).
		Where("provider = ? AND media_id = ? AND chapter_id = ?", provider, mId, chapterId).
		Update("status", status).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to update chapter download queue item status")
		return err
	}
	return nil
}

func (db *Database) UpdateChapterDownloadProgress(provider string, mId int, chapterId string, downloadedPages int) error {
	err := db.gormdb.Model(&models.ChapterDownloadQueueItem{}).
		Where("provider = ? AND media_id = ? AND chapter_id = ?", provider, mId, chapterId).
		Update("downloaded_pages", downloadedPages).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to update chapter download progress")
		return err
	}
	return nil
}

func (db *Database) GetChapterDownloadQueueCountForSeries(provider string, mediaID int) (int, error) {
	var count int64
	err := db.gormdb.Model(&models.ChapterDownloadQueueItem{}).
		Where("provider = ? AND media_id = ?", provider, mediaID).
		Count(&count).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to count chapter download queue items for series")
		return 0, err
	}
	return int(count), nil
}

func (db *Database) DeleteChapterDownloadQueueItemsForSeries(provider string, mediaID int) error {
	err := db.gormdb.Where("provider = ? AND media_id = ?", provider, mediaID).
		Delete(&models.ChapterDownloadQueueItem{}).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to delete chapter download queue items for series")
		return err
	}
	return nil
}

func (db *Database) GetMediaQueuedChapters(mediaId int) ([]*models.ChapterDownloadQueueItem, error) {
	var res []*models.ChapterDownloadQueueItem
	err := db.gormdb.Where("media_id = ?", mediaId).Find(&res).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get media queued chapters")
		return nil, err
	}

	return res, nil
}

// GetMediaQueuedChapterCount returns the number of chapters in the queue for a specific media
func (db *Database) GetMediaQueuedChapterCount(mediaId int) (int64, error) {
	var count int64
	err := db.gormdb.Model(&models.ChapterDownloadQueueItem{}).Where("media_id = ?", mediaId).Count(&count).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get media queued chapter count")
		return 0, err
	}
	return count, nil
}

// GetTotalQueuedChapterCount returns the total number of chapters in the queue
func (db *Database) GetTotalQueuedChapterCount() (int64, error) {
	var count int64
	err := db.gormdb.Model(&models.ChapterDownloadQueueItem{}).Count(&count).Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get total queued chapter count")
		return 0, err
	}
	return count, nil
}

func (db *Database) ClearAllChapterDownloadQueueItems() error {
	err := db.gormdb.
		Where("status = ? OR status = ? OR status = ?", "not_started", "downloading", "errored").
		Delete(&models.ChapterDownloadQueueItem{}).
		Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to clear all chapter download queue items")
		return err
	}
	return nil
}

func (db *Database) ResetErroredChapterDownloadQueueItems() error {
	err := db.gormdb.Model(&models.ChapterDownloadQueueItem{}).
		Where("status = ?", "errored").
		Update("status", "not_started").Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to reset errored chapter download queue items")
		return err
	}
	return nil
}

func (db *Database) ResetDownloadingChapterDownloadQueueItems() error {
	err := db.gormdb.Model(&models.ChapterDownloadQueueItem{}).
		Where("status = ?", "downloading").
		Update("status", "not_started").Error
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to reset downloading chapter download queue items")
		return err
	}
	return nil
}
