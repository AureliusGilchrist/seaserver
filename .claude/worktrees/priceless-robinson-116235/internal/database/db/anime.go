package db

import (
	"seanime/internal/database/models"
	"seanime/internal/util/result"
)

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synthetic Anime functions
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var syntheticAnimeCache = result.NewMap[int, *models.SyntheticAnime]()

func (db *Database) GetSyntheticAnime(syntheticId int) (*models.SyntheticAnime, bool) {
	if res, ok := syntheticAnimeCache.Get(syntheticId); ok {
		return res, true
	}

	var res models.SyntheticAnime
	err := db.gormdb.Where("synthetic_id = ?", syntheticId).First(&res).Error
	if err != nil {
		return nil, false
	}

	syntheticAnimeCache.Set(syntheticId, &res)
	return &res, true
}

func (db *Database) GetSyntheticAnimeByTitle(title string) (*models.SyntheticAnime, bool) {
	var res models.SyntheticAnime
	err := db.gormdb.Where("title = ?", title).First(&res).Error
	if err != nil {
		return nil, false
	}

	syntheticAnimeCache.Set(res.SyntheticID, &res)
	return &res, true
}

func (db *Database) GetAllSyntheticAnime() ([]*models.SyntheticAnime, error) {
	var res []*models.SyntheticAnime
	err := db.gormdb.Find(&res).Error
	if err != nil {
		return nil, err
	}
	return res, nil
}

func (db *Database) InsertSyntheticAnime(anime *models.SyntheticAnime) error {
	syntheticAnimeCache.Set(anime.SyntheticID, anime)
	return db.gormdb.Save(anime).Error
}

func (db *Database) UpdateSyntheticAnime(anime *models.SyntheticAnime) error {
	syntheticAnimeCache.Set(anime.SyntheticID, anime)
	return db.gormdb.Save(anime).Error
}

func (db *Database) DeleteSyntheticAnime(syntheticId int) error {
	err := db.gormdb.Where("synthetic_id = ?", syntheticId).Delete(&models.SyntheticAnime{}).Error
	if err != nil {
		return err
	}
	syntheticAnimeCache.Delete(syntheticId)
	return nil
}

// SearchSyntheticAnime searches for synthetic anime by title (case-insensitive partial match)
func (db *Database) SearchSyntheticAnime(query string, limit int) ([]*models.SyntheticAnime, error) {
	if limit <= 0 {
		limit = 10
	}
	var res []*models.SyntheticAnime
	err := db.gormdb.Where("LOWER(title) LIKE LOWER(?) OR LOWER(title_english) LIKE LOWER(?) OR LOWER(synonyms) LIKE LOWER(?)", 
		"%"+query+"%", "%"+query+"%", "%"+query+"%").Limit(limit).Find(&res).Error
	if err != nil {
		return nil, err
	}
	return res, nil
}

// GetSyntheticAnimeCount returns the total count of synthetic anime entries
func (db *Database) GetSyntheticAnimeCount() (int64, error) {
	var count int64
	err := db.gormdb.Model(&models.SyntheticAnime{}).Count(&count).Error
	return count, err
}

// ClearAllSyntheticAnime removes all synthetic anime entries (used before reimporting)
func (db *Database) ClearAllSyntheticAnime() error {
	syntheticAnimeCache = result.NewMap[int, *models.SyntheticAnime]()
	return db.gormdb.Where("1 = 1").Delete(&models.SyntheticAnime{}).Error
}

// UpsertSyntheticAnime inserts or updates a synthetic anime entry based on synthetic_id
func (db *Database) UpsertSyntheticAnime(anime *models.SyntheticAnime) error {
	var existing models.SyntheticAnime
	err := db.gormdb.Where("synthetic_id = ?", anime.SyntheticID).First(&existing).Error
	if err != nil {
		// Not found, insert new
		return db.InsertSyntheticAnime(anime)
	}
	// Found, update
	anime.ID = existing.ID
	return db.UpdateSyntheticAnime(anime)
}
