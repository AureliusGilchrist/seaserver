package manga

import (
	"context"
	"strings"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/util/comparison"

	"github.com/samber/lo"
)

// A series downloaded from a provider, or found on disk by the scanner, exists only locally: it has
// a title and a folder and nothing else. Everything good — cover art, description, chapter titles,
// your reading progress, the entry page — hangs off an AniList ID, and until one is attached the
// series is a grey card called "Manga ID: 38456" that no part of the app has anything to say about.
//
// Attaching one by hand is a dialog, a search and a click per series, and the search almost always
// puts the right answer first, because the provider's title and AniList's title are usually the same
// string. Doing that a hundred times is not a decision anybody is making; it is a chore standing in
// for one.
//
// So it is done automatically, but only where the answer is not really in doubt. The bar is a title
// that matches well enough by several different measures at once — see linkConfidence — because the
// cost of being wrong here is not a blank card. It is somebody's downloaded chapters filed under the
// wrong series, their reading progress written to a series they have never read, and no obvious sign
// that anything happened. Anything short of the bar is left exactly as it is, for the dialog.

// MinLinkConfidence is how closely a local title has to match an AniList entry's before the two are
// linked without asking.
//
// 0.6 of the combined score below. That is deliberately not "60% of the letters are the same": the
// score is the average of several comparisons over several of AniList's titles, so reaching it means
// the match held up in more than one way rather than scraping past a single lenient measure.
const MinLinkConfidence = 0.6

// AutoLinkSyntheticManga finds an AniList entry for a local series and records the link.
//
// Returns the AniList ID it linked to, or 0 when nothing was close enough — which is not a failure.
// The series stays exactly as it was and the Link dialog still works; this only ever removes work
// that was going to have one obvious outcome.
func (d *Downloader) AutoLinkSyntheticManga(ctx context.Context, syntheticID int) int {
	if d.database == nil || d.anilistClientRef == nil || syntheticID >= 0 {
		return 0
	}

	// Already linked. Nothing here ever overwrites an existing link — a wrong one that the user
	// fixed by hand must not be re-made by a background job ten minutes later.
	if anilistID, found := d.database.GetMangaIDMapping(syntheticID); found && anilistID > 0 {
		return 0
	}

	synthetic, found := d.database.GetSyntheticManga(syntheticID)
	if !found || synthetic == nil {
		return 0
	}
	title := strings.TrimSpace(synthetic.Title)
	if title == "" {
		return 0
	}

	client := d.anilistClientRef.Get()
	if client == nil {
		return 0
	}

	page, perPage := 1, 10
	res, err := client.SearchBaseManga(ctx, &page, &perPage, nil, &title, nil)
	if err != nil || res == nil || res.Page == nil {
		d.logger.Debug().Err(err).Str("title", title).Msg("manga: AniList search found nothing to link to")
		return 0
	}

	best, confidence := bestLinkCandidate(title, res.Page.Media)
	if best == nil || confidence < MinLinkConfidence {
		d.logger.Debug().
			Str("title", title).
			Float64("confidence", confidence).
			Msg("manga: No AniList entry close enough to link automatically")
		return 0
	}

	if err := d.database.SaveMangaIDMapping(syntheticID, best.ID, synthetic.ProviderID); err != nil {
		d.logger.Warn().Err(err).Int("syntheticId", syntheticID).Int("anilistId", best.ID).
			Msg("manga: Could not record the AniList link")
		return 0
	}

	d.logger.Info().
		Str("title", title).
		Int("syntheticId", syntheticID).
		Int("anilistId", best.ID).
		Float64("confidence", confidence).
		Msg("manga: Linked a local series to AniList automatically")

	return best.ID
}

// bestLinkCandidate picks the closest AniList entry to a local title, with its confidence.
func bestLinkCandidate(title string, candidates []*anilist.BaseManga) (*anilist.BaseManga, float64) {
	var best *anilist.BaseManga
	bestScore := 0.0

	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}
		if score := linkConfidence(title, candidate); score > bestScore {
			best, bestScore = candidate, score
		}
	}

	return best, bestScore
}

