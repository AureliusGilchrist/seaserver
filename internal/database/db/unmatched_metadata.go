package db

import (
	"seanime/internal/database/models"

	"gorm.io/gorm/clause"
)

// UpsertUnmatchedTorrentMetadata stores what a download is for, replacing any earlier record for
// the same torrent. Keyed by torrent name, which is also the name of the folder it downloads into.
//
// This says what a download is *for*, and nothing about how far it has got. It used to carry a
// download-state column as well, which meant the badge had two sources — a state per torrent here,
// reconciled on every poll against the torrent client and the disk — and the reconciliation was
// where all the trouble lived. The badge is now one row per anime in AnimeDownloadState, written at
// the moments it changes and read back as written.
func (db *Database) UpsertUnmatchedTorrentMetadata(torrentName string, animeID int, value []byte) error {
	record := models.UnmatchedTorrentMetadata{
		TorrentName: torrentName,
		AnimeID:     animeID,
		Value:       value,
	}

	// A download can be re-queued, and the user can change which anime a torrent is for from the
	// match screen, so the name is the identity and the rest is overwritten.
	return db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "torrent_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"anime_id", "value", "updated_at"}),
	}).Create(&record).Error
}

// GetUnmatchedTorrentMetadata returns the record for a torrent, or nil when there is none.
func (db *Database) GetUnmatchedTorrentMetadata(torrentName string) (*models.UnmatchedTorrentMetadata, error) {
	var record models.UnmatchedTorrentMetadata
	if err := db.gormdb.Where("torrent_name = ?", torrentName).First(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

// CountUnmatchedTorrentMetadataByAnimeID returns how many staged downloads are for an anime.
//
// A record exists from the moment a download is queued until its files have been matched into the
// library, so a non-zero count means "something for this anime is already on its way" — which is
// what Enqueue Future checks before putting an anime in the queue for you to download again.
func (db *Database) CountUnmatchedTorrentMetadataByAnimeID(animeID int) (int, error) {
	var count int64
	if err := db.gormdb.Model(&models.UnmatchedTorrentMetadata{}).Where("anime_id = ?", animeID).Count(&count).Error; err != nil {
		return 0, err
	}
	return int(count), nil
}

// DeleteUnmatchedTorrentMetadata drops a torrent's record. Called when the download is deleted —
// keeping it would have a re-download of the same release inherit the old anime.
func (db *Database) DeleteUnmatchedTorrentMetadata(torrentName string) error {
	return db.gormdb.Where("torrent_name = ?", torrentName).Delete(&models.UnmatchedTorrentMetadata{}).Error
}
