package onlinestream_providers

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/goccy/go-json"
	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/util"
)

// AniZone is an onlinestream provider for anizone.to.
//
// The site is server-rendered by Laravel Livewire, which is convenient here: the three things a
// provider needs are each readable straight out of the HTML it already sends —
//
//	search     /anime?search={query}   results embedded as a JSON array in the page's Alpine state
//	episodes   /anime/{slug}           episode list embedded the same way
//	sources    /anime/{slug}/{number}  the player's props as JSON, with the m3u8 and subtitles in it
//
// Episode numbers double as the episode slugs the site's URLs use (/anime/{slug}/{number}), and the
// player's props carry the stream and its subtitle tracks. The streams answer to a plain GET with no
// referer, so nothing special is needed to play them.
type AniZone struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const AniZoneProvider string = "anizone"

func NewAniZone(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &AniZone{
		Url:       "https://anizone.to",
		Client:    &http.Client{Timeout: time.Second * 15},
		UserAgent: util.GetRandomUserAgent(),
		logger:    logger,
	}
}

const (
	anizoneMinInterval = 700 * time.Millisecond
	anizoneBackoff     = 15 * time.Second
)

var (
	anizonePace    sync.Mutex
	anizoneLastReq time.Time
	anizonePaused  time.Time
)

func anizonePaceRequest() {
	anizonePace.Lock()
	defer anizonePace.Unlock()

	now := time.Now()
	if now.Before(anizonePaused) {
		time.Sleep(time.Until(anizonePaused))
		now = time.Now()
	}
	if gap := anizoneMinInterval - now.Sub(anizoneLastReq); gap > 0 {
		time.Sleep(gap)
	}
	anizoneLastReq = time.Now()
}

func anizoneNoteRateLimited() {
	anizonePace.Lock()
	defer anizonePace.Unlock()
	until := time.Now().Add(anizoneBackoff)
	if until.After(anizonePaused) {
		anizonePaused = until
	}
}

func (a *AniZone) fetch(url string) ([]byte, error) {
	anizonePaceRequest()

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", a.UserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := a.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		anizoneNoteRateLimited()
		a.logger.Warn().Dur("pausing", anizoneBackoff).
			Msg("anizone: Rate limited, pausing all requests to the site")
		return nil, fmt.Errorf("anizone: rate limited (429)")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anizone: unexpected status %s", resp.Status)
	}

	return io.ReadAll(resp.Body)
}

func (a *AniZone) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"default"},
		SupportsDub:    false,
	}
}

// azItem is one element of the JSON arrays the site embeds in its pages' Alpine state.
type azItem struct {
	Slug         string            `json:"slug"`
	Url          string            `json:"url"`
	Cover        string            `json:"cover"`
	MainTitle    string            `json:"main_title"`
	TitleList    map[string]string `json:"title_list"`
	EpisodeCount int               `json:"episode_count"`
	StartYear    int               `json:"start_year"`
	Summary      string            `json:"summary"`
	AirDate      string            `json:"air_date"`
}

// azUnescape undoes the escaping AniZone's pages apply to their embedded JSON.
//
// The payloads arrive as `JSON.parse('[{...}]')` with the structural quotes written as
// backslash-u0022 (and apostrophes as backslash-u0027) and the path separators as \/ — the
// escaping json_encode of an HTML attribute produces. The quote escapes in particular sit where
// the delimiters belong, and a parser handed escaped delimiters rejects the document outright.
func azUnescape(raw string) string {
	// Written as interpreted literals rather than entity text, so the sequence that reaches this
	// function is matched byte for byte: the payload's quotes are the six characters
	// backslash-u-0-0-2-2, and its apostrophes backslash-u-0-0-2-7.
	raw = strings.ReplaceAll(raw, "\\u0022", "\"")
	raw = strings.ReplaceAll(raw, "\\u0027", "'")
	// The doubled form first, so a single pass does not leave a stray backslash behind.
	raw = strings.ReplaceAll(raw, "\\\\/", "/")
	raw = strings.ReplaceAll(raw, "\\/", "/")
	return raw
}

