package enqueuefuture

import (
	"regexp"
	"strings"

	"seanime/internal/api/anilist"
)

// A recommendation graph is full of AniList entries that are not things to watch: the promotional
// video for a series, the commercials that ran alongside it, the music video for its opening, the
// "special program" the studio streamed before it aired. They are related to real shows, so the walk
// finds them constantly, and every one of them costs a franchise slot, an item in the queue, and a
// torrent search that was never going to find anything worth downloading.
//
// So they are rejected at discovery, before they are ever queued, rather than being left for the user
// to skip one at a time.

// promoTitleRegex matches an entry whose title says it is promotional material.
//
// Anchored to whole tokens, and the abbreviations are only trusted with a boundary on both sides:
// "PV" and "CM" are two letters and would otherwise fire inside ordinary words. The spelled-out forms
// are safe enough to match anywhere in the title, since no real series is called "... Commercial".
var promoTitleRegex = regexp.MustCompile(
	`(?i)(\bPV\b|\bCM\b|\bPVs\b|\bCMs\b|\bTVCM\b|\bteaser\b|\btrailer\b|\bpromotion(al)? video\b|\bcommercial\b|\bspecial program\b|\bpreview\b|\bpilot film\b)`,
)

// rejectReason is why an entry will not be queued, or "" when it is fine.
//
// episodes is AniList's episode count for the entry. Zero means AniList does not list a single
// episode for it, which for the things this rejects is the norm — a PV is one video, filed with no
// episode count at all.
func rejectReason(title string, format *anilist.MediaFormat, episodes int, notYetReleased bool) string {
	if notYetReleased {
		return "not yet released"
	}

	if format != nil {
		switch *format {
		case anilist.MediaFormatManga, anilist.MediaFormatNovel, anilist.MediaFormatOneShot:
			// Relations cross media types freely — the manga it came from, the novel under that.
			return "not an anime"
		case anilist.MediaFormatMusic:
			// Opening/ending music videos. Downloadable in principle, never what this is for.
			return "music video"
		}
	}

	if promoTitleRegex.MatchString(title) {
		return "promotional material"
	}

	// Nothing to download and nothing to watch. This also catches most of the promotional entries
	// whose titles do not say what they are.
	if episodes <= 0 {
		return "no episodes"
	}

	return ""
}

// isJunkTitle reports whether a queued row's title alone marks it as promotional material.
//
// Used to clear out rows queued before the filter above existed. Titles are all a queued row carries
// — the episode count is not stored on it — so this is deliberately the narrower of the two checks.
func isJunkTitle(title string) bool {
	if strings.TrimSpace(title) == "" {
		return false
	}
	return promoTitleRegex.MatchString(title)
}

// purgeJunkItems drops the promotional entries already sitting in the queue.
//
// The filter above only stops new ones being queued; a queue built before it existed is still full of
// them, and there is no reason to make the user skip a hundred commercials by hand. Runs at the start
// of every run, which is cheap — one read of the list view, which carries no snapshot blobs.
//
// Title-only, because the episode count is not stored on the row. Entries with no episodes are kept
// out at discovery instead.
func (r *Repository) purgeJunkItems() {
	items, err := r.database.GetEnqueueFutureListItems()
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not read the queue to clear out promotional entries")
		return
	}

	removed := 0
	for _, item := range items {
		if item == nil || !isJunkTitle(item.Title) {
			continue
		}
		if err := r.database.DeleteEnqueueFutureItem(item.MediaID); err != nil {
			r.logger.Warn().Err(err).Int("mediaId", item.MediaID).Str("title", item.Title).
				Msg("enqueuefuture: Could not remove a promotional entry")
			continue
		}
		r.logger.Debug().Int("mediaId", item.MediaID).Str("title", item.Title).
			Msg("enqueuefuture: Removed a promotional entry from the queue")
		removed++
	}

	if removed > 0 {
		r.logger.Info().Int("removed", removed).
			Msg("enqueuefuture: Cleared promotional entries (PVs, CMs and the like) out of the queue")
	}
}
