package handlers

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/mmcdole/gofeed"
)

// News area: the server fetches and parses RSS feeds once per interval so the frontend
// widget stays cheap no matter how many times it is opened or how many profiles exist.

const (
	rssFetchTimeout    = 15 * time.Second
	rssCacheTTL        = 15 * time.Minute
	rssMaxItemsPerFeed = 25
	rssMaxItemsTotal   = 60
)

// Default feeds when the user has not configured any (Settings -> App).
// Anime + manga news and release info.
var defaultRssFeeds = []string{
	"https://www.animenewsnetwork.com/all/rss.xml",
	"https://myanimelist.net/rss/news.xml",
	"https://www.reddit.com/r/anime/.rss",
	"https://www.reddit.com/r/manga/.rss",
}

type RssItem struct {
	Title       string `json:"title"`
	Link        string `json:"link"`
	Description string `json:"description"`
	Image       string `json:"image"`
	PublishedAt int64  `json:"publishedAt"`
	FeedTitle   string `json:"feedTitle"`
}

type RssFeedResponse struct {
	Items       []RssItem `json:"items"`
	Feeds       []string  `json:"feeds"`
	Errors      []string  `json:"errors"`
	UpdatedAt   int64     `json:"updatedAt"`
}

type rssCacheEntry struct {
	items     []RssItem
	feeds     []string
	errors    []string
	fetchedAt time.Time
}

var (
	rssCacheMu sync.Mutex
	rssCache   *rssCacheEntry
)

// HandleGetNewsFeed
//
//	@summary returns merged, sorted items from the configured RSS feeds.
//	@desc Fetches each feed configured in Settings -> App (defaults to anime/manga news feeds),
//	@desc merges the items newest-first and caches the result for 15 minutes.
//	@route /api/v1/news [GET]
//	@returns handlers.RssFeedResponse
func (h *Handler) HandleGetNewsFeed(c echo.Context) error {
	feeds := h.getRssFeedUrls()

	rssCacheMu.Lock()
	if rssCache != nil && time.Since(rssCache.fetchedAt) < rssCacheTTL && strings.Join(rssCache.feeds, "\n") == strings.Join(feeds, "\n") {
		cached := *rssCache
		rssCacheMu.Unlock()
		return h.RespondWithData(c, RssFeedResponse{
			Items:     cached.items,
			Feeds:     cached.feeds,
			Errors:    cached.errors,
			UpdatedAt: cached.fetchedAt.Unix(),
		})
	}
	rssCacheMu.Unlock()

	client := &http.Client{Timeout: rssFetchTimeout}
	parser := gofeed.NewParser()
	parser.Client = client

	ctx, cancel := context.WithTimeout(c.Request().Context(), rssFetchTimeout+5*time.Second)
	defer cancel()

	var (
		mu     sync.Mutex
		wg     sync.WaitGroup
		items  []RssItem
		errors []string
	)

	for _, feedURL := range feeds {
		wg.Add(1)
		go func(url string) {
			defer wg.Done()
			feed, err := parser.ParseURLWithContext(url, ctx)
			if err != nil || feed == nil {
				mu.Lock()
				errors = append(errors, url)
				mu.Unlock()
				return
			}
			feedTitle := strings.TrimSpace(feed.Title)
			count := 0
			for _, item := range feed.Items {
				if count >= rssMaxItemsPerFeed {
					break
				}
				ri := RssItem{
					Title:       strings.TrimSpace(item.Title),
					Link:        item.Link,
					Description: stripRssHtml(item.Description),
					FeedTitle:   feedTitle,
				}
				if item.Image != nil && item.Image.URL != "" {
					ri.Image = item.Image.URL
				}
				if item.PublishedParsed != nil {
					ri.PublishedAt = item.PublishedParsed.Unix()
				} else if item.UpdatedParsed != nil {
					ri.PublishedAt = item.UpdatedParsed.Unix()
				}
				mu.Lock()
				items = append(items, ri)
				mu.Unlock()
				count++
			}
		}(feedURL)
	}

	wg.Wait()

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].PublishedAt == items[j].PublishedAt {
			return items[i].Title < items[j].Title
		}
		return items[i].PublishedAt > items[j].PublishedAt
	})
	if len(items) > rssMaxItemsTotal {
		items = items[:rssMaxItemsTotal]
	}

	now := time.Now()
	rssCacheMu.Lock()
	rssCache = &rssCacheEntry{items: items, feeds: feeds, errors: errors, fetchedAt: now}
	rssCacheMu.Unlock()

	return h.RespondWithData(c, RssFeedResponse{
		Items:     items,
		Feeds:     feeds,
		Errors:    errors,
		UpdatedAt: now.Unix(),
	})
}

// getRssFeedUrls returns the user's configured feeds, falling back to the defaults.
// Feeds are stored in Settings -> App as one URL per line (or comma-separated).
func (h *Handler) getRssFeedUrls() []string {
	feeds := []string{}
	raw := ""
	if h.App.Settings != nil && h.App.Settings.Library != nil {
		raw = h.App.Settings.Library.NewsFeeds
	}
	for _, line := range strings.FieldsFunc(raw, func(r rune) bool { return r == '\n' || r == ',' || r == ';' }) {
		line = strings.TrimSpace(line)
		if line != "" && strings.HasPrefix(line, "http") {
			feeds = append(feeds, line)
		}
	}
	if len(feeds) == 0 {
		return defaultRssFeeds
	}
	return feeds
}

// stripRssHtml removes HTML tags and collapses whitespace in feed descriptions.
func stripRssHtml(s string) string {
	if s == "" {
		return ""
	}
	var b strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			b.WriteRune(r)
		}
	}
	out := b.String()
	// Collapse runs of whitespace (tags often separate words, so their removal glues text).
	out = strings.Join(strings.Fields(out), " ")
	if len(out) > 500 {
		out = out[:500] + "…"
	}
	return out
}
