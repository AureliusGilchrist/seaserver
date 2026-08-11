package db

import (
	"seanime/internal/database/models"

	"gorm.io/gorm/clause"
)

// Download states a row can be in. See models.UnmatchedTorrentMetadata.DownloadState.
const (
	// DownloadStateDownloading is set the moment a download is queued and stands until something
	// says the files have arrived.
	DownloadStateDownloading = "downloading"
	// DownloadStateFinished means the files are all here and waiting to be matched into the library.
	DownloadStateFinished = "finished"
	// DownloadStateMatched means the files are in the library. The download is over as far as
	// anything asking about it is concerned.
	DownloadStateMatched = "matched"
)

// UpsertUnmatchedTorrentMetadata stores what a download is for, replacing any earlier record for
// the same torrent. Keyed by torrent name, which is also the name of the folder it downloads into.
//
// A row appearing for the first time is a download that has just been queued, so it starts in the
// downloading state — that is the moment the badge is meant to come up, and it is recorded here
// rather than left to be inferred later from a torrent client that may already have forgotten.
// Later writes leave the state alone: re-saving the metadata (the user picking a different anime on
// the match screen, say) says nothing about how far the download has got, and the transitions that
// do are stamped explicitly by SetUnmatchedTorrentDownloadState.
func (db *Database) UpsertUnmatchedTorrentMetadata(torrentName string, animeID int, value []byte) error {
	record := models.UnmatchedTorrentMetadata{
		TorrentName:   torrentName,
		AnimeID:       animeID,
		Value:         value,
		DownloadState: DownloadStateDownloading,
	}

	// A download can be re-queued, and the user can change which anime a torrent is for from the
	// match screen, so the name is the identity and the rest is overwritten.
	return db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "torrent_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"anime_id", "value", "updated_at"}),
	}).Create(&record).Error
}

// SetUnmatchedTorrentDownloadState records that a download has moved on to another state.
//
// Updates only the state column, so it cannot disturb the metadata a match reads. A torrent with no
// row is not an error: downloads the server never recorded (added straight in the torrent client,
// or queued by a version that predates the record) simply have no state to keep.
func (db *Database) SetUnmatchedTorrentDownloadState(torrentName, state string) error {
	return db.gormdb.Model(&models.UnmatchedTorrentMetadata{}).
		Where("torrent_name = ?", torrentName).
		Update("download_state", state).Error
}

// UnmatchedDownloadState is one row's answer: which anime, and how far its download has got.
type UnmatchedDownloadState struct {
	TorrentName   string
	AnimeID       int
	DownloadState string
}

// GetUnmatchedTorrentDownloadStates returns the recorded state of every download.
//
// This is the durable answer to "what is downloading" — one query, no disk, and independent of
// whether the torrent client still remembers any of it.
func (db *Database) GetUnmatchedTorrentDownloadStates() ([]UnmatchedDownloadState, error) {
	var rows []UnmatchedDownloadState
	if err := db.gormdb.Model(&models.UnmatchedTorrentMetadata{}).
		Select("torrent_name", "anime_id", "download_state").
		Where("anime_id > 0").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
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
