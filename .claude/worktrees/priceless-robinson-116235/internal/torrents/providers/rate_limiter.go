package torrent_providers

import (
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	hibiketorrent "seanime/internal/extension/hibike/torrent"

	"github.com/anacrolix/torrent/metainfo"
)

// rateLimiter enforces a maximum number of HTTP requests per minute
// per provider. Uses a sliding-window token-bucket approach: up to
// maxPerMinute tokens are available and each consumed token is
// replenished after 1 minute.
type rateLimiter struct {
	mu            sync.Mutex
	maxPerMinute  int
	tokens        int
	replenishChan chan struct{}
}

// providerLimiters holds one rate limiter per provider, keyed by provider ID.
var (
	providerLimitersMu sync.Mutex
	providerLimiters   = map[string]*rateLimiter{}
)

// getProviderLimiter returns (or lazily creates) an 8-req/min rate limiter
// for the given provider ID.
func getProviderLimiter(providerID string) *rateLimiter {
	providerLimitersMu.Lock()
	defer providerLimitersMu.Unlock()
	if rl, ok := providerLimiters[providerID]; ok {
		return rl
	}
	rl := newRateLimiter(8)
	providerLimiters[providerID] = rl
	return rl
}

func newRateLimiter(maxPerMinute int) *rateLimiter {
	return &rateLimiter{
		maxPerMinute:  maxPerMinute,
		tokens:        maxPerMinute,
		replenishChan: make(chan struct{}, maxPerMinute),
	}
}

// Acquire blocks until a token is available, then consumes it.
// The token is automatically replenished after 60 seconds.
func (rl *rateLimiter) Acquire() {
	for {
		rl.mu.Lock()
		if rl.tokens > 0 {
			rl.tokens--
			rl.mu.Unlock()
			// Schedule replenishment
			go func() {
				time.Sleep(60 * time.Second)
				rl.mu.Lock()
				if rl.tokens < rl.maxPerMinute {
					rl.tokens++
				}
				rl.mu.Unlock()
			}()
			return
		}
		rl.mu.Unlock()
		// Poll every 500ms when tokens are exhausted
		time.Sleep(500 * time.Millisecond)
	}
}

// videoExtensions are the video file extensions we require inside a torrent.
var videoExtensions = []string{".mkv", ".mp4", ".avi"}

// filterAndRank applies video filtering and quality ranking to results.
// It's the standard pipeline every Search / SmartSearch / GetLatest should use.
func filterAndRank(torrents []*hibiketorrent.AnimeTorrent, media hibiketorrent.Media) []*hibiketorrent.AnimeTorrent {
	return rankTorrents(filterVideoTorrents(torrents), inferMediaSeason(media))
}

// filterVideoTorrents returns only torrents that contain at least one video file
// (mkv, mp4, or avi) inside the torrent. It downloads and parses the .torrent
// file to inspect actual contents. Falls back to name-based detection if the
// .torrent cannot be fetched/parsed.
func filterVideoTorrents(torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	var out []*hibiketorrent.AnimeTorrent
	for _, t := range torrents {
		if torrentHasVideoFiles(t) {
			out = append(out, t)
		}
	}
	return out
}

// torrentHasVideoFiles checks whether a torrent is an anime video release.
// Rejects audio, manga, games, live-action, and other non-anime content.
// It first tries to download and parse the .torrent file. If that fails, it falls
// back to checking the torrent name for video format indicators.
func torrentHasVideoFiles(t *hibiketorrent.AnimeTorrent) bool {
	// First: reject torrents that are clearly non-anime content by name
	if isNonAnimeContent(t.Name) {
		return false
	}

	// Try to download and parse the .torrent file to check actual contents
	if t.DownloadUrl != "" {
		if has, ok := checkTorrentFileContents(t.DownloadUrl); ok {
			return has
		}
	}

	// Fallback: check the torrent name for video-related keywords
	lower := strings.ToLower(t.Name)
	for _, ext := range videoExtensions {
		if strings.Contains(lower, ext) {
			return true
		}
	}
	// Common anime torrent indicators that imply video content
	for _, kw := range []string{"x264", "x265", "hevc", "avc", "h.264", "h.265", "h264", "h265",
		"av1", "bluray", "bdrip", "bd-rip", "webrip", "web-dl", "dvdrip", "1080p", "720p", "480p",
		"2160p", "4k", "uhd", "10bit", "10-bit"} {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

// audioExtensions lists file extensions for audio-only content.
var audioExtensions = []string{".mp3", ".flac", ".aac", ".ogg", ".opus", ".wav", ".m4a", ".wma", ".alac", ".ape"}

// audioKeywords lists name-level indicators of music / soundtrack releases.
var audioKeywords = []string{
	"soundtrack", "ost", "original sound", "character song",
	"drama cd", "radio cd", "djcd", "dj cd",
	"single", "album", "discography", "music collection",
	"lossless", "flac", "mp3", "aac", "hi-res",
	"vocal", "vocal album", "insert song",
}

// nonAnimeKeywords lists name-level indicators of non-anime content.
var nonAnimeKeywords = []string{
	// Manga / comics / books
	"manga", "light novel", "ln vol", "artbook", "art book",
	"doujinshi", "doujin", "comic", "tankobon", "tankoubon",
	"chapter", "vol.", "scan",
	// Games
	"game", "visual novel", "eroge", "galge", "rpg",
	"pc game", "ps4", "ps5", "psp", "switch", "xbox",
	"rom", "iso", "nsp", "xci",
	// Software / other
	"software", "application", "patch", "crack",
	"font", "plugin",
	// Live action
	"live action", "live-action", "j-drama", "jdrama",
	"k-drama", "kdrama", "tokusatsu",
}

// isNonAnimeContent returns true when the torrent name indicates it is NOT
// anime video content (audio, manga, games, live-action, software, etc).
func isNonAnimeContent(name string) bool {
	lower := strings.ToLower(name)

	// Check for audio file extensions in the name
	for _, ext := range audioExtensions {
		if strings.Contains(lower, ext) {
			return true
		}
	}

	// Check for audio-specific keywords
	for _, kw := range audioKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}

	// Check for non-anime content keywords
	for _, kw := range nonAnimeKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}

	return false
}

