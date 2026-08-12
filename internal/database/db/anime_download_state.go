package db

import (
	"seanime/internal/database/models"

	"gorm.io/gorm/clause"
)

// The three states an anime's download badge can be in. They are a progression, and the order here
// is the order they happen in.
const (
	// AnimeDownloadStateDownloading is set the moment a download is queued, and stands until
	// something says the files have arrived. Nothing takes it back down except the next state.
	AnimeDownloadStateDownloading = "downloading"
	// AnimeDownloadStateDownloaded means the files are here and waiting to be matched.
	AnimeDownloadStateDownloaded = "downloaded"
	// AnimeDownloadStateMatched means the files are in the library. The end of the progression.
	AnimeDownloadStateMatched = "matched"
)

// AnimeDownloadStateRow is one anime's badge.
type AnimeDownloadStateRow struct {
	MediaID int
	State   string
}

// SetAnimeDownloadState records that an anime has reached a state, unconditionally.
//
// For the two transitions that are facts about what somebody did rather than guesses about what
// might have happened: a download was queued, a match was completed. Both outrank whatever the row
// said before — queueing a second season of a series already in the library makes it downloading
// again, which is exactly what the badge should say.
func (db *Database) SetAnimeDownloadState(mediaID int, state string) error {
	if mediaID <= 0 {
		return nil
	}

	record := models.AnimeDownloadState{
		MediaID: mediaID,
		State:   state,
	}

	return db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "media_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"state", "updated_at"}),
	}).Create(&record).Error
}

// AdvanceAnimeDownloadState moves an anime on to a state only if it is currently in `from`.
//
// For the transition that is observed rather than performed: a torrent finishing. The guard is what
// keeps the badge honest when a series has more than one download — the first finishing must not
// announce that the series is downloaded while the second is still coming — and it is what stops a
// stale observation walking a badge backwards from matched to downloaded.
//
// A row that does not exist is not created. Nothing has been queued for this anime, so there is no
// download to have finished, and inventing one is how badges appear for things nobody asked for.
func (db *Database) AdvanceAnimeDownloadState(mediaID int, from, to string) error {
	if mediaID <= 0 {
		return nil
	}

	return db.gormdb.Model(&models.AnimeDownloadState{}).
		Where("media_id = ? AND state = ?", mediaID, from).
		Update("state", to).Error
}

// AnimeDownloadStates returns every anime's badge, in one read.
//
// This is the whole answer to "which badge does this anime show" — no disk, no torrent client, no
// cross-referencing. The route that serves the badges does this and nothing else.
func (db *Database) AnimeDownloadStates() ([]AnimeDownloadStateRow, error) {
	var rows []AnimeDownloadStateRow
	if err := db.gormdb.Model(&models.AnimeDownloadState{}).
		Select("media_id", "state").
		Where("media_id > 0").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// ClearAnimeDownloadState removes an anime's badge entirely.
//
// Only for when the download itself is deleted — the one action that says "this was never going to
// happen". Everything else moves the state on rather than removing it.
func (db *Database) ClearAnimeDownloadState(mediaID int) error {
	if mediaID <= 0 {
		return nil
	}
	return db.gormdb.Where("media_id = ?", mediaID).Delete(&models.AnimeDownloadState{}).Error
}
