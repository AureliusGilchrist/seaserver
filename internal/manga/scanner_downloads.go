package manga

import (
	"cmp"
	"context"
	"slices"
	"strconv"
	"strings"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/events"

	"github.com/rs/zerolog"
)

// Scanning the manga directories only ever looked at folders on disk, and a downloaded series is not
// always a folder with a recognisable name: the en masse downloader files series under the ID they
// had at the time, so what is left behind is a numeric folder and a row in the download map. Those
// are the cards reading "Manga ID: 47353 — Provider: weebcentral": a real AniList ID whose metadata
// was simply never fetched, and a name nothing on disk knows.
//
// The scan now finishes by going through the download map as well, which is where every one of those
// lives, and describing everything in it — an AniList ID gets its entry fetched by ID, a local series
// gets matched and then described from its provider. Both write what they find immediately, so a
// scan that has looked at a title leaves that title with its metadata and its cover, rather than
// leaving a note for a background pass to get to later.

// downloadScanSpacing is the gap between two AniList requests while sweeping the downloads.
//
// A user is watching a progress bar, so this is faster than the background fill, but it is still
// AniList's shared budget being spent: 90 requests a minute is the hard ceiling and the collection
// refreshes are entitled to their share of it.
const downloadScanSpacing = 750 * time.Millisecond

// DownloadScanResult reports what the download sweep managed to describe.
type DownloadScanResult struct {
	// Described is how many series were given metadata they did not have.
	Described int `json:"described"`
	// Linked is how many local series were matched to an AniList entry.
	Linked int `json:"linked"`
	// Failed is how many were looked at and could not be described.
	Failed int `json:"failed"`
}

// ScanDownloadedSeries describes every downloaded series that is missing metadata.
//
// Two kinds of series turn up here. One is filed under a real AniList ID and has nothing stored for
// it, which is a single fetch by ID — no searching, no guessing, the ID is already the answer. The
// other is a local series, which is searched for by title the same way the folder scan searches
// (see searchAniListForTitle), and then either linked or described from its provider.
func ScanDownloadedSeries(
	ctx context.Context,
	downloader *Downloader,
	reviewMatches bool,
	wsEventManager events.WSEventManagerInterface,
	logger *zerolog.Logger,
) *DownloadScanResult {
	result := &DownloadScanResult{}
	if downloader == nil || downloader.database == nil {
		return result
	}

	pending := downloader.downloadsNeedingMetadata()
	if len(pending) == 0 {
		return result
	}

	logger.Info().Int("count", len(pending)).Msg("manga-scan: Describing downloaded series with no metadata")

	client := anilist.NewAnilistClient("", "")
	synonymLookup := providerSynonymSource(logger)

	for i, entry := range pending {
		select {
		case <-ctx.Done():
			return result
		default:
		}

		if wsEventManager != nil {
			wsEventManager.SendEvent(events.MangaScanProgress, MangaScanProgressEvent{
				Current:    i + 1,
				Total:      len(pending),
				FolderName: entry.title,
			})
		}

		if i > 0 {
			time.Sleep(downloadScanSpacing)
		}

		if entry.mediaID > 0 {
			if downloader.describeAniListDownload(ctx, client, entry.mediaID) {
				result.Described++
			} else {
				result.Failed++
			}
			continue
		}

		// A local series. Matching it is the same decision the folder scan makes, and it is held to
		// the same bar — and skipped entirely when the user asked to review matches, because a link
		// made here would be one they never saw proposed.
		linked := false
		if !reviewMatches {
			if downloader.linkSyntheticFromScan(ctx, client, entry, synonymLookup, logger) {
				result.Linked++
				linked = true
			}
		}

		if linked {
			continue
		}

		// Not matched, or not allowed to match: describe it where it is. The provider that has the
		// chapters also has the cover and the synopsis, and this writes them now rather than
		// queueing the series for the background fill.
		if downloader.fillSyntheticMetadata(entry.mediaID) {
			result.Described++
		} else {
			result.Failed++
		}
	}

	logger.Info().
		Int("described", result.Described).
		Int("linked", result.Linked).
		Int("failed", result.Failed).
		Msg("manga-scan: Finished describing downloaded series")

	return result
}

// downloadEntry is one downloaded series the sweep has to deal with.
type downloadEntry struct {
	mediaID int
	title   string
}

