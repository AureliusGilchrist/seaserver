package unmatched

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"seanime/internal/database/models"
)

// Matching moves files out of the staging directory and renames every one of them, which used to
// be the end of it: getting a bad match back meant finding the files in the library and renaming
// them by hand from memory. So every match writes down exactly what it did — where each file came
// from, what it was called, and where it ended up — and that record is what the undo screen reads
// and what a revert replays backwards.
//
// What a revert cannot bring back is the creditless/"Extra" content a match deletes rather than
// moves. Those names are kept in the record too, so the confirmation can say so plainly instead of
// implying the match is fully reversible.

// MatchHistoryFile is one file a match moved: where it came from, and what it became.
type MatchHistoryFile struct {
	// OriginalName is the file's name in the torrent, before renaming.
	OriginalName string `json:"originalName"`
	// OriginalRelPath is its path relative to the torrent's staging directory, so season
	// folders are restored the way the release had them.
	OriginalRelPath string `json:"originalRelPath"`
	// OriginalPath is the absolute path it was moved out of.
	OriginalPath string `json:"originalPath"`
	// NewName is the name it was given in the library.
	NewName string `json:"newName"`
	// NewPath is the absolute path it was moved to.
	NewPath string `json:"newPath"`
	Size    int64  `json:"size"`
}

// MatchHistoryDetails is the full record of a match, stored as JSON alongside the row.
type MatchHistoryDetails struct {
	TorrentName string             `json:"torrentName"`
	StagingPath string             `json:"stagingPath"`
	AnimeID     int                `json:"animeId"`
	AnimeTitle  string             `json:"animeTitle"`
	Destination string             `json:"destination"`
	Files       []MatchHistoryFile `json:"files"`
	// DeletedFiles are the creditless/bonus files the match deleted instead of moving. They are
	// gone for good — recorded only so the undo screen can say what a revert will not bring back.
	DeletedFiles []string `json:"deletedFiles,omitempty"`
	// Metadata is the torrent's sidecar as it stood at match time, so a revert can put it back
	// beside the restored files and the torrent reappears in the Unmatched screen knowing which
	// anime it came from.
	Metadata *TorrentMetadata `json:"metadata,omitempty"`
	// Revert is filled in once the match has been undone.
	Revert *RevertOutcome `json:"revert,omitempty"`
}

// RevertOutcome is what a completed revert managed to do.
type RevertOutcome struct {
	RevertedAt time.Time `json:"revertedAt"`
	// Restored holds the original relative paths that were put back in the staging directory.
	Restored []string `json:"restored"`
	// Missing holds files that were no longer where the match left them — renamed, moved or
	// deleted since — and so could not be restored.
	Missing []string        `json:"missing,omitempty"`
	Failed  []RevertFailure `json:"failed,omitempty"`
	// DestinationRemoved reports whether the anime folder the match created was emptied and
	// removed as part of the revert.
	DestinationRemoved bool `json:"destinationRemoved"`
}

// RevertFailure is one file a revert could not put back, and why.
type RevertFailure struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// File statuses reported for a match that has not been reverted yet, so the confirmation can show
// what will actually happen before anything is touched.
const (
	// RevertStatusReady — the file is where the match left it and its original path is free.
	RevertStatusReady = "ready"
	// RevertStatusMissing — the file is no longer at the path the match moved it to.
	RevertStatusMissing = "missing"
	// RevertStatusBlocked — something already occupies the path it would be restored to.
	RevertStatusBlocked = "blocked"
	// RevertStatusRestored — the match has been reverted and this file was put back.
	RevertStatusRestored = "restored"
)

// MatchHistoryFileStatus is a recorded file plus what a revert would (or did) do with it.
type MatchHistoryFileStatus struct {
	MatchHistoryFile
	Status string `json:"status"`
}

