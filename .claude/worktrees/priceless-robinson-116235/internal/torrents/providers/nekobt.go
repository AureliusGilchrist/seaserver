package torrent_providers

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	hibiketorrent "seanime/internal/extension/hibike/torrent"

	"github.com/PuerkitoBio/goquery"
)

const (
	NekoBTProviderID = "seanime-builtin-nekobt"
	nekoBTBaseURL    = "https://nekobt.to"
)

// NekoBT implements hibiketorrent.AnimeProvider for nekobt.to
// Uses HTML scraping since the Torznab API returns empty results.
type NekoBT struct{}

func NewNekoBT() *NekoBT {
	return &NekoBT{}
}

func (n *NekoBT) GetSettings() hibiketorrent.AnimeProviderSettings {
	return hibiketorrent.AnimeProviderSettings{
		CanSmartSearch: true,
		SmartSearchFilters: []hibiketorrent.AnimeProviderSmartSearchFilter{
			hibiketorrent.AnimeProviderSmartSearchFilterQuery,
			hibiketorrent.AnimeProviderSmartSearchFilterResolution,
		},
		SupportsAdult: false,
		Type:          hibiketorrent.AnimeProviderTypeMain,
	}
}

func (n *NekoBT) Search(opts hibiketorrent.AnimeSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := searchAllVariants(opts.Media, opts.Query, n.scrapeSearch)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (n *NekoBT) SmartSearch(opts hibiketorrent.AnimeSmartSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	suffix := ""
	if opts.Resolution != "" {
		suffix = opts.Resolution
	}

	results, err := smartSearchAllVariants(opts.Media, opts.Query, suffix, n.scrapeSearch)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (n *NekoBT) GetTorrentInfoHash(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	return torrent.InfoHash, nil
}

func (n *NekoBT) GetTorrentMagnetLink(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	if torrent.MagnetLink != "" {
		return torrent.MagnetLink, nil
	}
	if torrent.InfoHash != "" {
		return fmt.Sprintf("magnet:?xt=urn:btih:%s", torrent.InfoHash), nil
	}
	return "", fmt.Errorf("no magnet link or info hash available")
}

func (n *NekoBT) GetLatest() ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := n.scrapeSearch("")
	if err != nil {
		return nil, err
	}
	return filterVideoTorrents(results), nil
}

var nekoBTSizeRegex = regexp.MustCompile(`(?i)([\d.]+)\s*(TiB|GiB|MiB|KiB|B)`)

func (n *NekoBT) scrapeSearch(query string) ([]*hibiketorrent.AnimeTorrent, error) {
	getProviderLimiter(NekoBTProviderID).Acquire()

	searchURL := nekoBTBaseURL + "/search"
	if query != "" {
		searchURL += "?q=" + url.QueryEscape(query)
	}

	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("nekobt: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nekobt: failed to fetch page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nekobt: unexpected status code %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("nekobt: failed to parse HTML: %w", err)
	}

	var results []*hibiketorrent.AnimeTorrent

	// NekoBT renders torrents in table rows. Each row has:
	// - Category, Title, Links (magnet + torrent download), Size, Date, Seeders, Leechers, Downloads
	doc.Find("table tbody tr, tr").Each(func(i int, s *goquery.Selection) {
		// Find all <td> cells in this row
		cells := s.Find("td")
		if cells.Length() < 5 {
			return
		}

		// Extract title from the link text
		titleEl := s.Find("a[href*='/torrent/'], a[href*='/media/']").First()
		title := strings.TrimSpace(titleEl.Text())
		if title == "" {
			// Fallback: try to get any substantive text from the row
			title = strings.TrimSpace(cells.Eq(1).Text())
		}
		if title == "" || len(title) < 5 {
			return
		}

		torrent := &hibiketorrent.AnimeTorrent{
			Provider:      NekoBTProviderID,
			Name:          cleanTitle(title),
			EpisodeNumber: -1,
		}

		// Extract link (page link)
		if href, exists := titleEl.Attr("href"); exists {
			if strings.HasPrefix(href, "/") {
				torrent.Link = nekoBTBaseURL + href
			} else {
				torrent.Link = href
			}
		}

		// Extract magnet link
		s.Find("a[href^='magnet:']").Each(func(_ int, a *goquery.Selection) {
			if href, exists := a.Attr("href"); exists {
				torrent.MagnetLink = href
				// Extract info hash from magnet link
				torrent.InfoHash = extractInfoHashFromMagnet(href)
			}
		})

		// Extract .torrent download URL
		s.Find("a[href*='.torrent'], a[href*='/download']").Each(func(_ int, a *goquery.Selection) {
			if href, exists := a.Attr("href"); exists {
				if strings.HasPrefix(href, "/") {
					torrent.DownloadUrl = nekoBTBaseURL + href
				} else {
					torrent.DownloadUrl = href
				}
			}
		})

		// Parse size, date, seeders, leechers, downloads from text
		rowText := s.Text()

		// Size
		if match := nekoBTSizeRegex.FindString(rowText); match != "" {
			torrent.FormattedSize = match
			torrent.Size = parseNyaaSize(match)
		}

		// Date - look for date patterns like "2026-04-05 13:23:18"
		dateRegex := regexp.MustCompile(`(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})`)
		if dateMatch := dateRegex.FindString(rowText); dateMatch != "" {
			if t, err := time.Parse("2006-01-02 15:04:05", dateMatch); err == nil {
				torrent.Date = t.Format(time.RFC3339)
			}
		}

		// Extract seeders/leechers/downloads from the last few cells
		numCells := cells.Length()
		if numCells >= 3 {
			torrent.Seeders, _ = strconv.Atoi(strings.TrimSpace(cells.Eq(numCells - 3).Text()))
			torrent.Leechers, _ = strconv.Atoi(strings.TrimSpace(cells.Eq(numCells - 2).Text()))
			torrent.DownloadCount, _ = strconv.Atoi(strings.TrimSpace(cells.Eq(numCells - 1).Text()))
		}

		if torrent.MagnetLink != "" || torrent.DownloadUrl != "" {
			results = append(results, torrent)
		}
	})

	return results, nil
}

// cleanTitle removes excessive whitespace and newlines from scraped title text.
func cleanTitle(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	return strings.TrimSpace(s)
}

var infoHashFromMagnetRegex = regexp.MustCompile(`(?i)btih:([a-f0-9]{40})`)

// extractInfoHashFromMagnet extracts the 40-char hex info hash from a magnet URI.
func extractInfoHashFromMagnet(magnet string) string {
	if match := infoHashFromMagnetRegex.FindStringSubmatch(magnet); len(match) > 1 {
		return strings.ToLower(match[1])
	}
	return ""
}
