package db

import (
	"errors"
	"time"

	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// The torrent client's add queue: torrents the client could not take because it was offline, waiting
// to be added the moment it answers again. Ordered by insertion (the id), so they are imported in
// the order they were queued — see internal/torrent_clients/torrent_client/offline_queue.go.

func (db *Database) GetTorrentAddQueueItems() ([]*models.TorrentAddQueueItem, error) {
	var res []*models.TorrentAddQueueItem
	err := retryOnBusy(func() error {
		return db.gormdb.Order("id ASC").Find(&res).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get the torrent add queue")
		return nil, err
	}
	return res, nil
}

// GetNextTorrentAddQueueItem returns the oldest add that is waiting and due to be tried.
func (db *Database) GetNextTorrentAddQueueItem() (*models.TorrentAddQueueItem, error) {
	var res models.TorrentAddQueueItem
	now := time.Now()
	err := retryOnBusy(func() error {
		return db.gormdb.
			Where("status = ?", "pending").
			Where("next_attempt_at IS NULL OR next_attempt_at <= ?", now).
			Order("id ASC").
			First(&res).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		db.Logger.Error().Err(err).Msg("db: Failed to get the next torrent add queue item")
		return nil, err
	}
	return &res, nil
}

func (db *Database) InsertTorrentAddQueueItem(item *models.TorrentAddQueueItem) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Create(item).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to insert a torrent add queue item")
		return err
	}
	return nil
}

// MarkTorrentAddQueueItemStarted records that the worker is adding this torrent right now.
func (db *Database) MarkTorrentAddQueueItemStarted(id uint) error {
	now := time.Now()
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.TorrentAddQueueItem{}).
			Where("id = ?", id).
			Updates(map[string]any{
				"status":          "adding",
				"error_message":   "",
				"started_at":      &now,
				"next_attempt_at": nil,
			}).Error
	})
	return err
}

// RescheduleTorrentAddQueueItem puts a failed add back in line to be tried again, with the reason
// attached and a growing interval before the next try. Failures are not final: the queue keeps
// coming back to them, for as long as it takes.
func (db *Database) RescheduleTorrentAddQueueItem(id uint, errorMessage string, attempts int, nextAttemptAt time.Time) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.TorrentAddQueueItem{}).
			Where("id = ?", id).
			Updates(map[string]any{
				"status":          "pending",
				"error_message":   errorMessage,
				"attempts":        attempts,
				"next_attempt_at": &nextAttemptAt,
				"started_at":      nil,
			}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to reschedule a queued torrent add")
		return err
	}
	return nil
}

func (db *Database) DeleteTorrentAddQueueItem(id uint) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Where("id = ?", id).Delete(&models.TorrentAddQueueItem{}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to delete a torrent add queue item")
		return err
	}
	return nil
}

func (db *Database) ClearTorrentAddQueueItems() error {
	err := retryOnBusy(func() error {
		return db.gormdb.Where("1 = 1").Delete(&models.TorrentAddQueueItem{}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to clear the torrent add queue")
		return err
	}
	return nil
}

// ResetAddingTorrentAddQueueItems returns adds left mid-import by a stop back to waiting.
//
// "Adding" is a claim that only holds while the worker making it is alive; nothing survives a
// restart, so neither should the claim. Whether the torrent actually made it to the client is
// decided from the client itself when the queue next runs, not from a status written down before
// the stop.
func (db *Database) ResetAddingTorrentAddQueueItems() error {
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.TorrentAddQueueItem{}).
			Where("status = ?", "adding").
			Updates(map[string]any{"status": "pending", "started_at": nil}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to reset in-progress torrent adds")
		return err
	}
	return nil
}
