package enqueuefuture

import (
	"seanime/internal/database/db"
)

// The queue is built from a graph walk that happens once, and then it sits there — for days, while
// you work through it. Everything in it was worth queueing at the moment it was queued, and some of
// it stops being worth queueing shortly afterwards: you download something from the queue, or match
// it, or grab the same series from the anime page instead. The row stays regardless, because nothing
// went back to look at it.
//
// What that produces is a queue that asks you about things you have already dealt with — a series
// already in the library, a download already running — which is the one thing a queue you are
// working through must not do, since the whole value of it is that everything in it still needs a
// decision.
//
// So the same rule that keeps an anime out of the queue also takes it back out: an anime whose
// download badge says downloading, downloaded or matched is settled, and a settled anime has nothing
// left to ask about.

// settledStates are the badges that mean an anime no longer belongs in the queue. Matched is the one
// that used to slip through: the staged download record that discovery checks is deleted the moment
// a match completes, so a matched anime looked untouched to everything except the badge.
var settledStates = map[string]string{
	db.AnimeDownloadStateDownloading: "already downloading",
	db.AnimeDownloadStateDownloaded:  "already downloaded",
	db.AnimeDownloadStateMatched:     "already matched into the library",
}

// purgeSettledItems removes queued rows for anime that have since been downloaded or matched.
//
// Two reads and a delete per removed row: every badge in one query, every queue row in another, and
// nothing at all when the two do not intersect — which is the normal case, and why this is cheap
// enough to run whenever the queue is read.
//
// Every row, terminal ones included. A row marked skipped for an anime now sitting in the library is
// still a row about something settled, and leaving it there keeps it in the counts.
//
// Returns how many rows it removed, for the caller's log line.
func (r *Repository) purgeSettledItems() int {
	if r.database == nil {
		return 0
	}

	states, err := r.database.AnimeDownloadStates()
	if err != nil {
		r.logger.Debug().Err(err).Msg("enqueuefuture: Could not read download badges to clear settled entries")
		return 0
	}
	if len(states) == 0 {
		return 0
	}

	settled := make(map[int]string, len(states))
	for _, row := range states {
		if reason, ok := settledStates[row.State]; ok {
			settled[row.MediaID] = reason
		}
	}
	if len(settled) == 0 {
		return 0
	}

	items, err := r.database.GetAllEnqueueFutureListItems()
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not read the queue to clear settled entries")
		return 0
	}

	removed := 0
	for _, item := range items {
		if item == nil {
			continue
		}
		reason, ok := settled[item.MediaID]
		if !ok {
			continue
		}
		if err := r.database.DeleteEnqueueFutureItem(item.MediaID); err != nil {
			r.logger.Warn().Err(err).Int("mediaId", item.MediaID).Str("title", item.Title).
				Msg("enqueuefuture: Could not remove a settled entry")
			continue
		}
		r.logger.Debug().Int("mediaId", item.MediaID).Str("title", item.Title).Str("reason", reason).
			Msg("enqueuefuture: Removed a settled entry from the queue")
		removed++
	}

	if removed > 0 {
		r.logger.Info().Int("removed", removed).
			Msg("enqueuefuture: Cleared entries you have already downloaded or matched out of the queue")
	}
	return removed
}
