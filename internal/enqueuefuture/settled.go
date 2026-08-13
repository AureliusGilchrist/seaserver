package enqueuefuture

// An anime in the queue can be dealt with while it sits there: you download it from the queue, or
// grab it from the anime page instead, or match a download you already had. The row does not know
// any of that — it was written by a walk that happened once, days ago.
//
// These used to be deleted for it. That reads badly in practice: the queue is the record of a walk,
// and an entry disappearing because you handled it looks exactly like one the walk never found, so
// the counts move and the franchise you were working through quietly loses a season.
//
// So they stay and are marked instead. The screen greys them out: still there, still part of their
// family group, still counted, but not something you can select or pick a torrent for — there is
// nothing to decide about an anime that is already downloading. Skip and ignore remain, because
// those are how you say you are finished with a row rather than what to do with it.

// downloadStatesByMediaID reads every anime's download badge in one query.
//
// One read for the whole queue rather than one per row, and nothing at all when no badge exists,
// which is why this is cheap enough to run every time the queue is listed.
func (r *Repository) downloadStatesByMediaID() map[int]string {
	if r.database == nil {
		return nil
	}

	rows, err := r.database.AnimeDownloadStates()
	if err != nil {
		r.logger.Debug().Err(err).Msg("enqueuefuture: Could not read download badges for the queue")
		return nil
	}
	if len(rows) == 0 {
		return nil
	}

	states := make(map[int]string, len(rows))
	for _, row := range rows {
		if row.State != "" {
			states[row.MediaID] = row.State
		}
	}
	return states
}
