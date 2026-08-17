package manga_providers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/rs/zerolog"

	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/util"
)

// WeebCentral is a manga provider for weebcentral.com.
//
// The site is server-rendered and driven by HTMX, which is convenient here: the three things a
// provider needs are each available as their own fragment endpoint, returning just the markup for
// that piece rather than a whole page to dig through.
//
//	search       /search/data?query=…&display_mode=Full%20Display
//	chapters     /series/{id}/full-chapter-list
//	pages        /chapters/{id}/images?reading_style=long_strip
//
// Series and chapter IDs are ULIDs, stable and opaque, which is what both IDs here are. The slug in
// a series URL is decoration — /series/{id}/anything resolves — so it is not stored or relied on.
type WeebCentral struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const WeebCentralProvider string = "weebcentral"

func NewWeebCentral(logger *zerolog.Logger) hibikemanga.Provider {
	c := &http.Client{
		Timeout: 60 * time.Second,
	}
	c.Transport = util.AddCloudFlareByPass(c.Transport)
	return &WeebCentral{
		Url:       "https://weebcentral.com",
		Client:    c,
		UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
		logger:    logger,
	}
}

func (w *WeebCentral) GetSettings() hibikemanga.Settings {
	return hibikemanga.Settings{
		// Every chapter on the site is one official or scanlated release; there is no picking
		// between groups or languages, so the IDs stay plain.
		SupportsMultiScanlator: false,
		SupportsMultiLanguage:  false,
	}
}

// seriesIDFromURL pulls the ULID out of a series link.
var seriesIDFromURL = regexp.MustCompile(`/series/([0-9A-Za-z]{26})`)

// chapterIDFromURL pulls the ULID out of a chapter link. The href is relative on the chapter list
// and absolute in search results, so the pattern deliberately does not anchor on the host.
var chapterIDFromURL = regexp.MustCompile(`/chapters/([0-9A-Za-z]{26})`)

// chapterNumberFromTitle reads the number out of "Chapter 12", "Volume 6", "Chapter 12.5".
var chapterNumberFromTitle = regexp.MustCompile(`(?i)(?:chapter|volume|episode|ch\.?|vol\.?)\s*([0-9]+(?:\.[0-9]+)?)`)

// WeebCentral is one site with one operator, not an API with a published budget, and the en masse
// manga downloader walks a whole library through it — a search, a chapter list and a page fetch per
// title, hundreds of titles, as fast as the loop can go. That is a scrape, and it earns a 429 quickly
// and a ban eventually.
//
// So requests are spaced, process-wide. One at a time, with a gap between them: this is a courtesy
// to the site rather than a limit anybody imposed, and it is deliberately conservative because the
// cost of being wrong is not a slow queue, it is losing access to the source entirely.
const (
	// weebCentralMinInterval is the least time between two requests to the site.
	weebCentralMinInterval = 900 * time.Millisecond

	// weebCentralBackoff is how long everything waits after the site says 429. Long enough to be an
	// apology rather than a retry, and applied to the whole provider, not just the caller that
	// happened to receive it — the next request is what would confirm we did not listen.
	weebCentralBackoff = 20 * time.Second
)

var (
	weebCentralPace     sync.Mutex
	weebCentralLastReq  time.Time
	weebCentralPausedTo time.Time
)

// paceRequest blocks until it is polite to send the next request.
//
// Serialised deliberately: the point is a steady, single-file trickle. Concurrency here would be
// several requests landing at once between the gaps, which is exactly the pattern that got the 429.
func paceRequest() {
	weebCentralPace.Lock()
	defer weebCentralPace.Unlock()

	now := time.Now()

	// Still inside a penalty from a 429 — everything waits, not just whoever was refused.
	if now.Before(weebCentralPausedTo) {
		time.Sleep(time.Until(weebCentralPausedTo))
		now = time.Now()
	}

	if gap := weebCentralMinInterval - now.Sub(weebCentralLastReq); gap > 0 {
		time.Sleep(gap)
	}
	weebCentralLastReq = time.Now()
}

// noteRateLimited puts the whole provider in a penalty box after the site refuses a request.
func noteRateLimited() {
	weebCentralPace.Lock()
	defer weebCentralPace.Unlock()
	until := time.Now().Add(weebCentralBackoff)
	if until.After(weebCentralPausedTo) {
		weebCentralPausedTo = until
	}
}

