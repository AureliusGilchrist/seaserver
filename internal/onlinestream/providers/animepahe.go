package onlinestream_providers

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
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
const animePaheBaseURL = "https://animepahe.pw"

func NewAnimePahe(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &AnimePahe{
		Url:       animePaheBaseURL,
		Client:    &http.Client{Timeout: time.Second * 20},
		UserAgent: util.GetSharedUserAgent(),
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

	status, body, err := animepaheGet(p.Client, url, p.UserAgent, "application/json, text/plain, */*", p.Url+"/")
	if err != nil {
		return err
	}
	if status == http.StatusTooManyRequests {
		animepaheNoteRateLimited()
		return fmt.Errorf("animepahe: rate limited (429)")
	}
	if status == http.StatusForbidden {
		return animepaheBlockedError()
	}
	if status != http.StatusOK {
		return fmt.Errorf("animepahe: unexpected status %d", status)
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

	status, body, err := animepaheGet(p.Client, url, p.UserAgent, "", p.Url+"/")
	if err != nil {
		return nil, err
	}
	if status == http.StatusTooManyRequests {
		animepaheNoteRateLimited()
		return nil, fmt.Errorf("animepahe: rate limited (429)")
	}
	if status == http.StatusForbidden {
		return nil, animepaheBlockedError()
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("animepahe: unexpected status %d", status)
	}
	return body, nil
}

// animepaheBlockedError explains a 403: Cloudflare's check, passed or expired.
func animepaheBlockedError() error {
	if GetAnimePaheClearance() == nil {
		return fmt.Errorf("animepahe: 403 blocked by Cloudflare's check; unlock AnimePahe on the En Masse page")
	}
	return fmt.Errorf("animepahe: 403 blocked by Cloudflare's check; the saved clearance has expired or does not match, unlock AnimePahe again")
}

func (p *AnimePahe) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"kwik"},
		SupportsDub:    false,
	}
}

// animepaheValue reads a JSON field the site has sent both as a number and as a string.
type animepaheValue string

func (v *animepaheValue) UnmarshalJSON(b []byte) error {
	t := strings.TrimSpace(string(b))
	if t == "null" {
		*v = ""
		return nil
	}
	if strings.HasPrefix(t, "\"") {
		var str string
		if err := json.Unmarshal(b, &str); err != nil {
			return err
		}
		*v = animepaheValue(str)
		return nil
	}
	*v = animepaheValue(t)
	return nil
}

func (v animepaheValue) Float() float64 {
	f, _ := strconv.ParseFloat(string(v), 64)
	return f
}

type animepaheSearchResponse struct {
	Data []struct {
		ID       animepaheValue `json:"id"`
		Session  animepaheValue `json:"session"`
		Title    string         `json:"title"`
		Type     string         `json:"type"`
		Episodes animepaheValue `json:"episodes"`
		Year     animepaheValue `json:"year"`
	} `json:"data"`
}

func (p *AnimePahe) Search(opts hibikeonlinestream.SearchOptions) (ret []*hibikeonlinestream.SearchResult, err error) {
	p.logger.Debug().Str("query", opts.Query).Msg("animepahe: Searching anime")

	// Versatile search, shared with the other providers: the query first, then the media's other
	// names — english, romaji, synonyms — so a series the site knows by a different name is still
	// found.
	queries := mediaSearchQueries(opts)

	seen := make(map[string]struct{})
	ret = make([]*hibikeonlinestream.SearchResult, 0)
	var lastSearchError error

	for _, q := range queries {
		if strings.TrimSpace(q) == "" {
			continue
		}

		endpoint := fmt.Sprintf("%s/api?m=search&q=%s", p.Url, url.QueryEscape(q))

		var res animepaheSearchResponse
		if err := p.fetchJson(endpoint, &res); err != nil {
			lastSearchError = err
			// Refused outright (403, a Cloudflare check): every other name would be refused too.
			if l := err.Error(); strings.Contains(l, "403") || strings.Contains(l, "challenge") {
				break
			}
			continue
		}

		for _, item := range res.Data {
			id := string(item.Session)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:    id,
				Title: item.Title,
				URL:   fmt.Sprintf("%s/anime/%s", p.Url, id),
			})
		}
	}

	if len(ret) == 0 {
		if lastSearchError != nil {
			return nil, fmt.Errorf("animepahe: search failed: %w", lastSearchError)
		}
		return nil, fmt.Errorf("anime not found")
	}

	return ret, nil
}

type animepaheReleaseResponse struct {
	LastPage animepaheValue `json:"last_page"`
	Data     []struct {
		Session animepaheValue `json:"session"`
		Episode animepaheValue `json:"episode"`
		Title   string         `json:"title"`
	} `json:"data"`
}

