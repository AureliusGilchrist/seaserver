package torrent_providers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	hibiketorrent "seanime/internal/extension/hibike/torrent"
)

const (
	NekoBTProviderID = "seanime-builtin-nekobt"
	nekoBTBaseURL    = "https://nekobt.to"
)

// NekoBT implements hibiketorrent.AnimeProvider for nekobt.to
// Uses the site's JSON search API (the pages are rendered in the browser).
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

// nekoBTSearchResponse is the part of /api/v1/torrents/search the provider reads. The site is a
// client-rendered app now, so its HTML holds no results; the API is what the page itself calls.
type nekoBTSearchResponse struct {
	Error bool `json:"error"`
	Data  struct {
		Results []struct {
			ID         string `json:"id"`
			UploadedAt int64  `json:"uploaded_at"`
			Title      string `json:"title"`
			InfoHash   string `json:"infohash"`
			Magnet     string `json:"magnet"`
			Filesize   string `json:"filesize"`
			Seeders    string `json:"seeders"`
			Leechers   string `json:"leechers"`
			Completed  string `json:"completed"`
			AudioLang  string `json:"audio_lang"`
			Batch      bool   `json:"batch"`
			Deleted    any    `json:"deleted"`
			Hidden     bool   `json:"hidden"`
		} `json:"results"`
	} `json:"data"`
}

var nekoBTDualAudioRe = regexp.MustCompile(`(?i)dual[\s._-]*audio|\bdual\b|multi[\s._-]*audio`)

func (n *NekoBT) scrapeSearch(query string) ([]*hibiketorrent.AnimeTorrent, error) {
	getProviderLimiter(NekoBTProviderID).Acquire()

	searchURL := nekoBTBaseURL + "/api/v1/torrents/search?limit=100&sort_by=seeders&query=" + url.QueryEscape(query)
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("nekobt: failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nekobt: search failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nekobt: unexpected status code %d", resp.StatusCode)
	}

	var body nekoBTSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("nekobt: bad search response: %w", err)
	}
	if body.Error {
		return nil, fmt.Errorf("nekobt: search returned an error")
	}

	var results []*hibiketorrent.AnimeTorrent
	for _, r := range body.Data.Results {
		if r.Hidden || r.Deleted != nil || r.Title == "" {
			continue
		}
		name := cleanTitle(r.Title)
		// NekoBT records the audio languages; say so in the name when a release with Japanese and
		// English audio does not, so it ranks as dual audio like everywhere else.
		langs := "," + strings.ToLower(r.AudioLang) + ","
		if strings.Contains(langs, ",ja") && strings.Contains(langs, ",en") && !nekoBTDualAudioRe.MatchString(name) {
			name += " [Dual Audio]"
		}
		t := &hibiketorrent.AnimeTorrent{
			Provider:      NekoBTProviderID,
			Name:          name,
			Link:          nekoBTBaseURL + "/torrents/" + r.ID,
			DownloadUrl:   nekoBTBaseURL + "/api/v1/torrents/" + r.ID + "/download?public=true",
			MagnetLink:    r.Magnet,
			InfoHash:      strings.ToLower(r.InfoHash),
			EpisodeNumber: -1,
			IsBatch:       r.Batch,
		}
		t.Size, _ = strconv.ParseInt(r.Filesize, 10, 64)
		if t.Size > 0 {
			t.FormattedSize = formatNekoBTSize(t.Size)
		}
		t.Seeders, _ = strconv.Atoi(r.Seeders)
		t.Leechers, _ = strconv.Atoi(r.Leechers)
		t.DownloadCount, _ = strconv.Atoi(r.Completed)
		if r.UploadedAt > 0 {
			t.Date = time.UnixMilli(r.UploadedAt).UTC().Format(time.RFC3339)
		}
		if t.InfoHash == "" {
			t.InfoHash = extractInfoHashFromMagnet(t.MagnetLink)
		}
		results = append(results, t)
	}
	return results, nil
}

// nekoBTSizeRegex reads a size like "1.2 GiB" (Shana Project uses it too).
var nekoBTSizeRegex = regexp.MustCompile(`(?i)([\d.]+)\s*(TiB|GiB|MiB|KiB|B)`)

func formatNekoBTSize(b int64) string {
	units := []string{"B", "KiB", "MiB", "GiB", "TiB"}
	f := float64(b)
	i := 0
	for f >= 1024 && i < len(units)-1 {
		f /= 1024
		i++
	}
	return fmt.Sprintf("%.2f %s", f, units[i])
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
