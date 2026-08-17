package manga

import (
	"context"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
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

// startupBackfillDelay is how long the server has to itself before the backfill starts.
//
// The extensions have to be loaded before a provider can be asked anything, and the AniList
// collection refresh that runs at startup should have the budget to itself while it does. Nothing
// here is urgent — nobody has opened the library yet.
const startupBackfillDelay = 45 * time.Second

// BackfillLibraryMetadata describes every downloaded and locally scanned series that is missing
// anything, without waiting for the library screen to be opened.
//
// The screen used to be the only thing that started this, which meant a library only filled in for
// somebody sitting and watching it fill in. Started here, the server does it while it is simply on,
// and the first time the screen is opened it is already right.
func (d *Downloader) BackfillLibraryMetadata(platformRef *util.Ref[platform.Platform]) {
	if d == nil || d.database == nil {
		return
	}

	go func() {
		defer util.HandlePanicInModuleThen("manga/BackfillLibraryMetadata", func() {})

		time.Sleep(startupBackfillDelay)

		if d.isOfflineRef != nil && d.isOfflineRef.Get() {
			return
		}

		pending := make([]int, 0)

		// Every synthetic series that is still short of a cover or a synopsis. Read from the
		// database rather than from the download folder: a folder the scanner found has no
		// downloaded chapters, so it is not in the media map, and those are exactly the entries that
		// have never had anything but a folder name.
		if synthetics, err := d.database.GetAllSyntheticManga(); err == nil {
			for _, synthetic := range synthetics {
				if synthetic != nil && needsMetadata(synthetic) {
					pending = append(pending, synthetic.SyntheticID)
				}
			}
		} else {
			d.logger.Warn().Err(err).Msg("manga downloader: Could not list local series to describe")
		}

		// And every download filed under an AniList ID with nothing stored for it.
		d.mediaMapMu.RLock()
		mediaIDs := make([]int, 0)
		if d.mediaMap != nil {
			for mediaID := range *d.mediaMap {
				mediaIDs = append(mediaIDs, mediaID)
			}
		}
		d.mediaMapMu.RUnlock()

		for _, mediaID := range mediaIDs {
			if mediaID <= 0 {
				continue // synthetics are already accounted for above
			}
			if _, found := d.database.GetDownloadedMangaMetadata(mediaID); !found {
				pending = append(pending, mediaID)
			}
		}

		if len(pending) == 0 {
			return
		}

		d.logger.Info().Int("count", len(pending)).
			Msg("manga downloader: Filling in metadata for the manga library in the background")

		d.BackfillMissingMetadata(platformRef, pending)
	}()
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

		outcome := d.fetchAndStoreMetadata(platformRef, mediaID)
		if outcome.stored {
			d.logger.Debug().Int("mediaId", mediaID).Int("remaining", remaining).
				Msg("manga downloader: Filled in metadata for a downloaded series")
		}

		// Paced by whichever source was actually used. The fifteen seconds exist to keep the AniList
		// budget intact, and a series that never touched AniList — one already linked, or one whose
		// description came off the provider's own page — has no reason to wait for it. The provider
		// paces itself (see weebCentralMinInterval), so the short gap is not a way around anything.
		if outcome.usedAniList {
			time.Sleep(backfillSpacing)
		} else {
			time.Sleep(providerBackfillSpacing)
		}
	}
}

// providerBackfillSpacing is the gap after a series that only needed the provider.
const providerBackfillSpacing = 2 * time.Second

// backfillOutcome says what one series' turn did, so the loop can pace itself by it.
type backfillOutcome struct {
	// stored is whether anything new was written.
	stored bool
	// usedAniList is whether the turn spent a request from the AniList budget.
	usedAniList bool
}

