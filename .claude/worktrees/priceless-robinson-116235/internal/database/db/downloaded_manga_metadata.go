package db

import "seanime/internal/database/models"

// SaveDownloadedMangaMetadata stores metadata for downloaded manga
// This ensures titles and covers display correctly even when manga isn't in the user's AniList collection
func (db *Database) SaveDownloadedMangaMetadata(mediaID int, title, coverImage, provider string) error {
	// Check if metadata already exists
	var existing models.DownloadedMangaMetadata
	err := retryOnBusy(func() error {
		return db.gormdb.Where("media_id = ?", mediaID).First(&existing).Error
	})

	if err == nil {
		// Metadata exists, update it (only if new data is non-empty)
		if title != "" {
			existing.Title = title
		}
		if coverImage != "" {
			existing.CoverImage = coverImage
		}
		if provider != "" {
			existing.Provider = provider
		}
		return retryOnBusy(func() error {
			return db.gormdb.Save(&existing).Error
		})
	}

	// Metadata doesn't exist, create new one
	metadata := &models.DownloadedMangaMetadata{
		MediaID:    mediaID,
		Title:      title,
		CoverImage: coverImage,
		Provider:   provider,
	}

	return retryOnBusy(func() error {
		return db.gormdb.Create(metadata).Error
	})
}

// GetDownloadedMangaMetadata retrieves metadata for a downloaded manga by media ID
// Returns the metadata and true if found, nil and false otherwise
func (db *Database) GetDownloadedMangaMetadata(mediaID int) (*models.DownloadedMangaMetadata, bool) {
	var metadata models.DownloadedMangaMetadata
	err := retryOnBusy(func() error {
		return db.gormdb.Where("media_id = ?", mediaID).First(&metadata).Error
	})
	if err != nil {
		return nil, false
	}
	return &metadata, true
}

// GetAllDownloadedMangaMetadata returns all stored manga metadata
func (db *Database) GetAllDownloadedMangaMetadata() ([]*models.DownloadedMangaMetadata, error) {
	var metadata []*models.DownloadedMangaMetadata
	err := retryOnBusy(func() error {
		return db.gormdb.Find(&metadata).Error
	})
	return metadata, err
}

// DeleteDownloadedMangaMetadata removes metadata for a downloaded manga
func (db *Database) DeleteDownloadedMangaMetadata(mediaID int) error {
	return retryOnBusy(func() error {
		return db.gormdb.Where("media_id = ?", mediaID).Delete(&models.DownloadedMangaMetadata{}).Error
	})
}