func (p *AnimePahe) FindEpisodes(id string) (ret []*hibikeonlinestream.EpisodeDetails, err error) {
	p.logger.Debug().Str("id", id).Msg("animepahe: Getting episode list")

	type release struct {
		session string
		number  float64
		title   string
	}
	var releases []release
	seen := make(map[float64]struct{})

	for page := 1; page <= 100; page++ {
		endpoint := fmt.Sprintf("%s/api?m=release&id=%s&sort=episode_asc&page=%d", p.Url, url.QueryEscape(id), page)

		var res animepaheReleaseResponse
		if err := p.fetchJson(endpoint, &res); err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}

		for _, ep := range res.Data {
			n := ep.Episode.Float()
			if ep.Session == "" || n <= 0 {
				continue
			}
			if _, ok := seen[n]; ok {
				continue
			}
			seen[n] = struct{}{}
			releases = append(releases, release{session: string(ep.Session), number: n, title: ep.Title})
		}

		if float64(page) >= res.LastPage.Float() {
			break
		}
	}

	// A later season is often numbered on from the one before (13, 14, ...): renumber from 1 so
	// the episodes line up with the season's own list. Half episodes (recaps, "12.5") are left out.
	offset := 0
	if len(releases) > 0 {
		lowest := releases[0].number
		for _, r := range releases {
			if r.number < lowest {
				lowest = r.number
			}
		}
		if lowest > 1 && lowest == float64(int(lowest)) {
			offset = int(lowest) - 1
		}
	}

	ret = make([]*hibikeonlinestream.EpisodeDetails, 0, len(releases))
	for _, r := range releases {
		if r.number != float64(int(r.number)) {
			continue
		}
		ret = append(ret, &hibikeonlinestream.EpisodeDetails{
			ID:     r.session,
			Number: int(r.number) - offset,
			URL:    fmt.Sprintf("%s/play/%s/%s", p.Url, id, r.session),
			Title:  r.title,
		})
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

	// The way Seanime's own AnimePahe provider did it: every release on the play page (each
	// resolution and fansub, Japanese and English audio) becomes a source of its own, labelled
	// "1080p - SubsPlease" and "(Eng)" for the English audio. The audio asked for comes first,
	// highest resolution first.
	buttons := animepaheKwikButtons(string(body), server == "dub")
	if len(buttons) == 0 {
		return nil, ErrSourceNotFound
	}

	sources := make([]*hibikeonlinestream.VideoSource, 0, len(buttons))
	headers := map[string]string{}
	var lastErr error
	for i, b := range buttons {
		if i >= animepaheMaxSources {
			break
		}
		videoUrl, err := p.unpackKwik(b.url)
		if err != nil {
			lastErr = err
			continue
		}
		if len(headers) == 0 {
			headers["Referer"] = animepaheKwikOrigin(b.url) + "/"
			headers["Origin"] = animepaheKwikOrigin(b.url)
		}
		sources = append(sources, &hibikeonlinestream.VideoSource{
			URL:       videoUrl,
			Type:      hibikeonlinestream.VideoSourceM3U8,
			Quality:   b.label(),
			Subtitles: make([]*hibikeonlinestream.VideoSubtitle, 0),
		})
	}
	if len(sources) == 0 {
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, ErrSourceNotFound
	}

	serverName := "kwik"
	if server != "" && server != "default" {
		serverName = server
	}
	return &hibikeonlinestream.EpisodeServer{
		Provider:     AnimePaheProvider,
		Server:       serverName,
		Headers:      headers,
		VideoSources: sources,
	}, nil
}

// animepaheMaxSources caps how many releases of one episode are unpacked (each is a request).
const animepaheMaxSources = 8

// animepaheButton is one release on the play page.
type animepaheButton struct {
	url        string
	resolution int
	audio      string
	fansub     string
	av1        bool
}

func (b animepaheButton) label() string {
	l := "default"
	if b.resolution > 0 {
		l = fmt.Sprintf("%dp", b.resolution)
	}
	if b.fansub != "" {
		l += " - " + b.fansub
	}
	if b.av1 {
		l += " (AV1)"
	}
	if b.audio == "eng" {
		l += " (Eng)"
	}
	return l
}

// animepaheKwikButtons lists the play page's releases: the audio asked for first (Japanese,
// English for dub), then by resolution, H.264 before AV1; the other audio after.
func animepaheKwikButtons(pageHtml string, dub bool) []animepaheButton {
	want := "jpn"
	if dub {
		want = "eng"
	}
	var out []animepaheButton
	seen := map[string]bool{}
	for _, m := range animepaheButtonRegex.FindAllStringSubmatch(pageHtml, -1) {
		if seen[m[1]] {
			continue
		}
		seen[m[1]] = true
		attrs := map[string]string{}
		for _, a := range animepaheAttrRegex.FindAllStringSubmatch(m[0], -1) {
			attrs[a[1]] = a[2]
		}
		res, _ := strconv.Atoi(attrs["resolution"])
		out = append(out, animepaheButton{url: m[1], resolution: res, audio: attrs["audio"], fansub: attrs["fansub"], av1: attrs["av1"] == "1"})
	}
	if len(out) == 0 {
		if u := animepaheKwikRegex.FindString(pageHtml); u != "" {
			out = append(out, animepaheButton{url: u})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		wi, wj := out[i].audio == want || out[i].audio == "", out[j].audio == want || out[j].audio == ""
		if wi != wj {
			return wi
		}
		if out[i].resolution != out[j].resolution {
			return out[i].resolution > out[j].resolution
		}
		return !out[i].av1 && out[j].av1
	})
	return out
}