// fetch performs one paced GET and returns the body.
func (w *WeebCentral) fetch(url string) ([]byte, error) {
	paceRequest()

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", w.UserAgent)
	// The fragment endpoints are meant to be called from a page on the site; without a referer some
	// of them answer with an empty shell rather than the content.
	req.Header.Set("Referer", w.Url+"/")

	resp, err := w.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		// Back off for everything, not just this caller. The site has asked us to stop; the next
		// request from any other goroutine is what would tell it we were not listening.
		noteRateLimited()
		w.logger.Warn().Dur("pausing", weebCentralBackoff).
			Msg("weebcentral: Rate limited, pausing all requests to the site")
		return nil, fmt.Errorf("weebcentral: rate limited (429)")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("weebcentral: unexpected status %s", resp.Status)
	}

	return io.ReadAll(resp.Body)
}

func (w *WeebCentral) request(url string) (*goquery.Document, error) {
	body, err := w.fetch(url)
	if err != nil {
		return nil, err
	}

	// These endpoints answer with a bare fragment — a run of <article> elements, no <html> or
	// <body> around them. Handed straight to the parser that is a malformed document, and it
	// recovers by dropping most of it: parsing the search fragment directly yielded zero articles
	// out of the twenty-four that were plainly in the bytes. Wrapping it first gives the parser the
	// document structure it expects, and everything is then where it looks for it.
	return goquery.NewDocumentFromReader(strings.NewReader("<html><body>" + string(body) + "</body></html>"))
}

// requestPage fetches a whole page and parses it as it arrived.
//
// The series page is a complete document rather than a fragment, and wrapping one in another
// <html><body> is what the parser is least able to make sense of: the nested <head> is discarded
// along with the metadata in it.
func (w *WeebCentral) requestPage(url string) (*goquery.Document, error) {
	body, err := w.fetch(url)
	if err != nil {
		return nil, err
	}
	return goquery.NewDocumentFromReader(strings.NewReader(string(body)))
}

func (w *WeebCentral) Search(opts hibikemanga.SearchOptions) ([]*hibikemanga.SearchResult, error) {
	results := make([]*hibikemanga.SearchResult, 0)

	w.logger.Debug().Str("query", opts.Query).Msg("weebcentral: Searching manga")

	// Full Display carries the cover and the year; the Minimal mode the site also offers does not,
	// and both are wanted here.
	//
	// The parameter names are the site's current ones and are not interchangeable with the older
	// set: query=/order=Relevance now answers 400 — a whole error page, served with the fragment
	// the caller asked for nowhere in it. Parsed, that yielded no articles and so no results, which
	// is indistinguishable from a series the site does not carry. Every cover search and every
	// en masse match had been failing that way, silently, which is the shelf of blank cards in the
	// manga library.
	endpoint := fmt.Sprintf("%s/search/data?limit=24&offset=0&text=%s&sort=Best%%20Match&order=Descending&official=Any&display_mode=Full%%20Display",
		w.Url, url.QueryEscape(opts.Query))

	doc, err := w.request(endpoint)
	if err != nil {
		w.logger.Error().Err(err).Str("query", opts.Query).Msg("weebcentral: Search request failed")
		return nil, err
	}

	doc.Find("article").Each(func(_ int, article *goquery.Selection) {
		links := article.Find(`a[href*="/series/"]`)
		link := links.First()
		// Prefer the link that carries the title as its text over the one wrapping the cover, which
		// has none. Same series either way; this only decides what there is to read.
		links.EachWithBreak(func(_ int, candidate *goquery.Selection) bool {
			if strings.TrimSpace(candidate.Text()) != "" {
				link = candidate
				return false
			}
			return true
		})
		href, ok := link.Attr("href")
		if !ok {
			return
		}
		match := seriesIDFromURL.FindStringSubmatch(href)
		if match == nil {
			return
		}

		// The two display modes mark the title up differently, and neither is a superset of the
		// other: the compact card uses a heading, while the full card has no heading at all and
		// puts the title in a link wrapped by a tooltip span that repeats it as data-tip.
		//
		// The tooltip is read before any link's text because the full card's *first* series link is
		// the one wrapping the cover, and its text is everything painted over the artwork — the
		// "Official" ribbon included. Taking that gave series titled "Official #Killstagram".
		title := strings.TrimSpace(article.Find("h2").First().Text())
		if title == "" {
			article.Find(`a[href*="/series/"]`).EachWithBreak(func(_ int, candidate *goquery.Selection) bool {
				if tip := strings.TrimSpace(candidate.Parent().AttrOr("data-tip", "")); tip != "" {
					title = tip
					return false
				}
				if tip := strings.TrimSpace(candidate.AttrOr("data-tip", "")); tip != "" {
					title = tip
					return false
				}
				return true
			})
		}
		if title == "" {
			// The cover's alt text is "{title} cover", which is the title with a known suffix.
			title = strings.TrimSpace(strings.TrimSuffix(
				strings.TrimSpace(article.Find("img[alt]").First().AttrOr("alt", "")), "cover"))
		}
		if title == "" {
			title = strings.TrimSpace(link.Text())
		}
		if title == "" {
			return
		}

		// The cover is served as a <picture>; the <img> inside it is the fallback every browser can
		// read, which is also the one worth handing on.
		image := article.Find("picture img").First().AttrOr("src", "")
		if image == "" {
			image = article.Find("img").First().AttrOr("src", "")
		}

		// Minimal display lists the year as a bare cell; full display labels it "Year: 2005". Both
		// reduce to "the first four-digit number in this card that could be a year".
		year := 0
		article.Find("div, span").EachWithBreak(func(_ int, cell *goquery.Selection) bool {
			text := strings.TrimSpace(cell.Text())
			text = strings.TrimSpace(strings.TrimPrefix(text, "Year:"))
			if len(text) != 4 {
				return true
			}
			if parsed, err := strconv.Atoi(text); err == nil && parsed > 1900 && parsed < 2200 {
				year = parsed
				return false
			}
			return true
		})

		results = append(results, &hibikemanga.SearchResult{
			Provider: WeebCentralProvider,
			ID:       match[1],
			Title:    title,
			Year:     year,
			Image:    image,
			// Left to Seanime to rate, so this ranks the same way every other provider does.
			SearchRating: 0,
		})
	})

	if len(results) == 0 {
		w.logger.Error().Str("query", opts.Query).Msg("weebcentral: No results found")
		return nil, ErrNoResults
	}

	// The site returns its own relevance order, which is good, but the year filter the caller may
	// have asked for is not something the endpoint accepts — so it is applied here.
	if opts.Year > 0 {
		filtered := make([]*hibikemanga.SearchResult, 0, len(results))
		for _, r := range results {
			if r.Year == 0 || r.Year == opts.Year {
				filtered = append(filtered, r)
			}
		}
		// Only when it leaves something behind: a wrong year on the entry must not empty the list.
		if len(filtered) > 0 {
			results = filtered
		}
	}

	w.logger.Info().Int("count", len(results)).Msg("weebcentral: Found results")

	return results, nil
}

