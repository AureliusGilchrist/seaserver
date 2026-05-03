package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetMediaCache retrieves a cached media entry by bucket and key.
// Returns the raw JSON bytes and true if found, or nil and false if not found.
func (db *Database) GetMediaCache(bucket, key string) ([]byte, bool) {
	var entry models.MediaCacheEntry
	err := db.gormdb.Where("bucket = ? AND cache_key = ?", bucket, key).First(&entry).Error
	if err != nil {
		return nil, false
	}
	return entry.Data, true
}

// SetMediaCache stores a media entry in the SQLite cache, replacing any existing entry.
func (db *Database) SetMediaCache(bucket, key string, data []byte) error {
	entry := models.MediaCacheEntry{
		Bucket:   bucket,
		CacheKey: key,
		Data:     data,
		CachedAt: time.Now(),
	}
	return db.gormdb.Save(&entry).Error
}