// linkConfidence scores how well a local title matches an AniList entry, from 0 to 1.
//
// Every title AniList holds for the entry is tried — romaji, English, native, and the synonyms,
// which is where a provider's spelling usually turns up — and the best of them is the entry's score.
// A local folder called "Kaguya-sama wa Kokurasetai" should match an entry titled "Kaguya-sama: Love
// is War" through its synonyms, and comparing against the romaji alone would miss it.
//
// The score for one pair is the average of two different comparisons rather than either alone. They
// fail in different directions — Levenshtein is unkind to a title carrying an extra subtitle, Dice
// is too kind to two titles that merely share a lot of short words — and averaging means a match has
// to look right by both to clear the bar. This is what "the set of them summing to 60%" is doing:
// one lenient measure agreeing is not enough on its own.
func linkConfidence(title string, candidate *anilist.BaseManga) float64 {
	normalizedTitle := normalizeForLinking(title)
	if normalizedTitle == "" {
		return 0
	}

	best := 0.0
	for _, candidateTitle := range candidateTitles(candidate) {
		normalizedCandidate := normalizeForLinking(candidateTitle)
		if normalizedCandidate == "" {
			continue
		}

		// An exact match after normalisation is the common case and needs no arithmetic.
		if normalizedTitle == normalizedCandidate {
			return 1
		}

		against := []*string{&normalizedCandidate}
		levRatio := 0.0
		for _, res := range comparison.CompareWithLevenshtein(&normalizedTitle, against) {
			if res != nil {
				levRatio = levenshteinRatio(res.Distance, normalizedTitle, normalizedCandidate)
			}
		}
		diceRating := 0.0
		for _, res := range comparison.CompareWithSorensenDice(&normalizedTitle, against) {
			if res != nil {
				diceRating = res.Rating
			}
		}

		if score := (levRatio + diceRating) / 2; score > best {
			best = score
		}
	}

	return best
}

// levenshteinRatio turns an edit distance into a 0-1 similarity, so it can be averaged with Dice.
func levenshteinRatio(distance int, a string, b string) float64 {
	longest := len(a)
	if len(b) > longest {
		longest = len(b)
	}
	if longest == 0 {
		return 0
	}
	ratio := 1 - float64(distance)/float64(longest)
	if ratio < 0 {
		return 0
	}
	return ratio
}

// candidateTitles is every name AniList knows the entry by.
func candidateTitles(candidate *anilist.BaseManga) []string {
	titles := make([]string, 0, 4+len(candidate.Synonyms))

	if candidate.Title != nil {
		for _, t := range []*string{candidate.Title.Romaji, candidate.Title.English, candidate.Title.Native, candidate.Title.UserPreferred} {
			if t != nil && *t != "" {
				titles = append(titles, *t)
			}
		}
	}
	for _, synonym := range candidate.Synonyms {
		if synonym != nil && *synonym != "" {
			titles = append(titles, *synonym)
		}
	}

	return lo.Uniq(titles)
}

// normalizeForLinking strips the parts of a title that are punctuation and spacing decisions rather
// than the name: a provider writing "Kaguya sama" and AniList writing "Kaguya-sama:" are the same
// series, and no comparison should have to work that out for itself.
func normalizeForLinking(title string) string {
	lowered := strings.ToLower(strings.TrimSpace(title))

	var b strings.Builder
	b.Grow(len(lowered))
	lastWasSpace := false
	for _, r := range lowered {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r > 127:
			b.WriteRune(r)
			lastWasSpace = false
		default:
			// Every separator collapses to a single space, so "kaguya-sama:  love" and
			// "kaguya sama love" end up identical.
			if !lastWasSpace {
				b.WriteRune(' ')
				lastWasSpace = true
			}
		}
	}

	return strings.TrimSpace(b.String())
}

// autoLinkSpacing is the gap between two link attempts, matching the metadata backfill's pacing: one
// AniList search each, and neither is anything anybody is waiting on.
const autoLinkSpacing = backfillSpacing

// autoLinkTimeout bounds one search.
const autoLinkTimeout = 30 * time.Second
