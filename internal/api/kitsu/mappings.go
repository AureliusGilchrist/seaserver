package kitsu

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// External site names that Kitsu's mapping system carries. We keep these as exported constants so
// the resolver can switch on them without sprinkling string literals across the codebase.
const (
	ExternalSiteAniListAnime = "anilist/anime"
	ExternalSiteAniListManga = "anilist/manga"
	ExternalSiteMALAnime     = "myanimelist/anime"
	ExternalSiteMALManga     = "myanimelist/manga"
	ExternalSiteAniDBAnime   = "anidb/anime"
	ExternalSiteAniDBManga   = "anidb/manga"
)

// Mapping resource. Kitsu returns external-site pointers as `mappings` resources linked from
// `anime.relationships.mappings` and `manga.relationships.mappings`.
//
// The pointer we care about is `relationships.item` — populated only when the embedded pointer
// asks to resolve to a Kitsu media item. Most mappings do not have it; the consumable fields are
// `Attributes.ExternalSite` and `Attributes.ExternalID`.
type Mapping struct {
	ID            string          `json:"id"`
	Type          string          `json:"type"`
	Attributes    MappingAttributes `json:"attributes"`
	Relationships json.RawMessage `json:"relationships,omitempty"`
}

// MappingAttributes carries the cross-platform identifier pair.
type MappingAttributes struct {
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
	ExternalSite  string `json:"externalSite"`
	ExternalID    string `json:"externalId"`
	Person        string `json:"person,omitempty"`
	Thumbnail     string `json:"thumbnail,omitempty"`
	Description   string `json:"description,omitempty"`
}

// GetAnimeMappings fetches every mapping Kitsu has for a given anime id. Mappings are immutable
// upstream; we keep the result un-cached so the AnimeMostPopular -> mapping pipeline can flush
// fresh entries into the synthetic-id table as the user requests new pages.
func (c *Client) GetAnimeMappings(ctx context.Context, animeID string) ([]Mapping, error) {
	if animeID == "" {
		return nil, fmt.Errorf("kitsu: anime id required")
	}
	path := fmt.Sprintf("/anime/%s/mappings", url.PathEscape(animeID))
	raw, _, err := c.do(ctx, "GET", path, nil, 0)
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	var out []Mapping
	if len(resp.Data) > 0 && string(resp.Data) != "null" {
		if err := json.Unmarshal(resp.Data, &out); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// GetMangaMappings returns the mapping list for a given manga id.
func (c *Client) GetMangaMappings(ctx context.Context, mangaID string) ([]Mapping, error) {
	if mangaID == "" {
		return nil, fmt.Errorf("kitsu: manga id required")
	}
	path := fmt.Sprintf("/manga/%s/mappings", url.PathEscape(mangaID))
	raw, _, err := c.do(ctx, "GET", path, nil, 0)
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	var out []Mapping
	if len(resp.Data) > 0 && string(resp.Data) != "null" {
		if err := json.Unmarshal(resp.Data, &out); err != nil {
			return nil, err
		}
	}
	return out, nil
}
