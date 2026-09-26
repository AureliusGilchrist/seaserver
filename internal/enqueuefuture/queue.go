package enqueuefuture

import (
	"encoding/json"
	"errors"

	"seanime/internal/database/db"
	"seanime/internal/database/models"
)

// ListItems returns the queue in walk order, without the snapshots.
func (r *Repository) ListItems() ([]*Item, error) {
	// The queue screen ranks by seeders, so this is the first moment anything needs the figure for
	// items prepared before it was recorded. Runs in the background, once per process.
	r.backfillSeedersOnce()

	// Anything you have downloaded or matched joins the queue the first time this screen is opened,
	// so it is a record of your library rather than only of what a walk happened to find. Once per
	// process: the badge table does not change often enough to be worth re-reading on every poll,
	// and anything badged after this point is registered on the next start. See RegisterBadgedAnime.
	r.registerBadgedOnce.Do(func() {
		if _, err := r.RegisterBadgedAnime(); err != nil {
			r.logger.Warn().Err(err).Msg("enqueuefuture: Could not register already-downloaded anime")
		}
	})

	records, err := r.database.GetEnqueueFutureListItems()
	if err != nil {
		return nil, err
	}

	// What has already happened to each of these outside the queue, in one read. The screen greys
	// out anything downloading, downloaded or matched rather than offering it as a decision — see
	// settled.go.
	states := r.downloadStatesByMediaID()

	items := make([]*Item, 0, len(records))
	for _, record := range records {
		item := toItem(record, nil)
		item.DownloadState = states[record.MediaID]
		items = append(items, item)
	}
	return items, nil
}

// GetItem returns one item with its snapshot decoded, or nil when it is not in the queue.
func (r *Repository) GetItem(mediaID int) (*Item, error) {
	record, err := r.database.GetEnqueueFutureItem(mediaID)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return nil, nil
	}

	var snapshot *Snapshot
	if len(record.Value) > 0 {
		snapshot = &Snapshot{}
		if err := json.Unmarshal(record.Value, snapshot); err != nil {
			// A snapshot that will not decode is no use, but the row still is: the queue screen can
			// show the item and re-search it live rather than losing it entirely.
			r.logger.Warn().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Failed to decode snapshot")
			snapshot = nil
		}
	}

	item := toItem(record, snapshot)
	if r.database != nil {
		if state, err := r.database.GetAnimeDownloadState(mediaID); err == nil {
			item.DownloadState = state
		}
	}
	return item, nil
}

// SetItemStatus records what you did with an item from the queue screen.
//
// Only the terminal states are accepted: the worker owns everything else, and letting the UI write
// "pending" or "preparing" would hand it a way to fight the worker over the same row.
func (r *Repository) SetItemStatus(mediaID int, status string) error {
	switch status {
	case db.EnqueueFutureStatusDownloaded, db.EnqueueFutureStatusSkipped, db.EnqueueFutureStatusIgnored:
	default:
		return errors.New("invalid status")
	}
	return r.database.SetEnqueueFutureItemStatus(mediaID, status, "")
}

// ReinstateItemFromDownloaded moves a queue row marked "downloaded" back to ready, so it can be
// acted on again, and reports whether it moved anything.
//
// For the stale-download hand-clear. A row marked downloaded by an older build reads as terminal to
// the list query — it is left out of the queue screen entirely, since the list only sends rows the
// screen can still decide about — which makes a stale download not just badged but invisible: there
// is no row left to press anything on. Ready is the safe state to hand it back — the worker only
// picks up pending rows, so this cannot fight it, and the snapshot a previous preparation stored is
// left exactly where it was.
//
// Deliberately scoped to rows that read "downloaded" right now: a skipped or ignored row is a
// decision you made, and nothing here un-decides it.
func (r *Repository) ReinstateItemFromDownloaded(mediaID int) (bool, error) {
	if r.database == nil || mediaID <= 0 {
		return false, nil
	}

	record, err := r.database.GetEnqueueFutureItem(mediaID)
	if err != nil {
		return false, err
	}
	// Not in the queue at all — the badge clear is the whole story for this anime, and there is no
	// row to reinstate. Not an error: the row may have been dropped by a run long ago.
	if record == nil {
		return false, nil
	}
	if record.Status != db.EnqueueFutureStatusDownloaded {
		return false, nil
	}

	if err := r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusReady, ""); err != nil {
		return false, err
	}
	r.logger.Info().Int("mediaId", mediaID).Msg("enqueuefuture: Downloaded row reinstated to ready by hand")
	return true, nil
}