// checkTorrentFileContents downloads a .torrent file and checks if it contains
// at least one video file. Returns (hasVideo, ok) where ok indicates whether
// the check was successful.
func checkTorrentFileContents(downloadURL string) (bool, bool) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return false, false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, false
	}

	// Limit read to 10MB to avoid abuse
	lr := io.LimitReader(resp.Body, 10*1024*1024)

	mi, err := metainfo.Load(lr)
	if err != nil {
		return false, false
	}

	info, err := mi.UnmarshalInfo()
	if err != nil {
		return false, false
	}

	// Single-file torrent
	if len(info.Files) == 0 {
		ext := strings.ToLower(filepath.Ext(info.BestName()))
		for _, ve := range videoExtensions {
			if ext == ve {
				return true, true
			}
		}
		return false, true
	}

	// Multi-file torrent
	for _, f := range info.Files {
		if len(f.Path) > 0 {
			ext := strings.ToLower(filepath.Ext(f.Path[len(f.Path)-1]))
			for _, ve := range videoExtensions {
				if ext == ve {
					return true, true
				}
			}
		}
	}

	return false, true
}

// getTitleVariants returns all unique non-empty title variants from a Media object.
// Order: romaji title, english title, then synonyms.
func getTitleVariants(media hibiketorrent.Media) []string {
	seen := make(map[string]struct{})
	var variants []string

	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		lower := strings.ToLower(s)
		if _, exists := seen[lower]; exists {
			return
		}
		seen[lower] = struct{}{}
		variants = append(variants, s)
	}

	add(media.RomajiTitle)
	if media.EnglishTitle != nil {
		add(*media.EnglishTitle)
	}
	for _, syn := range media.Synonyms {
		add(syn)
	}

	return variants
}

