package enqueuefuture

import (
	"seanime/internal/database/db"
	"seanime/internal/database/db_bridge"
)

// An anime in the queue can be dealt with while it sits there: you download it from the queue, or
// grab it from the anime page instead, or match a download you already had. The row does not know
// any of that — it was written by a walk that happened once, days ago.
//
// These used to be deleted for it. That reads badly in practice: the queue is the record of a walk,
// and an entry disappearing because you handled it looks exactly like one the walk never found, so
// the counts move and the franchise you were working through quietly loses a season.
//
// So they stay and are marked instead. The screen greys them out: still there, still part of their
// family group, still counted, but not something you can select or pick a torrent for — there is
// nothing to decide about an anime that is already downloading. Skip and ignore remain, because
// those are how you say you are finished with a row rather than what to do with it.

// downloadStatesByMediaID reads every anime's download badge in one query.
//
// One read for the whole queue rather than one per row, and nothing at all when no badge exists,
// which is why this is cheap enough to run every time the queue is listed.
func (r *Repository) downloadStatesByMediaID() map[int]string {
	if r.database == nil {
		return nil
	}

	// No early return on an empty badge table.
	//
	// It used to give up here, which quietly made the other two sources unreachable for anybody whose
	// badges were sparse — and the badge table is *only* downloads this server watched happen. A
	// library full of scanned-in series and a staging folder full of finished downloads both read as
	// "nothing is downloaded", because the one source that had no rows decided the answer for the two
	// that did.
	states := make(map[int]string)

	rows, err := r.database.AnimeDownloadStates()
	if err != nil {
		r.logger.Debug().Err(err).Msg("enqueuefuture: Could not read download badges for the queue")
	}
	for _, row := range rows {
		if row.State != "" {
			states[row.MediaID] = row.State
		}
	}

	// Files in the library are what "matched" describes, so anything with them has earned the badge —
	// whether or not this server was the one that put them there.
	//
	// The recorded states only cover downloads this server watched happen. Everything imported by
	// hand, scanned in, or downloaded before any of it was recorded has no row at all, which is why
	// the queue was leaving series greyed-out-looking everywhere else in the app but plain here: the
	// badge UI has always consulted both sources and this consulted one. Same rule as
	// buildDownloadingMediaStatus, for the same reason — and computed on read, so deleting the files
	// takes the badge with them and leaves no record claiming otherwise.
	//
	// Downloading wins over it: a series you already have with another season coming down is a series
	// that is coming down, and that is the fact that decides what you do next.
	for mediaID := range r.animeWithLocalFiles() {
		if existing := states[mediaID]; existing == db.AnimeDownloadStateDownloading {
			continue
		}
		states[mediaID] = db.AnimeDownloadStateMatched
	}

	// And a download sitting in staging is "downloaded", from the files themselves rather than from
	// anything written down about them.
	//
	// A staged record exists from the moment a torrent is queued until its files are matched into the
	// library, so its presence is the fact: something for this anime is on disk and not yet filed.
	// Only where nothing better is known — an anime already in the library is matched, and one still
	// coming down is downloading, both of which are later stages of the same story.
	staged, err := r.database.UnmatchedTorrentMetadataAnimeIDs()
	if err != nil {
		r.logger.Debug().Err(err).Msg("enqueuefuture: Could not read staged downloads for badges")
		return states
	}
	for mediaID := range staged {
		if states[mediaID] == "" {
			states[mediaID] = db.AnimeDownloadStateDownloaded
		}
	}

	return states
}

// animeWithLocalFiles is every anime with at least one non-ignored file in the library.
func (r *Repository) animeWithLocalFiles() map[int]struct{} {
	out := make(map[int]struct{})

	localFiles, _, err := db_bridge.GetLocalFiles(r.database)
	if err != nil {
		r.logger.Debug().Err(err).Msg("enqueuefuture: Could not read local files for badges")
		return out
	}
	for _, lf := range localFiles {
		if lf == nil || lf.Ignored || lf.MediaId == 0 {
			continue
		}
		out[lf.MediaId] = struct{}{}
	}
	return out
}
