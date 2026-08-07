package handlers

import (
	"seanime/internal/database/db_bridge"
	"seanime/internal/library/anime"
	"seanime/internal/unmatched"
	"strings"

	"github.com/labstack/echo/v4"
)

// HandleGetUnmatchedMatchHistory
//
//	@summary returns the matches that can be undone.
//	@desc This handler returns every recorded match from the Unmatched screen, newest first, with
//	@desc the original and new name of each file and whether it can still be restored.
//	@route /api/v1/unmatched/history [GET]
//	@returns []*unmatched.MatchHistoryEntry
func (h *Handler) HandleGetUnmatchedMatchHistory(c echo.Context) error {
	entries, err := h.App.UnmatchedRepository.GetMatchHistory(0)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, entries)
}

// HandleGetUnmatchedMatchHistoryEntry
//
//	@summary returns a single recorded match.
//	@desc This handler returns one recorded match with the current state of every file it moved,
//	@desc which is what the revert confirmation is built from.
//	@route /api/v1/unmatched/history/entry [POST]
//	@returns *unmatched.MatchHistoryEntry
func (h *Handler) HandleGetUnmatchedMatchHistoryEntry(c echo.Context) error {
	type body struct {
		ID uint `json:"id"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "record id is required"))
	}

	entry, err := h.App.UnmatchedRepository.GetMatchHistoryEntry(b.ID)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, entry)
}

// HandleRevertUnmatchedMatch
//
//	@summary undoes a match, moving its files back to the Unmatched folder.
//	@desc This handler restores every file a match moved to the exact path and name it had before,
//	@desc removes the library entries the match created, and puts the torrent's metadata back.
//	@route /api/v1/unmatched/history/revert [POST]
//	@returns *unmatched.RevertResult
func (h *Handler) HandleRevertUnmatchedMatch(c echo.Context) error {
	type body struct {
		ID uint `json:"id"`
		// Confirmed is the client's acknowledgement that the user was shown what the revert will
		// do and said yes. A revert moves files across the disk, so it is never performed on the
		// strength of an ID alone.
		Confirmed bool `json:"confirmed"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "record id is required"))
	}
	if !b.Confirmed {
		return h.RespondWithError(c, echo.NewHTTPError(400, "this revert has not been confirmed"))
	}

	// Share the match lock: a revert moving files out of the library while a match moves files
	// into it would have the two racing over the same staging directory and the same DB rows.
	matchMu.Lock()
	defer matchMu.Unlock()

	result, err := h.App.UnmatchedRepository.RevertMatch(b.ID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if len(result.Restored) > 0 {
		h.removeRevertedLocalFiles(result)

		// The files are back in staging, so the Unmatched screen and the library both need to
		// catch up. Reuses the coalescing scheduler the match path uses, so undoing a run of
		// matches costs one refresh rather than one each.
		h.App.UnmatchedRepository.InvalidateCache()
		h.scheduleAnimeCollectionRefresh()
	}

	return h.RespondWithData(c, result)
}

// HandleDismissUnmatchedMatchRecord
//
//	@summary keeps a match and takes it off the undo list.
//	@desc This handler deletes the record of a match without touching a single file.
//	@route /api/v1/unmatched/history/dismiss [POST]
//	@returns bool
func (h *Handler) HandleDismissUnmatchedMatchRecord(c echo.Context) error {
	type body struct {
		ID uint `json:"id"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "record id is required"))
	}

	if err := h.App.UnmatchedRepository.DismissMatchRecord(b.ID); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// removeRevertedLocalFiles drops the library entries a match injected for the files a revert has
// just moved back out. Without this the library keeps pointing at paths that no longer exist, and
// the anime carries on showing episodes that are sitting in the Unmatched folder again.
//
// Entries are matched on path, compared the way the filesystem does — the match wrote them with
// forward slashes, and a user's library may well be on Windows.
func (h *Handler) removeRevertedLocalFiles(result *unmatched.RevertResult) {
	injectMu.Lock()
	defer injectMu.Unlock()

	existingLFs, lfsId, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		h.App.Logger.Warn().Err(err).Msg("unmatched: failed to load local files while reverting a match")
		return
	}

	restored := make(map[string]bool, len(result.Restored))
	for _, f := range result.Restored {
		restored[normalizeLocalFilePath(f.NewPath)] = true
	}

	kept := make([]*anime.LocalFile, 0, len(existingLFs))
	removed := 0
	for _, lf := range existingLFs {
		if lf != nil && restored[normalizeLocalFilePath(lf.Path)] {
			removed++
			continue
		}
		kept = append(kept, lf)
	}

	if removed == 0 {
		return
	}

	if _, err := db_bridge.SaveLocalFiles(h.App.Database, lfsId, kept); err != nil {
		h.App.Logger.Warn().Err(err).Msg("unmatched: failed to save local files while reverting a match")
		return
	}

	h.App.Logger.Info().
		Int("count", removed).
		Int("mediaId", result.AnimeID).
		Msg("unmatched: removed reverted files from library DB")
}

// normalizeLocalFilePath puts a path into the one form the comparison above can rely on: forward
// slashes, lowercased. Local file paths are written by several different code paths (the scanner,
// the match injection) and on Windows they disagree on separator and on drive-letter case.
func normalizeLocalFilePath(path string) string {
	return strings.ToLower(strings.ReplaceAll(path, "\\", "/"))
}
