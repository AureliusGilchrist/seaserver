package db

import (
	"fmt"
	"seanime/internal/database/models"
	"seanime/internal/util/result"
	"time"
)

var mangaMappingCache = result.NewMap[string, *models.MangaMapping]()

func formatMangaMappingCacheKey(provider string, mediaId int) string {
	return fmt.Sprintf("%s$%d", provider, mediaId)
}

func (db *Database) GetMangaMapping(provider string, mediaId int) (*models.MangaMapping, bool) {

	if res, ok := mangaMappingCache.Get(formatMangaMappingCacheKey(provider, mediaId)); ok {
		return res, true
	}

	var res models.MangaMapping
	err := db.gormdb.Where("provider = ? AND media_id = ?", provider, mediaId).First(&res).Error
	if err != nil {
		return nil, false
	}

	mangaMappingCache.Set(formatMangaMappingCacheKey(provider, mediaId), &res)

	return &res, true
}

func (db *Database) InsertMangaMapping(provider string, mediaId int, mangaId string) error {
	mapping := models.MangaMapping{
		Provider: provider,
		MediaID:  mediaId,
		MangaID:  mangaId,
	}

	mangaMappingCache.Set(formatMangaMappingCacheKey(provider, mediaId), &mapping)

	return db.gormdb.Save(&mapping).Error
}

