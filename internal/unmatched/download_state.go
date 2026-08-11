package unmatched

import (
	"strings"

	"seanime/internal/database/db"
)

// The three states a download passes through, re-exported from the database package so callers in
// here and in the handlers never have to spell them as strings.
const (
	DownloadStateDownloading = db.DownloadStateDownloading
	DownloadStateFinished    = db.DownloadStateFinished
	DownloadStateMatched     = db.DownloadStateMatched
)

// DownloadState is one download's recorded progress: which anime it is for, and how far it has got.
type DownloadState struct {
	TorrentName string
	AnimeID     int
	State       string
}

// MarkDownloadState records that a download has moved on.
//
// Best-effort by design: the states are what the download badge is drawn from, and failing to write
// one costs a badge that lags rather than anything a caller can usefully do about it. Callers are in
// the middle of moving files or finishing a scan, and none of them should stop over this.
func (r *Repository) MarkDownloadState(torrentName, state string) {
	if r.database == nil || strings.TrimSpace(torrentName) == "" {
		return
	}

	key := metadataKey(torrentName)
	if err := r.database.SetUnmatchedTorrentDownloadState(key, state); err != nil {
		r.logger.Debug().Err(err).Str("torrent", torrentName).Str("state", state).
			Msg("unmatched: Could not record download state")
		return
	}

	r.logger.Debug().Str("torrent", torrentName).Str("state", state).Msg("unmatched: Download state recorded")
}

// DownloadStates returns what has been recorded about every download the server knows of.
//
// This is the durable half of the download badge: rows written when each download was queued and
// stamped as it progressed, so the answer survives a server restart, a torrent client that has
// forgotten the torrent, and a staging folder that a match has already deleted. Nothing here touches
// the disk or the torrent client.
func (r *Repository) DownloadStates() []DownloadState {
	if r.database == nil {
		return nil
	}

	rows, err := r.database.GetUnmatchedTorrentDownloadStates()
	if err != nil {
		r.logger.Debug().Err(err).Msg("unmatched: Could not read download states")
		return nil
	}

	states := make([]DownloadState, 0, len(rows))
	for _, row := range rows {
		states = append(states, DownloadState{
			TorrentName: row.TorrentName,
			AnimeID:     row.AnimeID,
			State:       row.DownloadState,
		})
	}
	return states
}
