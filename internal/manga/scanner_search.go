package manga

import (
	"cmp"
	"context"
	"slices"
	"strings"
	"time"

	"seanime/internal/api/anilist"
	hibikemanga "seanime/internal/extension/hibike/manga"
	manga_providers "seanime/internal/manga/providers"

	"github.com/rs/zerolog"
)

// searchSpacing is the gap between two of the searches made for a single folder. The scan already
// paces itself between folders; this keeps a folder that needs several tries from spending them all
// in the same instant.
const searchSpacing = 400 * time.Millisecond

// maxSynonymQueries is how many of a provider's alternative titles are worth trying. They are a last
// resort, reached only by a folder nothing else matched, and the list is ordered by how official the
// name is — past the first couple they are transliterations of transliterations.
const maxSynonymQueries = 2

// synonymSource supplies the other names a series is known by, for a title AniList did not
// recognise. Nil when there is nowhere to ask.
type synonymSource func(title string) []string

// searchAniListForTitle looks a folder's name up on AniList, asking in several ways rather than one.
//
// The full name is tried first and is usually the end of it. Only when nothing has cleared the
// automatic-match bar does it go on to the next variant, so a library of well-named folders costs
// exactly what it did before — one search each — and the extra requests are spent only on the
// folders that were about to be filed as "not a real series".
//
// Candidates found by any query are scored against the *folder's* name, never against the query that
// found them. This is what keeps a short variant honest: searching "Kaguya" may well return
// something called "Kaguya", but if the folder is called "Kaguya-sama - Love is War" then that is
// what the result has to look like to be offered.
func searchAniListForTitle(
	ctx context.Context,
	client anilist.AnilistClient,
	searchName string,
	rawName string,
	cleanedName string,
	synonyms synonymSource,
	logger *zerolog.Logger,
) ([]MangaScanCandidate, error) {
	best := make(map[int]MangaScanCandidate)

	// bestConfidence is the score of the strongest candidate found so far, across every query.
	bestConfidence := func() float64 {
		highest := 0.0
		for _, candidate := range best {
			if candidate.Confidence > highest {
				highest = candidate.Confidence
			}
		}
		return highest
	}

	collect := func(media []*anilist.BaseManga) {
		for _, candidate := range rankScanCandidates(media, rawName, cleanedName) {
			if existing, found := best[candidate.MediaID]; !found || candidate.Confidence > existing.Confidence {
				best[candidate.MediaID] = candidate
			}
		}
	}

	search := func(query string) error {
		page, perPage := 1, 10
		res, err := client.SearchBaseManga(ctx, &page, &perPage, nil, &query, nil)
		if err != nil {
			return err
		}
		if res != nil && res.Page != nil {
			collect(res.Page.Media)
		}
		return nil
	}

	queries := titleSearchVariants(searchName)
	if len(queries) == 0 {
		return nil, nil
	}

	tried := make(map[string]bool)
	for i, query := range queries {
		if tried[strings.ToLower(query)] {
			continue
		}
		tried[strings.ToLower(query)] = true

		if i > 0 {
			time.Sleep(searchSpacing)
		}

		if err := search(query); err != nil {
			if i == 0 {
				// The first query failing is the scan failing for this folder: nothing is known
				// about it yet, and the caller has to be able to tell that apart from an answer.
				return nil, err
			}
			// A later one failing just ends the extra effort. Whatever the earlier queries found is
			// still a real answer.
			logger.Debug().Err(err).Str("query", query).Msg("manga-scan: A follow-up search failed, keeping what was found")
			break
		}

		if bestConfidence() >= ScanMatchThreshold {
			break
		}
	}

	// Still nothing worth showing anybody. The name on the folder is not one AniList indexes — a
	// romanisation, an abbreviation, the English title of a series filed under its Japanese one —
	// and the provider's page for it lists exactly those alternatives.
	if bestConfidence() < ScanSuggestionThreshold && synonyms != nil {
		for i, synonym := range synonyms(searchName) {
			if i >= maxSynonymQueries {
				break
			}
			if synonym == "" || tried[strings.ToLower(synonym)] {
				continue
			}
			tried[strings.ToLower(synonym)] = true

			time.Sleep(searchSpacing)
			if err := search(synonym); err != nil {
				break
			}
			logger.Debug().Str("folder", rawName).Str("synonym", synonym).
				Msg("manga-scan: Searched AniList under an alternative title from the provider")

			if bestConfidence() >= ScanMatchThreshold {
				break
			}
		}
	}

	candidates := make([]MangaScanCandidate, 0, len(best))
	for _, candidate := range best {
		candidates = append(candidates, candidate)
	}
	return sortAndCapCandidates(candidates), nil
}

// SuggestMangaMatches finds the AniList entries a name might refer to, best first.
//
// This is the same search the scan makes, offered to the Link dialog: somebody linking a folder by
// hand was typing its name into a single search and getting the same empty list the scan got, then
// guessing at shorter names themselves. Doing it here means the dialog opens with the answer already
// in it, found the same way and ranked the same way as everything else.
func SuggestMangaMatches(ctx context.Context, title string, logger *zerolog.Logger) ([]MangaScanCandidate, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return []MangaScanCandidate{}, nil
	}

	// Somebody has the Link dialog open and is waiting on this, so it says so — it goes ahead of
	// the background work rather than behind it. See internal/api/anilist/priority.go.
	client := anilist.NewAnilistClient("", "")
	candidates, err := searchAniListForTitle(
		anilist.WithUserInitiated(ctx), client, title, title, cleanMangaTitle(title), providerSynonymSource(logger), logger)
	if err != nil {
		return nil, err
	}
	if candidates == nil {
		candidates = []MangaScanCandidate{}
	}
	return candidates, nil
}

// providerSynonymSource asks WeebCentral what else a series is called.
//
// Two requests — a search and the series page — and only for a folder that AniList had no answer for
// at all. The provider is constructed directly rather than taken from the extension bank because a
// scan has no bank to hand, and this one is built in.
func providerSynonymSource(logger *zerolog.Logger) synonymSource {
	provider, ok := manga_providers.NewWeebCentral(logger).(*manga_providers.WeebCentral)
	if !ok {
		return nil
	}

	return func(title string) []string {
		title = strings.TrimSpace(title)
		if title == "" {
			return nil
		}

		results, err := provider.Search(hibikemanga.SearchOptions{Query: title})
		if err != nil || len(results) == 0 {
			return nil
		}

		best := bestSearchResult(results, title)
		if best == nil {
			return nil
		}

		details, err := provider.GetSeriesDetails(best.ID)
		if err != nil || details == nil {
			return nil
		}

		// The provider's own title first: it is the publisher's name for the series where the folder
		// name was somebody's, and it is the likeliest of these to be what AniList indexes.
		names := make([]string, 0, len(details.Synonyms)+1)
		if details.Title != "" && !strings.EqualFold(details.Title, title) {
			names = append(names, details.Title)
		}
		names = append(names, details.Synonyms...)
		return names
	}
}

// sortAndCapCandidates orders candidates best first and keeps only as many as review can use.
func sortAndCapCandidates(candidates []MangaScanCandidate) []MangaScanCandidate {
	slices.SortStableFunc(candidates, func(a, b MangaScanCandidate) int {
		return cmp.Compare(b.Confidence, a.Confidence)
	})
	if len(candidates) > maxScanCandidates {
		candidates = candidates[:maxScanCandidates]
	}
	return candidates
}