func (db *Database) DeleteMangaMapping(provider string, mediaId int) error {
	err := db.gormdb.Where("provider = ? AND media_id = ?", provider, mediaId).Delete(&models.MangaMapping{}).Error
	if err != nil {
		return err
	}

	mangaMappingCache.Delete(formatMangaMappingCacheKey(provider, mediaId))
	return nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var mangaChapterContainerCache = result.NewMap[string, *models.MangaChapterContainer]()

func formatMangaChapterContainerCacheKey(provider string, mediaId int, chapterId string) string {
	return fmt.Sprintf("%s$%d$%s", provider, mediaId, chapterId)
}

func (db *Database) GetMangaChapterContainer(provider string, mediaId int, chapterId string) (*models.MangaChapterContainer, bool) {

	if res, ok := mangaChapterContainerCache.Get(formatMangaChapterContainerCacheKey(provider, mediaId, chapterId)); ok {
		return res, true
	}

	var res models.MangaChapterContainer
	err := db.gormdb.Where("provider = ? AND media_id = ? AND chapter_id = ?", provider, mediaId, chapterId).First(&res).Error
	if err != nil {
		return nil, false
	}

	mangaChapterContainerCache.Set(formatMangaChapterContainerCacheKey(provider, mediaId, chapterId), &res)

	return &res, true
}

func (db *Database) InsertMangaChapterContainer(provider string, mediaId int, chapterId string, chapterContainer []byte) error {
	container := models.MangaChapterContainer{
		Provider:  provider,
		MediaID:   mediaId,
		ChapterID: chapterId,
		Data:      chapterContainer,
	}

	mangaChapterContainerCache.Set(formatMangaChapterContainerCacheKey(provider, mediaId, chapterId), &container)

	return db.gormdb.Save(&container).Error
}

func (db *Database) DeleteMangaChapterContainer(provider string, mediaId int, chapterId string) error {
	err := db.gormdb.Where("provider = ? AND media_id = ? AND chapter_id = ?", provider, mediaId, chapterId).Delete(&models.MangaChapterContainer{}).Error
	if err != nil {
		return err
	}

	mangaChapterContainerCache.Delete(formatMangaChapterContainerCacheKey(provider, mediaId, chapterId))
	return nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Synthetic Manga functions
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var syntheticMangaCache = result.NewMap[int, *models.SyntheticManga]()

func (db *Database) GetSyntheticManga(syntheticId int) (*models.SyntheticManga, bool) {
	if res, ok := syntheticMangaCache.Get(syntheticId); ok {
		return res, true
	}

	var res models.SyntheticManga
	err := db.gormdb.Where("synthetic_id = ?", syntheticId).First(&res).Error
	if err != nil {
		return nil, false
	}

	syntheticMangaCache.Set(syntheticId, &res)
	return &res, true
}

func (db *Database) GetSyntheticMangaByProviderID(provider, providerId string) (*models.SyntheticManga, bool) {
	var res models.SyntheticManga
	err := db.gormdb.Where("provider = ? AND provider_id = ?", provider, providerId).First(&res).Error
	if err != nil {
		return nil, false
	}

	syntheticMangaCache.Set(res.SyntheticID, &res)
	return &res, true
}

func (db *Database) GetAllSyntheticManga() ([]*models.SyntheticManga, error) {
	var res []*models.SyntheticManga
	err := db.gormdb.Find(&res).Error
	if err != nil {
		return nil, err
	}
	return res, nil
}

func (db *Database) InsertSyntheticManga(manga *models.SyntheticManga) error {
	syntheticMangaCache.Set(manga.SyntheticID, manga)
	return db.gormdb.Save(manga).Error
}

func (db *Database) UpdateSyntheticManga(manga *models.SyntheticManga) error {
	syntheticMangaCache.Set(manga.SyntheticID, manga)
	return db.gormdb.Save(manga).Error
}

func (db *Database) DeleteSyntheticManga(syntheticId int) error {
	err := db.gormdb.Where("synthetic_id = ?", syntheticId).Delete(&models.SyntheticManga{}).Error
	if err != nil {
		return err
	}
	syntheticMangaCache.Delete(syntheticId)
	return nil
}

// SearchSyntheticManga searches for synthetic manga by title (case-insensitive partial match)
func (db *Database) SearchSyntheticManga(query string, limit int) ([]*models.SyntheticManga, error) {
	if limit <= 0 {
		limit = 10
	}
	var res []*models.SyntheticManga
	err := db.gormdb.Where("LOWER(title) LIKE LOWER(?)", "%"+query+"%").Limit(limit).Find(&res).Error
	if err != nil {
		return nil, err
	}
	return res, nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Manga Reading History
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// UpdateMangaReadingHistory updates or creates a reading history entry for a manga
func (db *Database) UpdateMangaReadingHistory(mediaId int, chapterNumber string) error {
	isSynthetic := mediaId < 0

	var existing models.MangaReadingHistory
	err := db.gormdb.Where("media_id = ?", mediaId).First(&existing).Error

	if err != nil {
		// Create new entry
		entry := &models.MangaReadingHistory{
			MediaID:           mediaId,
			LastReadAt:        time.Now(),
			LastChapterNumber: chapterNumber,
			IsSynthetic:       isSynthetic,
		}
		return db.gormdb.Create(entry).Error
	}

	// Update existing entry
	existing.LastReadAt = time.Now()
	existing.LastChapterNumber = chapterNumber
	return db.gormdb.Save(&existing).Error
}

// GetMangaReadingHistory returns reading history entries sorted by most recent
func (db *Database) GetMangaReadingHistory(limit int) ([]*models.MangaReadingHistory, error) {
	if limit <= 0 {
		limit = 50
	}
	var res []*models.MangaReadingHistory
	err := db.gormdb.Order("last_read_at DESC").Limit(limit).Find(&res).Error
	if err != nil {
		return nil, err
	}
	return res, nil
}

// GetSyntheticMangaReadingHistory returns reading history for synthetic manga only
func (db *Database) GetSyntheticMangaReadingHistory(limit int) ([]*models.MangaReadingHistory, error) {
	if limit <= 0 {
		limit = 50
	}
	var res []*models.MangaReadingHistory
	err := db.gormdb.Where("is_synthetic = ?", true).Order("last_read_at DESC").Limit(limit).Find(&res).Error
	if err != nil {
		return nil, err
	}
	return res, nil
}

// GetMangaReadingHistoryEntry returns a single reading history entry
func (db *Database) GetMangaReadingHistoryEntry(mediaId int) (*models.MangaReadingHistory, error) {
	var res models.MangaReadingHistory
	err := db.gormdb.Where("media_id = ?", mediaId).First(&res).Error
	if err != nil {
		return nil, err
	}
	return &res, nil
}

// UpdateChapterContainerMediaID updates all chapter containers from old media ID to new media ID
func (db *Database) UpdateChapterContainerMediaID(oldMediaID, newMediaID int) error {
	err := db.gormdb.Model(&models.MangaChapterContainer{}).
		Where("media_id = ?", oldMediaID).
		Update("media_id", newMediaID).Error
	
	if err != nil {
		db.Logger.Error().Err(err).
			Int("oldMediaID", oldMediaID).
			Int("newMediaID", newMediaID).
			Msg("db: Failed to update chapter container media IDs")
		return err
	}
	
	db.Logger.Info().
		Int("oldMediaID", oldMediaID).
		Int("newMediaID", newMediaID).
		Msg("db: Updated chapter container media IDs")
	
	return nil
}
