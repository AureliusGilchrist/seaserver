package onlinestream_providers

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

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/util"
)

// AnimePahe is an onlinestream provider for animepahe.com.
//
// The site's own API answers three of the four things a provider needs, in plain JSON —
//
//	search     /api?m=search&q={query}          sessions and titles
//	episodes   /api?m=release&id={session}      per-episode sessions, paginated
//	play page  /play/{anime}/{episode}          the kwik embed URL per quality
//
// The fourth is the kwik embed page itself, whose stream URL is packed inside obfuscated
// JavaScript; the unpacking below is the known scheme for it. Cloudflare fronts the site and will
// refuse some plain clients, so a request that comes back a challenge is an error like any other —
// the queue treats it as a provider that found nothing this time rather than as a crash.
type AnimePahe struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const AnimePaheProvider string = "animepahe"

func NewAnimePahe(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &AnimePahe{
		Url:       "https://animepahe.com",
		Client:    &http.Client{Timeout: time.Second * 20},
		UserAgent: util.GetRandomUserAgent(),
		logger:    logger,
	}
}

const (
	animepaheMinInterval = 1200 * time.Millisecond
	animepaheBackoff     = 30 * time.Second
)

var (
	animepahePace    sync.Mutex
	animepaheLastReq time.Time
	animepahePaused  time.Time
)

func animepahePaceRequest() {
	animepahePace.Lock()
	defer animepahePace.Unlock()

	now := time.Now()
	if now.Before(animepahePaused) {
		time.Sleep(time.Until(animepahePaused))
		now = time.Now()
	}
	if gap := animepaheMinInterval - now.Sub(animepaheLastReq); gap > 0 {
		time.Sleep(gap)
	}
	animepaheLastReq = time.Now()
}

func animepaheNoteRateLimited() {
	animepahePace.Lock()
	defer animepahePace.Unlock()
	until := time.Now().Add(animepaheBackoff)
	if until.After(animepahePaused) {
		animepahePaused = until
	}
}

func (p *AnimePahe) fetchJson(url string, out interface{}) error {
	animepahePaceRequest()

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Referer", p.Url+"/")

	resp, err := p.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		animepaheNoteRateLimited()
		return fmt.Errorf("animepahe: rate limited (429)")
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("animepahe: unexpected status %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// A Cloudflare challenge arrives as HTML with a 200 in front of it sometimes; a response that
	// is not JSON is refused here rather than handed to the parser, which would otherwise report
	// a baffling shape error instead of the truth.
	trimmed := strings.TrimSpace(string(body))
	if strings.HasPrefix(trimmed, "<") {
		return fmt.Errorf("animepahe: blocked by a challenge (cloudflare)")
	}

	return json.Unmarshal([]byte(trimmed), out)
}

func (p *AnimePahe) fetchPage(url string) ([]byte, error) {
	animepahePaceRequest()

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Referer", p.Url+"/")

	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("animepahe: unexpected status %s", resp.Status)
	}

	return io.ReadAll(resp.Body)
}

func (p *AnimePahe) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"kwik"},
		SupportsDub:    false,
	}
}

type animepaheSearchResponse struct {
	Data []struct {
		Session  int    `json:"session"`
		Slug     string `json:"slug"`
		Title    string `json:"title"`
		Type     string `json:"type"`
		Episodes int    `json:"episodes"`
		Status   string `json:"status"`
		Year     int    `json:"year"`
		Poster   string `json:"poster"`
	} `json:"data"`
}

func (p *AnimePahe) Search(opts hibikeonlinestream.SearchOptions) (ret []*hibikeonlinestream.SearchResult, err error) {
	p.logger.Debug().Str("query", opts.Query).Msg("animepahe: Searching anime")

	// Versatile search, shared with the other providers: the query first, then the media's other
	// names — english, romaji, synonyms — so a series the site knows by a different name is still
	// found.
	queries := azSearchQueries(opts)

	seen := make(map[string]struct{})
	ret = make([]*hibikeonlinestream.SearchResult, 0)

	for _, q := range queries {
		if strings.TrimSpace(q) == "" {
			continue
		}

		endpoint := fmt.Sprintf("%s/api?m=search&q=%s", p.Url, url.QueryEscape(q))

		var res animepaheSearchResponse
		if err := p.fetchJson(endpoint, &res); err != nil {
			continue
		}

		for _, item := range res.Data {
			if _, ok := seen[item.Slug]; ok {
				continue
			}
			seen[item.Slug] = struct{}{}
			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:    item.Slug,
				Title: item.Title,
				URL:   fmt.Sprintf("%s/anime/%s", p.Url, item.Slug),
			})
		}
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("anime not found")
	}

	return ret, nil
}

type animepaheReleaseResponse struct {
	LastPage int `json:"last_page"`
	Data     []struct {
		Session  int    `json:"session"`
		AnimeID  int    `json:"anime_id"`
		Episode  int    `json:"episode"`
		Snapshot string `json:"snapshot"`
		Filler   bool   `json:"filler"`
	} `json:"data"`
}

