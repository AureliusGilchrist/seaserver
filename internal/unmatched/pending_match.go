package unmatched

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// A match moves every episode of a download into the library, renaming each one as it goes. It is
// not atomic and it is not quick — a cross-filesystem match copies every episode end to end — so
// there is a window, minutes long for a season pack, in which the server can stop with half the
// episodes moved.
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

// pendingMatchDirName is where journals live: inside the staging area, beside the files they
// describe. Same volume as the downloads, so a plan cannot survive on a disk that its files do not,
// and it travels with them if the staging area is moved.
const pendingMatchDirName = ".pending-matches"

// pendingMove is one file's journey, decided in advance.
type pendingMove struct {
	Src     string `json:"src"`
	Dest    string `json:"dest"`
	NewName string `json:"newName"`
	RelPath string `json:"relPath"`
}

// pendingMatch is a match that has begun moving files and has not been seen to finish.
type pendingMatch struct {
	TorrentName string        `json:"torrentName"`
	AnimeID     int           `json:"animeId"`
	Destination string        `json:"destination"`
	Moves       []pendingMove `json:"moves"`
	StartedAt   time.Time     `json:"startedAt"`
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

// writePendingMatch records a match about to move files. Best-effort: a match must not be blocked
// because its journal could not be written, since the failure it guards against is rarer than the
// match itself.
func (r *Repository) writePendingMatch(torrentName string, animeID int, destination string, planned []plannedMove) {
	if len(planned) == 0 {
		return
	}

	moves := make([]pendingMove, 0, len(planned))
	for _, p := range planned {
		moves = append(moves, pendingMove{Src: p.src, Dest: p.dest, NewName: p.newName, RelPath: p.relPath})
	}

	record := pendingMatch{
		TorrentName: torrentName,
		AnimeID:     animeID,
		Destination: destination,
		Moves:       moves,
		StartedAt:   time.Now(),
	}

	if err := os.MkdirAll(pendingMatchDir(), 0o755); err != nil {
		r.logger.Warn().Err(err).Msg("unmatched: Could not create the pending-match directory")
		return
	}

	data, err := json.Marshal(record)
	if err != nil {
		r.logger.Warn().Err(err).Str("torrent", torrentName).Msg("unmatched: Could not encode the match plan")
		return
	}

	// Written whole to a temporary file and then renamed, so a stop partway through writing the
	// journal cannot leave a half-written plan behind to be resumed from.
	path := pendingMatchPath(torrentName)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		r.logger.Warn().Err(err).Str("torrent", torrentName).Msg("unmatched: Could not write the match plan")
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		r.logger.Warn().Err(err).Str("torrent", torrentName).Msg("unmatched: Could not commit the match plan")
		_ = os.Remove(tmp)
	}
}

// clearPendingMatch removes the journal once the match has been seen through.
func (r *Repository) clearPendingMatch(torrentName string) {
	if err := os.Remove(pendingMatchPath(torrentName)); err != nil && !os.IsNotExist(err) {
		r.logger.Warn().Err(err).Str("torrent", torrentName).Msg("unmatched: Could not clear the match plan")
	}
}

// ResumePendingMatches finishes matches that were interrupted by the server stopping. Call once at
// startup, before the scanner begins looking for new work.
//
// Each remaining move is judged on its own by looking at the disk rather than by trusting a status
// written somewhere: a file still at its source has not been moved and is moved now; one already at
// its destination is done and is left alone. That makes resuming safe to run repeatedly and safe
// after a stop at any point, including partway through a single file.
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

		r.resumeMatch(record, path)
	}
}

// resumeMatch replays the moves of one interrupted match that have not already happened.
func (r *Repository) resumeMatch(record pendingMatch, path string) {
	remaining := make([]plannedMove, 0, len(record.Moves))
	for _, move := range record.Moves {
		if _, err := os.Stat(move.Dest); err == nil {
			continue // already in the library under its proper name
		}
		if _, err := os.Stat(move.Src); err != nil {
			continue // neither here nor there; nothing this can do about it
		}
		remaining = append(remaining, plannedMove{
			src: move.Src, dest: move.Dest, newName: move.NewName, relPath: move.RelPath,
		})
	}

	if len(remaining) == 0 {
		// Everything arrived before the server stopped, or there is nothing left to carry.
		_ = os.Remove(path)
		return
	}

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

	errs := r.runMoves(remaining)

	failed := 0
	for i, move := range remaining {
		if errs[i] != nil {
			failed++
			r.logger.Error().Err(errs[i]).Str("src", move.src).Str("dest", move.dest).
				Msg("unmatched: Failed to move a file while finishing an interrupted match")
			continue
		}
		r.logger.Info().Str("src", move.src).Str("dest", move.dest).Msg("unmatched: Moved file")
	}

	// The journal is kept when anything failed, so the next start tries again rather than abandoning
	// files halfway between the download and the library.
	if failed == 0 {
		_ = os.Remove(path)
		r.logger.Info().Str("torrent", record.TorrentName).Msg("unmatched: Interrupted match finished")
	}
}
