package db

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"seanime/internal/database/models"
)

// A run produces two things that have no queue row to live on: what it found for the anime it drops,
// and how the run itself ended. Both are kept here so they outlive the process.

const (
	// EnqueueFutureDroppedRowLimit is how many dropped anime are remembered, newest first. A row is
	// small and there is one per anime at most, so this is generous; it stops a long walk across
	// the catalog from growing the table for good.
	EnqueueFutureDroppedRowLimit = 2000
	// EnqueueFutureDroppedSnapshotLimit is how many of those keep their snapshot. A snapshot runs to
	// hundreds of kilobytes, so the full row limit would be gigabytes in the worst case. Older rows
	// keep everything but the blob, and one put back on the queue is searched live instead.
	EnqueueFutureDroppedSnapshotLimit = 200

	enqueueFutureLastRunID = 1
)

// enqueueFutureDroppedColumns is everything the dropped list draws, without the snapshot blob.
var enqueueFutureDroppedColumns = []string{
	"id", "created_at", "updated_at", "profile_id", "media_id", "root_media_id", "family_id", "depth",
	"relation_type", "parent_media_id", "title", "cover_image", "reason", "torrents", "best_seeders",
	"total_seeders", "aired_at", "score", "provider_id",
}

// SaveEnqueueFutureDroppedItem records a dropped anime, replacing what an earlier run recorded for
// it, and trims the table back to its limits.
func (db *Database) SaveEnqueueFutureDroppedItem(item *models.EnqueueFutureDroppedItem) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "media_id"}},
			UpdateAll: true,
		}).Create(item).Error
	})
	if err != nil {
		return err
	}
	return db.pruneEnqueueFutureDroppedItems()
}

func (db *Database) pruneEnqueueFutureDroppedItems() error {
	newest := func(limit int) *gorm.DB {
		return db.gormdb.Model(&models.EnqueueFutureDroppedItem{}).
			Select("id").
			Order("updated_at DESC, id DESC").
			Limit(limit)
	}
	return retryOnBusy(func() error {
		if err := db.gormdb.
			Where("id NOT IN (?)", newest(EnqueueFutureDroppedRowLimit)).
			Delete(&models.EnqueueFutureDroppedItem{}).Error; err != nil {
			return err
		}
		// UpdateColumn, so clearing a blob does not touch updated_at and promote the row to newest.
		return db.gormdb.Model(&models.EnqueueFutureDroppedItem{}).
			Where("value IS NOT NULL AND id NOT IN (?)", newest(EnqueueFutureDroppedSnapshotLimit)).
			UpdateColumn("value", nil).Error
	})
}

// GetEnqueueFutureDroppedItems returns the dropped anime highest rated first, without their snapshots.
// Unscored anime sit at the bottom, and ties read newest first.
func (db *Database) GetEnqueueFutureDroppedItems() ([]*models.EnqueueFutureDroppedItem, error) {
	var res []*models.EnqueueFutureDroppedItem
	err := retryOnBusy(func() error {
		return db.gormdb.
			Model(&models.EnqueueFutureDroppedItem{}).
			Select(enqueueFutureDroppedColumns).
			Order("score DESC, updated_at DESC, id DESC").
			Find(&res).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get dropped enqueue future items")
		return nil, err
	}
	return res, nil
}

// GetEnqueueFutureDroppedItem returns one dropped anime with its snapshot, or nil when there is none.
func (db *Database) GetEnqueueFutureDroppedItem(mediaID int) (*models.EnqueueFutureDroppedItem, error) {
	var res models.EnqueueFutureDroppedItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("media_id = ?", mediaID).First(&res).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &res, nil
}

// HasEnqueueFutureDroppedItem reports whether a run has dropped this anime.
func (db *Database) HasEnqueueFutureDroppedItem(mediaID int) bool {
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureDroppedItem{}).
			Where("media_id = ?", mediaID).
			Count(&count).Error
	})
	return err == nil && count > 0
}

// DeleteEnqueueFutureDroppedItem forgets one dropped anime.
func (db *Database) DeleteEnqueueFutureDroppedItem(mediaID int) error {
	return retryOnBusy(func() error {
		return db.gormdb.
			Where("media_id = ?", mediaID).
			Delete(&models.EnqueueFutureDroppedItem{}).Error
	})
}

// ClearEnqueueFutureDroppedItems forgets every dropped anime.
func (db *Database) ClearEnqueueFutureDroppedItems() error {
	return retryOnBusy(func() error {
		return db.gormdb.
			Where("1 = 1").
			Delete(&models.EnqueueFutureDroppedItem{}).Error
	})
}

// SaveEnqueueFutureLastRun replaces the record of the most recent run.
func (db *Database) SaveEnqueueFutureLastRun(run *models.EnqueueFutureLastRun) error {
	run.ID = enqueueFutureLastRunID
	return retryOnBusy(func() error {
		return db.gormdb.Save(run).Error
	})
}

// GetEnqueueFutureLastRun returns the record of the most recent run, or nil when there is none.
func (db *Database) GetEnqueueFutureLastRun() (*models.EnqueueFutureLastRun, error) {
	var res models.EnqueueFutureLastRun
	err := retryOnBusy(func() error {
		return db.gormdb.Where("id = ?", enqueueFutureLastRunID).First(&res).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &res, nil
}

// ClearEnqueueFutureLastRun forgets the most recent run.
func (db *Database) ClearEnqueueFutureLastRun() error {
	return retryOnBusy(func() error {
		return db.gormdb.
			Where("id = ?", enqueueFutureLastRunID).
			Delete(&models.EnqueueFutureLastRun{}).Error
	})
}
