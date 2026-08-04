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

// DeleteMediaCache removes one cached media entry. Used by the per-entry deep refresh, which
// has to reach the SQLite cache too — clearing only the in-memory and file caches leaves this
// one to serve the same stale media straight back.
func (db *Database) DeleteMediaCache(bucket, key string) error {
	return db.gormdb.Where("bucket = ? AND cache_key = ?", bucket, key).Delete(&models.MediaCacheEntry{}).Error
}

// DeleteMediaCacheForKey removes a cached media entry from every bucket.
func (db *Database) DeleteMediaCacheForKey(key string) error {
	return db.gormdb.Where("cache_key = ?", key).Delete(&models.MediaCacheEntry{}).Error
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
