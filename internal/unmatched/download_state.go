package unmatched

import (
	"seanime/internal/database/db"
)

// The three states an anime's download badge can be in, re-exported so callers in here and in the
// handlers never have to spell them as strings.
const (
	DownloadStateDownloading = db.AnimeDownloadStateDownloading
	DownloadStateDownloaded  = db.AnimeDownloadStateDownloaded
	DownloadStateMatched     = db.AnimeDownloadStateMatched
)

// AnimeDownloadState is one anime's badge.
type AnimeDownloadState struct {
	MediaID int
	State   string
}

// MarkAnimeDownloading records that a download has been queued for an anime.
//
// Unconditional: queueing is something the user did, and it outranks whatever the badge said before.
// A new season of a series already in the library goes back to downloading, which is what somebody
// watching the card wants to know.
//
// Best-effort, like everything here: the callers are in the middle of adding a torrent, and failing
// to write a badge is not a reason to stop. It costs a badge that appears late, not a lost download.
func (r *Repository) MarkAnimeDownloading(mediaID int) {
	r.setAnimeDownloadState(mediaID, DownloadStateDownloading)
}

// MarkAnimeDownloaded records that an anime's download has finished and is waiting to be matched.
//
// Only moves an anime that is currently downloading, so the second of two downloads finishing
// cannot announce that a series is done while the first is still running, and an observation
// arriving late cannot walk a matched anime backwards.
func (r *Repository) MarkAnimeDownloaded(mediaID int) {
	if r.database == nil || mediaID <= 0 {
		return
	}
	if err := r.database.AdvanceAnimeDownloadState(mediaID, DownloadStateDownloading, DownloadStateDownloaded); err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("unmatched: Could not record download as downloaded")
		return
	}
	// Logged at info, like the other two. These fire once per state change per anime — a handful of
	// lines a day — and when a badge does not appear, the first thing worth knowing is whether the
	// server ever wrote it down. That question cost several rounds of guessing to answer.
	r.logger.Info().Int("mediaId", mediaID).Msg("unmatched: Download badge set to downloaded")
}

// MarkAnimeMatchedState records that an anime's download has been filed into the library.
//
// Unconditional, and the end of the progression: a match is something that definitely happened, and
// nothing after it takes the badge back off. Only queueing another download changes it again.
func (r *Repository) MarkAnimeMatchedState(mediaID int) {
	r.setAnimeDownloadState(mediaID, DownloadStateMatched)
}

// ClearAnimeDownloadState removes an anime's badge, for a download that has been deleted.
func (r *Repository) ClearAnimeDownloadState(mediaID int) {
	if r.database == nil || mediaID <= 0 {
		return
	}
	if err := r.database.ClearAnimeDownloadState(mediaID); err != nil {
		r.logger.Debug().Err(err).Int("mediaId", mediaID).Msg("unmatched: Could not clear download state")
	}
}

func (r *Repository) setAnimeDownloadState(mediaID int, state string) {
	if r.database == nil || mediaID <= 0 {
		return
	}
	if err := r.database.SetAnimeDownloadState(mediaID, state); err != nil {
		// Loud, because a failure here is invisible everywhere else: the badge simply never
		// appears, and nothing else in the system notices that it should have.
		r.logger.Error().Err(err).Int("mediaId", mediaID).Str("state", state).
			Msg("unmatched: Could not record download state")
		return
	}
	r.logger.Info().Int("mediaId", mediaID).Str("state", state).Msg("unmatched: Download badge set")
}

// AnimeDownloadStates returns every anime's badge.
//
// One read, no disk, no torrent client. Survives a server restart, a torrent client that has
// forgotten the torrent, and a staging folder a match has already deleted, because none of those
// were ever consulted.
func (r *Repository) AnimeDownloadStates() []AnimeDownloadState {
	if r.database == nil {
		return nil
	}

	rows, err := r.database.AnimeDownloadStates()
	if err != nil {
		r.logger.Debug().Err(err).Msg("unmatched: Could not read download states")
		return nil
	}

	states := make([]AnimeDownloadState, 0, len(rows))
	for _, row := range rows {
		states = append(states, AnimeDownloadState{MediaID: row.MediaID, State: row.State})
	}
	return states
}
