package torrent_providers

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	hibiketorrent "seanime/internal/extension/hibike/torrent"

	"github.com/PuerkitoBio/goquery"
)

const (
	ShanaProjectProviderID = "seanime-builtin-shanaproject"
	shanaBaseURL           = "https://www.shanaproject.com"
)

// ShanaProject implements hibiketorrent.AnimeProvider for shanaproject.com
// Uses HTML scraping of the search results page.
type ShanaProject struct{}

func NewShanaProject() *ShanaProject {
	return &ShanaProject{}
}

func (sp *ShanaProject) GetSettings() hibiketorrent.AnimeProviderSettings {
	return hibiketorrent.AnimeProviderSettings{
		CanSmartSearch: false,
		SupportsAdult:  false,
		Type:           hibiketorrent.AnimeProviderTypeMain,
	}
}

func (sp *ShanaProject) Search(opts hibiketorrent.AnimeSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := searchAllVariants(opts.Media, opts.Query, sp.scrapeSearch)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (sp *ShanaProject) SmartSearch(opts hibiketorrent.AnimeSmartSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := smartSearchAllVariants(opts.Media, opts.Query, "", sp.scrapeSearch)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (sp *ShanaProject) GetTorrentInfoHash(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	return torrent.InfoHash, nil
}

func (sp *ShanaProject) GetTorrentMagnetLink(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	if torrent.MagnetLink != "" {
		return torrent.MagnetLink, nil
	}
	return "", fmt.Errorf("no magnet link available")
}

func (sp *ShanaProject) GetLatest() ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := sp.scrapeLatest()
	if err != nil {
		return nil, err
	}
	return filterVideoTorrents(results), nil
}

func (sp *ShanaProject) scrapeSearch(query string) ([]*hibiketorrent.AnimeTorrent, error) {
	getProviderLimiter(ShanaProjectProviderID).Acquire()

	searchURL := shanaBaseURL + "/search/?title=" + url.QueryEscape(query)

	doc, err := sp.fetchPage(searchURL)
	if err != nil {
		return nil, err
	}

	return sp.parseRows(doc), nil
}

func (sp *ShanaProject) scrapeLatest() ([]*hibiketorrent.AnimeTorrent, error) {
	getProviderLimiter(ShanaProjectProviderID).Acquire()

	doc, err := sp.fetchPage(shanaBaseURL + "/")
	if err != nil {
		return nil, err
	}

	return sp.parseRows(doc), nil
}

func (sp *ShanaProject) fetchPage(pageURL string) (*goquery.Document, error) {
	req, err := http.NewRequest("GET", pageURL, nil)
	if err != nil {
		return nil, fmt.Errorf("shanaproject: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("shanaproject: failed to fetch page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("shanaproject: unexpected status code %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("shanaproject: failed to parse HTML: %w", err)
	}

	return doc, nil
}

func (sp *ShanaProject) parseRows(doc *goquery.Document) []*hibiketorrent.AnimeTorrent {
	var results []*hibiketorrent.AnimeTorrent

	// ShanaProject lists releases in table rows or div-based lists.
	// Each entry has: episode, title/series link, resolution tag (HD/SD),
	// subber, file size, and a download link.
	doc.Find("tr, .release_block, .release").Each(func(i int, s *goquery.Selection) {
		// Look for download link
		downloadLink := ""
		s.Find("a[href*='/download/']").Each(func(_ int, a *goquery.Selection) {
			if href, exists := a.Attr("href"); exists {
				if strings.HasPrefix(href, "/") {
					downloadLink = shanaBaseURL + href
				} else {
					downloadLink = href
				}
			}
		})
		if downloadLink == "" {
			return
		}

		// Extract series/title
		title := ""
		pageLink := ""
		s.Find("a[href*='/series/']").Each(func(_ int, a *goquery.Selection) {
			text := strings.TrimSpace(a.Text())
			if text != "" && title == "" {
				title = text
			}
			if href, exists := a.Attr("href"); exists && pageLink == "" {
				if strings.HasPrefix(href, "/") {
					pageLink = shanaBaseURL + href
				} else {
					pageLink = href
				}
			}
		})
		if title == "" {
			return
		}

		// Subber
		subber := ""
		s.Find("a[href*='/subbertag/']").Each(func(_ int, a *goquery.Selection) {
			text := strings.TrimSpace(a.Text())
			if text != "" && subber == "" {
				subber = text
			}
		})

		// Build full name
		fullName := title
		if subber != "" {
			fullName = "[" + subber + "] " + title
		}

		// File size - look for size-like text
		rowText := s.Text()
		sizeStr := ""
		if match := nekoBTSizeRegex.FindString(rowText); match != "" {
			sizeStr = match
		}

		torrent := &hibiketorrent.AnimeTorrent{
			Provider:      ShanaProjectProviderID,
			Name:          cleanTitle(fullName),
			Link:          pageLink,
			DownloadUrl:   downloadLink,
			FormattedSize: sizeStr,
			Size:          parseNyaaSize(sizeStr),
			EpisodeNumber: -1,
		}

		// Check for resolution tags
		if strings.Contains(rowText, "1080p") || strings.Contains(s.Find(".release_quality").Text(), "HD") {
			torrent.Resolution = "1080p"
		} else if strings.Contains(rowText, "720p") {
			torrent.Resolution = "720p"
		} else if strings.Contains(rowText, "480p") || strings.Contains(s.Find(".release_quality").Text(), "SD") {
			torrent.Resolution = "480p"
		}

		if subber != "" {
			torrent.ReleaseGroup = subber
		}

		results = append(results, torrent)
	})

	return results
}
