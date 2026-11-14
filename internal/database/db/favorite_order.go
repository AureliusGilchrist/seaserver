package db

import (
	"fmt"

	"gorm.io/gorm"

	"seanime/internal/database/models"
)

// favoriteOrder lists favourites in the order the user arranged them, then anything not yet placed
// (rank 0) newest first — which is also how every list read before ranks existed.
const favoriteOrder = "CASE WHEN sort_rank = 0 THEN 1 ELSE 0 END, sort_rank ASC, added_at DESC"

// ReorderFavorites stores the order of one kind of favourite: ids[0] becomes first. Favourites not
// listed keep their rank; IDs that are not favourites are ignored.
func (db *Database) ReorderFavorites(kind string, ids []int) error {
	var model interface{}
	var column string
	switch kind {
	case "anime":
		model, column = &models.AnimeFavorite{}, "media_id"
	case "manga":
		model, column = &models.MangaFavorite{}, "media_id"
	case "character":
		model, column = &models.CharacterFavorite{}, "character_id"
	case "staff":
		model, column = &models.StaffFavorite{}, "staff_id"
	case "studio":
		model, column = &models.StudioFavorite{}, "studio_id"
	case "episode":
		// Episodes have a two-part key, so they are ordered by their row ID.
		model, column = &models.EpisodeFavorite{}, "id"
	case "theme":
		model, column = &models.ThemeFavorite{}, "id"
	default:
		return fmt.Errorf("unknown favourite type %q", kind)
	}
	return retryOnBusy(func() error {
		return db.gormdb.Transaction(func(tx *gorm.DB) error {
			for i, id := range ids {
				if err := tx.Model(model).Where(column+" = ?", id).Update("sort_rank", i+1).Error; err != nil {
					return err
				}
			}
			return nil
		})
	})
}
