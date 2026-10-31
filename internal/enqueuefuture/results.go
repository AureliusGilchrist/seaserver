package enqueuefuture

import (
	"seanime/internal/database/db"
	"seanime/internal/database/models"
)

// recordDropped keeps what the search found for an anime about to be dropped from the queue.
//
// Best effort: a failed write costs the record of this one entry, which is no reason to keep an entry
// with nothing downloadable on the queue. The snapshot is only kept when there are torrents in it —
// with none, a live search on the way back is no worse, and the entry alone is not worth the bytes.
func (r *Repository) recordDropped(mediaID int, result *prepared, reason string, torrents int, best int, value []byte) {
	dropped := &models.EnqueueFutureDroppedItem{
		MediaID:     mediaID,
		Title:       result.title,
		CoverImage:  result.coverImage,
		Reason:      reason,
		Torrents:    torrents,
		BestSeeders: best,
		AiredAt:     airedAtOf(result),
	}
	if result.snapshot != nil {
		dropped.ProviderID = result.snapshot.ProviderID
		dropped.TotalSeeders = totalSeeders(result.snapshot.SearchData)
	}
	if torrents > 0 {
		dropped.Value = value
	}
	if item, err := r.database.GetEnqueueFutureItem(mediaID); err == nil && item != nil {
		dropped.ProfileID = item.ProfileID
		dropped.RootMediaID = item.RootMediaID
		dropped.FamilyID = item.FamilyID
		dropped.Depth = item.Depth
		dropped.RelationType = item.RelationType
		dropped.ParentMediaID = item.ParentMediaID
	}
	if err := r.database.SaveEnqueueFutureDroppedItem(dropped); err != nil {
		r.logger.Warn().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Could not record a dropped entry")
	}
}

// ListDropped returns the anime dropped for having nothing downloadable, newest first.
func (r *Repository) ListDropped() ([]*DroppedItem, error) {
	records, err := r.database.GetEnqueueFutureDroppedItems()
	if err != nil {
		return nil, err
	}

	items := make([]*DroppedItem, 0, len(records))
	for _, record := range records {
		items = append(items, &DroppedItem{
			MediaID:     record.MediaID,
			RootMediaID: record.RootMediaID,
			Title:       record.Title,
			CoverImage:  record.CoverImage,
			Reason:      record.Reason,
			Torrents:    record.Torrents,
			BestSeeders: record.BestSeeders,
			ProviderID:  record.ProviderID,
			DroppedAt:   record.UpdatedAt,
		})
	}
	return items, nil
}

// RestoreDropped puts a dropped anime back on the queue as ready, with the results it was dropped
// with, and reports whether there was anything to restore.
//
// Ready needs no snapshot: a row without one opens with a live search, which is what happens to a
// record that found no torrents or has aged out of its blob. An anime a later run has queued again
// keeps that newer row, and only the record of the drop goes.
func (r *Repository) RestoreDropped(mediaID int) (bool, error) {
	record, err := r.database.GetEnqueueFutureDroppedItem(mediaID)
	if err != nil || record == nil {
		return false, err
	}

	if _, err := r.database.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
		ProfileID:      record.ProfileID,
		MediaID:        record.MediaID,
		RootMediaID:    record.RootMediaID,
		FamilyID:       record.FamilyID,
		Depth:          record.Depth,
		Status:         db.EnqueueFutureStatusReady,
		Title:          record.Title,
		CoverImage:     record.CoverImage,
		TotalSeeders:   record.TotalSeeders,
		SeedersVersion: db.EnqueueFutureSeedersMethodVersion,
		AiredAt:        record.AiredAt,
		RelationType:   record.RelationType,
		ParentMediaID:  record.ParentMediaID,
		Value:          record.Value,
	}); err != nil {
		return false, err
	}

	if err := r.database.DeleteEnqueueFutureDroppedItem(mediaID); err != nil {
		return false, err
	}
	return true, nil
}

// DeleteDropped forgets one dropped anime.
func (r *Repository) DeleteDropped(mediaID int) error {
	return r.database.DeleteEnqueueFutureDroppedItem(mediaID)
}

// ClearDropped forgets every dropped anime.
func (r *Repository) ClearDropped() error {
	return r.database.ClearEnqueueFutureDroppedItems()
}

// saveLastRun records how a run ended, so the screen can still say after a restart.
func (r *Repository) saveLastRun(status Status) {
	if r.database == nil {
		return
	}
	if err := r.database.SaveEnqueueFutureLastRun(&models.EnqueueFutureLastRun{
		RootMediaID: status.RootMediaID,
		RootTitle:   status.RootTitle,
		Discovered:  status.Discovered,
		Prepared:    status.Prepared,
		Failed:      status.Failed,
		Skipped:     status.Skipped,
		Families:    status.Families,
		LastError:   status.LastError,
		StartedAt:   status.StartedAt,
		FinishedAt:  status.FinishedAt,
	}); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not record how the run ended")
	}
}

// RestoreLastRun loads the outcome of the most recent run back into the status. Call once at startup,
// before anything can start a run.
func (r *Repository) RestoreLastRun() {
	run, err := r.database.GetEnqueueFutureLastRun()
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not read how the last run ended")
		return
	}
	if run == nil {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if r.running {
		return
	}
	r.status.RootMediaID = run.RootMediaID
	r.status.RootTitle = run.RootTitle
	r.status.Discovered = run.Discovered
	r.status.Prepared = run.Prepared
	r.status.Failed = run.Failed
	r.status.Skipped = run.Skipped
	r.status.Families = run.Families
	r.status.LastError = run.LastError
	r.status.StartedAt = run.StartedAt
	r.status.FinishedAt = run.FinishedAt
}
