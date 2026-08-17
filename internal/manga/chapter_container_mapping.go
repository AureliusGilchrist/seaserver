package manga

import (
	"cmp"
	"errors"
	"seanime/internal/extension"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/util"
	"seanime/internal/util/result"
	"slices"
	"strings"

	"github.com/rs/zerolog"
)

var searchResultCache = result.NewCache[string, []*hibikemanga.SearchResult]()

func (r *Repository) ManualSearch(provider string, query string) (ret []*hibikemanga.SearchResult, err error) {
	defer util.HandlePanicInModuleWithError("manga/ManualSearch", &err)

	if query == "" {
		return make([]*hibikemanga.SearchResult, 0), nil
	}

	// Get the search results
	providerExtension, ok := extension.GetExtension[extension.MangaProviderExtension](r.extensionBankRef.Get(), provider)
	if !ok {
		r.logger.Error().Str("provider", provider).Msg("manga: Provider not found")
		return nil, errors.New("manga: Provider not found")
	}

	normalizedQuery := strings.ToLower(strings.TrimSpace(query))

	searchRes, found := searchResultCache.Get(provider + normalizedQuery)
	if found {
		return searchRes, nil
	}

	searchRes, err = searchProviderWithVariants(providerExtension.GetProvider(), normalizedQuery, r.logger)
	if err != nil {
		r.logger.Error().Err(err).Str("query", normalizedQuery).Msg("manga: Search failed")
		return nil, err
	}

	// Overwrite the provider just in case
	for _, res := range searchRes {
		res.Provider = provider
	}

	searchResultCache.Set(provider+normalizedQuery, searchRes)

	return searchRes, nil
}

// searchProviderWithVariants searches a provider for a title, asking in more than one way when the
// first way finds nothing convincing.
//
// This is the search behind the manual mapping dialog, and what the user types into it is usually
// the folder or the series as *they* have it written — with the volume range still on the end, the
// scanlation group still in brackets, or the subtitle they know it by rather than the one the site
// files it under. One query for that name returns an empty list, and an empty list reads as "this
// provider does not have it" when the provider has it under a name half a step away.
//
// Every result found is kept, whichever variant found it, and they are ranked against what the user
// actually typed — so the extra queries can only add possibilities, never re-order the good ones
// away from the top.
func searchProviderWithVariants(provider hibikemanga.Provider, query string, logger *zerolog.Logger) ([]*hibikemanga.SearchResult, error) {
	variants := titleSearchVariants(query)
	if len(variants) == 0 {
		variants = []string{query}
	}

	merged := make([]*hibikemanga.SearchResult, 0, 24)
	seen := make(map[string]bool)
	var firstErr error

	for i, variant := range variants {
		// Past the first few the variants are short, and a short query against a provider's own
		// index returns everything that happens to share a word.
		if i >= maxProviderSearchVariants {
			break
		}

		results, err := provider.Search(hibikemanga.SearchOptions{Query: variant})
		if err != nil {
			// Only the first query's failure is the search failing. A follow-up finding nothing is
			// the ordinary case — it is a guess at another name.
			if i == 0 {
				firstErr = err
			}
			continue
		}

		for _, res := range results {
			if res == nil || seen[res.ID] {
				continue
			}
			seen[res.ID] = true
			merged = append(merged, res)
		}

		// Something that looks like what was asked for. Anything further would be guesses stacked
		// under an answer that is already here.
		if bestSearchResult(merged, query) != nil {
			break
		}

		if i > 0 && len(merged) > 0 {
			logger.Debug().Str("query", query).Str("variant", variant).Int("found", len(merged)).
				Msg("manga: Found provider results under a variant of the title")
		}
	}

	if len(merged) == 0 && firstErr != nil {
		return nil, firstErr
	}

	// Ranked against what the user typed, so the closest name is first whichever query produced it.
	HydrateSearchResultSearchRating(merged, &query)
	slices.SortStableFunc(merged, func(a, b *hibikemanga.SearchResult) int {
		return cmp.Compare(b.SearchRating, a.SearchRating)
	})

	return merged, nil
}

// maxProviderSearchVariants is how many ways one manual search asks. Each is a request to a site
// that is being asked politely, and somebody is waiting on all of them.
const maxProviderSearchVariants = 3

// ManualMapping is used to manually map a manga to a provider.
// After calling this, the client should re-fetch the chapter container.
func (r *Repository) ManualMapping(provider string, mediaId int, mangaId string) (err error) {
	defer util.HandlePanicInModuleWithError("manga/ManualMapping", &err)

	r.logger.Trace().Msgf("manga: Removing cached bucket for %s, media ID: %d", provider, mediaId)

	// Delete the cached chapter container if any
	bucket := r.getFcProviderBucket(provider, mediaId, bucketTypeChapter)
	_ = r.fileCacher.Remove(bucket.Name())

	r.logger.Trace().
		Str("provider", provider).
		Int("mediaId", mediaId).
		Str("mangaId", mangaId).
		Msg("manga: Manual mapping")

	// Insert the mapping into the database
	err = r.db.InsertMangaMapping(provider, mediaId, mangaId)
	if err != nil {
		r.logger.Error().Err(err).Msg("manga: Failed to insert mapping")
		return err
	}

	r.logger.Debug().Msg("manga: Manual mapping successful")

	return nil
}

type MappingResponse struct {
	MangaID *string `json:"mangaId"`
}

func (r *Repository) GetMapping(provider string, mediaId int) (ret MappingResponse) {
	defer util.HandlePanicInModuleThen("manga/GetMapping", func() {
		ret = MappingResponse{}
	})

	mapping, found := r.db.GetMangaMapping(provider, mediaId)
	if !found {
		return MappingResponse{}
	}

	return MappingResponse{
		MangaID: &mapping.MangaID,
	}
}

func (r *Repository) RemoveMapping(provider string, mediaId int) (err error) {
	defer util.HandlePanicInModuleWithError("manga/RemoveMapping", &err)

	// Delete the mapping from the database
	err = r.db.DeleteMangaMapping(provider, mediaId)
	if err != nil {
		r.logger.Error().Err(err).Msg("manga: Failed to delete mapping")
		return err
	}

	r.logger.Debug().Msg("manga: Mapping removed")

	r.logger.Trace().Msgf("manga: Removing cached bucket for %s, media ID: %d", provider, mediaId)
	// Delete the cached chapter container if any
	bucket := r.getFcProviderBucket(provider, mediaId, bucketTypeChapter)
	_ = r.fileCacher.Remove(bucket.Name())

	return nil
}
