package db

import (
	"encoding/json"
	"errors"

	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// MoveMangaMediaID re-files everything one database holds about a manga from one media ID to
// another, in one transaction. It is how a local series that has been matched to AniList stops
// being a local series: its reading history, favourite, provider link, downloaded-chapter records,
// download queue and todo entry all move to the AniList ID, so nothing is left behind under the
// synthetic one for the app to translate.
//
// Where a table allows one row per manga and the destination already has one, the two are merged
// rather than duplicated: the more recent reading history wins, an existing favourite, metadata or
// provider link for the destination is kept and the old one dropped.
//
// Returns how many rows changed. Running it again for the same pair changes nothing.
func (db *Database) MoveMangaMediaID(from, to int) (int, error) {
	if from == to || from == 0 || to == 0 {
		return 0, nil
	}

	moved := 0
	err := retryOnBusy(func() error {
		moved = 0
		return db.gormdb.Transaction(func(tx *gorm.DB) error {
			n, err := moveReadingHistory(tx, from, to)
			if err != nil {
				return err
			}
			moved += n

			for _, model := range []interface{}{&models.DownloadedMangaMetadata{}, &models.MangaFavorite{}} {
				n, err := moveUniqueByMediaID(tx, model, from, to)
				if err != nil {
					return err
				}
				moved += n
			}

			n, err = moveMangaMappings(tx, from, to)
			if err != nil {
				return err
			}
			moved += n

			for _, model := range []interface{}{&models.MangaChapterContainer{}, &models.ChapterDownloadQueueItem{}} {
				res := tx.Model(model).Where("media_id = ?", from).Update("media_id", to)
				if res.Error != nil {
					return res.Error
				}
				moved += int(res.RowsAffected)
			}

			n, err = moveToWatchManga(tx, from, to)
			if err != nil {
				return err
			}
			moved += n
			return nil
		})
	})
	if err != nil {
		return 0, err
	}

	if moved > 0 {
		// Cached lookups are keyed by media ID; drop them so nothing serves the old filing.
		mangaMappingCache.Clear()
		mangaChapterContainerCache.Clear()
	}
	return moved, nil
}

func moveReadingHistory(tx *gorm.DB, from, to int) (int, error) {
	var old models.MangaReadingHistory
	if err := tx.Where("media_id = ?", from).First(&old).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, nil
		}
		return 0, err
	}

	var existing models.MangaReadingHistory
	err := tx.Where("media_id = ?", to).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		res := tx.Model(&models.MangaReadingHistory{}).Where("id = ?", old.ID).
			Updates(map[string]interface{}{"media_id": to, "is_synthetic": to < 0})
		return int(res.RowsAffected), res.Error
	}
	if err != nil {
		return 0, err
	}

	// Both exist: keep the destination row, carrying the later read across.
	if old.LastReadAt.After(existing.LastReadAt) {
		if err := tx.Model(&models.MangaReadingHistory{}).Where("id = ?", existing.ID).
			Updates(map[string]interface{}{
				"last_read_at":        old.LastReadAt,
				"last_chapter_number": old.LastChapterNumber,
				"is_synthetic":        to < 0,
			}).Error; err != nil {
			return 0, err
		}
	}
	res := tx.Unscoped().Where("id = ?", old.ID).Delete(&models.MangaReadingHistory{})
	return int(res.RowsAffected), res.Error
}

// moveUniqueByMediaID moves a one-row-per-manga record, or drops it when the destination has one.
func moveUniqueByMediaID(tx *gorm.DB, model interface{}, from, to int) (int, error) {
	var count int64
	if err := tx.Model(model).Where("media_id = ?", to).Count(&count).Error; err != nil {
		return 0, err
	}
	if count > 0 {
		res := tx.Unscoped().Where("media_id = ?", from).Delete(model)
		return int(res.RowsAffected), res.Error
	}
	res := tx.Model(model).Where("media_id = ?", from).Update("media_id", to)
	return int(res.RowsAffected), res.Error
}

// moveMangaMappings moves each provider link, keeping the destination's own where it has one for
// the same provider — that one was chosen for the AniList entry and is not ours to replace.
func moveMangaMappings(tx *gorm.DB, from, to int) (int, error) {
	var rows []*models.MangaMapping
	if err := tx.Where("media_id = ?", from).Find(&rows).Error; err != nil {
		return 0, err
	}
	moved := 0
	for _, row := range rows {
		var count int64
		if err := tx.Model(&models.MangaMapping{}).Where("provider = ? AND media_id = ?", row.Provider, to).Count(&count).Error; err != nil {
			return moved, err
		}
		var res *gorm.DB
		if count > 0 {
			res = tx.Unscoped().Where("id = ?", row.ID).Delete(&models.MangaMapping{})
		} else {
			res = tx.Model(&models.MangaMapping{}).Where("id = ?", row.ID).Update("media_id", to)
		}
		if res.Error != nil {
			return moved, res.Error
		}
		moved += int(res.RowsAffected)
	}
	return moved, nil
}

// moveToWatchManga re-points manga todo entries, inside the stored entry as well as the column.
func moveToWatchManga(tx *gorm.DB, from, to int) (int, error) {
	var rows []*models.ToWatchItem
	if err := tx.Where("anime_id = ? AND media_type = ?", from, "MANGA").Find(&rows).Error; err != nil {
		return 0, err
	}
	moved := 0
	for _, row := range rows {
		var duplicate int64
		if err := tx.Model(&models.ToWatchItem{}).
			Where("profile_id = ? AND anime_id = ? AND media_type = ?", row.ProfileID, to, "MANGA").
			Count(&duplicate).Error; err != nil {
			return moved, err
		}
		if duplicate > 0 {
			if err := tx.Unscoped().Where("id = ?", row.ID).Delete(&models.ToWatchItem{}).Error; err != nil {
				return moved, err
			}
			moved++
			continue
		}
		updates := map[string]interface{}{"anime_id": to}
		if value := repointStoredMediaID(row.Value, from, to); value != nil {
			updates["value"] = value
		}
		if err := tx.Model(&models.ToWatchItem{}).Where("id = ?", row.ID).Updates(updates).Error; err != nil {
			return moved, err
		}
		moved++
	}
	return moved, nil
}

// repointStoredMediaID rewrites the media ID inside a stored JSON entry, or returns nil to leave it.
func repointStoredMediaID(value []byte, from, to int) []byte {
	if len(value) == 0 {
		return nil
	}
	var entry map[string]interface{}
	if err := json.Unmarshal(value, &entry); err != nil {
		return nil
	}
	changed := false
	for _, key := range []string{"mediaId", "animeId"} {
		if n, ok := entry[key].(float64); ok && int(n) == from {
			entry[key] = to
			changed = true
		}
	}
	if !changed {
		return nil
	}
	out, err := json.Marshal(entry)
	if err != nil {
		return nil
	}
	return out
}