// MatchHistoryEntry is one match as the undo screen sees it.
type MatchHistoryEntry struct {
	ID          uint       `json:"id"`
	TorrentName string     `json:"torrentName"`
	AnimeID     int        `json:"animeId"`
	AnimeTitle  string     `json:"animeTitle"`
	Destination string     `json:"destination"`
	StagingPath string     `json:"stagingPath"`
	MatchedAt   time.Time  `json:"matchedAt"`
	RevertedAt  *time.Time `json:"revertedAt,omitempty"`

	Files        []MatchHistoryFileStatus `json:"files"`
	DeletedFiles []string                 `json:"deletedFiles,omitempty"`

	ReadyCount    int `json:"readyCount"`
	MissingCount  int `json:"missingCount"`
	BlockedCount  int `json:"blockedCount"`
	RestoredCount int `json:"restoredCount"`

	Revert *RevertOutcome `json:"revert,omitempty"`
}

// RestoredFile is one file a revert moved back, reported so callers can undo what they did with
// it — the library database entry the match injected, in particular.
type RestoredFile struct {
	NewPath         string `json:"newPath"`
	NewName         string `json:"newName"`
	OriginalPath    string `json:"originalPath"`
	OriginalRelPath string `json:"originalRelPath"`
}

// RevertResult is the outcome of undoing a match.
type RevertResult struct {
	Success     bool            `json:"success"`
	ID          uint            `json:"id"`
	TorrentName string          `json:"torrentName"`
	AnimeID     int             `json:"animeId"`
	AnimeTitle  string          `json:"animeTitle"`
	StagingPath string          `json:"stagingPath"`
	Restored    []RestoredFile  `json:"restored"`
	Missing     []string        `json:"missing,omitempty"`
	Failed      []RevertFailure `json:"failed,omitempty"`
	// DeletedFiles are the files the original match deleted. A revert cannot bring them back.
	DeletedFiles       []string `json:"deletedFiles,omitempty"`
	DestinationRemoved bool     `json:"destinationRemoved"`
	ErrorMessage       string   `json:"errorMessage,omitempty"`
}

// recordMatch writes down what a match did, so it can be reviewed and undone later.
//
// planned and moveErrs are the match's own plan and its per-file outcome, indexed together: only
// the files that actually moved are recorded, since those are the only ones a revert has anything
// to put back. Best-effort — a match that cannot be recorded is still a completed match, so this
// logs and returns rather than failing it.
func (r *Repository) recordMatch(req *MatchRequest, result *MatchResult, planned []plannedMove, moveErrs []error, metadata *TorrentMetadata) {
	if r.database == nil || req == nil || result == nil {
		return
	}

	files := make([]MatchHistoryFile, 0, len(planned))
	for i, p := range planned {
		if i < len(moveErrs) && moveErrs[i] != nil {
			continue
		}
		size := int64(0)
		if info, err := os.Stat(p.dest); err == nil {
			size = info.Size()
		}
		files = append(files, MatchHistoryFile{
			OriginalName:    filepath.Base(p.src),
			OriginalRelPath: p.relPath,
			OriginalPath:    p.src,
			NewName:         p.newName,
			NewPath:         p.dest,
			Size:            size,
		})
	}

	if len(files) == 0 {
		return
	}

	details := &MatchHistoryDetails{
		TorrentName:  req.TorrentName,
		StagingPath:  DestinationFor(req.TorrentName),
		AnimeID:      req.AnimeID,
		AnimeTitle:   req.AnimeTitleClean,
		Destination:  result.Destination,
		Files:        files,
		DeletedFiles: append([]string(nil), result.RemovedFiles...),
		Metadata:     metadata,
	}

	value, err := json.Marshal(details)
	if err != nil {
		r.logger.Warn().Err(err).Str("torrent", req.TorrentName).Msg("unmatched: Failed to encode match record")
		return
	}

	record := &models.UnmatchedMatchRecord{
		TorrentName: req.TorrentName,
		AnimeID:     req.AnimeID,
		AnimeTitle:  req.AnimeTitleClean,
		Destination: result.Destination,
		FileCount:   len(files),
		Value:       value,
	}
	if _, err := r.database.InsertUnmatchedMatchRecord(record); err != nil {
		r.logger.Warn().Err(err).Str("torrent", req.TorrentName).Msg("unmatched: Failed to save match record")
		return
	}

	r.logger.Debug().
		Uint("recordId", record.ID).
		Str("torrent", req.TorrentName).
		Int("files", len(files)).
		Msg("unmatched: Recorded match for undo")
}