var (
	animepaheButtonRegex = regexp.MustCompile(`<[^>]*data-src="(https?://kwik[^"]+)"[^>]*>`)
	animepaheAttrRegex   = regexp.MustCompile(`data-([a-z0-9]+)="([^"]*)"`)
	animepaheKwikRegex   = regexp.MustCompile(`https?://kwik[^"'\s<>]+/e/[^"'\s<>]+`)
)

// animepaheBestKwik picks the stream from the play page: one button per release, each with its
// kwik embed, resolution and audio language. The highest resolution in Japanese wins (English
// when dub is asked for), preferring H.264 over AV1, which more players handle.
func animepaheBestKwik(pageHtml string, dub bool) (string, int) {
	buttons := animepaheKwikButtons(pageHtml, dub)
	if len(buttons) == 0 {
		return "", 0
	}
	return buttons[0].url, buttons[0].resolution
}

func animepaheKwikOrigin(kwikUrl string) string {
	if u, err := url.Parse(kwikUrl); err == nil && u.Host != "" {
		return u.Scheme + "://" + u.Host
	}
	return "https://kwik.si"
}

// unpackKwik pulls the stream URL out of a kwik embed page.
//
// The page packs its code through a JSFuck-style "packet" script: an array of digits, a chunk of
// self-decoding JavaScript, and the stream URL assembled from the decoded digits. The scheme the
// ecosystem knows is: everything between the first "value" assignment and the eval is garbage
// aimed at a resolver; the stream lives in a padded hex string assembled from the digits array.
func (p *AnimePahe) unpackKwik(kwikUrl string) (string, error) {
	animepahePaceRequest()
	status, body, err := animepaheGet(p.Client, kwikUrl, p.UserAgent, "", p.Url+"/")
	if err != nil {
		return "", err
	}
	if status == http.StatusTooManyRequests {
		animepaheNoteRateLimited()
		return "", fmt.Errorf("animepahe: kwik rate limited (429)")
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("animepahe: kwik returned status %d", status)
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

var (
	animepahePackedRegex = regexp.MustCompile(`(?s)\}\('((?:\\.|[^'\\])*)',\s*(\d+),\s*(\d+),\s*'((?:\\.|[^'\\])*)'\.split\('\|'\)`)
	animepaheWordRegex   = regexp.MustCompile(`\b\w+\b`)
	animepaheSourceRegex = regexp.MustCompile(`(?:source|src|file)\s*[=:]\s*['"](https?://[^'"]+\.m3u8[^'"]*)['"]`)
	animepaheM3U8Regex   = regexp.MustCompile(`https?://[^"'\s\\]+\.m3u8[^"'\s\\]*`)
)

// animepaheUnpackKwikScript finds the stream in a kwik embed page. The page hides it in a script
// run through the classic JavaScript packer — eval(function(p,a,c,k,e,d){...}('payload', radix,
// count, 'word|word|...'.split('|'))) — which replaces every word of the payload by the
// dictionary entry its base-radix number names. Undoing that gives "const source='...m3u8'".
func animepaheUnpackKwikScript(pageHtml string) string {
	for _, m := range animepahePackedRegex.FindAllStringSubmatch(pageHtml, -1) {
		radix, _ := strconv.Atoi(m[2])
		words := strings.Split(m[4], "|")
		unpacked := animepaheUnpack(unescapeJS(m[1]), radix, words)
		if sm := animepaheSourceRegex.FindStringSubmatch(unpacked); sm != nil {
			return sm[1]
		}
		if u := animepaheM3U8Regex.FindString(unpacked); u != "" {
			return u
		}
	}
	// Served in the clear.
	if sm := animepaheSourceRegex.FindStringSubmatch(pageHtml); sm != nil {
		return sm[1]
	}
	return animepaheM3U8Regex.FindString(pageHtml)
}

func animepaheUnpack(payload string, radix int, words []string) string {
	if radix < 2 || radix > 62 {
		return payload
	}
	return animepaheWordRegex.ReplaceAllStringFunc(payload, func(w string) string {
		n, ok := parseBase(w, radix)
		if !ok || n >= len(words) || words[n] == "" {
			return w
		}
		return words[n]
	})
}

const packerAlphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

func parseBase(w string, radix int) (int, bool) {
	n := 0
	for _, r := range w {
		d := strings.IndexRune(packerAlphabet, r)
		if d < 0 || d >= radix {
			return 0, false
		}
		n = n*radix + d
		if n > 1<<24 {
			return 0, false
		}
	}
	return n, true
}

func unescapeJS(s string) string {
	return strings.NewReplacer(`\'`, `'`, `\"`, `"`, `\\`, `\`).Replace(s)
}
