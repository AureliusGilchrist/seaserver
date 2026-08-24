package kitsu

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// GetUserAnimeLibrary fetches one page of a user's anime library entries. The page/limit pair is
// passed through EncodePage, which clamps limit to Kitsu's max of 20 per request.
//
// The status filter, when non-empty, maps to `filter[status]=…` and accepts the Kitsu status
// constants (`current`, `planned`, `completed`, `on_hold`, `dropped`).
func (c *Client) GetUserAnimeLibrary(ctx context.Context, userID, status string, page, limit int) ([]LibraryEntry, error) {
	if userID == "" {
		return nil, fmt.Errorf("kitsu: user id required")
	}

	filters := map[string]string{}
	if status != "" {
		filters["status"] = status
	}

	path := fmt.Sprintf("/users/%s/library-entries", url.PathEscape(userID)) +
		EncodeFilter(filters) + EncodePage(limit, page) +
		"[include=anime]"
	c.cache.Delete(path)
	raw, _, err := c.do(ctx, "GET", path, nil, 0)
	if err != nil {
		return nil, err
	}

	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}

	var out []LibraryEntry
	// Empty libraries come back as `data: null`, not as an empty array — Guard against both.
	if len(resp.Data) > 0 && string(resp.Data) != "null" {
		if err := json.Unmarshal(resp.Data, &out); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// GetUserMangaLibrary is the manga equivalent.
func (c *Client) GetUserMangaLibrary(ctx context.Context, userID, status string, page, limit int) ([]LibraryEntry, error) {
	if userID == "" {
		return nil, fmt.Errorf("kitsu: user id required")
	}

	filters := map[string]string{}
	if status != "" {
		filters["status"] = status
	}

	path := fmt.Sprintf("/users/%s/library-entries", url.PathEscape(userID)) +
		EncodeFilter(filters) + EncodePage(limit, page) +
		"[include=manga]"
	c.cache.Delete(path)
	raw, _, err := c.do(ctx, "GET", path, nil, 0)
	if err != nil {
		return nil, err
	}

	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	var out []LibraryEntry
	if len(resp.Data) > 0 && string(resp.Data) != "null" {
		if err := json.Unmarshal(resp.Data, &out); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// CountLibraryEntries returns the number of entries that match the filter. Useful as a cheap
// replacement for an entry-by-entry pagination.
func (c *Client) CountLibraryEntries(ctx context.Context, userID, kind string) (int, error) {
	if userID == "" {
		return 0, fmt.Errorf("kitsu: user id required")
	}
	if kind != "anime" && kind != "manga" {
		kind = "anime" // Kitsu treats /library-entries as anime unless we add a media_type filter
	}
	path := fmt.Sprintf("/users/%s/library-entries", url.PathEscape(userID)) +
		"[filter[kind]=" + kind + "][page[limit]=1]"

	c.cache.Delete(path)
	raw, _, err := c.do(ctx, "GET", path, nil, 0)
	if err != nil {
		return 0, err
	}
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return 0, err
	}
	if resp.Meta != nil {
		return resp.Meta.Count, nil
	}
	return 0, nil
}

// EncodeStatusFilter turns an AniList-style status string into the Kitsu equivalent. Empty input
// means "no filter" — return "" so EncodeFilter drops it.
func EncodeStatusFilter(anilistStatus string) string {
	mapping := map[string]string{
		"CURRENT":   LibraryStatusCurrent,
		"PLANNING":  LibraryStatusPlanned,
		"COMPLETED": LibraryStatusCompleted,
		"PAUSED":    LibraryStatusOnHold,
		"DROPPED":   LibraryStatusDropped,
	}
	if v, ok := mapping[strings.ToUpper(anilistStatus)]; ok {
		return v
	}
	return ""
}
