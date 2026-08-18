package unmatched

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/util"
	"strings"
	"time"
)

// A match moves every episode of a download into the library, renaming each one as it goes, and then
// writes down what it did: the undo record, the anime's matched state, the sidecar in the destination
// folder, the cleanup of the staging directory. It is not atomic and it is not quick — a
// cross-filesystem match copies every episode end to end — so there is a window, minutes long for a
// season pack, in which the server can stop with the match half done.
//
// What made that worse than an interruption should be is that the naming is derived from the files
// found in the staging directory: episode numbers come from their order and their titles. Resuming
// by simply running the match again would therefore renumber whatever was left, because half of the
// inputs are no longer there — episode 7 onwards would be matched as episode 1 onwards, into the
// same folder, beside the correctly named half.
//
// So the plan is written down before the first file is touched, and it is the plan that is resumed.
// Every destination name is decided while all the inputs are still present, which is what "continue
// with the same data" has to mean: the second half of an interrupted match lands under exactly the
// names it would have had if nothing had gone wrong.
//
// The plan carries the request that produced it, so resuming does not stop at the files. A match
// that moved its episodes and then died before recording itself used to leave a library with the
// episodes in it and nothing anywhere saying they had been matched: no undo record, no sidecar, the
// staging directory still full, the anime still unmatched. The journal now covers that half too, one
// step at a time, and each step is crossed off as it completes — so a match interrupted anywhere is
// finished from where it stopped rather than from the beginning.

// pendingMatchDirName is where journals live: inside the staging area, beside the files they
// describe. Same volume as the downloads, so a plan cannot survive on a disk that its files do not,
// and it travels with them if the staging area is moved.
const pendingMatchDirName = ".pending-matches"

// The steps a match takes after its files have moved, crossed off in the journal as each completes.
// Resuming skips the ones already done, which is what keeps a resumed match from writing a second
// undo record or re-running work that has already happened.
const (
	stageRecord    = "record"    // the undo record
	stageConflict  = "conflict"  // the pending-conflict question, now settled
	stageSelection = "selection" // the torrent's metadata row and the anime's matched state
	stageSidecar   = "sidecar"   // the provenance file in the destination folder
	stageCleanup   = "cleanup"   // the staging directory
)

// pendingMove is one file's journey, decided in advance.
type pendingMove struct {
	Src     string `json:"src"`
	Dest    string `json:"dest"`
	NewName string `json:"newName"`
	RelPath string `json:"relPath"`
	// Size is the source's size at planning time, so a destination that already exists can be
	// judged rather than assumed: the right size means the file arrived, anything else means it was
	// interrupted and is copied again. Zero for plans written before this field existed, which are
	// treated the old way — existence alone.
	Size int64 `json:"size,omitempty"`
	// Episode and Season are the numbering this move was given, carried so a resumed match hands
	// finalisation the same plan the original had.
	Episode int `json:"episode,omitempty"`
	Season  int `json:"season,omitempty"`
}

// pendingMatch is a match that has begun and has not been seen through.
type pendingMatch struct {
	// MatchID identifies this attempt across restarts. It goes into the undo record, so a resumed
	// match can tell whether the record it is about to write is already there.
	MatchID     string        `json:"matchId"`
	TorrentName string        `json:"torrentName"`
	AnimeID     int           `json:"animeId"`
	Destination string        `json:"destination"`
	Moves       []pendingMove `json:"moves"`
	StartedAt   time.Time     `json:"startedAt"`

	// Request is what was asked for, kept whole so the bookkeeping after the moves can be replayed
	// exactly as it would have run.
	Request *MatchRequest `json:"request,omitempty"`
	// PreMetadata is the torrent's sidecar as it stood before the match, which the undo record needs
	// in order to put the download back the way it was found.
	PreMetadata *TorrentMetadata `json:"preMetadata,omitempty"`
	// RemovedFiles are the creditless/bonus files the match deleted rather than moved. Recorded so a
	// resumed match's undo record says the same thing the original's would have.
	RemovedFiles []string `json:"removedFiles,omitempty"`
	// Stages are the post-move steps already completed.
	Stages []string `json:"stages,omitempty"`
}

func (p *pendingMatch) done(stage string) bool {
	for _, s := range p.Stages {
		if s == stage {
			return true
		}
	}
	return false
}

// matchJournal is the live handle on a plan: it marks steps off as they complete and removes itself
// when the match is finished. A nil journal is a match running without one — the plan could not be
// written — and every method is safe on it, so the match itself is never blocked by that.
type matchJournal struct {
	repo   *Repository
	path   string
	record *pendingMatch
}

