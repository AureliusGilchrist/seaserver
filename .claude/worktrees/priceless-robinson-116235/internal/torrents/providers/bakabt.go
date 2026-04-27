package torrent_providers

import (
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	"seanime/internal/extension"
	hibiketorrent "seanime/internal/extension/hibike/torrent"

	"github.com/PuerkitoBio/goquery"
)

const (
	BakaBTProviderID = "seanime-builtin-bakabt"
	bakaBTBaseURL    = "https://bakabt.me"
)

// BakaBT implements hibiketorrent.AnimeProvider for bakabt.me
// This is a private tracker that requires authentication.
// Users need to configure their credentials via the extension user config.
type BakaBT struct {
	mu       sync.Mutex
	client   *http.Client
	loggedIn bool
	username string
	password string
}

func NewBakaBT() *BakaBT {
	jar, _ := cookiejar.New(nil)
	return &BakaBT{
		client: &http.Client{
			Timeout: 30 * time.Second,
			Jar:     jar,
		},
	}
}

func (b *BakaBT) GetSettings() hibiketorrent.AnimeProviderSettings {
	return hibiketorrent.AnimeProviderSettings{
		CanSmartSearch: true,
		SmartSearchFilters: []hibiketorrent.AnimeProviderSmartSearchFilter{
			hibiketorrent.AnimeProviderSmartSearchFilterQuery,
		},
		SupportsAdult: true,
		Type:          hibiketorrent.AnimeProviderTypeMain,
	}
}

// SetSavedUserConfig receives saved user config (username/password).
// Implements extension.Configurable.
func (b *BakaBT) SetSavedUserConfig(config extension.SavedUserConfig) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if u, ok := config.Values["username"]; ok {
		b.username = u
	}
	if p, ok := config.Values["password"]; ok {
		b.password = p
	}
	// Reset login state when config changes
	b.loggedIn = false
}

func (b *BakaBT) Search(opts hibiketorrent.AnimeSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := searchAllVariants(opts.Media, opts.Query, b.scrapeSearch)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (b *BakaBT) SmartSearch(opts hibiketorrent.AnimeSmartSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := smartSearchAllVariants(opts.Media, opts.Query, "", b.scrapeSearch)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (b *BakaBT) GetTorrentInfoHash(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	return torrent.InfoHash, nil
}

func (b *BakaBT) GetTorrentMagnetLink(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	if torrent.MagnetLink != "" {
		return torrent.MagnetLink, nil
	}
	if torrent.InfoHash != "" {
		return fmt.Sprintf("magnet:?xt=urn:btih:%s", torrent.InfoHash), nil
	}
	return "", fmt.Errorf("no magnet link or info hash available")
}

func (b *BakaBT) GetLatest() ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := b.scrapeSearch("")
	if err != nil {
		return nil, err
	}
	return filterVideoTorrents(results), nil
}

func (b *BakaBT) login() error {
	b.mu.Lock()
	username := b.username
	password := b.password
	b.mu.Unlock()

	if username == "" || password == "" {
		return fmt.Errorf("bakabt: username and password are required (configure in extension settings)")
	}

	getProviderLimiter(BakaBTProviderID).Acquire()

	loginURL := bakaBTBaseURL + "/login.php"
	form := url.Values{}
	form.Set("username", username)
	form.Set("password", password)

	req, err := http.NewRequest("POST", loginURL, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("bakabt: failed to create login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := b.client.Do(req)
	if err != nil {
		return fmt.Errorf("bakabt: login request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check if login was successful by looking for redirect or cookies
	if resp.StatusCode >= 400 {
		return fmt.Errorf("bakabt: login failed with status %d", resp.StatusCode)
	}

	b.mu.Lock()
	b.loggedIn = true
	b.mu.Unlock()

	return nil
}

func (b *BakaBT) ensureLoggedIn() error {
	b.mu.Lock()
	loggedIn := b.loggedIn
	b.mu.Unlock()

	if loggedIn {
		return nil
	}
	return b.login()
}

func (b *BakaBT) scrapeSearch(query string) ([]*hibiketorrent.AnimeTorrent, error) {
	if err := b.ensureLoggedIn(); err != nil {
		return nil, err
	}

	getProviderLimiter(BakaBTProviderID).Acquire()

	// only=1 restricts to Anime category; hd=1 and multiaudio=1 prefer quality releases
	searchURL := bakaBTBaseURL + "/browse.php?only=1&hentai=1&incomplete=1&hd=1&multiaudio=1&reorder=1&q=" + url.QueryEscape(query)

	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("bakabt: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bakabt: failed to fetch search: %w", err)
	}
	defer resp.Body.Close()

	// If we get redirected to login, mark as not logged in and retry once
	if resp.StatusCode == http.StatusFound || resp.StatusCode == http.StatusMovedPermanently {
		b.mu.Lock()
		b.loggedIn = false
		b.mu.Unlock()
		return nil, fmt.Errorf("bakabt: session expired, retry will re-login")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bakabt: unexpected status code %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("bakabt: failed to parse HTML: %w", err)
	}

	var results []*hibiketorrent.AnimeTorrent

	// BakaBT uses a table-based layout for search results.
	// Each row typically has: category, title, download link, size, seeders, leechers
	doc.Find(".torrents tr, #torrent_table tr, table.torrent_table tr").Each(func(i int, s *goquery.Selection) {
		cells := s.Find("td")
		if cells.Length() < 3 {
			return
		}

		// Title
		titleEl := s.Find("a.title, td.title a, a[href*='torrent/']").First()
		title := strings.TrimSpace(titleEl.Text())
		if title == "" {
			return
		}

		torrent := &hibiketorrent.AnimeTorrent{
			Provider:      BakaBTProviderID,
			Name:          cleanTitle(title),
			EpisodeNumber: -1,
		}

		// Page link
		if href, exists := titleEl.Attr("href"); exists {
			if strings.HasPrefix(href, "/") {
				torrent.Link = bakaBTBaseURL + href
			} else {
				torrent.Link = href
			}
		}

		// Download URL
		s.Find("a[href*='download']").Each(func(_ int, a *goquery.Selection) {
			if href, exists := a.Attr("href"); exists {
				if strings.HasPrefix(href, "/") {
					torrent.DownloadUrl = bakaBTBaseURL + href
				} else {
					torrent.DownloadUrl = href
				}
			}
		})

		// Size
		rowText := s.Text()
		if match := nekoBTSizeRegex.FindString(rowText); match != "" {
			torrent.FormattedSize = match
			torrent.Size = parseNyaaSize(match)
		}

		// Seeders/leechers from the last cells
		numCells := cells.Length()
		if numCells >= 2 {
			seedersText := strings.TrimSpace(cells.Eq(numCells - 2).Text())
			leechersText := strings.TrimSpace(cells.Eq(numCells - 1).Text())
			fmt.Sscanf(seedersText, "%d", &torrent.Seeders)
			fmt.Sscanf(leechersText, "%d", &torrent.Leechers)
		}

		if torrent.DownloadUrl != "" || torrent.Link != "" {
			results = append(results, torrent)
		}
	})

	return results, nil
}
