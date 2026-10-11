package onlinestream_providers

import (
	"bytes"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/util"
)

// KickAssAnime is an onlinestream provider for kaa.lt.
//
//	search    POST /api/fsearch {"query"}                    → result[] with slug, title, title_en
//	episodes  GET  /api/show/{slug}/episodes?ep=&lang=       → paged list of {slug, episode_number}
//	episode   GET  /api/show/{slug}/episode/ep-{n}-{slug}    → servers[] of player page URLs
//	player    GET  the VidStreaming server URL               → manifest (HLS) and subtitles, inside
//	                                                           an Astro island's props attribute
//
// A dub is the same show under the en-US language, so it is chosen with the lang parameter. Only the
// VidStreaming server is used: the other is DASH, which the player cannot play.
type KickAssAnime struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const KickAssAnimeProvider string = "kickassanime"

func NewKickAssAnime(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &KickAssAnime{
		Url:       "https://kaa.lt",
		Client:    &http.Client{Timeout: time.Second * 20},
		UserAgent: util.GetRandomUserAgent(),
		logger:    logger,
	}
}

const (
	kaaSubLang = "ja-JP"
	kaaDubLang = "en-US"
)

var (
	kaaManifestRe = regexp.MustCompile(`"manifest":\[0,"([^"]+)"\]`)
	kaaSubtitleRe = regexp.MustCompile(`"language":\[0,"([^"]*)"\],"name":\[0,"([^"]*)"\],"src":\[0,"([^"]+)"\]`)
	kaaPropsRe    = regexp.MustCompile(`props="([^"]*manifest[^"]*)"`)
)