func (j *matchJournal) isDone(stage string) bool {
	if j == nil || j.record == nil {
		return false
	}
	return j.record.done(stage)
}

// mark crosses off a completed step and puts the plan back on disk immediately, so a stop directly
// afterwards does not repeat it.
func (j *matchJournal) mark(stage string) {
	if j == nil || j.record == nil || j.path == "" {
		return
	}
	if j.record.done(stage) {
		return
	}
	j.record.Stages = append(j.record.Stages, stage)
	j.flush()
}

func (j *matchJournal) flush() {
	if j == nil || j.record == nil || j.path == "" {
		return
	}
	data, err := json.Marshal(j.record)
	if err != nil {
		return
	}
	if err := util.WriteFileCrashSafe(j.path, data, 0o644); err != nil && j.repo != nil {
		j.repo.logger.Warn().Err(err).Str("torrent", j.record.TorrentName).
			Msg("unmatched: Could not update the match plan")
	}
}

// clear removes the plan. Only ever called once the match has been seen all the way through.
func (j *matchJournal) clear() {
	if j == nil || j.path == "" {
		return
	}
	if err := os.Remove(j.path); err != nil && !os.IsNotExist(err) && j.repo != nil {
		j.repo.logger.Warn().Err(err).Str("path", j.path).Msg("unmatched: Could not clear the match plan")
	}
}

func (j *matchJournal) matchID() string {
	if j == nil || j.record == nil {
		return ""
	}
	return j.record.MatchID
}

func pendingMatchDir() string {
	return filepath.Join(UnmatchedBasePath, pendingMatchDirName)
}

// pendingMatchPath is the journal file for a torrent. The name is derived from the torrent's own,
// sanitised, so that resuming can find it without a database and so one torrent has exactly one.
func pendingMatchPath(torrentName string) string {
	safe := strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|', 0:
			return '_'
		}
		return r
	}, torrentName)
	if len(safe) > 120 {
		safe = safe[:120]
	}
	return filepath.Join(pendingMatchDir(), safe+".json")
}

// writePendingMatch records a match about to move files, and returns the handle the rest of the
// match reports its progress to. Best-effort: a match must not be blocked because its journal could
// not be written, since the failure it guards against is rarer than the match itself — so a failure
// here returns a journal that does nothing rather than stopping the match.
func (r *Repository) writePendingMatch(req *MatchRequest, destination string, planned []plannedMove, preMetadata *TorrentMetadata, removed []string) *matchJournal {
	if req == nil || len(planned) == 0 {
		return nil
	}

	moves := make([]pendingMove, 0, len(planned))
	for _, p := range planned {
		size := int64(0)
		if info, err := os.Stat(p.src); err == nil {
			size = info.Size()
		}
		moves = append(moves, pendingMove{
			Src: p.src, Dest: p.dest, NewName: p.newName, RelPath: p.relPath,
			Size: size, Episode: p.episode, Season: p.season,
		})
	}

	reqCopy := *req
	record := &pendingMatch{
		MatchID:      fmt.Sprintf("%d-%d", time.Now().UnixNano(), req.AnimeID),
		TorrentName:  req.TorrentName,
		AnimeID:      req.AnimeID,
		Destination:  destination,
		Moves:        moves,
		StartedAt:    time.Now(),
		Request:      &reqCopy,
		PreMetadata:  preMetadata,
		RemovedFiles: append([]string(nil), removed...),
	}

	if err := os.MkdirAll(pendingMatchDir(), 0o755); err != nil {
		r.logger.Warn().Err(err).Msg("unmatched: Could not create the pending-match directory")
		return nil
	}

	journal := &matchJournal{repo: r, path: pendingMatchPath(req.TorrentName), record: record}
	journal.flush()
	return journal
}

// ResumePendingMatches finishes matches that were interrupted by the server stopping — including one
// stopped abruptly, since nothing about this depends on the server having been given the chance to
// tidy up. Call once at startup, before the scanner begins looking for new work.
//
// Each remaining move is judged on its own by looking at the disk rather than by trusting a status
// written somewhere: a file still at its source has not been moved and is moved now; one already at
// its destination, at the size the plan recorded, is done and is left alone. That makes resuming safe
// to run repeatedly and safe after a stop at any point, including partway through a single file.
func (r *Repository) ResumePendingMatches() {
	entries, err := os.ReadDir(pendingMatchDir())
	if err != nil {
		return // nothing pending, which is the normal case
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		path := filepath.Join(pendingMatchDir(), entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			r.logger.Warn().Err(err).Str("plan", entry.Name()).Msg("unmatched: Could not read an interrupted match")
			continue
		}

		var record pendingMatch
		if err := json.Unmarshal(data, &record); err != nil {
			r.logger.Warn().Err(err).Str("plan", entry.Name()).
				Msg("unmatched: An interrupted match could not be decoded, leaving it for manual matching")
			_ = os.Remove(path)
			continue
		}

		r.resumeMatch(&record, path)
	}
}

