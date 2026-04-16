package handlers

import (
	"context"
	"fmt"
	"seanime/internal/database/db_bridge"
	"seanime/internal/library/anime"
	"seanime/internal/unmatched"

	"github.com/labstack/echo/v4"
)

// HandleGetUnmatchedTorrents
//
//	@summary returns all unmatched torrents.
//	@desc This handler returns all torrents in the unmatched directory that haven't been matched to an anime yet.
//	@route /api/v1/unmatched/torrents [GET]
//	@returns []*unmatched.UnmatchedTorrent
func (h *Handler) HandleGetUnmatchedTorrents(c echo.Context) error {
	torrents, err := h.App.UnmatchedRepository.GetUnmatchedTorrents()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, torrents)
}

// HandleGetUnmatchedTorrentContents
//
//	@summary returns the contents of a specific unmatched torrent.
//	@desc This handler returns the detailed file structure of a specific torrent.
//	@route /api/v1/unmatched/torrent/contents [POST]
//	@returns *unmatched.UnmatchedTorrent
func (h *Handler) HandleGetUnmatchedTorrentContents(c echo.Context) error {
	type body struct {
		Name string `json:"name"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Name == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "torrent name is required"))
	}

	torrent, err := h.App.UnmatchedRepository.GetTorrentContents(b.Name)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, torrent)
}

// HandleMatchUnmatchedTorrent
//
//	@summary matches selected files from an unmatched torrent to an anime.
//	@desc This handler moves selected files to the anime directory with proper naming.
//	@route /api/v1/unmatched/match [POST]
//	@returns *unmatched.MatchResult
func (h *Handler) HandleMatchUnmatchedTorrent(c echo.Context) error {
	var req unmatched.MatchRequest
	if err := c.Bind(&req); err != nil {
		return h.RespondWithError(c, err)
	}

	// Feature 4: guard against matching the same mediaId twice
	if req.AnimeID > 0 {
		if lfs, _, err := db_bridge.GetLocalFiles(h.App.Database); err == nil {
			for _, lf := range lfs {
				if lf.MediaId == req.AnimeID {
					return h.RespondWithError(c, echo.NewHTTPError(409,
						fmt.Sprintf("You already matched these files (mediaId %d is already in your library)", req.AnimeID)))
				}
			}
		}
	}

	result, err := h.App.UnmatchedRepository.MatchAndMoveFiles(&req)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Feature 3: immediately inject moved files as locked local-file DB entries so
	// the "Resolve unmatched" step on the home page is never needed.
	if result.Success && req.AnimeID > 0 && len(result.MovedFiles) > 0 {
		libraryPath := h.App.UnmatchedRepository.GetAnimeBasePath()
		go func() {
			newLFs := make([]*anime.LocalFile, 0, len(result.MovedFiles))
			for _, name := range result.MovedFiles {
				fullPath := result.Destination + "/" + name
				lf := anime.NewLocalFile(fullPath, libraryPath)
				lf.MediaId = req.AnimeID
				lf.Locked = true
				lf.Ignored = false
				// Set episode type to main — the FileHydrator will refine it during the next scan
				lf.Metadata = &anime.LocalFileMetadata{
					Episode:      0,
					AniDBEpisode: "",
					Type:         anime.LocalFileTypeMain,
				}
				newLFs = append(newLFs, lf)
			}

			existingLFs, lfsId, lfsErr := db_bridge.GetLocalFiles(h.App.Database)
			if lfsErr != nil {
				h.App.Logger.Warn().Err(lfsErr).Msg("unmatched: failed to load local files for DB injection")
			} else {
				merged := append(existingLFs, newLFs...)
				if _, saveErr := db_bridge.SaveLocalFiles(h.App.Database, lfsId, merged); saveErr != nil {
					h.App.Logger.Warn().Err(saveErr).Msg("unmatched: failed to save injected local files")
				} else {
					h.App.Logger.Info().
						Int("count", len(newLFs)).
						Int("mediaId", req.AnimeID).
						Msg("unmatched: injected moved files into library DB")
				}
			}
		}()
	}

	// High-priority: refresh library collection in background so matched items appear immediately
	go func() {
		if _, err := h.App.GetAnimeCollection(true); err != nil {
			h.App.Logger.Warn().Err(err).Msg("unmatched: failed to refresh anime collection after match")
		}

		// Invalidate unmatched cache and trigger a rescan so UI drops matched entries
		h.App.UnmatchedRepository.InvalidateCache()
		h.App.UnmatchedScanner.TriggerScan()
	}()

	return h.RespondWithData(c, result)
}

// HandleUnmatchedFamilySearch
//
//	@summary fetches the full sequel/prequel relation tree for an anime.
//	@desc Returns the root anime plus all related sequel/prequel entries from AniList.
//	@route /api/v1/unmatched/family-search [POST]
//	@returns []familyEntry
func (h *Handler) HandleUnmatchedFamilySearch(c echo.Context) error {
	type body struct {
		AnimeID int `json:"animeId"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.AnimeID <= 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "animeId is required"))
	}

	type familyEntry struct {
		ID    int    `json:"id"`
		Title string `json:"title"`
	}

	platform := h.App.AnilistPlatformRef.Get()
	ctx := context.Background()

	visited := make(map[int]bool)
	out := make([]familyEntry, 0)

	type node struct{ id int }
	queue := []node{{id: b.AnimeID}}

	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if visited[cur.id] {
			continue
		}
		visited[cur.id] = true

		media, err := platform.GetAnimeWithRelations(ctx, cur.id)
		if err != nil || media == nil {
			continue
		}

		title := ""
		if media.GetTitle() != nil {
			if media.GetTitle().GetUserPreferred() != nil {
				title = *media.GetTitle().GetUserPreferred()
			} else if media.GetTitle().GetRomaji() != nil {
				title = *media.GetTitle().GetRomaji()
			}
		}
		out = append(out, familyEntry{ID: media.ID, Title: title})

		if media.Relations == nil {
			continue
		}
		for _, edge := range media.GetRelations().GetEdges() {
			if edge == nil || edge.Node == nil {
				continue
			}
			n := edge.GetNode()
			if n == nil || visited[n.ID] {
				continue
			}
			// Only follow sequels / prequels that have broad relation formats
			if edge.RelationType == nil {
				continue
			}
			rt := string(*edge.RelationType)
			if rt != "SEQUEL" && rt != "PREQUEL" {
				continue
			}
			if !edge.IsBroadRelationFormat() {
				continue
			}
			queue = append(queue, node{id: n.ID})
		}
	}

	return h.RespondWithData(c, out)
}

