package db

import (
	"errors"

	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// Statuses an EnqueueFutureItem moves through.
//
// The unprepared states are the worker's business; the terminal ones are the user's. An item is
// discovered as Pending, claimed as Preparing, and settles into Ready (or NoResults / Failed) once
// the worker is done with it. The last three are only ever set from the queue screen.
//
// Skipped and Ignored both take an anime off the queue and differ only in what they mean, which is
// the point: skipping is "not this time", ignoring is "not ever". Both are kept as rows rather than
// deleted, because that record is exactly what stops the anime being rediscovered the next time a
// recommendation chain wanders past it.
const (
	EnqueueFutureStatusPending    = "pending"
	EnqueueFutureStatusPreparing  = "preparing"
	EnqueueFutureStatusReady      = "ready"
	EnqueueFutureStatusNoResults  = "no_results"
	EnqueueFutureStatusFailed     = "failed"
	EnqueueFutureStatusDownloaded = "downloaded"
	EnqueueFutureStatusSkipped    = "skipped"
	EnqueueFutureStatusIgnored    = "ignored"
)

// GetEnqueueFutureItems returns the whole queue in walk order, blobs included.
func (db *Database) GetEnqueueFutureItems(profileID uint) ([]*models.EnqueueFutureItem, error) {
	var res []*models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("profile_id = ?", profileID).Order("position ASC, id ASC").Find(&res).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get enqueue future items")
		return nil, err
	}
	return res, nil
}

// GetEnqueueFutureListItems returns the queue without the snapshot blobs.
//
// The list view renders every row, and the blobs are hundreds of kilobytes each — selecting them to
// draw a title and a cover would make opening the screen cost more than preparing the queue did.
func (db *Database) GetEnqueueFutureListItems(profileID uint) ([]*models.EnqueueFutureItem, error) {
	var res []*models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.
			Model(&models.EnqueueFutureItem{}).
			Select("id", "created_at", "updated_at", "profile_id", "media_id", "root_media_id",
				"family_id", "position", "depth", "status", "attempts", "last_error", "title", "cover_image").
			Where("profile_id = ?", profileID).
			Order("position ASC, id ASC").
			Find(&res).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get enqueue future list items")
		return nil, err
	}
	return res, nil
}

// GetEnqueueFutureItem returns one item with its snapshot, or nil when there is none.
func (db *Database) GetEnqueueFutureItem(profileID uint, mediaID int) (*models.EnqueueFutureItem, error) {
	var res models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("profile_id = ? AND media_id = ?", profileID, mediaID).First(&res).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		db.Logger.Error().Err(err).Int("mediaId", mediaID).Msg("db: Failed to get enqueue future item")
		return nil, err
	}
	return &res, nil
}

// HasEnqueueFutureItem reports whether the anime is already in the queue in any state.
//
// Terminal rows count: an anime you already downloaded or deliberately skipped must not come back
// the next time a recommendation chain wanders past it.
func (db *Database) HasEnqueueFutureItem(profileID uint, mediaID int) bool {
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("profile_id = ? AND media_id = ?", profileID, mediaID).
			Count(&count).Error
	})
	return err == nil && count > 0
}

// CountEnqueueFutureItemsForRoot returns how many items a given run has discovered so far. This is
// what the per-run cap is checked against.
func (db *Database) CountEnqueueFutureItemsForRoot(profileID uint, rootMediaID int) (int, error) {
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("profile_id = ? AND root_media_id = ?", profileID, rootMediaID).
			Count(&count).Error
	})
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

// InsertEnqueueFutureItem adds a newly discovered anime to the end of the queue.
//
// Returns false without an error when the anime is already queued — discovery hits duplicates
// constantly (that is what a recommendation graph is), so this is the normal path, not a fault.
func (db *Database) InsertEnqueueFutureItem(item *models.EnqueueFutureItem) (bool, error) {
	if db.HasEnqueueFutureItem(item.ProfileID, item.MediaID) {
		return false, nil
	}

	var maxPosition int64
	_ = retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("profile_id = ?", item.ProfileID).
			Select("COALESCE(MAX(position), 0)").
			Scan(&maxPosition).Error
	})
	item.Position = int(maxPosition) + 1

	if item.Status == "" {
		item.Status = EnqueueFutureStatusPending
	}

	err := retryOnBusy(func() error {
		return db.gormdb.Create(item).Error
	})
	if err != nil {
		// The unique index on media_id is the last word on duplicates: two runs can discover the
		// same anime between the check above and this insert.
		db.Logger.Debug().Err(err).Int("mediaId", item.MediaID).Msg("db: Failed to insert enqueue future item")
		return false, err
	}
	return true, nil
}