// resumeMatch replays the moves of one interrupted match that have not already happened, and then
// the bookkeeping steps it had not reached.
func (r *Repository) resumeMatch(record *pendingMatch, path string) {
	journal := &matchJournal{repo: r, path: path, record: record}

	planned := make([]plannedMove, 0, len(record.Moves))
	for _, move := range record.Moves {
		planned = append(planned, plannedMove{
			src: move.Src, dest: move.Dest, newName: move.NewName, relPath: move.RelPath,
			episode: move.Episode, season: move.Season,
		})
	}

	// Which of the planned moves still have to happen. Judged from the disk, and from the size the
	// plan recorded: a destination that is there but short is a copy that was interrupted, not a file
	// that arrived, and the difference is the whole reason this check is not just an existence test.
	moveErrs := make([]error, len(planned))
	remaining := make([]int, 0, len(planned))
	for i, move := range record.Moves {
		if destSettled(move) {
			continue // already in the library, whole, under its proper name
		}
		if _, err := os.Stat(move.Src); err != nil {
			// Neither here nor there. Nothing this can do about it, and it must not be reported as
			// moved — the undo record would then offer to put back a file that does not exist.
			moveErrs[i] = fmt.Errorf("neither the source nor a complete destination exists: %s", move.Src)
			continue
		}
		remaining = append(remaining, i)
	}

	if len(remaining) > 0 {
		r.logger.Info().
			Str("torrent", record.TorrentName).
			Int("remaining", len(remaining)).
			Int("of", len(record.Moves)).
			Msg("unmatched: Finishing a match that was interrupted, under the names it was already given")

		if err := os.MkdirAll(record.Destination, 0o755); err != nil {
			r.logger.Error().Err(err).Str("destination", record.Destination).
				Msg("unmatched: Could not recreate the destination for an interrupted match")
			return
		}

		todo := make([]plannedMove, 0, len(remaining))
		for _, i := range remaining {
			todo = append(todo, planned[i])
		}
		errs := r.runMoves(todo)
		for n, i := range remaining {
			moveErrs[i] = errs[n]
			if errs[n] != nil {
				r.logger.Error().Err(errs[n]).Str("src", planned[i].src).Str("dest", planned[i].dest).
					Msg("unmatched: Failed to move a file while finishing an interrupted match")
				continue
			}
			r.logger.Info().Str("src", planned[i].src).Str("dest", planned[i].dest).Msg("unmatched: Moved file")
		}
	}

	req := record.Request
	if req == nil {
		// A plan from before the request was carried in it. The files are all this can finish, which
		// is what it did before, so it is finished the old way rather than left to be retried forever.
		if allSucceeded(moveErrs) {
			journal.clear()
			r.logger.Info().Str("torrent", record.TorrentName).Msg("unmatched: Interrupted match finished")
		}
		return
	}

	result := &MatchResult{
		Success:      allSucceeded(moveErrs),
		Destination:  record.Destination,
		MovedFiles:   make([]string, 0, len(planned)),
		FailedFiles:  make([]string, 0),
		RemovedFiles: append([]string(nil), record.RemovedFiles...),
	}
	for i, p := range planned {
		if moveErrs[i] != nil {
			result.FailedFiles = append(result.FailedFiles, p.relPath)
			continue
		}
		result.MovedFiles = append(result.MovedFiles, p.newName)
	}

	// The rest of the match: the undo record, the metadata, the sidecar, the staging cleanup. Steps
	// already crossed off in the plan are skipped, so this is safe however many times it runs.
	r.finalizeMatch(req, result, planned, moveErrs, record.PreMetadata, journal)

	if len(result.FailedFiles) == 0 {
		r.logger.Info().Str("torrent", record.TorrentName).Msg("unmatched: Interrupted match finished")
	}
}

// destSettled reports whether a planned move's destination is there and complete.
func destSettled(move pendingMove) bool {
	info, err := os.Stat(move.Dest)
	if err != nil {
		return false
	}
	if util.IsMoveInFlight(move.Dest) {
		return false
	}
	if move.Size > 0 {
		return info.Size() == move.Size
	}
	// A plan written before sizes were recorded. Existence is all there is to go on, which is the
	// behaviour these plans were written under.
	return true
}

func allSucceeded(errs []error) bool {
	for _, err := range errs {
		if err != nil {
			return false
		}
	}
	return true
}