// PurgeDownloadedStates takes down the stale "downloaded" state of every anime in the queue that has
// one, and reports how many were changed.
//
// The global form of the stale-download hand-clear: one press instead of one press per anime. Per
// anime, the same three places the single clear takes down — the badge row (only while it still
// reads "downloaded"), the staged-download records left behind (they re-derive the badge on every
// queue read, so leaving them would undo the clear), and a queue row still marked "downloaded" by an
// older build, which the list view leaves out entirely and which is moved back to ready.
//
// A "downloading" badge is never touched and its staged record is never deleted — a real download
// running behind it keeps both — and a "matched" badge is never touched. No queue entry is ever
// removed: a reinstated row keeps its snapshot and its place.
func (r *Repository) PurgeDownloadedStates() (int, error) {
	if r.database == nil {
		return 0, nil
	}

	// Every row, terminal ones included: the hidden "downloaded" rows are exactly the ones this has
	// to reach, and they are left out of the list view the screen draws.
	items, err := r.database.GetAllEnqueueFutureListItems()
	if err != nil {
		return 0, err
	}

	states := r.downloadStatesByMediaID()

	changed := 0
	for _, item := range items {
		if item == nil || item.MediaID <= 0 {
			continue
		}
		mediaID := item.MediaID
		if states[mediaID] != db.AnimeDownloadStateDownloaded && item.Status != db.EnqueueFutureStatusDownloaded {
			continue
		}

		// The badge row, guarded like the single clear: only while it still reads "downloaded".
		if _, err := r.database.ClearAnimeDownloadStateIfDownloaded(mediaID); err != nil {
			return changed, err
		}

		// The staged records — unless a real download is running behind a badge right now. Read at
		// write time, since the badge could have moved since the states above were read: a download
		// queued in between keeps its record.
		state, err := r.database.GetAnimeDownloadState(mediaID)
		if err != nil {
			return changed, err
		}
		if state != db.AnimeDownloadStateDownloading {
			if _, err := r.database.DeleteUnmatchedTorrentMetadataByAnimeID(mediaID); err != nil {
				return changed, err
			}
		}

		// And the queue row, back to ready so the entry can be acted on again.
		if item.Status == db.EnqueueFutureStatusDownloaded {
			if _, err := r.ReinstateItemFromDownloaded(mediaID); err != nil {
				return changed, err
			}
		}

		changed++
	}

	if changed > 0 {
		r.logger.Info().Int("changed", changed).
			Msg("enqueuefuture: Purged stale downloaded state across the whole queue")
	}
	return changed, nil
}

// DeleteItem removes one item from the queue.
func (r *Repository) DeleteItem(mediaID int) error {
	return r.database.DeleteEnqueueFutureItem(mediaID)
}

// Clear empties the queue. Stops any run first, so the worker does not immediately refill what was
// just cleared out from under it, and drops the progress record — resuming into an emptied queue
// would rebuild exactly what was just thrown away.
func (r *Repository) Clear() error {
	r.Stop()
	r.clearProgress()
	return r.database.ClearEnqueueFutureItems()
}

func toItem(record *models.EnqueueFutureItem, snapshot *Snapshot) *Item {
	return &Item{
		MediaID:       record.MediaID,
		RootMediaID:   record.RootMediaID,
		FamilyID:      record.FamilyID,
		Position:      record.Position,
		Depth:         record.Depth,
		Status:        record.Status,
		Attempts:      record.Attempts,
		LastError:     record.LastError,
		Title:         record.Title,
		CoverImage:    record.CoverImage,
		TotalSeeders:  record.TotalSeeders,
		AiredAt:       record.AiredAt,
		RelationType:  record.RelationType,
		ParentMediaID: record.ParentMediaID,
		CreatedAt:     record.CreatedAt,
		Snapshot:      snapshot,
	}
}
