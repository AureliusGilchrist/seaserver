package torrent_providers

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	hibiketorrent "seanime/internal/extension/hibike/torrent"

	"github.com/mmcdole/gofeed"
)

const (
	NyaaProviderID = "seanime-builtin-nyaa"
	nyaaBaseURL    = "https://nyaa.si"
	// Category 1_2 = Anime - English-translated (video only, excludes music/soundtracks)
	nyaaAnimeCategory = "1_2"
)

// Nyaa implements hibiketorrent.AnimeProvider for nyaa.si
// It uses the RSS feed which provides seeders, leechers, downloads,
// infoHash, size, etc. via custom namespace elements.
type Nyaa struct{}

func NewNyaa() *Nyaa {
	return &Nyaa{}
}

func (n *Nyaa) GetSettings() hibiketorrent.AnimeProviderSettings {
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

func (n *Nyaa) Search(opts hibiketorrent.AnimeSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := searchAllVariants(opts.Media, opts.Query, n.fetchRSS)
	if err != nil {
		return nil, err
	}
	return filterAndRank(results, opts.Media), nil
}

func (n *Nyaa) SmartSearch(opts hibiketorrent.AnimeSmartSearchOptions) ([]*hibiketorrent.AnimeTorrent, error) {
	var suffixParts []string
	if opts.Resolution != "" {
		suffixParts = append(suffixParts, opts.Resolution)
	}
	if opts.EpisodeNumber > 0 {
		suffixParts = append(suffixParts, fmt.Sprintf("%02d", opts.EpisodeNumber))
	}
	if opts.Batch {
		suffixParts = append(suffixParts, "batch")
	}

	results, err := smartSearchAllVariants(opts.Media, opts.Query, strings.Join(suffixParts, " "), n.fetchRSS)
	if err != nil {
		return nil, err
	}

	return filterAndRank(results, opts.Media), nil
}

func (n *Nyaa) GetTorrentInfoHash(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	return torrent.InfoHash, nil
}

func (n *Nyaa) GetTorrentMagnetLink(torrent *hibiketorrent.AnimeTorrent) (string, error) {
	if torrent.MagnetLink != "" {
		return torrent.MagnetLink, nil
	}
	if torrent.InfoHash != "" {
		return fmt.Sprintf("magnet:?xt=urn:btih:%s", torrent.InfoHash), nil
	}
	return "", fmt.Errorf("no magnet link or info hash available")
}

func (n *Nyaa) GetLatest() ([]*hibiketorrent.AnimeTorrent, error) {
	results, err := n.fetchRSS("")
	if err != nil {
		return nil, err
	}
	return filterVideoTorrents(results), nil
}

func (n *Nyaa) fetchRSS(query string) ([]*hibiketorrent.AnimeTorrent, error) {
	getProviderLimiter(NyaaProviderID).Acquire()

	rssURL := fmt.Sprintf("%s/?page=rss&c=%s&f=0", nyaaBaseURL, nyaaAnimeCategory)
	if query != "" {
		rssURL += "&q=" + url.QueryEscape(query)
	}

	fp := gofeed.NewParser()
	feed, err := fp.ParseURL(rssURL)
	if err != nil {
		return nil, fmt.Errorf("nyaa: failed to fetch RSS: %w", err)
	}

	var results []*hibiketorrent.AnimeTorrent
	for _, item := range feed.Items {
		torrent := &hibiketorrent.AnimeTorrent{
			Provider:      NyaaProviderID,
			Name:          item.Title,
			Date:          formatDate(item.PublishedParsed),
			Link:          getGUID(item),
			DownloadUrl:   item.Link, // nyaa RSS <link> is the .torrent download URL
			EpisodeNumber: -1,
		}

		// Parse custom nyaa namespace fields
		if item.Extensions != nil {
			if nyaaExt, ok := item.Extensions["nyaa"]; ok {
				if seeders, ok := nyaaExt["seeders"]; ok && len(seeders) > 0 {
					torrent.Seeders, _ = strconv.Atoi(seeders[0].Value)
				}
				if leechers, ok := nyaaExt["leechers"]; ok && len(leechers) > 0 {
					torrent.Leechers, _ = strconv.Atoi(leechers[0].Value)
				}
				if downloads, ok := nyaaExt["downloads"]; ok && len(downloads) > 0 {
					torrent.DownloadCount, _ = strconv.Atoi(downloads[0].Value)
				}
				if infoHash, ok := nyaaExt["infoHash"]; ok && len(infoHash) > 0 {
					torrent.InfoHash = infoHash[0].Value
				}
				if size, ok := nyaaExt["size"]; ok && len(size) > 0 {
					torrent.FormattedSize = size[0].Value
					torrent.Size = parseNyaaSize(size[0].Value)
				}
			}
		}

		if torrent.InfoHash != "" {
			torrent.MagnetLink = fmt.Sprintf("magnet:?xt=urn:btih:%s&dn=%s", torrent.InfoHash, url.QueryEscape(torrent.Name))
		}

		results = append(results, torrent)
	}

	return results, nil
}

func getGUID(item *gofeed.Item) string {
	if item.GUID != "" {
		return item.GUID
	}
	return item.Link
}

func formatDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}

// parseNyaaSize parses size strings like "1.2 GiB", "500 MiB" into bytes.
func parseNyaaSize(s string) int64 {
	s = strings.TrimSpace(s)
	parts := strings.Fields(s)
	if len(parts) != 2 {
		return 0
	}
	val, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return 0
	}

	switch strings.ToUpper(parts[1]) {
	case "TIB":
		return int64(val * 1024 * 1024 * 1024 * 1024)
	case "GIB":
		return int64(val * 1024 * 1024 * 1024)
	case "MIB":
		return int64(val * 1024 * 1024)
	case "KIB":
		return int64(val * 1024)
	case "B":
		return int64(val)
	default:
		return 0
	}
}
