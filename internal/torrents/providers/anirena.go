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
	AniRenaProviderID = "seanime-builtin-anirena"
	aniRenaBaseURL    = "https://www.anirena.com"
)

// AniRena implements hibiketorrent.AnimeProvider for anirena.com, a public anime tracker. Its
// search page is rendered on the server and lists seeders (its own and those other trackers
// report), size, date and the .torrent link; its RSS feed has no seeders, so the page is read.
type AniRena struct{}

func NewAniRena() *AniRena {
	return &AniRena{}
}

func (a *AniRena) GetSettings() hibiketorrent.AnimeProviderSettings {
	return hibiketorrent.AnimeProviderSettings{
		CanSmartSearch: true,
		SmartSearchFilters: []hibiketorrent.AnimeProviderSmartSearchFilter{
			hibiketorrent.AnimeProviderSmartSearchFilterBatch,
			hibiketorrent.AnimeProviderSmartSearchFilterEpisodeNumber,
			hibiketorrent.AnimeProviderSmartSearchFilterResolution,
			hibiketorrent.AnimeProviderSmartSearchFilterQuery,
		},
		SupportsAdult: false,
		Type:          hibiketorrent.AnimeProviderTypeMain,
	}
}

func (a *AniRena) Search(opts hibiketorrent.AnimeSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := searchAllVariants(opts.Media, opts.Query, a.search)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (a *AniRena) SmartSearch(opts hibiketorrent.AnimeSmartSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	var suffixParts []string
	if opts.Resolution != "" {
		suffixParts = append(suffixParts, opts.Resolution)
	}
	// AniRena matches every word in the title, and few complete releases say "batch", so a
	// batch search is the bare title; an episode search adds the number.
	if !opts.Batch && opts.EpisodeNumber > 0 {
		suffixParts = append(suffixParts, fmt.Sprintf("%02d", opts.EpisodeNumber))
	}
	results, err := smartSearchAllVariants(opts.Media, opts.Query, strings.Join(suffixParts, " "), a.search)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (a *AniRena) GetTorrentInfoHash(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	if torrent.InfoHash != "" {
		return torrent.InfoHash, nil
	}
	magnet, err := a.GetTorrentMagnetLink(torrent)
	if err != nil {
		return "", err
	}
	if h := extractInfoHashFromMagnet(magnet); h != "" {
		return h, nil
	}
	return "", fmt.Errorf("anirena: no info hash in the magnet link")
}

// GetTorrentMagnetLink follows the torrent's magnet link, which the site serves as a redirect.
func (a *AniRena) GetTorrentMagnetLink(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	if torrent.MagnetLink != "" && strings.HasPrefix(torrent.MagnetLink, "magnet:") {
		return torrent.MagnetLink, nil
	}
	id := aniRenaTorrentID(torrent)
	if id == "" {
		if torrent.InfoHash != "" {
			return "magnet:?xt=urn:btih:" + torrent.InfoHash, nil
		}
		return "", fmt.Errorf("anirena: no torrent id")
	}
	req, err := http.NewRequest("GET", aniRenaBaseURL+"/torrents/"+id+"/magnet", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", aniRenaUserAgent)
	client := &http.Client{
		Timeout: 30 * time.Second,
		// The magnet is the redirect target; a client cannot follow it.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("anirena: magnet link failed: %w", err)
	}
	defer resp.Body.Close()
	if loc := resp.Header.Get("Location"); strings.HasPrefix(loc, "magnet:") {
		torrent.MagnetLink = loc
		torrent.InfoHash = extractInfoHashFromMagnet(loc)
		return loc, nil
	}
	return "", fmt.Errorf("anirena: no magnet link (status %d)", resp.StatusCode)
}

func (a *AniRena) GetLatest() ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := a.search("")
	if err != nil {
		return nil, err
	}
	return filterVideoTorrents(results), nil
}

const aniRenaUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

var (
	aniRenaTorrentIDRe = regexp.MustCompile(`/torrents?/([0-9a-f-]{36})`)
	aniRenaCountRe     = regexp.MustCompile(`\d+`)
)

func aniRenaTorrentID(t *hibiketorrent.AnimeTorrent) string {
	for _, s := range []string{t.DownloadUrl, t.Link} {
		if m := aniRenaTorrentIDRe.FindStringSubmatch(s); len(m) > 1 {
			return m[1]
		}
	}
	return ""
}

// aniRenaCount reads a cell like "1(45)": AniRena's own count, then in parentheses what other
// trackers report for the same torrent. The larger is the swarm.
func aniRenaCount(cell string) int {
	best := 0
	for _, s := range aniRenaCountRe.FindAllString(cell, -1) {
		if n, err := strconv.Atoi(s); err == nil && n > best {
			best = n
		}
	}
	return best
}

func (a *AniRena) search(query string) ([]*hibiketorrent.AnimeTorrent, error) {
	getProviderLimiter(AniRenaProviderID).Acquire()

	searchURL := aniRenaBaseURL + "/"
	if query != "" {
		searchURL += "?q=" + url.QueryEscape(query)
	}
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("anirena: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", aniRenaUserAgent)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("anirena: search failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anirena: unexpected status code %d", resp.StatusCode)
	}
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("anirena: failed to parse the page: %w", err)
	}
	return parseAniRenaRows(doc), nil
}

func parseAniRenaRows(doc *goquery.Document) []*hibiketorrent.AnimeTorrent {
	var results []*hibiketorrent.AnimeTorrent
	doc.Find("tr[data-torrent-id]").Each(func(_ int, row *goquery.Selection) {
		id, _ := row.Attr("data-torrent-id")
		name := cleanTitle(row.Find("a.tl-torrent-name").First().Text())
		if id == "" || name == "" {
			return
		}
		t := &hibiketorrent.AnimeTorrent{
			Provider:      AniRenaProviderID,
			Name:          name,
			Link:          aniRenaBaseURL + "/torrent/" + id,
			DownloadUrl:   aniRenaBaseURL + "/torrents/" + id + ".torrent",
			EpisodeNumber: -1,
		}
		if size := strings.TrimSpace(row.Find("td.col-size").First().Text()); size != "" {
			t.FormattedSize = size
			t.Size = parseNyaaSize(strings.NewReplacer("GB", "GiB", "MB", "MiB", "KB", "KiB", "TB", "TiB").Replace(size))
		}
		if ts, ok := row.Attr("data-created-ts"); ok {
			if sec, err := strconv.ParseInt(ts, 10, 64); err == nil && sec > 0 {
				t.Date = time.Unix(sec, 0).UTC().Format(time.RFC3339)
			}
		}
		t.Seeders = aniRenaCount(row.Find("td.col-se").First().Text())
		t.Leechers = aniRenaCount(row.Find("td.col-le").First().Text())
		t.DownloadCount = aniRenaCount(row.Find("td.col-dl").First().Text())
		results = append(results, t)
	})
	return results
}