// azExtractJsonArray pulls the JSON array an AniZone page embeds in its Alpine state.
//
// Anchored on the binding that carries it (`items: JSON.parse(`) rather than on the first
// JSON.parse in the document: the pages build several components this way, and the one that comes
// first is not always the one holding the results.
//
// Read with a streaming decoder rather than a closing-substring search: the array's end is wherever
// the JSON value ends, which a `]')` lookup only guesses at — the pages nest objects (tags, title
// lists) and the first `]')` after the start is not reliably the array's.
func azExtractJsonArray(html string) ([]azItem, error) {
	raw, err := azExtractEmbedded(html, "items: JSON.parse('")
	if err != nil {
		return nil, err
	}

	dec := json.NewDecoder(strings.NewReader(raw))
	var items []azItem
	if err := dec.Decode(&items); err != nil {
		return nil, fmt.Errorf("anizone: could not parse the embedded data: %w", err)
	}
	return items, nil
}

// azExtractEmbedded returns everything after the marker, unescaped, so the caller can read one JSON
// value out of it with a decoder. Falls back to the bare JSON.parse marker when the anchored one is
// absent (the site's markup has changed shape before, and a page that moved the binding should
// still be readable).
func azExtractEmbedded(html string, marker string) (string, error) {
	idx := strings.Index(html, marker)
	if idx == -1 {
		marker = "JSON.parse('"
		idx = strings.Index(html, marker)
	}
	if idx == -1 {
		return "", fmt.Errorf("anizone: could not find the embedded data in the page")
	}
	rest := html[idx+len(marker):]

	// The value starts at its first bracket, whatever sits between the call and it.
	start := strings.IndexAny(rest, "[{")
	if start == -1 {
		return "", fmt.Errorf("anizone: embedded data is truncated")
	}

	return azUnescape(rest[start:]), nil
}

var (
	ErrAniZoneNoAnime    = fmt.Errorf("anime not found")
	ErrAniZoneNoEpisodes = fmt.Errorf("no episodes found")
)

func (a *AniZone) Search(opts hibikeonlinestream.SearchOptions) (ret []*hibikeonlinestream.SearchResult, err error) {
	a.logger.Debug().Str("query", opts.Query).Msg("anizone: Searching anime")

	// Versatile search: the query first, then the media's other names — english, romaji, and the
	// synonyms AniList keeps. A series is often known to the site by a name the caller did not
	// send, and one of its other names is the difference between finding it and not.
	queries := azSearchQueries(opts)

	seen := make(map[string]struct{})
	ret = make([]*hibikeonlinestream.SearchResult, 0)

	for _, q := range queries {
		if strings.TrimSpace(q) == "" {
			continue
		}

		url := fmt.Sprintf("%s/anime?search=%s", a.Url, strings.ReplaceAll(q, " ", "+"))

		body, err := a.fetch(url)
		if err != nil {
			continue
		}

		items, err := azExtractJsonArray(string(body))
		if err != nil {
			continue
		}

		for _, item := range items {
			if item.Slug == "" {
				continue
			}
			if _, ok := seen[item.Slug]; ok {
				continue
			}
			seen[item.Slug] = struct{}{}
			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:    item.Slug,
				Title: item.MainTitle,
				URL:   fmt.Sprintf("%s/anime/%s", a.Url, item.Slug),
			})
		}
	}

	if len(ret) == 0 {
		return nil, ErrAniZoneNoAnime
	}

	return ret, nil
}

// azSearchQueries builds the list of names a search is tried under: the query the caller sent
// first, then the media's english title, romaji title, and synonyms — deduplicated, so a series
// whose names overlap is not searched for twice.
func azSearchQueries(opts hibikeonlinestream.SearchOptions) []string {
	queries := make([]string, 0, 2+len(opts.Media.Synonyms))
	add := func(q string) {
		q = strings.TrimSpace(q)
		if q == "" {
			return
		}
		for _, existing := range queries {
			if strings.EqualFold(existing, q) {
				return
			}
		}
		queries = append(queries, q)
	}

	add(opts.Query)
	if opts.Media.EnglishTitle != nil {
		add(*opts.Media.EnglishTitle)
	}
	add(opts.Media.RomajiTitle)
	for _, syn := range opts.Media.Synonyms {
		add(syn)
	}

	return queries
}

