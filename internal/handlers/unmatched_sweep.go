package handlers

import (
	"seanime/internal/unmatched"
	"seanime/internal/util"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// Auto-match is decided before a download starts: En Masse never asks for it, and the toggle in
// torrent search is off until the user finds it. Neither choice says anything about whether the
// finished download *can* be matched — the anime it was queued for is recorded either way, and that
// record is everything a match needs.
//
// So a library accumulates finished downloads that would match without a single decision, and the
// only way through them is the match modal, one torrent at a time. This sweep is that same match,
// run over every staged download that has an anime recorded for it.
//
// It deliberately reuses the manual-match path rather than the scanner's: same lock, same move, same
// post-match injection, so a swept torrent is indistinguishable from one matched by hand.

// UnmatchedSweepStatus is the progress of a running (or the last) sweep.
type UnmatchedSweepStatus struct {
	Running bool `json:"running"`
	// Total is how many staged downloads the sweep decided to work through.
	Total     int `json:"total"`
	Processed int `json:"processed"`
	Matched   int `json:"matched"`
	// Skipped counts downloads passed over: no anime recorded, or still downloading.
	Skipped int `json:"skipped"`
	Failed  int `json:"failed"`
	// Conflicts counts downloads left alone because the library already holds files at the
	// destinations they wanted. A sweep never overwrites — replacing one copy of a show with
	// another is a decision, so these are left for the user to match by hand and answer the
	// conflict dialog.
	Conflicts int `json:"conflicts"`
	// Current is the download being matched right now.
	Current string `json:"current"`
	// Errors holds one line per failure, capped so a bad run cannot grow without bound.
	Errors     []string `json:"errors"`
	Stopping   bool     `json:"stopping"`
	StartedAt  string   `json:"startedAt,omitempty"`
	FinishedAt string   `json:"finishedAt,omitempty"`
}

// sweepMaxErrors caps the reported failures. Past this the counts still climb; only the detail is
// dropped, because a status endpoint polled every second should not carry an unbounded list.
const sweepMaxErrors = 50

var (
	sweepMu     sync.Mutex
	sweepState  UnmatchedSweepStatus
	sweepCancel bool
)

// HandleSweepUnmatchedTorrents
//
//	@summary matches every staged download that already knows which anime it is for.
//	@desc This handler starts a background sweep that runs the ordinary match over each unmatched
//	@desc download carrying a recorded AniList ID. Downloads with no recorded anime, and ones the
//	@desc torrent client still reports as in progress, are left alone. Poll the status endpoint for
//	@desc progress. Starting a sweep while one is running is a no-op.
//	@route /api/v1/unmatched/match-all [POST]
//	@returns UnmatchedSweepStatus
func (h *Handler) HandleSweepUnmatchedTorrents(c echo.Context) error {
	sweepMu.Lock()
	if sweepState.Running {
		status := sweepState
		sweepMu.Unlock()
		return h.RespondWithData(c, status)
	}

	sweepCancel = false
	sweepState = UnmatchedSweepStatus{
		Running:   true,
		Errors:    make([]string, 0),
		StartedAt: time.Now().Format(time.RFC3339),
	}
	status := sweepState
	sweepMu.Unlock()

	go h.runUnmatchedSweep()

	return h.RespondWithData(c, status)
}

// HandleGetUnmatchedSweepStatus
//
//	@summary returns the progress of the "match all" sweep.
//	@desc This handler reports how far the sweep has got, and what it could not match. Safe to poll.
//	@route /api/v1/unmatched/match-all/status [GET]
//	@returns UnmatchedSweepStatus
func (h *Handler) HandleGetUnmatchedSweepStatus(c echo.Context) error {
	sweepMu.Lock()
	status := sweepState
	sweepMu.Unlock()
	return h.RespondWithData(c, status)
}

// HandleStopUnmatchedSweep
//
//	@summary asks the running "match all" sweep to stop.
//	@desc This handler stops the sweep after the download it is currently matching. Files already
//	@desc moved stay moved — a match is not undone by stopping the sweep.
//	@route /api/v1/unmatched/match-all/stop [POST]
//	@returns UnmatchedSweepStatus
func (h *Handler) HandleStopUnmatchedSweep(c echo.Context) error {
	sweepMu.Lock()
	if sweepState.Running {
		sweepCancel = true
		sweepState.Stopping = true
	}
	status := sweepState
	sweepMu.Unlock()
	return h.RespondWithData(c, status)
}

// runUnmatchedSweep works through the staged downloads one at a time.
//
// Sequential on purpose. Every match moves files and then hydrates episode metadata from AniList;
// running them in parallel would put hundreds of rate-limited requests in flight at once and have
// the moves compete for the same disk, which is slower overall as well as far harder to report on.
func (h *Handler) runUnmatchedSweep() {
	defer util.HandlePanicInModuleThen("handlers/runUnmatchedSweep", func() {
		sweepMu.Lock()
		sweepState.Running = false
		sweepState.Stopping = false
		sweepState.FinishedAt = time.Now().Format(time.RFC3339)
		sweepMu.Unlock()
	})

	torrents, err := h.App.UnmatchedRepository.GetUnmatchedTorrents()
	if err != nil {
		h.App.Logger.Error().Err(err).Msg("unmatched sweep: Failed to list staged downloads")
		sweepMu.Lock()
		sweepState.Running = false
		sweepState.Errors = append(sweepState.Errors, "failed to list staged downloads: "+err.Error())
		sweepState.FinishedAt = time.Now().Format(time.RFC3339)
		sweepMu.Unlock()
		return
	}

	// Decide the whole worklist up front so the reported total is stable: matching empties staging
	// directories as it goes, and re-listing mid-sweep would make the total shrink under the user.
	type sweepItem struct {
		name    string
		animeID int
	}
	work := make([]sweepItem, 0, len(torrents))
	skipped := 0
	for _, t := range torrents {
		if t == nil {
			continue
		}
		metadata := h.App.UnmatchedRepository.GetTorrentMetadata(t.Name)
		if metadata == nil || metadata.AnimeID == 0 {
			skipped++
			continue
		}
		// The torrent client is the authority on whether this is really finished. An "unknown"
		// verdict is not a reason to skip — it is what a download the client has forgotten looks
		// like, and those are exactly the ones stuck here.
		//
		// "Unreachable" is a reason to skip, and a different one: it means the authority could not
		// be consulted at all. This moves files and deletes the staging directory, in bulk, across
		// every torrent at once — doing that on a guess is how a download in progress becomes four
		// episodes in the library and a client writing into files that are no longer there.
		if h.App.UnmatchedScanner != nil {
			switch h.App.UnmatchedScanner.CompletionStateFor(t.Name) {
			case unmatched.CompletionDownloading, unmatched.CompletionUnreachable:
				skipped++
				continue
			}
		}
		work = append(work, sweepItem{name: t.Name, animeID: metadata.AnimeID})
	}

	sweepMu.Lock()
	sweepState.Total = len(work)
	sweepState.Skipped = skipped
	sweepMu.Unlock()

	h.App.Logger.Info().
		Int("toMatch", len(work)).
		Int("skipped", skipped).
		Msg("unmatched sweep: Starting")

	for _, item := range work {
		sweepMu.Lock()
		cancelled := sweepCancel
		if !cancelled {
			sweepState.Current = item.name
		}
		sweepMu.Unlock()
		if cancelled {
			h.App.Logger.Info().Msg("unmatched sweep: Stopped on request")
			break
		}

		h.sweepOne(item.name, item.animeID)

		sweepMu.Lock()
		sweepState.Processed++
		sweepMu.Unlock()
	}

	sweepMu.Lock()
	sweepState.Running = false
	sweepState.Stopping = false
	sweepState.Current = ""
	sweepState.FinishedAt = time.Now().Format(time.RFC3339)
	matched, failed := sweepState.Matched, sweepState.Failed
	sweepMu.Unlock()

	h.App.Logger.Info().
		Int("matched", matched).
		Int("failed", failed).
		Msg("unmatched sweep: Finished")

	h.App.UnmatchedRepository.InvalidateCache()
}

// sweepOne matches a single staged download and records the outcome.
func (h *Handler) sweepOne(torrentName string, animeID int) {
	defer util.HandlePanicInModuleThen("handlers/sweepOne", func() {
		recordSweepFailure(torrentName, "panicked while matching")
	})

	// The same lock the manual match takes, so a sweep running in the background and a user
	// matching by hand in the Unmatched screen cannot move files at the same time.
	matchMu.Lock()
	result, err := h.App.UnmatchedRepository.MatchTorrentFromMetadata(torrentName)
	matchMu.Unlock()

	if err != nil {
		h.App.Logger.Warn().Err(err).Str("torrent", torrentName).Msg("unmatched sweep: Match failed")
		recordSweepFailure(torrentName, err.Error())
		return
	}
	if result == nil {
		// No anime recorded after all — the record was dropped between building the worklist and
		// getting here. Nothing to do, and nothing worth reporting as a failure.
		sweepMu.Lock()
		sweepState.Skipped++
		sweepMu.Unlock()
		return
	}

	// The destinations are already occupied. Nothing was moved and nothing was deleted, so the
	// download stays staged for the user to match by hand and decide whether to replace what is
	// there. Counted separately: this is neither a match nor a failure.
	if result.Conflict != nil {
		h.App.Logger.Info().
			Str("torrent", torrentName).
			Int("conflicts", len(result.Conflict.Files)).
			Strs("sourceTorrents", result.Conflict.SourceTorrents).
			Msg("unmatched sweep: Left staged, the library already has these episodes")
		sweepMu.Lock()
		sweepState.Conflicts++
		sweepMu.Unlock()
		return
	}

	// Anything that moved is in the library now and has to reach the library database, whether or
	// not every file in the torrent made it. See FinalizeUnmatchedMatch.
	if len(result.MovedFiles) > 0 {
		h.FinalizeUnmatchedMatch(unmatched.MatchRequest{
			TorrentName: torrentName,
			AnimeID:     animeID,
		}, *result)
	}

	if len(result.FailedFiles) > 0 {
		h.App.Logger.Warn().
			Str("torrent", torrentName).
			Int("moved", len(result.MovedFiles)).
			Int("failed", len(result.FailedFiles)).
			Msg("unmatched sweep: Some files could not be moved")
		recordSweepFailure(torrentName, result.ErrorMessage)
		return
	}

	sweepMu.Lock()
	sweepState.Matched++
	sweepMu.Unlock()
}

// recordSweepFailure counts a failure and keeps its detail, up to sweepMaxErrors.
func recordSweepFailure(torrentName, reason string) {
	if reason == "" {
		reason = "unknown error"
	}
	sweepMu.Lock()
	defer sweepMu.Unlock()
	sweepState.Failed++
	if len(sweepState.Errors) < sweepMaxErrors {
		sweepState.Errors = append(sweepState.Errors, torrentName+": "+reason)
	}
}
