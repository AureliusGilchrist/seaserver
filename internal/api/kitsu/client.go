// Package kitsu is the server-side client for the Kitsu JSON:API.
//
// Kitsu is a JSON:API service (https://kitsu.app/api/edge/...) rather than a GraphQL one, so the
// package is built around plain HTTP+JSON rather than a generated client. The AniList version is
// GraphQL because AniList is — the surface is different because the service is different.
//
// The role of this client is to back KitsuIDMapping + SyntheticIDIndex lookups and to fill user
// libraries for the per-profile flow. The shared planning-slut and auto-downloader still go through
// the AniList clients (the "data grabber" lives there); the Kitsu client is only used when Kitsu is
// the *primary* source for a request.
package kitsu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"seanime/internal/util/result"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

const (
	// DefaultBaseURL is overridable so tests can point at a stubbed server.
	DefaultBaseURL = "https://kitsu.app/api/edge"
	// DefaultMediaBaseURL is for media-related endpoints.
	DefaultMediaBaseURL = "https://media.kitsu.app"

	// RequestTimeout caps any single request — Kitsu is usually snappy but a hung connection
	// should not block forever.
	RequestTimeout = 30 * time.Second
)

// ErrNotAuthenticated signals that the requested operation requires a token and none is present.
// Treated as recoverable by callers (the UI re-prompts for a token).
var ErrNotAuthenticated = errors.New("kitsu: not authenticated")

// ErrNotFound signals that the upstream returned 404 (or a JSON:API resource-null) and the caller
// should treat it as "no such media" rather than as a real error.
var ErrNotFound = errors.New("kitsu: not found")

// Client is the primary type — a single instance is shared across all callers. It is safe for
// concurrent use because the underlying http.Client is.
type Client struct {
	logger     *zerolog.Logger
	baseURL    string
	httpClient *http.Client

	// token is the bearer token used for user-authed routes. May be empty when the client is
	// constructed for unauthenticated reads (which Kitsu allows up to a low rate).
	token string

	// cache is a tiny TTL cache for the GET endpoints we hit on a hot path: by-slug media lookups
	// in particular benefit because the same slug arrives over and over in a single render pass.
	cache *result.BoundedCache[string, []byte]
}

// ClientOptions configures a Client. Only Logger and BaseURL are required to be set; the others
// fall back to safe defaults.
type ClientOptions struct {
	Logger  *zerolog.Logger
	BaseURL string
	Token   string
}