// downloadsNeedingMetadata lists the downloaded series that have nothing to show, in a stable order.
func (d *Downloader) downloadsNeedingMetadata() []downloadEntry {
	pending := make([]downloadEntry, 0)

	for mediaID := range d.mediaMapSnapshot() {
		if mediaID == 0 {
			continue
		}

		if mediaID > 0 {
			// A mapped AniList ID whose local record still describes it needs nothing.
			if _, found := d.database.GetDownloadedMangaMetadata(mediaID); found {
				continue
			}
			pending = append(pending, downloadEntry{mediaID: mediaID, title: "Manga " + strconv.Itoa(mediaID)})
			continue
		}

		// Already matched: the AniList entry describes it.
		if anilistID, found := d.database.GetMangaIDMapping(mediaID); found && anilistID > 0 {
			continue
		}

		synthetic, found := d.database.GetSyntheticManga(mediaID)
		if !found || synthetic == nil {
			continue
		}
		if !needsMetadata(synthetic) && !canBeLinked(synthetic) {
			continue
		}

		pending = append(pending, downloadEntry{mediaID: mediaID, title: synthetic.Title})
	}

	// Sorted by ID so a scan interrupted halfway through resumes over the same list rather than a
	// reshuffled one — the download map is a Go map, and its iteration order is random per range.
	slices.SortFunc(pending, func(a, b downloadEntry) int {
		return cmp.Compare(a.mediaID, b.mediaID)
	})

	return pending
}

// canBeLinked is whether it is still worth asking AniList about a local series. A titled one always
// is — the whole point of the sweep is that a series nothing matched last time may match now.
func canBeLinked(synthetic *models.SyntheticManga) bool {
	return synthetic != nil && strings.TrimSpace(synthetic.Title) != ""
}

// describeAniListDownload fetches one series by its AniList ID and stores what comes back.
//
// No searching and no matching: the download is already filed under the AniList ID, so the entry is
// simply fetched. This is what turns a card reading "Manga ID: 47353" into the series it always was.
func (d *Downloader) describeAniListDownload(ctx context.Context, client anilist.AnilistClient, mediaID int) bool {
	// No deadline: the user is watching this scan, and a request that has queued behind a rate limit
	// is worth waiting out rather than cancelling and leaving the series undescribed.
	res, err := client.BaseMangaByID(anilist.WithUserInitiated(ctx), &mediaID)
	if err != nil || res == nil || res.GetMedia() == nil {
		d.logger.Debug().Err(err).Int("mediaId", mediaID).
			Msg("manga-scan: AniList had nothing for a downloaded series")
		return false
	}

	title, coverImage := titleAndCoverOf(res.GetMedia())

	// AniList carried the name but no artwork. The provider the chapters came from has a cover for
	// it, and a card with the right title and no picture is still half a card.
	if coverImage == "" && title != "" {
		coverImage = d.coverFromProvider(d.providerFor(mediaID), title)
	}

	if title == "" && coverImage == "" {
		return false
	}

	if err := d.database.SaveDownloadedMangaMetadata(mediaID, title, coverImage, ""); err != nil {
		d.logger.Warn().Err(err).Int("mediaId", mediaID).Msg("manga-scan: Could not store metadata")
		return false
	}

	d.logger.Info().Int("mediaId", mediaID).Str("title", title).
		Msg("manga-scan: Described a downloaded series from AniList")
	return true
}

// linkSyntheticFromScan matches a local series to AniList, searching the same several ways the
// folder scan does, and records the link along with the metadata it brings.
func (d *Downloader) linkSyntheticFromScan(
	ctx context.Context,
	client anilist.AnilistClient,
	entry downloadEntry,
	synonyms synonymSource,
	logger *zerolog.Logger,
) bool {
	title := strings.TrimSpace(entry.title)
	if title == "" {
		return false
	}

	candidates, err := searchAniListForTitle(ctx, client, title, title, cleanMangaTitle(title), synonyms, logger)
	if err != nil || len(candidates) == 0 {
		return false
	}

	best := candidates[0]
	if best.Confidence < ScanMatchThreshold {
		return false
	}

	synthetic, found := d.database.GetSyntheticManga(entry.mediaID)
	providerID := ""
	if found && synthetic != nil {
		providerID = synthetic.ProviderID
	}

	if err := d.database.SaveMangaIDMapping(entry.mediaID, best.MediaID, providerID); err != nil {
		d.logger.Warn().Err(err).Int("syntheticId", entry.mediaID).Int("anilistId", best.MediaID).
			Msg("manga-scan: Could not record the AniList link")
		return false
	}

	// Written now, while the title is in hand. The list endpoint reads stored metadata before it
	// reaches for anything else, so the card is right on the next refresh rather than after the
	// background fill gets round to it.
	_ = d.database.SaveDownloadedMangaMetadata(best.MediaID, best.Title, best.CoverImage, "")

	d.logger.Info().
		Str("title", title).
		Int("syntheticId", entry.mediaID).
		Int("anilistId", best.MediaID).
		Float64("confidence", best.Confidence).
		Msg("manga-scan: Matched a downloaded local series to AniList")

	return true
}
