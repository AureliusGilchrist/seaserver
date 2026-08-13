package manga

import (
	"context"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/extension"
	hibikemanga "seanime/internal/extension/hibike/manga"
	manga_providers "seanime/internal/manga/providers"
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
		// Negative IDs are synthetic series — local folders and unmatched provider downloads. They
		// are not skipped: AniList has never heard of them, but the provider they came from has
		// cover art for them, which is the whole point of fillSyntheticCover.
		if mediaID == 0 || d.backfill.attempted[mediaID] {
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
//
// AniList first, the provider second. AniList has the better metadata when it has any, but a series
// it has never heard of — or one whose entry carries no cover — still has cover art somewhere: the
// provider the chapters were downloaded from put a thumbnail next to it in its own search results.
// That is the picture the user has already seen while downloading the thing, so it is the right one
// to fall back to, and it costs a provider search rather than anything from the AniList budget.
func (d *Downloader) fetchAndStoreMetadata(platformRef *util.Ref[platform.Platform], mediaID int) bool {
	if mediaID < 0 {
		return d.fillSyntheticCover(mediaID)
	}

	p := platformRef.Get()
	if p == nil {
		return false
	}

	// Not user-initiated: nobody is waiting on this, and marking it so would put it in front of the
	// requests somebody is waiting on. See internal/api/anilist/priority.go.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var title, coverImage string
	media, err := p.GetManga(ctx, mediaID)
	if err != nil || media == nil {
		d.logger.Debug().Err(err).Int("mediaId", mediaID).
			Msg("manga downloader: Could not fetch metadata for a downloaded series")
	} else {
		title, coverImage = titleAndCoverOf(media)
	}

	// AniList had nothing, or had a title but no picture. Ask the provider the chapters came from.
	if coverImage == "" && title != "" {
		coverImage = d.coverFromProvider(d.providerFor(mediaID), title)
	}

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

// FallbackCoverProvider is asked for cover art when the download's own provider cannot supply it —
// most often because the "provider" was the local folder scanner, which has no artwork of any kind.
const FallbackCoverProvider = manga_providers.WeebCentralProvider

// fillSyntheticCover finds cover art for a synthetic series and stores it on its record.
//
// A synthetic series is one that exists only locally: a folder the scanner found, or a series
// downloaded from a provider before it was matched to anything. The scanner writes those with no
// cover at all — there is none on disk to write — so they render as a titled grey rectangle forever,
// which is the shelf of blank cards in the manga library.
//
// The title is the one thing they always have, so it is what this searches with.
func (d *Downloader) fillSyntheticCover(syntheticID int) bool {
	if d.database == nil {
		return false
	}

	synthetic, found := d.database.GetSyntheticManga(syntheticID)
	if !found || synthetic == nil || strings.TrimSpace(synthetic.Title) == "" {
		return false
	}
	if strings.TrimSpace(synthetic.CoverImage) != "" {
		return false // already has one
	}

	cover := d.coverFromProvider(synthetic.Provider, synthetic.Title)
	if cover == "" {
		return false
	}

	synthetic.CoverImage = cover
	if err := d.database.UpdateSyntheticManga(synthetic); err != nil {
		d.logger.Warn().Err(err).Int("syntheticId", syntheticID).
			Msg("manga downloader: Could not store the cover found for a local series")
		return false
	}

	d.logger.Debug().Int("syntheticId", syntheticID).Str("title", synthetic.Title).
		Msg("manga downloader: Found cover art for a local series")
	return true
}

// providerFor names the provider a download's chapters came from, so a cover search asks the source
// that actually has the series rather than a guess.
func (d *Downloader) providerFor(mediaID int) string {
	d.mediaMapMu.RLock()
	defer d.mediaMapMu.RUnlock()

	if d.mediaMap == nil {
		return ""
	}
	for provider := range (*d.mediaMap)[mediaID] {
		return provider
	}
	return ""
}

// coverFromProvider searches a manga provider by title and returns the cover of the best match.
//
// Falls back to WeebCentral when the named provider cannot be used — a series the local scanner
// found has provider "local", which is a folder on disk and has no artwork to give.
//
// The match has to be good enough to trust: this is picking a picture to put on a card by title
// alone, and a bad match is a stranger's cover art on your series, which is worse than the grey
// rectangle it replaced. HydrateSearchResultSearchRating scores the results the same way the rest of
// the manga matching does, and anything below minCoverSearchRating is left alone.
func (d *Downloader) coverFromProvider(provider string, title string) string {
	if d.repository == nil || strings.TrimSpace(title) == "" {
		return ""
	}

	candidates := []string{provider, FallbackCoverProvider}
	for _, providerID := range candidates {
		if providerID == "" || providerID == manga_providers.LocalProvider {
			continue
		}

		providerExtension, ok := extension.GetExtension[extension.MangaProviderExtension](
			d.repository.extensionBankRef.Get(), providerID)
		if !ok {
			continue
		}

		results, err := providerExtension.GetProvider().Search(hibikemanga.SearchOptions{Query: title})
		if err != nil || len(results) == 0 {
			continue
		}

		HydrateSearchResultSearchRating(results, &title)

		best := results[0]
		for _, res := range results {
			if res != nil && res.SearchRating > best.SearchRating {
				best = res
			}
		}
		if best == nil || best.Image == "" || best.SearchRating < minCoverSearchRating {
			continue
		}
		return best.Image
	}

	return ""
}

// minCoverSearchRating is how close a provider result's title has to be before its artwork is taken
// as this series'. Deliberately high: a wrong cover is a worse answer than none.
const minCoverSearchRating = 0.8

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
