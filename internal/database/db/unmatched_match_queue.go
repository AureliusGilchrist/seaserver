package db

import (
	"errors"
	"time"

	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// The unmatched match queue: matches the user has decided on, waiting to be carried out. Ordered by
// insertion (the id), so the server works through them in the order they were made — see
// internal/handlers/unmatched_match_queue.go for the worker.

func (db *Database) GetUnmatchedMatchQueueItems() ([]*models.UnmatchedMatchQueueItem, error) {
	var res []*models.UnmatchedMatchQueueItem
	err := retryOnBusy(func() error {
		return db.gormdb.Order("id ASC").Find(&res).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get the unmatched match queue")
		return nil, err
	}
	return res, nil
}

func (db *Database) GetUnmatchedMatchQueueItem(id uint) (*models.UnmatchedMatchQueueItem, error) {
	var res models.UnmatchedMatchQueueItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("id = ?", id).First(&res).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &res, nil
}

// GetNextUnmatchedMatchQueueItem returns the oldest item that is waiting and due to be tried.
//
// An item that failed is passed over until its retry is due, so one download that cannot be matched
// — a file something else has open, a network drive that is asleep — does not hold up everything
// behind it. It keeps its place in the order and comes back when its turn comes round again.
func (db *Database) GetNextUnmatchedMatchQueueItem() (*models.UnmatchedMatchQueueItem, error) {
	var res models.UnmatchedMatchQueueItem
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
		db.Logger.Error().Err(err).Msg("db: Failed to get the next unmatched match queue item")
		return nil, err
	}
	return &res, nil
}

// GetUnmatchedMatchQueueItemForTorrent returns the oldest match queued for a torrent, if any.
//
// A download can have more than one match queued: a season pack is routinely matched in parts, one
// season at a time and sometimes to different entries of the franchise, and each of those is its
// own decision with its own files. So this is not "the" item for a torrent, it is the first one —
// which is the one the worker would have been carrying out, and the one an interrupted match
// belongs to.
func (db *Database) GetUnmatchedMatchQueueItemForTorrent(torrentName string) (*models.UnmatchedMatchQueueItem, error) {
	var res models.UnmatchedMatchQueueItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("torrent_name = ?", torrentName).Order("id ASC").First(&res).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &res, nil
}

// InsertUnmatchedMatchQueueItem queues a match.
//
// Always an insert, never a replacement: the same download is matched more than once as a matter of
// course — part of a pack now, the rest later, sometimes to different entries — so a second
// decision is a second match, not a correction of the first. An item whose files have all been
// matched already resolves itself when its turn comes: there is nothing left of what it selected,
// so it is dropped without touching anything.
func (db *Database) InsertUnmatchedMatchQueueItem(item *models.UnmatchedMatchQueueItem) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Create(item).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to insert an unmatched match queue item")
		return err
	}
	return nil
}

// MarkUnmatchedMatchQueueItemStarted records that the worker has taken the item on.
func (db *Database) MarkUnmatchedMatchQueueItemStarted(id uint) error {
	now := time.Now()
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.UnmatchedMatchQueueItem{}).
			Where("id = ?", id).
			Updates(map[string]any{
				"status":          "matching",
				"error_message":   "",
				"started_at":      &now,
				"finished_at":     nil,
				"next_attempt_at": nil,
			}).Error
	})
	return err
}

// RescheduleUnmatchedMatchQueueItem puts a failed match back in line to be tried again.
func (db *Database) RescheduleUnmatchedMatchQueueItem(id uint, errorMessage string, attempts int, nextAttemptAt time.Time) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.UnmatchedMatchQueueItem{}).
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
		db.Logger.Error().Err(err).Msg("db: Failed to reschedule a queued match")
		return err
	}
	return nil
}

// SetUnmatchedMatchQueueItemQuestion stores the question a match stopped on, with nothing moved —
// the conflict or count mismatch the user has to answer before it can run.
func (db *Database) SetUnmatchedMatchQueueItemQuestion(id uint, conflict []byte, countMismatch []byte, errorMessage string) error {
	now := time.Now()
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.UnmatchedMatchQueueItem{}).
			Where("id = ?", id).
			Updates(map[string]any{
				"status":          "needs_decision",
				"error_message":   errorMessage,
				"conflict":        conflict,
				"count_mismatch":  countMismatch,
				"finished_at":     &now,
				"started_at":      nil,
				"next_attempt_at": nil,
			}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to record an unanswered match question")
		return err
	}
	return nil
}

// UpdateUnmatchedMatchQueueItemRequest replaces the stored request, used when the user answers a
// question and the match goes back in line with their answer attached. The attempt count starts
// over: the answer is new information, and whatever failed before failed without it.
func (db *Database) UpdateUnmatchedMatchQueueItemRequest(id uint, request []byte, status string) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.UnmatchedMatchQueueItem{}).
			Where("id = ?", id).
			Updates(map[string]any{
				"request":         request,
				"status":          status,
				"error_message":   "",
				"attempts":        0,
				"next_attempt_at": nil,
				"conflict":        nil,
				"count_mismatch":  nil,
			}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to update a queued match")
		return err
	}
	return nil
}

// ResetUnmatchedMatchQueueItem attempts a match again straight away, clearing the backoff. Used by
// the screen's own "try again", where somebody has decided the reason it failed is gone.
func (db *Database) ResetUnmatchedMatchQueueItem(id uint) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.UnmatchedMatchQueueItem{}).
			Where("id = ?", id).
			Updates(map[string]any{
				"status":          "pending",
				"error_message":   "",
				"attempts":        0,
				"next_attempt_at": nil,
			}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to reset a queued match")
		return err
	}
	return nil
}

func (db *Database) DeleteUnmatchedMatchQueueItem(id uint) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Where("id = ?", id).Delete(&models.UnmatchedMatchQueueItem{}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to delete an unmatched match queue item")
		return err
	}
	return nil
}

// DeleteUnmatchedMatchQueueItemsForTorrent removes whatever is queued for a torrent, used when the
// download itself is gone or has been matched by something else.
func (db *Database) DeleteUnmatchedMatchQueueItemsForTorrent(torrentName string) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Where("torrent_name = ?", torrentName).Delete(&models.UnmatchedMatchQueueItem{}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to delete queued matches for a torrent")
		return err
	}
	return nil
}

func (db *Database) ClearUnmatchedMatchQueueItems() error {
	err := retryOnBusy(func() error {
		return db.gormdb.Where("1 = 1").Delete(&models.UnmatchedMatchQueueItem{}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to clear the unmatched match queue")
		return err
	}
	return nil
}

// ResetMatchingUnmatchedMatchQueueItems returns items left mid-match by a stop back to waiting.
//
// "Matching" is a claim that only holds while the worker making it is alive; nothing survives a
// restart, so neither should the claim. What actually happened to the files is decided from the
// disk — an interrupted match leaves a plan behind, and the queue steps around it until the plan
// has been seen through. See unmatched.ResumePendingMatches.
func (db *Database) ResetMatchingUnmatchedMatchQueueItems() error {
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.UnmatchedMatchQueueItem{}).
			Where("status = ?", "matching").
			Updates(map[string]any{"status": "pending", "started_at": nil}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to reset in-progress queued matches")
		return err
	}
	return nil
}
