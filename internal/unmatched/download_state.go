package unmatched

import (
	"seanime/internal/database/db"
	"sort"
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

// ClearAnimeDownloadStateIfDownloading takes down an anime's badge, but only while it still reads
// "downloading" — never a "downloaded" or "matched" badge, which mean real files or a real library
// entry exist.
//
// For the one case HandleGetDownloadingMediaIds' design deliberately does not solve on its own: a
// badge that is wrong with nothing left in the torrent client behind it, after a torrent was removed
// by hand or a queue attempt failed partway through. Never called automatically — always by a
// person saying, about one anime, that the badge is wrong.
//
// Unlike the best-effort methods above, this reports its error: it backs a direct user action that
// needs a real answer, not a write happening as a side effect of something else.
func (r *Repository) ClearAnimeDownloadStateIfDownloading(mediaID int) (bool, error) {
	if r.database == nil || mediaID <= 0 {
		return false, nil
	}
	cleared, err := r.database.ClearAnimeDownloadStateIfDownloading(mediaID)
	if err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("unmatched: Could not clear downloading badge")
		return false, err
	}
	if cleared {
		r.logger.Info().Int("mediaId", mediaID).Msg("unmatched: Downloading badge cleared by hand")
	}
	return cleared, nil
}

// ClearAnimeDownloadStateIfDownloaded takes down an anime's badge, but only while it reads
// "downloaded" — the mirror of ClearAnimeDownloadStateIfDownloading, for a badge that is wrong the
// other way: stuck on "downloaded" with no files behind it. Never called automatically — always by
// a person saying, about one anime, that the badge is wrong.
//
// Reports its error, like ClearAnimeDownloadStateIfDownloading: it backs a direct user action that
// needs a real answer, not a write happening as a side effect of something else.
func (r *Repository) ClearAnimeDownloadStateIfDownloaded(mediaID int) (bool, error) {
	if r.database == nil || mediaID <= 0 {
		return false, nil
	}
	cleared, err := r.database.ClearAnimeDownloadStateIfDownloaded(mediaID)
	if err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("unmatched: Could not clear downloaded badge")
		return false, err
	}
	if cleared {
		r.logger.Info().Int("mediaId", mediaID).Msg("unmatched: Downloaded badge cleared by hand")
	}
	return cleared, nil
}

// ClearStagedDownloadsForAnime drops every staged-download record for an anime, and reports how many
// went.
//
// The mirror of the badge clear for the other half of a stale download: the staged record is what
// keeps a "downloaded" badge standing — settled.go re-derives the badge from staged records on every
// read, so clearing the badge row alone is undone the moment the queue is listed again. Never called
// automatically: a record that a real, working download still needs costs that download its match,
// so this is always a person saying the records for this anime are stale.
func (r *Repository) ClearStagedDownloadsForAnime(mediaID int) (int, error) {
	if r.database == nil || mediaID <= 0 {
		return 0, nil
	}
	deleted, err := r.database.DeleteUnmatchedTorrentMetadataByAnimeID(mediaID)
	if err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("unmatched: Could not delete staged download records")
		return 0, err
	}
	if deleted > 0 {
		r.logger.Info().Int("mediaId", mediaID).Int("deleted", deleted).
			Msg("unmatched: Staged download records deleted by hand")
	}
	return deleted, nil
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

// ComputeStuckDownloadingMediaIDs reports which "downloading" badges have nothing behind them in
// the given live torrent list. Pure function of its inputs — no I/O, no locking — so the monitor
// that calls it stays a thin scheduler and this stays independently testable.
//
// An anime is stuck iff its badge reads "downloading" and none of the torrent names staged for it
// appear in liveNames. That single check already covers "no metadata rows at all" — zero rows
// trivially means zero live matches — so there is nothing further to special-case.
func (r *Repository) ComputeStuckDownloadingMediaIDs(liveNames map[string]struct{}) []int {
	if r.database == nil {
		return nil
	}

	downloading := make(map[int]struct{})
	for _, s := range r.AnimeDownloadStates() {
		if s.State == DownloadStateDownloading {
			downloading[s.MediaID] = struct{}{}
		}
	}
	if len(downloading) == 0 {
		return nil
	}

	byName, err := r.database.UnmatchedTorrentMetadataAnimeIDByName()
	if err != nil {
		r.logger.Debug().Err(err).Msg("unmatched: Could not read staged torrent names for the stuck-download check")
		return nil
	}

	live := make(map[int]struct{}, len(downloading))
	for name, animeID := range byName {
		if _, ok := liveNames[name]; ok {
			live[animeID] = struct{}{}
		}
	}

	stuck := make([]int, 0, len(downloading))
	for mediaID := range downloading {
		if _, ok := live[mediaID]; !ok {
			stuck = append(stuck, mediaID)
		}
	}
	sort.Ints(stuck)
	return stuck
}