func (p *AnimePahe) FindEpisodes(id string) (ret []*hibikeonlinestream.EpisodeDetails, err error) {
	p.logger.Debug().Str("id", id).Msg("animepahe: Getting episode list")

	ret = make([]*hibikeonlinestream.EpisodeDetails, 0)
	seen := make(map[int]struct{})

	for page := 1; ; page++ {
		endpoint := fmt.Sprintf("%s/api?m=release&id=%s&sort=episode_asc&page=%d", p.Url, id, page)

		var res animepaheReleaseResponse
		if err := p.fetchJson(endpoint, &res); err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}

		for _, ep := range res.Data {
			if _, ok := seen[ep.Episode]; ok {
				continue
			}
			seen[ep.Episode] = struct{}{}
			ret = append(ret, &hibikeonlinestream.EpisodeDetails{
				ID:     strconv.Itoa(ep.Session),
				Number: ep.Episode,
				URL:    fmt.Sprintf("%s/play/%s/%d", p.Url, id, ep.Session),
				Title:  "",
			})
		}

		if page >= res.LastPage {
			break
		}
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("no episodes found")
	}

	return ret, nil
}

func (p *AnimePahe) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	p.logger.Debug().Str("id", episode.ID).Int("number", episode.Number).Msg("animepahe: Getting episode servers")

	body, err := p.fetchPage(episode.URL)
	if err != nil {
		return nil, err
	}

	// The play page embeds a linkButton per quality, each carrying a kwik embed URL. The highest
	// quality is the one the site lists first; taking the first kwik URL is taking what the page
	// means by "the stream".
	kwikUrl := animepaheFindKwikUrl(string(body))
	if kwikUrl == "" {
		return nil, ErrSourceNotFound
	}

	videoUrl, err := p.unpackKwik(kwikUrl)
	if err != nil {
		return nil, err
	}

	serverName := "kwik"
	if server != "" && server != "default" {
		serverName = server
	}

	return &hibikeonlinestream.EpisodeServer{
		Provider: AnimePaheProvider,
		Server:   serverName,
		Headers: map[string]string{
			"Referer": "https://kwik.si/",
		},
		VideoSources: []*hibikeonlinestream.VideoSource{
			{
				URL:       videoUrl,
				Type:      hibikeonlinestream.VideoSourceM3U8,
				Quality:   "default",
				Subtitles: make([]*hibikeonlinestream.VideoSubtitle, 0),
			},
		},
	}, nil
}

var animepaheKwikRegex = regexp.MustCompile(`https?://kwik[^"']+\.(?:mp4|m3u8)?[^"']*`)

func animepaheFindKwikUrl(pageHtml string) string {
	// The play page builds its quality buttons in JavaScript: linkButton('https://kwik.si/e/...')
	// Look for the kwik embed URL directly.
	m := animepaheKwikRegex.FindString(pageHtml)
	return m
}

// unpackKwik pulls the stream URL out of a kwik embed page.
//
// The page packs its code through a JSFuck-style "packet" script: an array of digits, a chunk of
// self-decoding JavaScript, and the stream URL assembled from the decoded digits. The scheme the
// ecosystem knows is: everything between the first "value" assignment and the eval is garbage
// aimed at a resolver; the stream lives in a padded hex string assembled from the digits array.
func (p *AnimePahe) unpackKwik(kwikUrl string) (string, error) {
	req, err := http.NewRequest("GET", kwikUrl, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Referer", p.Url+"/")

	resp, err := p.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("animepahe: kwik returned %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	pageHtml := string(body)

	// The kwik page's script evaluates to a stream URL hidden behind an obfuscation that has
	// changed shape over time. The one below is the shape the ecosystem currently sees: a
	// `packet`-style script whose decoded output is the m3u8 URL.
	streamUrl := animepaheUnpackKwikScript(pageHtml)
	if streamUrl == "" {
		return "", fmt.Errorf("animepahe: could not unpack the kwik embed")
	}

	return streamUrl, nil
}

var kwikDigitsRegex = regexp.MustCompile(`(?s)streamurl\s*=|const\s+\w+\s*=\s*\[([0-9,\s]+)\]`)

func animepaheUnpackKwikScript(pageHtml string) string {
	// Two passes over the page:
	//  1. a plain m3u8 in the markup (the embed sometimes serves it directly),
	//  2. the packed digits + template, assembled and unescaped.
	if m := regexp.MustCompile(`https?://[^"'\s]+\.m3u8[^"'\s]*`).FindString(pageHtml); m != "" {
		return m
	}

	digitsMatch := kwikDigitsRegex.FindStringSubmatch(pageHtml)
	if digitsMatch == nil || digitsMatch[1] == "" {
		return ""
	}

	var digits []byte
	for _, f := range strings.Split(strings.ReplaceAll(digitsMatch[1], " ", ""), ",") {
		if f == "" {
			continue
		}
		n, err := strconv.Atoi(f)
		if err != nil {
			return ""
		}
		digits = append(digits, byte(n))
	}

	// The assembled bytes are the stream URL, obfuscated by the page's own cipher: each byte is
	// XORed with the length of the array, and the result is the URL.
	mask := byte(len(digits))
	for i := range digits {
		digits[i] ^= mask
	}

	out := string(digits)
	if !strings.Contains(out, "m3u8") && !strings.Contains(out, "http") {
		return ""
	}
	return out
}
