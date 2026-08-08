package db

import (
	"errors"
	"strings"

	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// The queue is global: one shared queue for the server, not one per profile.
//
// Every accessor here is deliberately unscoped. A recommendation graph is the same graph whoever is
// looking at it, and the whole value of the queue is that an anime dealt with once stays dealt with
// — scoping it per profile meant the same show came back for each profile in turn, and, because
// media_id is globally unique, the second profile's insert failed the constraint and its item was
// silently dropped from the run instead. EnqueueFutureItem.ProfileID is kept as provenance: which
// profile's run discovered the row, never a filter.
//
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
func (db *Database) GetEnqueueFutureItems() ([]*models.EnqueueFutureItem, error) {
	var res []*models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.Order("position ASC, id ASC").Find(&res).Error
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
func (db *Database) GetEnqueueFutureListItems() ([]*models.EnqueueFutureItem, error) {
	var res []*models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.
			Model(&models.EnqueueFutureItem{}).
			Select("id", "created_at", "updated_at", "profile_id", "media_id", "root_media_id",
				"family_id", "position", "depth", "status", "attempts", "last_error", "title", "cover_image").
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
func (db *Database) GetEnqueueFutureItem(mediaID int) (*models.EnqueueFutureItem, error) {
	var res models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("media_id = ?", mediaID).First(&res).Error
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
func (db *Database) HasEnqueueFutureItem(mediaID int) bool {
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("media_id = ?", mediaID).
			Count(&count).Error
	})
	return err == nil && count > 0
}

// CountEnqueueFutureItemsForRoot returns how many items a given run has discovered so far.
func (db *Database) CountEnqueueFutureItemsForRoot(rootMediaID int) (int, error) {
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("root_media_id = ?", rootMediaID).
			Count(&count).Error
	})
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

// CountEnqueueFutureFamiliesForRoot returns how many distinct franchises a run has queued.
//
// This, not the item count, is what the per-run cap is checked against: a show and all its seasons,
// sequels and side stories are one thing to decide about, so a franchise costs one slot whether it
// has one entry or fifteen.
func (db *Database) CountEnqueueFutureFamiliesForRoot(rootMediaID int) (int, error) {
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("root_media_id = ?", rootMediaID).
			Distinct("family_id").
			Count(&count).Error
	})
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

// EnqueueFutureRunCounts is what a run has actually achieved, read back from the queue itself.
type EnqueueFutureRunCounts struct {
	Items    int
	Prepared int
	Failed   int
	Families int
}

// GetEnqueueFutureRunCounts reads a run's progress off the queue rather than trusting a counter.
//
// In-memory tallies drift: a resumed run starts from whatever the progress file last recorded, and
// anything that happened between the final write and the process dying is lost — leaving a screen
// reading "0 of 0" over a queue with a hundred rows in it. The database is the thing that is
// actually true, so the readout comes from there.
func (db *Database) GetEnqueueFutureRunCounts(rootMediaID int) (EnqueueFutureRunCounts, error) {
	var counts EnqueueFutureRunCounts

	base := func() *gorm.DB {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("root_media_id = ?", rootMediaID)
	}

	var items, prepared, failed, families int64
	err := retryOnBusy(func() error {
		if err := base().Count(&items).Error; err != nil {
			return err
		}
		if err := base().Where("status IN ?", []string{
			EnqueueFutureStatusReady, EnqueueFutureStatusNoResults,
			EnqueueFutureStatusDownloaded, EnqueueFutureStatusSkipped, EnqueueFutureStatusIgnored,
		}).Count(&prepared).Error; err != nil {
			return err
		}
		if err := base().Where("status = ?", EnqueueFutureStatusFailed).Count(&failed).Error; err != nil {
			return err
		}
		return base().Distinct("family_id").Count(&families).Error
	})
	if err != nil {
		return counts, err
	}

	counts.Items = int(items)
	counts.Prepared = int(prepared)
	counts.Failed = int(failed)
	counts.Families = int(families)
	return counts, nil
}