// NewClient returns a ready-to-use client. The token may be empty; that simply means only public
// routes will succeed. Callers that mutate the token should call SetToken rather than building a
// fresh client, because the in-memory cache is per-instance.
func NewClient(opts ClientOptions) *Client {
	if opts.BaseURL == "" {
		opts.BaseURL = DefaultBaseURL
	}
	c := &Client{
		logger:  opts.Logger,
		baseURL: opts.BaseURL,
		token:   opts.Token,
		httpClient: &http.Client{
			Timeout: RequestTimeout,
			Transport: &http.Transport{
				ForceAttemptHTTP2:   false,
				MaxIdleConns:        64,
				MaxConnsPerHost:     24,
				MaxIdleConnsPerHost: 24,
				IdleConnTimeout:     30 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		},
		cache: result.NewBoundedCache[string, []byte](500),
	}
	return c
}

// SetToken replaces the bearer token. Safe to call concurrently.
func (c *Client) SetToken(token string) {
	c.token = token
}

// HasToken reports whether a token is configured. Used by callers to decide which streams of code
// can run.
func (c *Client) HasToken() bool {
	return strings.TrimSpace(c.token) != ""
}

// BaseURL returns the configured base URL (mainly for tests).
func (c *Client) BaseURL() string {
	return c.baseURL
}

// Cache returns the in-memory cache so other layers (synthetic-id resolver) can consult it.
func (c *Client) Cache() *result.BoundedCache[string, []byte] {
	return c.cache
}

// ClearCache empties the in-memory response cache. Called after mutating library-entry writes
// so the next read of the same path reflects the change.
func (c *Client) ClearCache() {
	c.cache.Clear()
}

// do performs a single round-trip. The result body is returned raw (the caller decodes via the
// model types) so we don't waste a marshal/unmarshal pair when the caller only needs the cache.
//
// `msecBetweenCalls` is non-zero only for mutating endpoints; get endpoints carry no such cost
// because they don't trigger Kitsu's abuse detection.
func (c *Client) do(ctx context.Context, method, path string, body any, msecBetweenCalls int) ([]byte, int, error) {
	if c.logger != nil {
		c.logger.Trace().Str("method", method).Str("path", path).Msg("kitsu: Request started")
	}

	full := c.baseURL + path
	var req *http.Request
	var err error

	if body != nil {
		buf, mErr := json.Marshal(body)
		if mErr != nil {
			return nil, 0, mErr
		}
		req, err = http.NewRequestWithContext(ctx, method, full, bytes.NewReader(buf))
		if err != nil {
			return nil, 0, err
		}
		req.Header.Set("Content-Type", "application/vnd.api+json")
	} else {
		req, err = http.NewRequestWithContext(ctx, method, full, nil)
		if err != nil {
			return nil, 0, err
		}
	}

	req.Header.Set("Accept", "application/vnd.api+json")
	req.Header.Set("Accept-Encoding", "gzip, identity")
	if c.HasToken() {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}

	if resp.StatusCode == http.StatusNotFound {
		return raw, resp.StatusCode, ErrNotFound
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return raw, resp.StatusCode, ErrNotAuthenticated
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return raw, resp.StatusCode, fmt.Errorf("kitsu: %s %s -> %d: %s", method, path, resp.StatusCode, string(raw))
	}

	// Light rate-limit guard: sleep before the *next* call rather than the current one, so the
	// measured cost of one call is just the request itself.
	if msecBetweenCalls > 0 {
		time.Sleep(time.Duration(msecBetweenCalls) * time.Millisecond)
	}

	return raw, resp.StatusCode, nil
}

// getCached is a small wrapper that consults the in-memory cache before going to the network.
// The cache key is the full request path including any query string.
func (c *Client) getCached(ctx context.Context, fullPath string, ttl time.Duration) ([]byte, error) {
	if cached, ok := c.cache.Get(fullPath); ok {
		return cached, nil
	}
	raw, _, err := c.do(ctx, http.MethodGet, fullPath, nil, 0)
	if err != nil {
		return nil, err
	}
	c.cache.SetT(fullPath, raw, ttl)
	return raw, nil
}

// invalidate drops any cached entry for a path. Called on every write so a subsequent read will
// repopulate from Kitsu.
func (c *Client) invalidate(prefix string) {
	// BoundedCache has no prefix-drop, so iterate. Cache cap is small (500), and this only runs
	// after a write, so the cost is negligible.
	var stale []string
	c.cache.Range(func(key string, _ []byte) bool {
		if strings.HasPrefix(key, prefix) {
			stale = append(stale, key)
		}
		return true
	})
	for _, k := range stale {
		c.cache.Delete(k)
	}
}

// EncodeFilter builds a query-string fragment from a filter object. Kitsu accepts both
// `[filter[A]=B]` and `[filter][A]=B` shapes; this helper uses the bracket form because that is
// what every example in their docs uses, and what every Kitsu client in the wild uses.
//
// Returns "" for an empty filter so callers can still pass it directly into the path builder.
func EncodeFilter(filters map[string]string) string {
	if len(filters) == 0 {
		return ""
	}
	// Stable ordering makes test assertions easy.
	keys := make([]string, 0, len(filters))
	for k := range filters {
		keys = append(keys, k)
	}
	// Light-weight sort without importing sort.
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j-1] > keys[j]; j-- {
			keys[j-1], keys[j] = keys[j], keys[j-1]
		}
	}
	var sb strings.Builder
	for _, k := range keys {
		v := filters[k]
		if v == "" {
			continue
		}
		sb.WriteString("[filter[")
		sb.WriteString(k)
		sb.WriteString("]=")
		sb.WriteString(url.QueryEscape(v))
		sb.WriteString("]")
	}
	return sb.String()
}

// EncodeFieldList builds a `fields[X]=…` query string for sparse fieldsets, again with the
// bracket syntax Kitsu expects. Page/perPage are added last; Kitsu treats them as separate
// `page[limit]=N` and `page[offset]=M` fields.
func EncodeFieldList(resource string, fields []string) string {
	if len(fields) == 0 {
		return ""
	}
	joined := strings.Join(fields, ",")
	return "[fields[" + resource + "]=" + url.QueryEscape(joined) + "]"
}

// EncodePage returns the page[size]/page[offset] fragment. Both are clamped to safe values
// because Kitsu caps `size` at 20 and rejects very large offsets.
func EncodePage(limit, offset int) string {
	if limit <= 0 || limit > 20 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return "[page[limit]=" + strconv.Itoa(limit) + "][page[offset]=" + strconv.Itoa(offset) + "]"
}