// GetMatchHistory returns recorded matches, newest first, each with the current state of every
// file it moved. Statuses are computed against the disk on every read rather than stored, because
// a file the user has since renamed or deleted has to show up as such before they hit revert.
func (r *Repository) GetMatchHistory(limit int) ([]*MatchHistoryEntry, error) {
	if r.database == nil {
		return []*MatchHistoryEntry{}, nil
	}

	records, err := r.database.GetUnmatchedMatchRecords(limit)
	if err != nil {
		return nil, err
	}

	entries := make([]*MatchHistoryEntry, 0, len(records))
	for _, record := range records {
		entry, err := buildMatchHistoryEntry(record)
		if err != nil {
			r.logger.Warn().Err(err).Uint("recordId", record.ID).Msg("unmatched: Skipping unreadable match record")
			continue
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

// GetMatchHistoryEntry returns a single recorded match with its files' current state.
func (r *Repository) GetMatchHistoryEntry(id uint) (*MatchHistoryEntry, error) {
	if r.database == nil {
		return nil, errors.New("match history is unavailable")
	}
	record, err := r.database.GetUnmatchedMatchRecord(id)
	if err != nil {
		return nil, fmt.Errorf("match record not found: %w", err)
	}
	return buildMatchHistoryEntry(record)
}

// DismissMatchRecord drops a match from the undo list, leaving every file exactly where it is.
// This is the "keep this match" side of the screen.
func (r *Repository) DismissMatchRecord(id uint) error {
	if r.database == nil {
		return errors.New("match history is unavailable")
	}
	return r.database.DeleteUnmatchedMatchRecord(id)
}

// buildMatchHistoryEntry turns a stored row into what the screen renders, statuses included.
func buildMatchHistoryEntry(record *models.UnmatchedMatchRecord) (*MatchHistoryEntry, error) {
	var details MatchHistoryDetails
	if err := json.Unmarshal(record.Value, &details); err != nil {
		return nil, fmt.Errorf("failed to decode match record: %w", err)
	}

	entry := &MatchHistoryEntry{
		ID:           record.ID,
		TorrentName:  firstNonEmpty(details.TorrentName, record.TorrentName),
		AnimeID:      details.AnimeID,
		AnimeTitle:   firstNonEmpty(details.AnimeTitle, record.AnimeTitle),
		Destination:  firstNonEmpty(details.Destination, record.Destination),
		StagingPath:  details.StagingPath,
		MatchedAt:    record.CreatedAt,
		RevertedAt:   record.RevertedAt,
		DeletedFiles: details.DeletedFiles,
		Revert:       details.Revert,
		Files:        make([]MatchHistoryFileStatus, 0, len(details.Files)),
	}

	restored := make(map[string]bool)
	failed := make(map[string]bool)
	if details.Revert != nil {
		for _, rel := range details.Revert.Restored {
			restored[rel] = true
		}
		for _, f := range details.Revert.Failed {
			failed[f.Name] = true
		}
	}

	for _, f := range details.Files {
		status := fileRevertStatus(f)
		// A reverted record reports what the revert did rather than what the disk says now: the
		// files are back in the staging directory, where a fresh status check would call every
		// one of them "blocked" by itself.
		if record.RevertedAt != nil {
			switch {
			case restored[f.OriginalRelPath]:
				status = RevertStatusRestored
			case failed[f.NewName]:
				status = RevertStatusBlocked
			default:
				status = RevertStatusMissing
			}
		}
		entry.Files = append(entry.Files, MatchHistoryFileStatus{MatchHistoryFile: f, Status: status})

		switch status {
		case RevertStatusReady:
			entry.ReadyCount++
		case RevertStatusMissing:
			entry.MissingCount++
		case RevertStatusBlocked:
			entry.BlockedCount++
		case RevertStatusRestored:
			entry.RestoredCount++
		}
	}

	return entry, nil
}

// fileRevertStatus reports what a revert would do with one file right now.
func fileRevertStatus(f MatchHistoryFile) string {
	if _, err := os.Stat(f.NewPath); err != nil {
		return RevertStatusMissing
	}
	if _, err := os.Stat(f.OriginalPath); err == nil {
		return RevertStatusBlocked
	}
	return RevertStatusReady
}

// RevertMatch undoes a recorded match: every file that is still where the match left it is moved
// back to the exact path and name it had in the staging directory, the torrent's metadata sidecar
// is put back beside it, and the anime folder the match created is removed if it is left holding
// nothing.
//
// Files that have since been renamed, moved or deleted are reported rather than guessed at, and
// nothing is overwritten: a file already sitting at the path one would be restored to leaves that
// file alone and reports it.
func (r *Repository) RevertMatch(id uint) (*RevertResult, error) {
	if r.database == nil {
		return nil, errors.New("match history is unavailable")
	}

	record, err := r.database.GetUnmatchedMatchRecord(id)
	if err != nil {
		return nil, fmt.Errorf("match record not found: %w", err)
	}
	if record.RevertedAt != nil {
		return nil, errors.New("this match has already been reverted")
	}

	var details MatchHistoryDetails
	if err := json.Unmarshal(record.Value, &details); err != nil {
		return nil, fmt.Errorf("failed to decode match record: %w", err)
	}

	result := r.applyRevert(&details)
	result.ID = record.ID

	// Nothing restored and nothing missing means every single file was blocked or errored: the
	// revert did nothing at all, so leave the record alone and let the user retry once they have
	// dealt with whatever is in the way.
	if len(result.Restored) == 0 && len(result.Missing) == 0 && len(result.Failed) > 0 {
		result.Success = false
		result.ErrorMessage = fmt.Sprintf("Could not restore any of the %d files", len(result.Failed))
		return result, nil
	}

	revertedAt := time.Now()
	details.Revert = &RevertOutcome{
		RevertedAt:         revertedAt,
		Restored:           make([]string, 0, len(result.Restored)),
		Missing:            result.Missing,
		Failed:             result.Failed,
		DestinationRemoved: result.DestinationRemoved,
	}
	for _, f := range result.Restored {
		details.Revert.Restored = append(details.Revert.Restored, f.OriginalRelPath)
	}

	value, err := json.Marshal(&details)
	if err != nil {
		r.logger.Warn().Err(err).Uint("recordId", record.ID).Msg("unmatched: Failed to encode revert outcome")
		value = record.Value
	}
	if err := r.database.MarkUnmatchedMatchRecordReverted(record.ID, revertedAt, value); err != nil {
		// The files are already back where they belong; failing to write that down would let the
		// same revert run a second time, which is harmless (every file reports missing) but
		// confusing, so it is reported.
		r.logger.Error().Err(err).Uint("recordId", record.ID).Msg("unmatched: Failed to mark match record as reverted")
		result.ErrorMessage = "Files were restored, but the undo could not be recorded"
	}

	r.invalidateCache()

	r.logger.Info().
		Uint("recordId", record.ID).
		Str("torrent", details.TorrentName).
		Int("restored", len(result.Restored)).
		Int("missing", len(result.Missing)).
		Int("failed", len(result.Failed)).
		Msg("unmatched: Reverted match")

	return result, nil
}

// applyRevert does the file work of a revert. Split out from RevertMatch so it can be exercised
// without a database.
func (r *Repository) applyRevert(details *MatchHistoryDetails) *RevertResult {
	result := &RevertResult{
		Success:      true,
		TorrentName:  details.TorrentName,
		AnimeID:      details.AnimeID,
		AnimeTitle:   details.AnimeTitle,
		StagingPath:  details.StagingPath,
		Restored:     make([]RestoredFile, 0, len(details.Files)),
		DeletedFiles: details.DeletedFiles,
	}

	// Work out what can move before moving anything, so the directories a restore needs exist by
	// the time the moves run concurrently.
	planned := make([]plannedMove, 0, len(details.Files))
	plannedFiles := make([]MatchHistoryFile, 0, len(details.Files))

	for _, f := range details.Files {
		// A crafted or stale record must not be able to write outside the staging directory.
		if !isInsideUnmatchedBase(f.OriginalPath) {
			result.Failed = append(result.Failed, RevertFailure{
				Name:   f.NewName,
				Reason: "its original location is outside the Unmatched folder",
			})
			continue
		}
		if _, err := os.Stat(f.NewPath); err != nil {
			result.Missing = append(result.Missing, f.NewName)
			continue
		}
		if _, err := os.Stat(f.OriginalPath); err == nil {
			result.Failed = append(result.Failed, RevertFailure{
				Name:   f.NewName,
				Reason: "a file is already sitting where it would be restored",
			})
			continue
		}
		if err := os.MkdirAll(filepath.Dir(f.OriginalPath), 0755); err != nil {
			result.Failed = append(result.Failed, RevertFailure{
				Name:   f.NewName,
				Reason: fmt.Sprintf("could not recreate its folder: %v", err),
			})
			continue
		}

		planned = append(planned, plannedMove{
			src:     f.NewPath,
			dest:    f.OriginalPath,
			newName: f.OriginalName,
			relPath: f.OriginalRelPath,
		})
		plannedFiles = append(plannedFiles, f)
	}

	moveErrs := r.runMoves(planned)
	for i, f := range plannedFiles {
		if err := moveErrs[i]; err != nil {
			r.logger.Error().Err(err).Str("src", f.NewPath).Str("dest", f.OriginalPath).Msg("unmatched: Failed to restore file")
			result.Failed = append(result.Failed, RevertFailure{Name: f.NewName, Reason: err.Error()})
			continue
		}
		result.Restored = append(result.Restored, RestoredFile{
			NewPath:         f.NewPath,
			NewName:         f.NewName,
			OriginalPath:    f.OriginalPath,
			OriginalRelPath: f.OriginalRelPath,
		})
		r.logger.Info().Str("src", f.NewPath).Str("dest", f.OriginalPath).Msg("unmatched: Restored file")
	}

	if len(result.Restored) > 0 {
		r.restoreStagingMetadata(details)
	}

	result.DestinationRemoved = r.removeEmptiedDestination(details.Destination)

	if len(result.Failed) > 0 {
		result.ErrorMessage = fmt.Sprintf("%d file(s) could not be restored", len(result.Failed))
	}

	return result
}

// restoreStagingMetadata puts back the record of which anime the restored download was for, so the
// torrent reappears in the Unmatched screen already knowing what it is.
//
// Auto-match is deliberately cleared: the record the match consumed may well have had it on, and
// leaving it on would have the scanner re-match the download within seconds of it being restored —
// undoing the undo.
func (r *Repository) restoreStagingMetadata(details *MatchHistoryDetails) {
	if details.Metadata == nil || details.TorrentName == "" {
		return
	}

	metadata := *details.Metadata
	metadata.AutoMatch = false

	if err := r.SaveTorrentMetadataRecord(details.TorrentName, metadata); err != nil {
		r.logger.Warn().Err(err).Str("torrent", details.TorrentName).
			Msg("unmatched: Failed to restore the torrent's metadata after a revert")
	}
}

// removeEmptiedDestination removes the anime folder a match wrote into, but only once it holds
// nothing but the sidecar the match left there. A folder with anything else in it — episodes from
// another release, artwork, subtitles the user added — is left exactly as it is.
//
// Reports whether the folder was removed.
func (r *Repository) removeEmptiedDestination(destination string) bool {
	if destination == "" {
		return false
	}

	libraryPath := r.getAnimeBasePath()
	if !isInsideDir(libraryPath, destination) {
		r.logger.Warn().Str("path", destination).Msg("unmatched: Refusing to remove a destination outside the library")
		return false
	}

	info, err := os.Stat(destination)
	if err != nil || !info.IsDir() {
		return false
	}
	if !onlyHoldsMetadata(destination) {
		return false
	}

	if err := os.RemoveAll(destination); err != nil {
		r.logger.Warn().Err(err).Str("path", destination).Msg("unmatched: Failed to remove emptied destination folder")
		return false
	}

	r.logger.Info().Str("path", destination).Msg("unmatched: Removed destination folder emptied by a revert")
	return true
}

// isInsideDir reports whether target sits strictly inside base. Used to keep a revert's deletes
// within the library, in the same spirit as isInsideUnmatchedBase does for the staging directory.
func isInsideDir(base, target string) bool {
	if base == "" || target == "" {
		return false
	}
	absBase, err := filepath.Abs(base)
	if err != nil {
		return false
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	if absBase == absTarget {
		return false
	}
	rel, err := filepath.Rel(absBase, absTarget)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