// HasEnqueueFutureFamily reports whether any member of a franchise is already queued.
//
// A candidate joining a family that is already in the queue is free — it is part of a franchise you
// have already taken on, and leaving half a series out because a counter ran out mid-way would be
// worse than useless.
func (db *Database) HasEnqueueFutureFamily(familyID int) bool {
	if familyID == 0 {
		return false
	}
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("family_id = ?", familyID).
			Count(&count).Error
	})
	return err == nil && count > 0
}

// InsertEnqueueFutureItem adds a newly discovered anime to the end of the queue.
//
// Returns false without an error when the anime is already queued — discovery hits duplicates
// constantly (that is what a recommendation graph is), so this is the normal path, not a fault.
func (db *Database) InsertEnqueueFutureItem(item *models.EnqueueFutureItem) (bool, error) {
	if db.HasEnqueueFutureItem(item.MediaID) {
		return false, nil
	}

	var maxPosition int64
	_ = retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
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
		// The unique index on (profile_id, media_id) is the last word on duplicates: two runs can
		// discover the same anime between the check above and this insert. That is the same "already
		// queued" answer as the check above, not a failure — reporting it as an error made an
		// ordinary race look like a broken run to the caller.
		if isUniqueConstraintErr(err) {
			db.Logger.Trace().Int("mediaId", item.MediaID).Uint("profileId", item.ProfileID).
				Msg("db: Enqueue future item was already queued")
			return false, nil
		}
		db.Logger.Debug().Err(err).Int("mediaId", item.MediaID).Msg("db: Failed to insert enqueue future item")
		return false, err
	}
	return true, nil
}

// isUniqueConstraintErr reports whether an insert failed only because the row is already there.
func isUniqueConstraintErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	return strings.Contains(strings.ToUpper(err.Error()), "UNIQUE CONSTRAINT FAILED")
}

// MergeEnqueueFutureFamily re-points every member of one family onto another.
//
// Families are discovered a show at a time, so a franchise reached from two directions starts life
// as two groups — this is what folds them back into one once the connection between them shows up.
func (db *Database) MergeEnqueueFutureFamily(fromFamilyID int, intoFamilyID int) error {
	if fromFamilyID == intoFamilyID || fromFamilyID == 0 || intoFamilyID == 0 {
		return nil
	}
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("family_id = ?", fromFamilyID).
			Update("family_id", intoFamilyID).Error
	})
}

// GetNextPendingEnqueueFutureItem returns the oldest unprepared item, or nil when there is none.
func (db *Database) GetNextPendingEnqueueFutureItem() (*models.EnqueueFutureItem, error) {
	var res models.EnqueueFutureItem
	err := retryOnBusy(func() error {
		return db.gormdb.
			Where("status = ?", EnqueueFutureStatusPending).
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
func (db *Database) SetEnqueueFutureItemStatus(mediaID int, status string, lastError string) error {
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("media_id = ?", mediaID).
			Updates(map[string]interface{}{
				"status":     status,
				"last_error": lastError,
			}).Error
	})
}

// SaveEnqueueFutureItemSnapshot stores a prepared item: its snapshot blob, the display fields read
// out of it, and the status the preparation ended in.
func (db *Database) SaveEnqueueFutureItemSnapshot(
	mediaID int, status string, title string, coverImage string, value []byte,
) error {
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("media_id = ?", mediaID).
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
func (db *Database) IncrementEnqueueFutureItemAttempts(mediaID int, lastError string) error {
	return retryOnBusy(func() error {
		return db.gormdb.Model(&models.EnqueueFutureItem{}).
			Where("media_id = ?", mediaID).
			Updates(map[string]interface{}{
				"attempts":   gorm.Expr("attempts + 1"),
				"last_error": lastError,
			}).Error
	})
}

// DeleteEnqueueFutureItem removes one item from the queue.
func (db *Database) DeleteEnqueueFutureItem(mediaID int) error {
	return retryOnBusy(func() error {
		return db.gormdb.
			Where("media_id = ?", mediaID).
			Delete(&models.EnqueueFutureItem{}).Error
	})
}

// ClearEnqueueFutureItems empties the queue.
func (db *Database) ClearEnqueueFutureItems() error {
	return retryOnBusy(func() error {
		return db.gormdb.
			Where("1 = 1").
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
