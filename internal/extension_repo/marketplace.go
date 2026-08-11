package extension_repo

import (
	"fmt"
	"io"
	"seanime/internal/constants"
	"seanime/internal/extension"
	"seanime/internal/util"
	"strings"

	"github.com/goccy/go-json"
	"github.com/samber/lo"
)

// GetMarketplaceExtensions fetches and merges extensions from one or more marketplace
// sources. The `url` argument may contain multiple marketplace URLs separated by newlines,
// commas or semicolons; each is fetched and the results are merged and de-duplicated by ID.
//
// This exists because upstream removed streaming/torrent providers from the default
// marketplace. Supporting multiple sources lets users add community provider marketplaces
// (which reappear alongside the default) without replacing the default.
func (r *Repository) GetMarketplaceExtensions(url string) (extensions []*extension.Extension, err error) {
	defer util.HandlePanicInModuleWithError("extension_repo/GetMarketplaceExtensions", &err)

	urls := parseMarketplaceUrls(url)
	if len(urls) == 0 {
		urls = defaultMarketplaceURLs
	}

	seen := make(map[string]struct{})
	var merged []*extension.Extension
	var firstErr error

	for _, u := range urls {
		exts, fetchErr := r.getMarketplaceExtensions(u)
		if fetchErr != nil {
			// Don't fail the whole request if a single source is unreachable; keep the
			// others so at least some providers show up.
			if firstErr == nil {
				firstErr = fetchErr
			}
			continue
		}
		for _, ext := range exts {
			if _, ok := seen[ext.ID]; ok {
				continue
			}
			seen[ext.ID] = struct{}{}
			merged = append(merged, ext)
		}
	}

	// Only surface an error if every source failed and nothing could be merged.
	if len(merged) == 0 && firstErr != nil {
		return nil, firstErr
	}

	return merged, nil
}

// defaultMarketplaceURLs are the sources consulted when the user has not named one of their own.
//
// Two of them, because one is no longer enough. Upstream's marketplace carries only plugins and
// custom sources now — every streaming, torrent and manga provider was taken out of it — so an
// install that consults it alone finds no online sources for anime at all, which is not an empty
// result so much as a whole category of extension quietly disappearing. The second source is a
// community marketplace that still lists them.
//
// Merged rather than replaced, and de-duplicated by extension ID by the caller, so upstream stays
// authoritative for anything it does publish and the community list only fills the gap it left.
var defaultMarketplaceURLs = []string{
	constants.DefaultExtensionMarketplaceURL,
	constants.CommunityExtensionMarketplaceURL,
}

// parseMarketplaceUrls splits a user-provided marketplace string into individual URLs.
// Supports newline, comma and semicolon separators. Empty entries are dropped and the
// default marketplaces are always included so the built-in sources never disappear.
func parseMarketplaceUrls(url string) []string {
	urls := append([]string{}, defaultMarketplaceURLs...)

	fields := strings.FieldsFunc(url, func(r rune) bool {
		return r == '\n' || r == '\r' || r == ',' || r == ';'
	})
	for _, f := range fields {
		trimmed := strings.TrimSpace(f)
		if trimmed != "" {
			urls = append(urls, trimmed)
		}
	}

	return lo.Uniq(urls)
}

func (r *Repository) getMarketplaceExtensions(url string) (extensions []*extension.Extension, err error) {
	resp, err := r.client.Get(url)
	if err != nil {
		r.logger.Error().Err(err).Msgf("marketplace: Failed to get marketplace extension: %s", url)
		return nil, fmt.Errorf("failed to get marketplace extension: %s", url)
	}
	defer resp.Body.Close()

	bodyR, err := io.ReadAll(resp.Body)
	if err != nil {
		r.logger.Error().Err(err).Msgf("marketplace: Failed to read marketplace extension: %s", url)
		return nil, fmt.Errorf("failed to read marketplace extension: %s", url)
	}

	err = json.Unmarshal(bodyR, &extensions)
	if err != nil {
		r.logger.Error().Err(err).Msgf("marketplace: Failed to unmarshal marketplace extension: %s", url)
		return nil, fmt.Errorf("failed to unmarshal marketplace extension: %s", url)
	}

	extensions = lo.Filter(extensions, func(item *extension.Extension, _ int) bool {
		return item.ID != "" && item.ManifestURI != ""
	})

	return
}
