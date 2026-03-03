package handlers

import (
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

	result, err := h.App.UnmatchedRepository.MatchAndMoveFiles(&req)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// High-priority: refresh library collection in background so matched items appear immediately
	go func() {
		if _, err := h.App.GetAnimeCollection(true); err != nil {
			h.App.Logger.Warn().Err(err).Msg("unmatched: failed to refresh anime collection after match")
		}
	}()

	return h.RespondWithData(c, result)
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