// fetchAndStoreMetadata fetches one series' details and stores its title and cover locally. Reports
// whether anything was stored.
//
// AniList first, the provider second. AniList has the better metadata when it has any, but a series
// it has never heard of — or one whose entry carries no cover — still has cover art somewhere: the
// provider the chapters were downloaded from put a thumbnail next to it in its own search results.
// That is the picture the user has already seen while downloading the thing, so it is the right one
// to fall back to, and it costs a provider search rather than anything from the AniList budget.
func (d *Downloader) fetchAndStoreMetadata(platformRef *util.Ref[platform.Platform], mediaID int) backfillOutcome {
	if mediaID < 0 {
		// A local series gets two things attempted, in this order: an AniList link, which brings the
		// real metadata with it and is what the user would otherwise do by hand in the Link dialog,
		// and then the provider's own description of it for the ones nothing was confident enough to
		// link. This is the decision the user described as "look it up on AniList to decide whether
		// it'll be synthetic or not": a series AniList knows stops being synthetic here, and only
		// what is left over is described from the provider.
		alreadyLinked := false
		if anilistID, found := d.database.GetMangaIDMapping(mediaID); found && anilistID > 0 {
			alreadyLinked = true
		}

		if !alreadyLinked {
			linkCtx, cancel := context.WithTimeout(context.Background(), autoLinkTimeout)
			linked := d.AutoLinkSyntheticManga(linkCtx, mediaID)
			cancel()

			if linked > 0 {
				// Linked: the AniList entry has the cover, the description and everything else, and
				// the downloads list reads it through the mapping from here on.
				return backfillOutcome{stored: true, usedAniList: true}
			}
			// The search happened whether or not it found anything, and it is the search that costs.
			return backfillOutcome{stored: d.fillSyntheticMetadata(mediaID), usedAniList: true}
		}

		// Linked already, by an earlier run or by hand. Every screen reads the AniList entry through
		// the mapping from here on, so there is nothing left for the provider to describe and no
		// request worth spending on it.
		return backfillOutcome{}
	}

	p := platformRef.Get()
	if p == nil {
		return backfillOutcome{}
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
		return backfillOutcome{usedAniList: true}
	}

	if err := d.database.SaveDownloadedMangaMetadata(mediaID, title, coverImage, ""); err != nil {
		d.logger.Warn().Err(err).Int("mediaId", mediaID).
			Msg("manga downloader: Could not store metadata for a downloaded series")
		return backfillOutcome{usedAniList: true}
	}
	return backfillOutcome{stored: true, usedAniList: true}
}

// FallbackCoverProvider is asked for cover art when the download's own provider cannot supply it —
// most often because the "provider" was the local folder scanner, which has no artwork of any kind.
const FallbackCoverProvider = manga_providers.WeebCentralProvider