// searchAllVariants runs searchFn for every title variant and returns
// deduplicated results. Deduplication is by torrent Link, then InfoHash,
// then Name.
func searchAllVariants(
	media hibiketorrent.Media,
	userQuery string,
	searchFn func(query string) ([]*hibiketorrent.AnimeTorrent, error),
) ([]*hibiketorrent.AnimeTorrent, error) {
	// If the user typed an explicit query, just use that
	if userQuery != "" {
		return searchFn(userQuery)
	}

	variants := getTitleVariants(media)
	if len(variants) == 0 {
		return nil, nil
	}

	seen := make(map[string]struct{})
	var all []*hibiketorrent.AnimeTorrent

	for _, v := range variants {
		results, err := searchFn(v)
		if err != nil {
			continue // try next variant
		}
		for _, t := range results {
			key := t.Link
			if key == "" {
				key = t.InfoHash
			}
			if key == "" {
				key = t.Name
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			all = append(all, t)
		}
	}

	return all, nil
}

// smartSearchAllVariants runs searchFn for every title variant with
// additional filter suffixes appended, and returns deduplicated results.
func smartSearchAllVariants(
	media hibiketorrent.Media,
	userQuery string,
	suffix string,
	searchFn func(query string) ([]*hibiketorrent.AnimeTorrent, error),
) ([]*hibiketorrent.AnimeTorrent, error) {
	// If the user typed an explicit query, build one combined query
	if userQuery != "" {
		q := userQuery
		if suffix != "" {
			q += " " + suffix
		}
		return searchFn(q)
	}

	variants := getTitleVariants(media)
	if len(variants) == 0 {
		return nil, nil
	}

	seen := make(map[string]struct{})
	var all []*hibiketorrent.AnimeTorrent

	for _, v := range variants {
		q := v
		if suffix != "" {
			q += " " + suffix
		}
		results, err := searchFn(q)
		if err != nil {
			continue
		}
		for _, t := range results {
			key := t.Link
			if key == "" {
				key = t.InfoHash
			}
			if key == "" {
				key = t.Name
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			all = append(all, t)
		}
	}

	return all, nil
}

// rankTorrents sorts torrents so the best quality appears first.
// Scoring favours seeders, higher resolution, dual-audio releases,
// "Complete" batches, and correct season matches.
// mediaSeason is the expected season number (0 means season 1 / unknown).
func rankTorrents(torrents []*hibiketorrent.AnimeTorrent, mediaSeason int) []*hibiketorrent.AnimeTorrent {
	if len(torrents) <= 1 {
		return torrents
	}
	sort.SliceStable(torrents, func(i, j int) bool {
		return torrentScore(torrents[i], mediaSeason) > torrentScore(torrents[j], mediaSeason)
	})
	return torrents
}

func torrentScore(t *hibiketorrent.AnimeTorrent, mediaSeason int) int {
	score := 0
	nameLower := strings.ToLower(t.Name)

	// --- seeders (the more the better) ---
	score += t.Seeders * 10

	// --- resolution ---
	res := strings.ToLower(t.Resolution)
	if res == "" {
		res = inferResolution(t.Name)
	}
	switch {
	case strings.Contains(res, "2160") || strings.Contains(res, "4k") || strings.Contains(res, "uhd"):
		score += 4000
	case strings.Contains(res, "1080"):
		score += 3000
	case strings.Contains(res, "720"):
		score += 2000
	case strings.Contains(res, "480"):
		score += 1000
	}

	// --- dual audio ---
	if strings.Contains(nameLower, "dual audio") || strings.Contains(nameLower, "dual.audio") ||
		strings.Contains(nameLower, "multi audio") || strings.Contains(nameLower, "multi.audio") ||
		strings.Contains(nameLower, "dualaudio") {
		score += 2500
	}

	// --- best release flag ---
	if t.IsBestRelease {
		score += 5000
	}

	// --- "Complete" batch boost ---
	if strings.Contains(nameLower, "complete") {
		score += 9001
	}

	// --- season matching ---
	// Determine the expected season: 0 means season 1 (default).
	expected := mediaSeason
	if expected <= 0 {
		expected = 1
	}

	torrentSeason := detectSeasonFromName(t.Name)
	// torrentSeason == 0 means the torrent doesn't mention a season → assume S1.
	if torrentSeason == 0 {
		torrentSeason = 1
	}

	if torrentSeason == expected {
		// Correct season match — boost
		score += 20000
	} else {
		// Season mismatch — heavy penalty
		score -= 10000
	}

	return score
}

// seasonPatterns detects season indicators in torrent names.
// Matches: S01, S1, Season 2, 2nd Season, Season 02, etc.
var seasonPatterns = regexp.MustCompile(
	`(?i)(?:` +
		`\bS(\d{1,2})\b` + // S01, S2
		`|` +
		`(\d{1,2})(?:st|nd|rd|th)\s*season` + // 2nd season
		`|` +
		`season\s*(\d{1,2})` + // season 2, season 02
		`)`,
)

// detectSeasonFromName extracts a season number from a torrent name.
// Returns 0 if no season indicator is found.
func detectSeasonFromName(name string) int {
	m := seasonPatterns.FindStringSubmatch(name)
	if m == nil {
		return 0
	}
	// Groups: m[1]=S##, m[2]=##(st|nd|rd|th), m[3]=season ##
	for _, g := range m[1:] {
		if g != "" {
			n, err := strconv.Atoi(g)
			if err == nil && n > 0 {
				return n
			}
		}
	}
	return 0
}

// inferMediaSeason tries to detect the season number from the media's
// titles (romaji, english, synonyms). Returns 0 if none found (= S1).
func inferMediaSeason(media hibiketorrent.Media) int {
	// Check all title variants
	for _, title := range getTitleVariants(media) {
		if s := detectSeasonFromName(title); s > 0 {
			return s
		}
	}
	return 0
}

func inferResolution(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "2160p") || strings.Contains(lower, "4k") || strings.Contains(lower, "uhd"):
		return "2160p"
	case strings.Contains(lower, "1080p") || strings.Contains(lower, "1080"):
		return "1080p"
	case strings.Contains(lower, "720p") || strings.Contains(lower, "720"):
		return "720p"
	case strings.Contains(lower, "480p") || strings.Contains(lower, "480"):
		return "480p"
	}
	return ""
}
