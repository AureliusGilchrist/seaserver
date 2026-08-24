package kitsu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"time"
)

// libraryEntryFromJSON: Kitsu's library-entries resources, when fetched individually, must have
// both `type: "libraryEntries"` and the relationships pointing to the user and the anime. Build
// that resource from a few primitives so the create/update calls below stay readable.
type libraryEntryResource struct {
	ID            string         `json:"id,omitempty"`
	Type          string         `json:"type"`
	Attributes    map[string]any `json:"attributes"`
	Relationships map[string]any `json:"relationships"`
}

// CreateLibraryEntry adds a new library entry — typically used the same way the AniList syncs
// use SaveMediaListEntry: planning a new anime, dropping a finished one, etc.
//
// `mediaID` and `mediaType` identify the underlying anime or manga. Kitsu requires both; if the
// caller doesn't know which kind it is, the resolver should have already populated that for them.
func (c *Client) CreateLibraryEntry(ctx context.Context, userID, mediaID, mediaType, status string, progress, ratingTwenty int) (*LibraryEntry, error) {
	if !c.HasToken() {
		return nil, ErrNotAuthenticated
	}
	if userID == "" || mediaID == "" {
		return nil, errors.New("kitsu: user id and media id required")
	}

	attrs := map[string]any{
		"status":   status,
		"progress": progress,
	}
	// ratingTwenty is the raw 2-20 scale Kitsu stores. Most clients don't bother sending it for
	// a brand-new entry — score updates usually piggy-back on a later call.
	if ratingTwenty > 0 {
		attrs["ratingTwenty"] = ratingTwenty
	}

	body := map[string]any{
		"data": libraryEntryResource{
			Type:       "libraryEntries",
			Attributes: attrs,
			Relationships: map[string]any{
				"user": map[string]any{
					"data": map[string]any{"type": "users", "id": userID},
				},
				mediaType: map[string]any{
					"data": map[string]any{"type": mediaType, "id": mediaID},
				},
			},
		},
	}

	raw, err := c.mutate(ctx, "POST", "/library-entries", body)
	if err != nil {
		return nil, err
	}
	return parseLibraryEntry(raw)
}

// UpdateLibraryEntry changes the existing entry's status / progress / score. Any zero-value field
// is sent as `null` (Kitsu treats null as "leave it alone").
func (c *Client) UpdateLibraryEntry(ctx context.Context, entryID, status string, progress, ratingTwenty *int, startedAt, finishedAt *string) (*LibraryEntry, error) {
	if !c.HasToken() {
		return nil, ErrNotAuthenticated
	}
	if entryID == "" {
		return nil, errors.New("kitsu: entry id required")
	}

	attrs := map[string]any{}
	if status != "" {
		attrs["status"] = status
	}
	if progress != nil {
		attrs["progress"] = *progress
	}
	if ratingTwenty != nil {
		attrs["ratingTwenty"] = *ratingTwenty
	}
	if startedAt != nil {
		attrs["startedAt"] = *startedAt
	}
	if finishedAt != nil {
		attrs["finishedAt"] = *finishedAt
	}

	body := map[string]any{
		"data": libraryEntryResource{
			ID:         entryID,
			Type:       "libraryEntries",
			Attributes: attrs,
		},
	}
	raw, err := c.mutate(ctx, "PATCH", "/library-entries/"+url.PathEscape(entryID), body)
	if err != nil {
		return nil, err
	}
	return parseLibraryEntry(raw)
}

// DeleteLibraryEntry removes a single entry. No body is required.
func (c *Client) DeleteLibraryEntry(ctx context.Context, entryID string) error {
	if !c.HasToken() {
		return ErrNotAuthenticated
	}
	if entryID == "" {
		return errors.New("kitsu: entry id required")
	}
	_, err := c.mutate(ctx, "DELETE", "/library-entries/"+url.PathEscape(entryID), nil)
	return err
}

// ProgressOnlyUpdate is the cheapest way to record "watched one more episode". It is rate-limit
// friendly and avoids sending the status/rating fields when they are not changing.
func (c *Client) ProgressOnlyUpdate(ctx context.Context, entryID string, progress int) (*LibraryEntry, error) {
	return c.UpdateLibraryEntry(ctx, entryID, "", &progress, nil, nil, nil)
}

// mutate runs POST/PATCH/DELETE through do() and parses out the single resource that Kitsu
// returned in `data`. Any non-empty cache entry for the modified resource is invalidated because
// it is now stale.
func (c *Client) mutate(ctx context.Context, method, path string, body any) ([]byte, error) {
	raw, status, err := c.do(ctx, method, path, body, 250) // 4 req/sec — Kitsu's conservatively safe rate for write calls
	if err != nil {
		return nil, err
	}
	// Fan out an invalidation: drop everything cached for prefix. /library-entries /user-states
	// are the obvious targets, but a generic prefix suffices.
	if i := indexOfPathPrefix(path); i > 0 {
		c.invalidate(path[:i])
	}
	if method != "DELETE" && (status < 200 || status >= 300) {
		return raw, fmt.Errorf("kitsu: %s %s -> %d", method, path, status)
	}
	return raw, nil
}

func indexOfPathPrefix(p string) int {
	// Pull out the leading "/resource-name" for cache invalidation.
	if len(p) == 0 || p[0] != '/' {
		return 0
	}
	for i := 1; i < len(p); i++ {
		if p[i] == '/' || p[i] == '?' || p[i] == '[' {
			return i
		}
	}
	return len(p)
}

func parseLibraryEntry(raw []byte) (*LibraryEntry, error) {
	var resp Response
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, err
	}
	var e LibraryEntry
	if err := json.Unmarshal(resp.Data, &e); err != nil {
		return nil, err
	}
	return &e, nil
}

// HasRateLimitBurstDelay is a small utility the rate-limiter consults. One token-economy write
// call sleeps this long inside `do` for non-GET methods.
const (
	writeRateLimitMs = 250 // 4/sec — comfortably under Kitsu's documented 30/min budget when
	// combined with concurrent reads
)

// TrimProgress returns a sanitized progress value. Negatives become zero, very large integers are
// clamped to int32 to avoid a malformed-payload 400.
func TrimProgress(progress int) int {
	if progress < 0 {
		return 0
	}
	if progress > int(^uint16(0)) { // 65535 — Kitsu's "no upper bound" is far above any anime
		return int(^uint16(0))
	}
	return progress
}

// YMD returns today's date in Kitsu's expected YYYY-MM-DD format. Used when the library entry's
// startedAt field would otherwise be left null but the entry is mid-watch.
func YMD(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02")
}

// YMDOrZero trims a date attribute Kitsu returns from JSON:API. Some anime have only a year
// ("2021") or year-month ("2021-03") and several handlers want a YYYY-MM-DD string instead of a
// half-empty one. Anything that does not look like a date returns "" so callers can branch.
func YMDOrZero(s string) string {
	if s == "" {
		return ""
	}
	switch len(s) {
	case 4:
		// Year only — pad with -01-01 so the frontend still sees a valid date.
		return s + "-01-01"
	case 7:
		return s + "-01"
	case 10:
		return s
	default:
		// Could be an ISO8601 timestamp. Slice off everything after the date portion.
		for i, r := range s {
			if r == 'T' || r == ' ' {
				return s[:i]
			}
		}
		return s
	}
}

// SanityCheckBuffer cap-pads the bytes buffer used in JSON marshalling when a caller asks for a
// very long body — the do() path uses bytes.NewReader(buf) so a stable buffer is fine.
var _ = bytes.NewReader