func (p *KickAssAnime) do(method, rawUrl string, payload []byte, referer string) ([]byte, error) {
	var body io.Reader
	if payload != nil {
		body = bytes.NewReader(payload)
	}
	req, err := http.NewRequest(method, rawUrl, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Accept", "application/json, text/html, */*")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if referer == "" {
		referer = p.Url + "/"
	}
	req.Header.Set("Referer", referer)

	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kickassanime: unexpected status %s", resp.Status)
	}
	return io.ReadAll(resp.Body)
}

func (p *KickAssAnime) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"default"},
		SupportsDub:    true,
	}
}

func (p *KickAssAnime) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	p.logger.Debug().Str("query", opts.Query).Msg("kickassanime: Searching anime")

	suffix := ""
	if opts.Dub {
		suffix = "/dub"
	}

	seen := make(map[string]struct{})
	ret := make([]*hibikeonlinestream.SearchResult, 0)

	for _, q := range azSearchQueries(opts) {
		payload, _ := json.Marshal(map[string]string{"query": q})
		body, err := p.do("POST", p.Url+"/api/fsearch", payload, "")
		if err != nil {
			continue
		}

		var res struct {
			Result []struct {
				Slug    string   `json:"slug"`
				Title   string   `json:"title"`
				TitleEn string   `json:"title_en"`
				Locales []string `json:"locales"`
			} `json:"result"`
		}
		if err := json.Unmarshal(body, &res); err != nil {
			continue
		}

		for _, item := range res.Result {
			if _, ok := seen[item.Slug]; ok {
				continue
			}
			if opts.Dub && !containsString(item.Locales, kaaDubLang) {
				continue
			}
			seen[item.Slug] = struct{}{}

			title := item.Title
			if item.TitleEn != "" && item.TitleEn != item.Title {
				title = item.Title + " / " + item.TitleEn
			}
			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:       item.Slug + suffix,
				Title:    title,
				URL:      fmt.Sprintf("%s/%s", p.Url, item.Slug),
				SubOrDub: dubOrSub(opts.Dub),
			})
		}
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("anime not found")
	}
	return ret, nil
}

func containsString(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

type kaaEpisodePage struct {
	Pages []struct {
		Number int `json:"number"`
	} `json:"pages"`
	Result []struct {
		Slug          string `json:"slug"`
		Title         string `json:"title"`
		EpisodeNumber int    `json:"episode_number"`
	} `json:"result"`
}

func (p *KickAssAnime) FindEpisodes(id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	p.logger.Debug().Str("id", id).Msg("kickassanime: Getting episode list")

	slug := strings.TrimSuffix(id, "/dub")
	lang := kaaSubLang
	if strings.HasSuffix(id, "/dub") {
		lang = kaaDubLang
	}

	fetchPage := func(page int) (*kaaEpisodePage, error) {
		endpoint := fmt.Sprintf("%s/api/show/%s/episodes?ep=1&lang=%s&page=%d", p.Url, slug, lang, page)
		body, err := p.do("GET", endpoint, nil, "")
		if err != nil {
			return nil, err
		}
		var res kaaEpisodePage
		if err := json.Unmarshal(body, &res); err != nil {
			return nil, fmt.Errorf("kickassanime: could not parse episodes: %w", err)
		}
		return &res, nil
	}

	first, err := fetchPage(1)
	if err != nil {
		return nil, err
	}

	pages := []*kaaEpisodePage{first}
	for n := 2; n <= len(first.Pages); n++ {
		next, err := fetchPage(n)
		if err != nil {
			p.logger.Warn().Err(err).Int("page", n).Msg("kickassanime: Failed to fetch episode page")
			break
		}
		pages = append(pages, next)
	}

	seen := make(map[int]struct{})
	ret := make([]*hibikeonlinestream.EpisodeDetails, 0)
	for _, pg := range pages {
		for _, ep := range pg.Result {
			if _, ok := seen[ep.EpisodeNumber]; ok {
				continue
			}
			seen[ep.EpisodeNumber] = struct{}{}
			ret = append(ret, &hibikeonlinestream.EpisodeDetails{
				Provider: KickAssAnimeProvider,
				ID:       fmt.Sprintf("%s|ep-%d-%s|%s", slug, ep.EpisodeNumber, ep.Slug, lang),
				Number:   ep.EpisodeNumber,
				URL:      fmt.Sprintf("%s/%s/ep-%d-%s", p.Url, slug, ep.EpisodeNumber, ep.Slug),
				Title:    ep.Title,
			})
		}
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("no episodes found")
	}

	sort.Slice(ret, func(i, j int) bool { return ret[i].Number < ret[j].Number })
	return ret, nil
}

func (p *KickAssAnime) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	p.logger.Debug().Str("id", episode.ID).Msg("kickassanime: Getting episode sources")

	parts := strings.Split(episode.ID, "|")
	if len(parts) != 3 {
		return nil, fmt.Errorf("kickassanime: episode id is malformed")
	}
	slug, epPath, lang := parts[0], parts[1], parts[2]

	endpoint := fmt.Sprintf("%s/api/show/%s/episode/%s?lang=%s", p.Url, slug, epPath, url.QueryEscape(lang))
	body, err := p.do("GET", endpoint, nil, "")
	if err != nil {
		return nil, err
	}

	var res struct {
		Servers []struct {
			Name string `json:"name"`
			Src  string `json:"src"`
		} `json:"servers"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("kickassanime: could not parse episode: %w", err)
	}

	playerUrl := ""
	for _, s := range res.Servers {
		if strings.EqualFold(s.Name, "VidStreaming") {
			playerUrl = s.Src
			break
		}
	}
	if playerUrl == "" {
		return nil, ErrSourceNotFound
	}

	pu, err := url.Parse(playerUrl)
	if err != nil {
		return nil, err
	}
	origin := pu.Scheme + "://" + pu.Host + "/"

	page, err := p.do("GET", playerUrl, nil, p.Url+"/")
	if err != nil {
		return nil, err
	}

	// The player's data is the island's props attribute, HTML-escaped JSON.
	propsMatch := kaaPropsRe.FindSubmatch(page)
	if propsMatch == nil {
		return nil, ErrSourceNotFound
	}
	props := html.UnescapeString(string(propsMatch[1]))

	manifest := kaaManifestRe.FindStringSubmatch(props)
	if manifest == nil {
		return nil, ErrSourceNotFound
	}

	subtitles := make([]*hibikeonlinestream.VideoSubtitle, 0)
	for i, m := range kaaSubtitleRe.FindAllStringSubmatch(props, -1) {
		subtitles = append(subtitles, &hibikeonlinestream.VideoSubtitle{
			ID:        fmt.Sprintf("%d", i),
			URL:       m[3],
			Language:  m[2],
			IsDefault: m[1] == "en",
		})
	}

	return &hibikeonlinestream.EpisodeServer{
		Provider: KickAssAnimeProvider,
		Server:   "default",
		Headers:  map[string]string{"Referer": origin, "Origin": strings.TrimSuffix(origin, "/")},
		VideoSources: []*hibikeonlinestream.VideoSource{{
			URL:       manifest[1],
			Type:      hibikeonlinestream.VideoSourceM3U8,
			Quality:   "auto",
			Subtitles: subtitles,
		}},
	}, nil
}
