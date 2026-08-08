package unmatched

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// A match renames every episode to a canonical "<Title> - Episode NNN - <Episode title>.mkv", which
// means two different releases of the same anime produce byte-identical destination names. moveFile
// starts with os.Rename, and rename replaces whatever already sits at the destination without a
// word — so matching a second copy of a show silently overwrote the copy already in the library.
// Different release group, different subs, possibly a different cut, and no trace that it happened.
//
// So a match now looks before it writes. Any destination that already exists is reported back as a
// MatchConflict and nothing is moved, renamed or deleted until the caller says which copy it wants.

// ConflictingFile is one destination a match would have overwritten.
type ConflictingFile struct {
	// NewName is the destination file name both copies resolve to.
	NewName string `json:"newName"`
	// NewPath is the absolute path that is already occupied.
	NewPath string `json:"newPath"`
	// RelPath is the incoming file's path inside the staging directory.
	RelPath string `json:"relPath"`
	// ExistingSize is the size of the file already in the library.
	ExistingSize int64 `json:"existingSize"`
	// IncomingSize is the size of the file that would replace it, so the dialog can show which
	// copy is the larger one.
	IncomingSize int64 `json:"incomingSize"`
	// SourceTorrent is the torrent that put the existing file there, when a match record still
	// says so. Empty for files placed before match history existed, or by hand.
	SourceTorrent string `json:"sourceTorrent,omitempty"`
	// MatchRecordID is the match record SourceTorrent was read from.
	MatchRecordID uint `json:"matchRecordId,omitempty"`
}

// MatchConflict is what a match found already in place, reported instead of overwriting it.
type MatchConflict struct {
	Destination string            `json:"destination"`
	Files       []ConflictingFile `json:"files"`
	// SourceTorrents are the distinct torrents that put the existing files there, most recently
	// matched first. Empty when no match record covers any of them.
	SourceTorrents []string `json:"sourceTorrents,omitempty"`
	// SameTorrent reports that every existing file came from this very torrent — a match being
	// re-run, rather than a competing release. Worth saying differently in the dialog.
	SameTorrent bool `json:"sameTorrent"`
	// TotalPlanned is how many files the match intended to move, so the dialog can say "9 of 12".
	TotalPlanned int `json:"totalPlanned"`
}

// conflictOwner is which torrent a given library path was moved there by.
type conflictOwner struct {
	torrent  string
	recordID uint
}

// detectConflicts reports the planned destinations that already exist, or nil when the way is
// clear. It only stats files, so it is safe to call before anything has been touched.
func (r *Repository) detectConflicts(torrentName, destination string, planned []plannedMove) *MatchConflict {
	type existing struct {
		move plannedMove
		size int64
	}

	found := make([]existing, 0)
	for _, p := range planned {
		info, err := os.Stat(p.dest)
		if err != nil || info.IsDir() {
			continue
		}
		found = append(found, existing{move: p, size: info.Size()})
	}
	if len(found) == 0 {
		return nil
	}

	// Only look up provenance once a conflict is certain — it reads and decodes every match
	// record, which is far too much work to do on every match that has nothing in its way.
	owners := r.matchRecordOwners()

	conflict := &MatchConflict{
		Destination:  destination,
		Files:        make([]ConflictingFile, 0, len(found)),
		TotalPlanned: len(planned),
		SameTorrent:  true,
	}

	seenTorrents := make(map[string]bool)
	sawOwner := false

	for _, e := range found {
		cf := ConflictingFile{
			NewName:      e.move.newName,
			NewPath:      e.move.dest,
			RelPath:      e.move.relPath,
			ExistingSize: e.size,
		}
		if info, err := os.Stat(e.move.src); err == nil {
			cf.IncomingSize = info.Size()
		}
		if owner, ok := owners[filepath.Clean(e.move.dest)]; ok {
			cf.SourceTorrent = owner.torrent
			cf.MatchRecordID = owner.recordID
			sawOwner = true
			if owner.torrent != torrentName {
				conflict.SameTorrent = false
			}
			if !seenTorrents[owner.torrent] {
				seenTorrents[owner.torrent] = true
				conflict.SourceTorrents = append(conflict.SourceTorrents, owner.torrent)
			}
		} else {
			// Provenance unknown, so this cannot be claimed as a re-run of this torrent.
			conflict.SameTorrent = false
		}
		conflict.Files = append(conflict.Files, cf)
	}

	// With no record covering any of them there is nothing to base "same torrent" on.
	if !sawOwner {
		conflict.SameTorrent = false
	}

	return conflict
}

// matchRecordOwners maps each library path a recorded match moved a file to onto the torrent that
// put it there. Records are read newest first and the first one to claim a path wins, so a path
// that has been matched more than once reports the match that actually produced the file on disk.
func (r *Repository) matchRecordOwners() map[string]conflictOwner {
	owners := make(map[string]conflictOwner)
	if r.database == nil {
		return owners
	}

	records, err := r.database.GetUnmatchedMatchRecords(0)
	if err != nil {
		r.logger.Warn().Err(err).Msg("unmatched: Could not read match history to attribute conflicting files")
		return owners
	}

	for _, record := range records {
		if record == nil || len(record.Value) == 0 {
			continue
		}
		var details MatchHistoryDetails
		if err := json.Unmarshal(record.Value, &details); err != nil {
			continue
		}
		// A reverted match moved its files back out, so it no longer owns those paths.
		if details.Revert != nil {
			continue
		}
		torrent := details.TorrentName
		if torrent == "" {
			torrent = record.TorrentName
		}
		for _, f := range details.Files {
			if f.NewPath == "" {
				continue
			}
			key := filepath.Clean(f.NewPath)
			if _, taken := owners[key]; taken {
				continue // an newer record already claimed it
			}
			owners[key] = conflictOwner{torrent: torrent, recordID: record.ID}
		}
	}

	return owners
}
