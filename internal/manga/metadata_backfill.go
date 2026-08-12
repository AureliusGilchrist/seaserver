package manga

import (
	"context"
	"sync"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/platforms/platform"
	"seanime/internal/util"
)

// The downloads list is built from the download folder, and the download folder knows nothing about
// what it holds beyond a media ID. Everything else — the title, the cover — comes from one of three
// places: your AniList collection, metadata stored locally when the series was downloaded, or
// AniList itself.
//
// The endpoint deliberately never asks AniList. It is called every time the Local Library screen is
// opened, a library of two hundred downloads would be two hundred requests against a budget of
// twenty-four a minute, and the screen would sit there for the length of it. So an entry that is on
// none of your lists and has nothing stored arrives with no media at all, and the card that renders
// it has nothing to show but the media ID — which is what "no thumbnails, no metadata, can't click
// it" looks like from the outside.
//
// This fills those in behind the screen instead: whatever is missing is fetched slowly, in the
// background, at a rate the AniList budget can absorb, and written to the same local store the
// endpoint already reads. The screen stays instant, and the next time it is opened the cards it could
// not describe describe themselves. It only ever runs for entries that have nothing — an entry that
// has been backfilled once is never fetched again.

// backfillSpacing is the gap between two metadata fetches.
//
// Background AniList work shares eighteen requests a minute with the graph walk, the prefetcher and
// the collection refreshes (see anilist.BackgroundRequestsPerMinute). Four a minute is a share this
// can take without pushing anything else into the queue, and a hundred missing covers fill in over
// about half an hour of the server simply being on — which is the right trade for something nobody
// is watching happen.
const backfillSpacing = 15 * time.Second

// backfillState guards the one backfill loop, so many opens of the screen cannot start many of them.
type backfillState struct {
	mu      sync.Mutex
	running bool
	// queue is what is left to fetch, in the order it was asked for.
	queue []int
	// attempted holds every media ID already tried this run, successfully or not. A series AniList
	// has no record of must not be asked about again every time the screen is opened.
	attempted map[int]bool
}

// BackfillMissingMetadata fills in the metadata for downloads that have none, in the background.
//
// Returns immediately. Safe to call on every request: a loop already running takes the new IDs into
// account when it reaches them, and IDs already tried are ignored.
func (d *Downloader) BackfillMissingMetadata(platformRef *util.Ref[platform.Platform], mediaIDs []int) {
	if d == nil || platformRef == nil || len(mediaIDs) == 0 {
		return
	}

	d.backfill.mu.Lock()
	if d.backfill.attempted == nil {
		d.backfill.attempted = make(map[int]bool)
	}

	pending := make([]int, 0, len(mediaIDs))
	for _, mediaID := range mediaIDs {
		// Synthetic downloads have negative IDs and describe themselves from their own record;
		// AniList has never heard of them.
		if mediaID <= 0 || d.backfill.attempted[mediaID] {
			continue
		}
		d.backfill.attempted[mediaID] = true
		pending = append(pending, mediaID)
	}

	if len(pending) == 0 || d.backfill.running {
		// Nothing new, or a loop is already working through a list that now includes these — the
		// IDs are marked attempted either way, and the running loop re-reads them below.
		d.backfill.queue = append(d.backfill.queue, pending...)
		d.backfill.mu.Unlock()
		return
	}

	d.backfill.queue = append(d.backfill.queue, pending...)
	d.backfill.running = true
	d.backfill.mu.Unlock()

	go d.runBackfill(platformRef)
}

// runBackfill works through the queue one series at a time, pausing between each.
func (d *Downloader) runBackfill(platformRef *util.Ref[platform.Platform]) {
	defer util.HandlePanicInModuleThen("manga/runBackfill", func() {
		d.backfill.mu.Lock()
		d.backfill.running = false
		d.backfill.mu.Unlock()
	})

	for {
		d.backfill.mu.Lock()
		if len(d.backfill.queue) == 0 {
			d.backfill.running = false
			d.backfill.mu.Unlock()
			return
		}
		mediaID := d.backfill.queue[0]
		d.backfill.queue = d.backfill.queue[1:]
		remaining := len(d.backfill.queue)
		d.backfill.mu.Unlock()

		if d.fetchAndStoreMetadata(platformRef, mediaID) {
			d.logger.Debug().Int("mediaId", mediaID).Int("remaining", remaining).
				Msg("manga downloader: Filled in metadata for a downloaded series")
		}

		time.Sleep(backfillSpacing)
	}
}

// fetchAndStoreMetadata fetches one series' details and stores its title and cover locally. Reports
// whether anything was stored.
func (d *Downloader) fetchAndStoreMetadata(platformRef *util.Ref[platform.Platform], mediaID int) bool {
	p := platformRef.Get()
	if p == nil {
		return false
	}

	// Not user-initiated: nobody is waiting on this, and marking it so would put it in front of the
	// requests somebody is waiting on. See internal/api/anilist/priority.go.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	media, err := p.GetManga(ctx, mediaID)
	if err != nil || media == nil {
		d.logger.Debug().Err(err).Int("mediaId", mediaID).
			Msg("manga downloader: Could not fetch metadata for a downloaded series")
		return false
	}

	title, coverImage := titleAndCoverOf(media)
	if title == "" && coverImage == "" {
		return false
	}

	if err := d.database.SaveDownloadedMangaMetadata(mediaID, title, coverImage, ""); err != nil {
		d.logger.Warn().Err(err).Int("mediaId", mediaID).
			Msg("manga downloader: Could not store metadata for a downloaded series")
		return false
	}
	return true
}

// titleAndCoverOf pulls the two things a card needs out of a media record.
func titleAndCoverOf(media *anilist.BaseManga) (title string, coverImage string) {
	if media.GetTitle() != nil {
		switch {
		case media.GetTitle().GetUserPreferred() != nil:
			title = *media.GetTitle().GetUserPreferred()
		case media.GetTitle().GetRomaji() != nil:
			title = *media.GetTitle().GetRomaji()
		case media.GetTitle().GetEnglish() != nil:
			title = *media.GetTitle().GetEnglish()
		}
	}
	if media.GetCoverImage() != nil {
		switch {
		case media.GetCoverImage().GetExtraLarge() != nil:
			coverImage = *media.GetCoverImage().GetExtraLarge()
		case media.GetCoverImage().GetLarge() != nil:
			coverImage = *media.GetCoverImage().GetLarge()
		case media.GetCoverImage().GetMedium() != nil:
			coverImage = *media.GetCoverImage().GetMedium()
		}
	}
	return title, coverImage
}
