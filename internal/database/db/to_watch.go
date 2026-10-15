package db

import (
	"errors"

	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// A profile's todo list: anime and manga the user means to watch or read, in the order they arranged. Ordered by
// position; a reorder rewrites the positions whole.

// GetToWatchItems returns a profile's list in their order. A list of thousands is a list, so this
// is one indexed read and nothing fancier.
func (db *Database) GetToWatchItems(profileID uint) ([]*models.ToWatchItem, error) {
	var res []*models.ToWatchItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("profile_id = ?", profileID).Order("position ASC, id ASC").Find(&res).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to get a to-watch list")
		return nil, err
	}
	return res, nil
}

// InsertToWatchItem adds a media entry to the end of a profile's list. One copy per profile and
// media type: anime and manga IDs can overlap.
func (db *Database) InsertToWatchItem(item *models.ToWatchItem) error {
	if item.MediaType == "" {
		item.MediaType = "ANIME"
	}
	var existing models.ToWatchItem
	err := retryOnBusy(func() error {
		return db.gormdb.Where("profile_id = ? AND anime_id = ? AND media_type = ?", item.ProfileID, item.AnimeID, item.MediaType).First(&existing).Error
	})
	if err == nil {
		return errors.New("already in the to-watch list")
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		db.Logger.Error().Err(err).Msg("db: Failed to check the to-watch list")
		return err
	}

	err = retryOnBusy(func() error {
		return db.gormdb.Create(item).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to add to a to-watch list")
		return err
	}
	return nil
}

// CountToWatchItems returns how many entries a profile's list has.
func (db *Database) CountToWatchItems(profileID uint) (int, error) {
	var count int64
	err := retryOnBusy(func() error {
		return db.gormdb.Model(&models.ToWatchItem{}).Where("profile_id = ?", profileID).Count(&count).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to count a to-watch list")
		return 0, err
	}
	return int(count), nil
}

func (db *Database) DeleteToWatchItem(profileID uint, mediaID int, mediaType string) error {
	if mediaType == "" {
		mediaType = "ANIME"
	}
	err := retryOnBusy(func() error {
		return db.gormdb.Where("profile_id = ? AND anime_id = ? AND media_type = ?", profileID, mediaID, mediaType).
			Delete(&models.ToWatchItem{}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to remove from a to-watch list")
		return err
	}
	return nil
}

// SetToWatchOrder rewrites a profile's running order from the media entries given. One
// write per profile, so a reorder is a reorder rather than a sequence of moves.
func (db *Database) SetToWatchOrder(profileID uint, items []*models.ToWatchItem) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Transaction(func(tx *gorm.DB) error {
			for i, item := range items {
				mediaType := item.MediaType
				if mediaType == "" {
					mediaType = "ANIME"
				}
				if err := tx.Model(&models.ToWatchItem{}).
					Where("profile_id = ? AND anime_id = ? AND media_type = ?", profileID, item.AnimeID, mediaType).
					Update("position", i+1).Error; err != nil {
					return err
				}
			}
			return nil
		})
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to reorder a to-watch list")
		return err
	}
	return nil
}

func (db *Database) ClearToWatchItems(profileID uint) error {
	err := retryOnBusy(func() error {
		return db.gormdb.Where("profile_id = ?", profileID).Delete(&models.ToWatchItem{}).Error
	})
	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to clear a to-watch list")
		return err
	}
	return nil
}
