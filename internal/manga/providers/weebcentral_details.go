package manga_providers

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// A series that AniList has never heard of still has a page describing it on the site the chapters
// came from, and that page is the only description of it in existence as far as this server is
// concerned. Search results carry the cover and the year and nothing else — no synopsis, no status,
// no alternative titles — so a synthetic entry built from a search alone is a picture and a name.
//
// The series page has the rest. It is one request per series, made once, in the background, and it
// is the difference between a local library of grey rectangles and one that reads like the rest of
// the app.

// SeriesDetails is everything the series page says about a manga.
type SeriesDetails struct {
	ID string `json:"id"`
	// Title is the site's own name for the series, not the folder's.
	Title string `json:"title"`
	// Synonyms are the "Associated Name(s)" — the alternative romanisations and the English title,
	// which are usually what a folder on disk was named after.
	Synonyms []string `json:"synonyms,omitempty"`
	// Image is the cover.
	Image string `json:"image,omitempty"`
	// Description is the synopsis, as prose.
	Description string `json:"description,omitempty"`
	// Status is the site's wording — "Ongoing", "Complete", "Hiatus", "Canceled".
	Status string `json:"status,omitempty"`
	// Type is "Manga", "Manhwa", "Manhua", "OEL".
	Type string `json:"type,omitempty"`
	// Authors is everybody credited on the series.
	Authors []string `json:"authors,omitempty"`
	// Tags is the site's genre list.
	Tags []string `json:"tags,omitempty"`
	// Year is the release year, 0 when the page does not say.
	Year int `json:"year,omitempty"`
}

// GetSeriesDetails reads everything the series page holds about one manga.
//
// The id may arrive in any of the forms normalizeID accepts.
func (w *WeebCentral) GetSeriesDetails(id string) (*SeriesDetails, error) {
	seriesID := normalizeID(id)
	if seriesID == "" {
		return nil, fmt.Errorf("weebcentral: no series id to fetch details for")
	}

	w.logger.Debug().Str("mangaId", seriesID).Msg("weebcentral: Fetching series details")

	doc, err := w.requestPage(fmt.Sprintf("%s/series/%s", w.Url, seriesID))
	if err != nil {
		w.logger.Error().Err(err).Str("mangaId", seriesID).Msg("weebcentral: Series details request failed")
		return nil, err
	}

	details := &SeriesDetails{ID: seriesID}

	// The page carries the title twice — once for the narrow layout and once for the wide one — and
	// they are the same string, so the first is as good as either.
	details.Title = strings.TrimSpace(doc.Find("h1").First().Text())
	if details.Title == "" {
		details.Title = strings.TrimSpace(doc.Find(`meta[property="og:image:alt"]`).AttrOr("content", ""))
		details.Title = strings.TrimSpace(strings.TrimSuffix(details.Title, "cover"))
	}

	details.Image = seriesCover(doc)

	// The synopsis is the paragraph under the "Description" heading. Matching on the heading rather
	// than on the paragraph's classes is deliberate: the classes are Tailwind utilities and change
	// whenever the site is restyled, while the word "Description" is the content.
	doc.Find("li").EachWithBreak(func(_ int, item *goquery.Selection) bool {
		label := strings.TrimSpace(item.Find("strong").First().Text())
		if !strings.EqualFold(strings.TrimSuffix(label, ":"), "Description") {
			return true
		}
		if p := strings.TrimSpace(item.Find("p").First().Text()); p != "" {
			details.Description = p
			return false
		}
		// No paragraph: whatever is left once the heading is taken off the item.
		text := strings.TrimSpace(item.Text())
		details.Description = strings.TrimSpace(strings.TrimPrefix(text, label))
		return false
	})

	details.Synonyms = labelledList(doc, "Associated Name")
	details.Authors = labelledList(doc, "Author")
	details.Tags = labelledList(doc, "Tag")

	details.Status = labelledValue(doc, "Status")
	details.Type = labelledValue(doc, "Type")
	if year := labelledValue(doc, "Released"); year != "" {
		if parsed, err := strconv.Atoi(year); err == nil && parsed > 1000 && parsed < 2200 {
			details.Year = parsed
		}
	}

	if details.Title == "" && details.Image == "" && details.Description == "" {
		return nil, fmt.Errorf("weebcentral: series page held no details for %s", seriesID)
	}

	w.logger.Info().
		Str("mangaId", seriesID).
		Str("title", details.Title).
		Bool("hasCover", details.Image != "").
		Bool("hasDescription", details.Description != "").
		Msg("weebcentral: Fetched series details")

	return details, nil
}

// seriesCover picks the cover off the series page.
//
// The <picture> offers a webp at full size and a jpg fallback; the fallback is taken because it is
// the one every client can render, and the proxy this URL is served through does no conversion.
func seriesCover(doc *goquery.Document) string {
	if src := strings.TrimSpace(doc.Find("picture img").First().AttrOr("src", "")); src != "" {
		return src
	}
	// The page's own Open Graph image is the same cover, and survives a restyle of the markup.
	if src := strings.TrimSpace(doc.Find(`meta[property="og:image"]`).AttrOr("content", "")); src != "" &&
		!strings.Contains(src, "/static/") {
		return src
	}
	return ""
}

// labelledItem finds the list item introduced by a given heading — "Status: ", "Author(s): ".
//
// Matched on a prefix because the site writes them inconsistently: "Tags(s)" on the series page and
// "Tag(s)" in search results, "Author(s)" with a trailing space, "Released" with none.
func labelledItem(doc *goquery.Document, label string) *goquery.Selection {
	var found *goquery.Selection
	doc.Find("li").EachWithBreak(func(_ int, item *goquery.Selection) bool {
		heading := strings.TrimSpace(item.Find("strong").First().Text())
		if strings.HasPrefix(strings.ToLower(heading), strings.ToLower(label)) {
			found = item
			return false
		}
		return true
	})
	return found
}

// labelledValue reads the single value under a heading.
func labelledValue(doc *goquery.Document, label string) string {
	item := labelledItem(doc, label)
	if item == nil {
		return ""
	}
	heading := strings.TrimSpace(item.Find("strong").First().Text())
	value := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(item.Text()), heading))
	return strings.TrimSpace(strings.Trim(value, ","))
}

// labelledList reads the several values under a heading — the associated names, the authors, the
// tags — each of which the page marks up as its own element with the separators left in the text.
func labelledList(doc *goquery.Document, label string) []string {
	item := labelledItem(doc, label)
	if item == nil {
		return nil
	}

	values := make([]string, 0, 4)
	seen := make(map[string]bool)
	add := func(value string) {
		value = strings.TrimSpace(strings.Trim(strings.TrimSpace(value), ","))
		if value == "" || seen[value] {
			return
		}
		seen[value] = true
		values = append(values, value)
	}

	// Associated names are an inner <ul> of <li>; authors and tags are a run of <span>.
	if inner := item.Find("li"); inner.Length() > 0 {
		inner.Each(func(_ int, li *goquery.Selection) { add(li.Text()) })
		return values
	}
	item.Find("span").Each(func(_ int, span *goquery.Selection) { add(span.Text()) })

	return values
}

// MangaDetailsProvider is implemented by providers that can describe a series beyond what a search
// result carries. Only WeebCentral does, which is why the synthetic metadata fill falls back to it.
type MangaDetailsProvider interface {
	GetSeriesDetails(id string) (*SeriesDetails, error)
}
