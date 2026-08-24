package kitsu

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
)

// GetMangaByID returns one manga resource by its Kitsu numeric id.
func (c *Client) GetMangaByID(ctx context.Context, id string) (*Manga, error) {
	if id == "" {
		return nil, errors.New("kitsu: manga id required")
	}
	raw, err := c.getCached(ctx, "/manga/"+url.PathEscape(id), ttlFromSeconds(600))
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}

	var m Manga
	if err := json.Unmarshal(resp.Data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// GetMangaBySlug is the manga analogue of GetAnimeBySlug.
func (c *Client) GetMangaBySlug(ctx context.Context, slug string) (*Manga, error) {
	if slug == "" {
		return nil, errors.New("kitsu: manga slug required")
	}
	filter := EncodeFilter(map[string]string{"slug": slug})
	path := "/manga" + filter
	raw, err := c.getCached(ctx, path, ttlFromSeconds(600))
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	var m Manga
	if err := json.Unmarshal(resp.Data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// ListManga runs a filtered, paginated manga search.
func (c *Client) ListManga(ctx context.Context, filters map[string]string, page, limit int) ([]Manga, error) {
	path := "/manga" + EncodeFilter(filters) + EncodePage(limit, page)
	raw, err := c.getCached(ctx, path, ttlFromSeconds(600))
	if err != nil {
		return nil, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}

	var out []Manga
	if err := json.Unmarshal(resp.Data, &out); err != nil {
		return nil, err
	}
	return out, nil
}