// HandleDeleteUnmatchedTorrent
//
//	@summary deletes an unmatched torrent directory.
//	@desc This handler removes a torrent directory from the unmatched folder.
//	@route /api/v1/unmatched/torrent/delete [POST]
//	@returns bool
func (h *Handler) HandleDeleteUnmatchedTorrent(c echo.Context) error {
	type body struct {
		Name string `json:"name"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Name == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "torrent name is required"))
	}

	err := h.App.UnmatchedRepository.DeleteTorrent(b.Name)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleGetUnmatchedDestination
//
//	@summary returns the destination path for a new torrent download.
//	@desc This handler returns the path where a torrent should be downloaded to.
//	@route /api/v1/unmatched/destination [POST]
//	@returns string
func (h *Handler) HandleGetUnmatchedDestination(c echo.Context) error {
	type body struct {
		TorrentName string `json:"torrentName"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	destination := h.App.UnmatchedRepository.GetUnmatchedDestination(b.TorrentName)
	return h.RespondWithData(c, destination)
}

// HandleGetUnmatchedScannerStatus
//
//	@summary returns the status of the unmatched scanner.
//	@desc This handler returns the scanner status including completed torrents.
//	@route /api/v1/unmatched/scanner/status [GET]
//	@returns *unmatched.ScannerStatus
func (h *Handler) HandleGetUnmatchedScannerStatus(c echo.Context) error {
	status := h.App.UnmatchedScanner.GetStatus()
	return h.RespondWithData(c, status)
}

// HandleClearCompletedTorrent
//
//	@summary clears a torrent from the completed list.
//	@desc This handler removes a torrent from the scanner's completed list.
//	@route /api/v1/unmatched/scanner/clear [POST]
//	@returns bool
func (h *Handler) HandleClearCompletedTorrent(c echo.Context) error {
	type body struct {
		TorrentName string `json:"torrentName"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	h.App.UnmatchedScanner.ClearCompletedTorrent(b.TorrentName)
	return h.RespondWithData(c, true)
}