// normalizeID reduces whatever form of identifier arrives to the bare ULID the site's fragment
// endpoints expect.
//
// IDs reach this provider from more than one place — a fresh search, a record stored when a manga
// was added, an id copied out of a URL — and they do not all look alike: "01J76…", "01J76…/Some-
// Title", or a full https://weebcentral.com/series/… link. The site tolerates the slug on its
// ordinary pages, which is what makes the difference easy to miss, but the fragment endpoints do
// not: /series/{id}/{slug}/full-chapter-list answers 307 and redirects to the series page, whose
// markup holds no chapter list at all. The provider then reported, accurately and uselessly, that
// the manga had no chapters — and the en masse downloader skipped every title it was given.
func normalizeID(id string) string {
	if match := seriesIDFromURL.FindStringSubmatch(id); match != nil {
		return match[1]
	}
	// Not a URL: take the first path segment, which is where the ULID sits in "ULID/slug".
	if idx := strings.IndexRune(id, '/'); idx > 0 {
		return id[:idx]
	}
	return id
}

// normalizeChapterID does the same for chapter identifiers, which arrive in the same variety.
func normalizeChapterID(id string) string {
	if match := chapterIDFromURL.FindStringSubmatch(id); match != nil {
		return match[1]
	}
	if idx := strings.IndexRune(id, '/'); idx > 0 {
		return id[:idx]
	}
	return id
}

