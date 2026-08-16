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
		MediaID:      record.MediaID,
		RootMediaID:  record.RootMediaID,
		FamilyID:     record.FamilyID,
		Position:     record.Position,
		Depth:        record.Depth,
		Status:       record.Status,
		Attempts:     record.Attempts,
		LastError:    record.LastError,
		Title:        record.Title,
		CoverImage:   record.CoverImage,
		TotalSeeders: record.TotalSeeders,
		AiredAt:      record.AiredAt,
		CreatedAt:    record.CreatedAt,
		Snapshot:     snapshot,
	}
}