// MergeEnqueueFutureFamily re-points every member of one family onto another.
//
// Families are discovered a show at a time, so a franchise reached from two directions starts life
// as two groups — this is what folds them back into one once the connection between them shows up.
func (db *Database) MergeEnqueueFutureFamily(profileID uint, fromFamilyID int, intoFamilyID int) error {
	if fromFamilyID == intoFamilyID || fromFamilyID == 0 || intoFamilyID == 0 {
		return nil
	}
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("profile_id = ? AND family_id = ?", profileID, fromFamilyID).
			Update("family_id", intoFamilyID).Error
	})
}

// GetNextPendingEnqueueFutureItem returns the oldest unprepared item, or nil when there is none.
func (db *Database) GetNextPendingEnqueueFutureItem(profileID uint) (*models.EnqueueFutureItem, error) {
	var res models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.
			Where("profile_id = ? AND status = ?", profileID, EnqueueFutureStatusPending).
			Order("position ASC, id ASC").
			First(&res).Error
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &res, nil
}

// SetEnqueueFutureItemStatus updates an item's status and error text, leaving its snapshot alone.
func (db *Database) SetEnqueueFutureItemStatus(profileID uint, mediaID int, status string, lastError string) error {
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("profile_id = ? AND media_id = ?", profileID, mediaID).
			Updates(map[string]interface{}{
				"status":     status,
				"last_error": lastError,
			}).Error
	})
}

// SaveEnqueueFutureItemSnapshot stores a prepared item: its snapshot blob, the display fields read
// out of it, and the status the preparation ended in.
func (db *Database) SaveEnqueueFutureItemSnapshot(
	profileID uint, mediaID int, status string, title string, coverImage string, value []byte,
) error {
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("profile_id = ? AND media_id = ?", profileID, mediaID).
			Updates(map[string]interface{}{
				"status":      status,
				"title":       title,
				"cover_image": coverImage,
				"value":       value,
				"last_error":  "",
			}).Error
	})
}

// IncrementEnqueueFutureItemAttempts bumps an item's attempt counter and records why.
//
// Attempts are persisted rather than held in memory so a restart mid-run does not hand a
// permanently broken entry a fresh set of retries every time the server comes up.
func (db *Database) IncrementEnqueueFutureItemAttempts(profileID uint, mediaID int, lastError string) error {
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("profile_id = ? AND media_id = ?", profileID, mediaID).
			Updates(map[string]interface{}{
				"attempts":   gorm.Expr("attempts + 1"),
				"last_error": lastError,
			}).Error
	})
}

// DeleteEnqueueFutureItem removes one item from the queue.
func (db *Database) DeleteEnqueueFutureItem(profileID uint, mediaID int) error {
	return retryOnBusy(func() error {
		return db.gormdb.
			Where("profile_id = ? AND media_id = ?", profileID, mediaID).
			Delete(&models.EnqueueFutureItem{}).Error
	})
}

// ClearEnqueueFutureItems empties the queue.
func (db *Database) ClearEnqueueFutureItems(profileID uint) error {
	return retryOnBusy(func() error {
		return db.gormdb.
			Where("profile_id = ?", profileID).
			Delete(&models.EnqueueFutureItem{}).Error
	})
}

// ResetPreparingEnqueueFutureItems puts claimed-but-unfinished items back on the queue.
//
// Called at startup. "preparing" only ever means "a worker is holding this right now", so after a
// restart there is no worker and the state is a lie — without this, a server killed mid-run leaves
// one item stuck forever and the run never resumes past it.
func (db *Database) ResetPreparingEnqueueFutureItems() error {
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("status = ?", EnqueueFutureStatusPreparing).
			Update("status", EnqueueFutureStatusPending).Error
	})
}
