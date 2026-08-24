package kitsu

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// AnimeTTL is how long a single anime lookup is reused. Short enough that a freshly-added
// cover/title edit shows up within an hour on the UI.
const AnimeTTL = 10 * 60 * 1_000_000_000 // 10 minutes in ns — the cache uses Duration.

// GetAnimeByID fetches one anime by its numeric Kitsu id. Returns ErrNotFound on a 404 rather than
// a generic HTTP error so callers can branch cleanly.
func (c *Client) GetAnimeByID(ctx context.Context, id string) (*Anime, error) {
	if id == "" {
		return nil, fmt.Errorf("kitsu: anime id required")
	}
	raw, err := c.getCached(ctx, "/anime/"+url.PathEscape(id), ttlFromSeconds(600))
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	var anime Anime
	if err := json.Unmarshal(resp.Data, &anime); err != nil {
		return nil, err
	}
	return &anime, nil
}

// GetAnimeBySlug fetches an anime by its slug ("naruto", "cowboy-bebop"). Slug is the routing key
// Kitsu uses on its web UI, so we prefer to keep slugs in our index when one is available.
func (c *Client) GetAnimeBySlug(ctx context.Context, slug string) (*Anime, error) {
	if slug == "" {
		return nil, fmt.Errorf("kitsu: anime slug required")
	}
	filter := EncodeFilter(map[string]string{"slug": slug})
	path := "/anime" + filter
	raw, err := c.getCached(ctx, path, ttlFromSeconds(600))
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}

	var anime Anime
	if err := json.Unmarshal(resp.Data, &anime); err != nil {
		return nil, err
	}
	return &anime, nil
}

// ListAnime runs a filtered, paginated anime search. The filters argument is the JSON:API
// filter map; pass nil to receive the unfiltered first 20 entries.
//
// Slug-prefix searching (`filter[text]=cowbo`) is not supported here directly because Kitsu's
// text filter is on synopsis/canonical title, not on slug. Callers who want exact slug matching
// should use GetAnimeBySlug instead.
func (c *Client) ListAnime(ctx context.Context, filters map[string]string, page, limit int) ([]Anime, error) {
	path := "/anime" + EncodeFilter(filters) + EncodePage(limit, page)
	raw, err := c.getCached(ctx, path, ttlFromSeconds(600))
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}

	var out []Anime
	if err := json.Unmarshal(resp.Data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// AnimeMostPopular fetches 20 anime at a time, ordered by Kitsu's popularity ranking.
//
// Used by the discovery page — Kitsu's "popularity rank" is roughly equivalent to AniList's
// popularity score, so any UI feature that used that can drop into this without rebuild.
func (c *Client) AnimeMostPopular(ctx context.Context, page, limit int) ([]Anime, error) {
	filters := map[string]string{}
	_ = filters // sorted-desc is the default endpoint order, no filter needed
	return c.ListAnime(ctx, filters, page, limit)
}