// fillSyntheticMetadata describes a synthetic series from its provider and stores what it finds.
//
// A synthetic series is one that exists only locally: a folder the scanner found, or a series
// downloaded from a provider before it was matched to anything. The scanner writes those with a
// title and nothing else — there is no cover on disk to write, and no synopsis — so they render as
// a titled grey rectangle forever, which is the shelf of blank cards in the manga library.
//
// AniList has already been asked about it by the time this runs, and had no answer worth trusting.
// The provider does: the series page carries the cover, the synopsis, the status, the year, the
// genres and the alternative titles, which between them are everything the entry page shows. That
// page is fetched once per series and stored, so the card describes itself from then on.
func (d *Downloader) fillSyntheticMetadata(syntheticID int) bool {
	if d.database == nil {
		return false
	}

	synthetic, found := d.database.GetSyntheticManga(syntheticID)
	if !found || synthetic == nil || strings.TrimSpace(synthetic.Title) == "" {
		return false
	}
	if !needsMetadata(synthetic) {
		return false
	}

	details := d.detailsFromProvider(synthetic)
	if details == nil {
		// No series page to be had — an unavailable provider, or a title nothing matched closely
		// enough. A search result's cover is still better than a grey rectangle.
		cover := d.coverFromProvider(synthetic.Provider, synthetic.Title)
		if cover == "" || strings.TrimSpace(synthetic.CoverImage) != "" {
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

	// Written into whatever is still empty, never over what is there. A cover the user set by hand,
	// or a title taken from the folder they named, is a decision — this is only ever filling gaps.
	changed := false
	set := func(field *string, value string) {
		value = strings.TrimSpace(value)
		if value != "" && strings.TrimSpace(*field) == "" {
			*field = value
			changed = true
		}
	}

	set(&synthetic.CoverImage, details.Image)
	set(&synthetic.Description, details.Description)
	set(&synthetic.Genres, strings.Join(details.Tags, ", "))
	set(&synthetic.Synonyms, strings.Join(details.Synonyms, ", "))
	set(&synthetic.Authors, strings.Join(details.Authors, ", "))

	if status := mediaStatusFromProvider(details.Status); status != "" && synthetic.Status != status {
		synthetic.Status = status
		changed = true
	}
	if details.Year > 0 && synthetic.Year == 0 {
		synthetic.Year = details.Year
		changed = true
	}

	if !changed {
		return false
	}

	if err := d.database.UpdateSyntheticManga(synthetic); err != nil {
		d.logger.Warn().Err(err).Int("syntheticId", syntheticID).
			Msg("manga downloader: Could not store the metadata found for a local series")
		return false
	}

	d.logger.Info().
		Int("syntheticId", syntheticID).
		Str("title", synthetic.Title).
		Bool("cover", synthetic.CoverImage != "").
		Bool("description", synthetic.Description != "").
		Msg("manga downloader: Described a local series from its provider")
	return true
}

// needsMetadata is whether there is anything left worth fetching for a synthetic series.
//
// The cover and the synopsis are the two things a card and an entry page cannot do without; a
// series that has both is described well enough not to spend a request on again.
func needsMetadata(synthetic *models.SyntheticManga) bool {
	return strings.TrimSpace(synthetic.CoverImage) == "" || strings.TrimSpace(synthetic.Description) == ""
}

// detailsFromProvider fetches the provider's series page for a synthetic series.
//
// A series downloaded from WeebCentral already knows its own ID there, so it is fetched directly.
// One the local scanner found knows only a folder name, so it is searched for first — and held to
// minCoverSearchRating, because everything below is written onto the user's series as if it were
// true, and a stranger's synopsis is a worse answer than none.
func (d *Downloader) detailsFromProvider(synthetic *models.SyntheticManga) *manga_providers.SeriesDetails {
	provider, ok := d.detailsProvider()
	if !ok {
		return nil
	}

	seriesID := ""
	if synthetic.Provider == manga_providers.WeebCentralProvider {
		seriesID = strings.TrimSpace(synthetic.ProviderID)
	}

	if seriesID == "" {
		results, err := d.searchProvider(manga_providers.WeebCentralProvider, synthetic.Title)
		if err != nil || len(results) == 0 {
			return nil
		}
		best := bestSearchResult(results, synthetic.Title)
		if best == nil {
			return nil
		}
		seriesID = best.ID
	}

	details, err := provider.GetSeriesDetails(seriesID)
	if err != nil {
		d.logger.Debug().Err(err).Int("syntheticId", synthetic.SyntheticID).Str("seriesId", seriesID).
			Msg("manga downloader: Could not read the provider's page for a local series")
		return nil
	}
	return details
}

// detailsProvider is the loaded provider that can describe a series beyond a search result.
func (d *Downloader) detailsProvider() (manga_providers.MangaDetailsProvider, bool) {
	if d.repository == nil {
		return nil, false
	}
	providerExtension, ok := extension.GetExtension[extension.MangaProviderExtension](
		d.repository.extensionBankRef.Get(), FallbackCoverProvider)
	if !ok {
		return nil, false
	}
	details, ok := providerExtension.GetProvider().(manga_providers.MangaDetailsProvider)
	return details, ok
}

// mediaStatusFromProvider turns the provider's wording into the status the rest of the app speaks.
//
// An unrecognised word returns empty rather than a guess: leaving the existing status alone is
// better than telling the user a running series has finished.
func mediaStatusFromProvider(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "ongoing":
		return "RELEASING"
	case "complete", "completed", "finished":
		return "FINISHED"
	case "hiatus":
		return "HIATUS"
	case "canceled", "cancelled", "dropped":
		return "CANCELLED"
	default:
		return ""
	}
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
		results, err := d.searchProvider(providerID, title)
		if err != nil || len(results) == 0 {
			continue
		}

		best := bestSearchResult(results, title)
		if best == nil || best.Image == "" {
			continue
		}
		return best.Image
	}

	return ""
}

// searchProvider runs a title search against one loaded provider.
//
// The local "provider" is a folder on disk with no artwork and nothing to say, so it is never asked.
func (d *Downloader) searchProvider(providerID string, title string) ([]*hibikemanga.SearchResult, error) {
	if d.repository == nil || providerID == "" || providerID == manga_providers.LocalProvider {
		return nil, nil
	}

	providerExtension, ok := extension.GetExtension[extension.MangaProviderExtension](
		d.repository.extensionBankRef.Get(), providerID)
	if !ok {
		return nil, nil
	}

	return providerExtension.GetProvider().Search(hibikemanga.SearchOptions{Query: title})
}

// bestSearchResult picks the result closest to the title, or nothing if none is close enough.
//
// HydrateSearchResultSearchRating scores them the same way the rest of the manga matching does, and
// anything below minCoverSearchRating is discarded rather than returned as a best effort.
func bestSearchResult(results []*hibikemanga.SearchResult, title string) *hibikemanga.SearchResult {
	if len(results) == 0 {
		return nil
	}

	HydrateSearchResultSearchRating(results, &title)

	best := results[0]
	for _, res := range results {
		if res != nil && (best == nil || res.SearchRating > best.SearchRating) {
			best = res
		}
	}
	if best == nil || best.SearchRating < minCoverSearchRating {
		return nil
	}
	return best
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
