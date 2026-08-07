package db

import (
	"seanime/internal/database/models"
	"time"
)

// unmatchedMatchHistoryLimit is how many match records are kept. Old records are only useful for
// undoing a match that was made recently — once the staging directory has been reused or the
// files renamed by hand, a revert can no longer do anything sensible — so the table is trimmed
// rather than allowed to grow for the lifetime of the library.
const unmatchedMatchHistoryLimit = 300

// InsertUnmatchedMatchRecord saves a completed match and trims the oldest records past the limit.
func (db *Database) InsertUnmatchedMatchRecord(record *models.UnmatchedMatchRecord) (*models.UnmatchedMatchRecord, error) {
	if err := db.gormdb.Create(record).Error; err != nil {
		return nil, err
	}
	db.trimUnmatchedMatchRecords()
	return record, nil
}

// GetUnmatchedMatchRecords returns the stored matches, newest first.
func (db *Database) GetUnmatchedMatchRecords(limit int) ([]*models.UnmatchedMatchRecord, error) {
	var records []*models.UnmatchedMatchRecord
	q := db.gormdb.Order("id DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	if err := q.Find(&records).Error; err != nil {
		return nil, err
	}
	return records, nil
}

// GetUnmatchedMatchRecord returns a single stored match.
func (db *Database) GetUnmatchedMatchRecord(id uint) (*models.UnmatchedMatchRecord, error) {
	var record models.UnmatchedMatchRecord
	if err := db.gormdb.Where("id = ?", id).First(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

// MarkUnmatchedMatchRecordReverted records that a match has been undone, along with the updated
// details blob describing what the revert managed to restore.
func (db *Database) MarkUnmatchedMatchRecordReverted(id uint, revertedAt time.Time, value []byte) error {
	return db.gormdb.Model(&models.UnmatchedMatchRecord{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"reverted_at": revertedAt,
			"value":       value,
		}).Error
}

// DeleteUnmatchedMatchRecord drops a match record. Used when the user confirms a match should
// stand, which takes it off the undo list without touching a single file.
func (db *Database) DeleteUnmatchedMatchRecord(id uint) error {
	return db.gormdb.Where("id = ?", id).Delete(&models.UnmatchedMatchRecord{}).Error
}

// trimUnmatchedMatchRecords keeps the table at unmatchedMatchHistoryLimit rows, dropping the
// oldest. Best-effort: a failure here leaves extra history behind, which harms nothing.
func (db *Database) trimUnmatchedMatchRecords() {
	var cutoff models.UnmatchedMatchRecord
	err := db.gormdb.Order("id DESC").Offset(unmatchedMatchHistoryLimit).Limit(1).Find(&cutoff).Error
	if err != nil || cutoff.ID == 0 {
		return
	}
	if err := db.gormdb.Where("id <= ?", cutoff.ID).Delete(&models.UnmatchedMatchRecord{}).Error; err != nil {
		db.Logger.Warn().Err(err).Msg("db: Failed to trim unmatched match history")
	}
}