func (a *AniZone) FindEpisodes(id string) (ret []*hibikeonlinestream.EpisodeDetails, err error) {
	a.logger.Debug().Str("id", id).Msg("anizone: Getting episode list")

	url := fmt.Sprintf("%s/anime/%s", a.Url, id)
	body, err := a.fetch(url)
	if err != nil {
		return nil, err
	}

	items, err := azExtractJsonArray(string(body))
	if err != nil {
		return nil, ErrAniZoneNoEpisodes
	}

	ret = make([]*hibikeonlinestream.EpisodeDetails, 0, len(items))
	for _, item := range items {
		number, _ := strconv.Atoi(item.Slug)
		if number == 0 && item.Slug != "0" {
			// The slug is the episode number; anything that is not one is not an episode.
			continue
		}
		title := item.MainTitle
		if len(item.TitleList) > 0 {
			// English first, then whatever the site has — the same order the page prefers it in.
			if en, ok := item.TitleList["1"]; ok && en != "" {
				title = en
			}
		}
		ret = append(ret, &hibikeonlinestream.EpisodeDetails{
			ID:     strconv.Itoa(number),
			Number: number,
			URL:    fmt.Sprintf("%s/anime/%s/%d", a.Url, id, number),
			Title:  title,
		})
	}

	if len(ret) == 0 {
		return nil, ErrAniZoneNoEpisodes
	}

	return ret, nil
}

// azPlayerProps is the player's props object an episode page embeds.
type azPlayerProps struct {
	Src       string `json:"src"`
	Subtitles []struct {
		Title    string `json:"title"`
		Format   string `json:"format"`
		Language string `json:"language"`
		Default  bool   `json:"default"`
		File     string `json:"file"`
	} `json:"subtitles"`
}

// azExtractPlayerProps pulls the player's JSON props out of an episode page.
//
// Anchored on the player's own call — the episode page embeds an episode list the same way, and the
// list comes first in the document, so the unanchored first JSON.parse is the wrong one.
func azExtractPlayerProps(html string) (*azPlayerProps, error) {
	raw, err := azExtractEmbedded(html, "vidstackPlayer(JSON.parse('")
	if err != nil {
		return nil, err
	}

	dec := json.NewDecoder(strings.NewReader(raw))
	var props azPlayerProps
	if err := dec.Decode(&props); err != nil {
		return nil, fmt.Errorf("anizone: could not parse the player's data: %w", err)
	}
	return &props, nil
}

func (a *AniZone) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	a.logger.Debug().Str("id", episode.ID).Int("number", episode.Number).Msg("anizone: Getting episode servers")

	body, err := a.fetch(episode.URL)
	if err != nil {
		return nil, err
	}

	props, err := azExtractPlayerProps(string(body))
	if err != nil || props.Src == "" {
		return nil, ErrSourceNotFound
	}

	videoSources := make([]*hibikeonlinestream.VideoSource, 0)
	videoSources = append(videoSources, &hibikeonlinestream.VideoSource{
		URL:     props.Src,
		Type:    hibikeonlinestream.VideoSourceM3U8,
		Quality: "default",
		Subtitles: func() []*hibikeonlinestream.VideoSubtitle {
			subs := make([]*hibikeonlinestream.VideoSubtitle, 0, len(props.Subtitles))
			for _, s := range props.Subtitles {
				if s.File == "" {
					continue
				}
				subs = append(subs, &hibikeonlinestream.VideoSubtitle{
					ID:        base64.StdEncoding.EncodeToString([]byte(s.File)),
					URL:       s.File,
					Language:  s.Language,
					IsDefault: s.Default,
				})
			}
			return subs
		}(),
	})

	serverName := "default"
	if server != "" {
		serverName = server
	}

	return &hibikeonlinestream.EpisodeServer{
		Provider:     AniZoneProvider,
		Server:       serverName,
		Headers:      map[string]string{"Referer": a.Url + "/"},
		VideoSources: videoSources,
	}, nil
}

// requestPage fetches a whole page and parses it — kept for the tests and for anything that needs
// to look at the markup itself rather than the embedded data.
func (a *AniZone) requestPage(url string) (*goquery.Document, error) {
	body, err := a.fetch(url)
	if err != nil {
		return nil, err
	}
	return goquery.NewDocumentFromReader(strings.NewReader(string(body)))
}