func (w *WeebCentral) FindChapters(id string) ([]*hibikemanga.ChapterDetails, error) {
	ret := make([]*hibikemanga.ChapterDetails, 0)

	w.logger.Debug().Str("mangaId", id).Msg("weebcentral: Finding chapters")

	seriesID := normalizeID(id)

	doc, err := w.request(fmt.Sprintf("%s/series/%s/full-chapter-list", w.Url, seriesID))
	if err != nil {
		w.logger.Error().Err(err).Str("mangaId", id).Msg("weebcentral: Chapter list request failed")
		return nil, err
	}

	// Newest first on the page, which is the opposite of the reading order the index is meant to
	// express — collected here, reversed below.
	type parsedChapter struct {
		id        string
		title     string
		number    string
		updatedAt string
	}
	parsed := make([]parsedChapter, 0)
	seen := make(map[string]bool)

	doc.Find(`a[href*="/chapters/"]`).Each(func(_ int, link *goquery.Selection) {
		href, ok := link.Attr("href")
		if !ok {
			return
		}
		match := chapterIDFromURL.FindStringSubmatch(href)
		if match == nil || seen[match[1]] {
			return
		}

		// The first span inside the label is the chapter's name; the ones after it are the
		// "last read" marker and other decoration, which must not end up in the title.
		title := strings.TrimSpace(link.Find("span.grow span").First().Text())
		if title == "" {
			title = strings.TrimSpace(link.Find("span").First().Text())
		}
		if title == "" {
			return
		}

		seen[match[1]] = true
		parsed = append(parsed, parsedChapter{
			id:        match[1],
			title:     title,
			number:    chapterNumber(title, len(parsed)),
			updatedAt: chapterDate(link),
		})
	})

	if len(parsed) == 0 {
		w.logger.Error().Str("mangaId", id).Msg("weebcentral: No chapters found")
		return nil, ErrNoChapters
	}

	// Oldest first, so Index counts up the way it is read.
	for i := len(parsed) - 1; i >= 0; i-- {
		c := parsed[i]
		ret = append(ret, &hibikemanga.ChapterDetails{
			Provider:  WeebCentralProvider,
			ID:        c.id,
			URL:       fmt.Sprintf("%s/chapters/%s", w.Url, c.id),
			Title:     c.title,
			Chapter:   c.number,
			Index:     uint(len(ret)),
			UpdatedAt: c.updatedAt,
		})
	}

	w.logger.Info().Int("count", len(ret)).Str("mangaId", id).Msg("weebcentral: Found chapters")

	return ret, nil
}

// chapterNumber reads the number out of a chapter's label, falling back to its position.
//
// The fallback matters for series whose chapters are labelled by volume or by name: without a
// number the caller cannot order them or tell which one follows which, and position is at least
// monotonic.
func chapterNumber(title string, position int) string {
	if match := chapterNumberFromTitle.FindStringSubmatch(title); match != nil {
		return strings.TrimLeft(match[1], "0")
	}
	// Anything left that is simply a bare number.
	trimmed := strings.TrimSpace(title)
	if _, err := strconv.ParseFloat(trimmed, 64); err == nil {
		return trimmed
	}
	return strconv.Itoa(position + 1)
}

// chapterDate reads the release date the list carries in a <time datetime="…"> and reduces it to
// the YYYY-MM-DD the interface asks for.
func chapterDate(link *goquery.Selection) string {
	value := link.Find("time").First().AttrOr("datetime", "")
	if value == "" {
		// The <time> is sometimes the chapter link's sibling rather than its child.
		value = link.Parent().Find("time").First().AttrOr("datetime", "")
	}
	if value == "" {
		return ""
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.Format("2006-01-02")
	}
	if len(value) >= 10 {
		return value[:10]
	}
	return ""
}

func (w *WeebCentral) FindChapterPages(id string) ([]*hibikemanga.ChapterPage, error) {
	ret := make([]*hibikemanga.ChapterPage, 0)

	w.logger.Debug().Str("chapterId", id).Msg("weebcentral: Finding chapter pages")

	// long_strip returns every page of the chapter in one fragment. The paged reading style returns
	// one image at a time, which would be a request per page.
	endpoint := fmt.Sprintf("%s/chapters/%s/images?is_prev=False&current_page=1&reading_style=long_strip",
		w.Url, normalizeChapterID(id))

	doc, err := w.request(endpoint)
	if err != nil {
		w.logger.Error().Err(err).Str("chapterId", id).Msg("weebcentral: Chapter pages request failed")
		return nil, err
	}

	doc.Find("img").Each(func(_ int, img *goquery.Selection) {
		src := strings.TrimSpace(img.AttrOr("src", ""))
		if src == "" || !strings.HasPrefix(src, "http") {
			return
		}
		// The fragment carries only page images, but a UI glyph slipping in would be filed as a
		// page and read as a blank one.
		if strings.Contains(src, "/static/") {
			return
		}

		ret = append(ret, &hibikemanga.ChapterPage{
			Provider: WeebCentralProvider,
			URL:      src,
			Index:    len(ret),
			// The image host serves pages only to requests that look like they came from the
			// reader. Without these the pages 403 — which is why they travel with each page rather
			// than being applied once by the client.
			Headers: map[string]string{
				"Referer":    w.Url + "/",
				"User-Agent": w.UserAgent,
			},
		})
	})

	if len(ret) == 0 {
		w.logger.Error().Str("chapterId", id).Msg("weebcentral: No pages found")
		return nil, ErrNoPages
	}

	w.logger.Info().Int("count", len(ret)).Str("chapterId", id).Msg("weebcentral: Found chapter pages")

	return ret, nil
}
