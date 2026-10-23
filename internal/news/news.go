package news

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
)

// The news area: the server fetches and parses RSS feeds once per interval so the frontend
// widget stays cheap no matter how many times it is opened or how many profiles exist.
//
// The same fetch feeds two consumers — the /api/v1/news handler and the cron job that raises
// notifications for new entries — so the fetch, the merge and the 15-minute cache live here,
// in one package both can import.

const (
	fetchTimeout      = 15 * time.Second
	cacheTTL          = 15 * time.Minute
	maxItemsPerFeed   = 50
	maxItemsTotal     = 200
	// An item older than this is never announced — feeds are allowed to carry a backlog, and
	// only things published while the server was watching are worth a notification.
	announcementFreshness = 48 * time.Hour
	// At most this many notifications per check, so one chatty feed cannot flood the drawer.
	maxAnnouncementsPerCheck = 5
)

// Default feeds when the user has not configured any (Settings -> App).
// Anime + manga news and release info.
var defaultFeeds = []string{
	"https://www.animenewsnetwork.com/all/rss.xml",
	"https://myanimelist.net/rss/news.xml",
	"https://www.reddit.com/r/anime/.rss",
	"https://www.reddit.com/r/manga/.rss",
}

type Item struct {
	Title       string   `json:"title"`
	Link        string   `json:"link"`
	Description string   `json:"description"`
	Image       string   `json:"image"`
	PublishedAt int64    `json:"publishedAt"`
	FeedTitle   string   `json:"feedTitle"`
	Author      string   `json:"author"`
	Categories  []string `json:"categories"`
}

type Response struct {
	Items     []Item   `json:"items"`
	Feeds     []string `json:"feeds"`
	Errors    []string `json:"errors"`
	UpdatedAt int64    `json:"updatedAt"`
}

type cacheEntry struct {
	response  *Response
	fetchedAt time.Time
}

var (
	cacheMu sync.Mutex
	cache   *cacheEntry

	// announceMu guards announced: the set of item links this server process has already raised
	// a notification for. nil means "never checked" — the first check marks everything seen
	// without announcing, so a fresh install does not greet its owner with a drawer full of
	// last week's headlines.
	announceMu sync.Mutex
	announced  map[string]bool
)

// GetFeedUrls parses the user's configured feeds (Settings -> App), falling back to the
// defaults. Feeds are stored one URL per line, or comma/semicolon-separated.
func GetFeedUrls(raw string) []string {
	feeds := []string{}
	for _, line := range strings.FieldsFunc(raw, func(r rune) bool { return r == '\n' || r == ',' || r == ';' }) {
		line = strings.TrimSpace(line)
		if line != "" && strings.HasPrefix(line, "http") {
			feeds = append(feeds, line)
		}
	}
	if len(feeds) == 0 {
		return defaultFeeds
	}
	return feeds
}

// GetResponse returns the merged feed, fetching it when the cache is stale or the configured
// feeds changed.
func GetResponse(feedUrls []string) *Response {
	cacheMu.Lock()
	if cache != nil && time.Since(cache.fetchedAt) < cacheTTL && strings.Join(cache.response.Feeds, "\n") == strings.Join(feedUrls, "\n") {
		cached := cache.response
		cacheMu.Unlock()
		return cached
	}
	cacheMu.Unlock()

	resp := fetch(feedUrls)

	now := time.Now()
	cacheMu.Lock()
	cache = &cacheEntry{response: resp, fetchedAt: now}
	cacheMu.Unlock()

	return resp
}

func fetch(feedUrls []string) *Response {
	client := &http.Client{Timeout: fetchTimeout}
	parser := gofeed.NewParser()
	parser.Client = client

	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout+5*time.Second)
	defer cancel()

	var (
		mu     sync.Mutex
		wg     sync.WaitGroup
		items  []Item
		errors []string
	)

	for _, feedURL := range feedUrls {
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
				if count >= maxItemsPerFeed {
					break
				}
				ri := Item{
					Title:       strings.TrimSpace(item.Title),
					Link:        item.Link,
					Description: stripHTML(item.Description),
					FeedTitle:   feedTitle,
				}
				if item.Image != nil && item.Image.URL != "" {
					ri.Image = item.Image.URL
				}
				if item.Author != nil && strings.TrimSpace(item.Author.Name) != "" {
					ri.Author = strings.TrimSpace(item.Author.Name)
				}
				if len(item.Categories) > 0 {
					ri.Categories = make([]string, 0, len(item.Categories))
					for _, cat := range item.Categories {
						if c := strings.TrimSpace(cat); c != "" {
							ri.Categories = append(ri.Categories, c)
						}
					}
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

	// The same story can arrive more than once: ANN's all-topics feed runs an article under
	// several topics, and two configured feeds may both have covered it. Collapse to one item
	// per story — same link, or same title once case and extra whitespace are ignored — keeping
	// the copy that carries an image when the duplicates disagree.
	byLink := make(map[string]int, len(items))
	byTitle := make(map[string]int, len(items))
	deduped := make([]Item, 0, len(items))
	for _, it := range items {
		if it.Link != "" {
			if i, seen := byLink[it.Link]; seen {
				if it.Image != "" && deduped[i].Image == "" {
					deduped[i].Image = it.Image
				}
				continue
			}
		}
		titleKey := strings.ToLower(strings.Join(strings.Fields(it.Title), " "))
		if titleKey != "" {
			if i, seen := byTitle[titleKey]; seen {
				if it.Image != "" && deduped[i].Image == "" {
					deduped[i].Image = it.Image
				}
				continue
			}
			byTitle[titleKey] = len(deduped)
		}
		if it.Link != "" {
			byLink[it.Link] = len(deduped)
		}
		deduped = append(deduped, it)
	}
	items = deduped

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].PublishedAt == items[j].PublishedAt {
			return items[i].Title < items[j].Title
		}
		return items[i].PublishedAt > items[j].PublishedAt
	})
	if len(items) > maxItemsTotal {
		items = items[:maxItemsTotal]
	}

	return &Response{
		Items:     items,
		Feeds:     feedUrls,
		Errors:    errors,
		UpdatedAt: time.Now().Unix(),
	}
}

// stripHTML removes HTML tags and collapses whitespace in feed descriptions.
func stripHTML(s string) string {
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
