package onlinestream_providers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/util"
)

// GogoanimeBy is an onlinestream provider for gogoanime.by (english subs only).
//
//	search    /?s=…                    → article.bs a links to /series/{slug}/
//	episodes  /series/{slug}/          → .episode-item[data-episode-number] a
//	episode   /{slug}-episode-{n}-…/   → li.player-type-link[data-src] points at /player/?source=…
//	player    /player/?source=…        → a JW Player page carrying a `sources` array of direct MP4s
type GogoanimeBy struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const GogoanimeByProvider string = "gogoanime-by"

func NewGogoanimeBy(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &GogoanimeBy{
		Url:       "https://gogoanime.by",
		Client:    &http.Client{Timeout: time.Second * 20},
		UserAgent: util.GetRandomUserAgent(),
		logger:    logger,
	}
}

var gogoByPlayerSourcesRe = regexp.MustCompile(`(?s)var\s+sources\s*=\s*(\[.*?\])\s*;`)

func (p *GogoanimeBy) get(rawUrl, referer string) ([]byte, error) {
	req, err := http.NewRequest("GET", rawUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,*/*")
	if referer != "" {
		req.Header.Set("Referer", referer)
	}

	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gogoanime-by: unexpected status %s", resp.Status)
	}
	return io.ReadAll(resp.Body)
}

func (p *GogoanimeBy) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"default"},
		SupportsDub:    false,
	}
}

func (p *GogoanimeBy) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	p.logger.Debug().Str("query", opts.Query).Msg("gogoanime-by: Searching anime")

	// The site only carries english subs.
	if opts.Dub {
		return nil, fmt.Errorf("anime not found")
	}

	seen := make(map[string]struct{})
	ret := make([]*hibikeonlinestream.SearchResult, 0)

	for _, q := range azSearchQueries(opts) {
		body, err := p.get(fmt.Sprintf("%s/?s=%s", p.Url, url.QueryEscape(q)), p.Url+"/")
		if err != nil {
			continue
		}
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
		if err != nil {
			continue
		}

		doc.Find("article.bs a[href*='/series/']").Each(func(_ int, s *goquery.Selection) {
			href, _ := s.Attr("href")
			slug := strings.Trim(strings.TrimPrefix(href, p.Url+"/series/"), "/")
			if slug == "" || strings.Contains(slug, "/") || strings.Contains(slug, "?") {
				return
			}
			if _, ok := seen[slug]; ok {
				return
			}
			seen[slug] = struct{}{}

			title := strings.TrimSpace(s.Find("h2").First().Text())
			if title == "" {
				title, _ = s.Attr("title")
			}
			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:       slug,
				Title:    title,
				URL:      href,
				SubOrDub: hibikeonlinestream.Sub,
			})
		})
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("anime not found")
	}
	return ret, nil
}

func (p *GogoanimeBy) FindEpisodes(id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	p.logger.Debug().Str("id", id).Msg("gogoanime-by: Getting episode list")

	body, err := p.get(fmt.Sprintf("%s/series/%s/", p.Url, id), p.Url+"/")
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	seen := make(map[int]struct{})
	ret := make([]*hibikeonlinestream.EpisodeDetails, 0)

	doc.Find(".episode-item").Each(func(_ int, s *goquery.Selection) {
		number, err := strconv.Atoi(strings.TrimSpace(s.AttrOr("data-episode-number", "")))
		if err != nil {
			return
		}
		href, ok := s.Find("a").First().Attr("href")
		if !ok || href == "" {
			return
		}
		if _, dup := seen[number]; dup {
			return
		}
		seen[number] = struct{}{}

		ret = append(ret, &hibikeonlinestream.EpisodeDetails{
			Provider: GogoanimeByProvider,
			ID:       strings.TrimPrefix(href, p.Url),
			Number:   number,
			URL:      href,
		})
	})

	if len(ret) == 0 {
		return nil, fmt.Errorf("no episodes found")
	}

	sort.Slice(ret, func(i, j int) bool { return ret[i].Number < ret[j].Number })
	return ret, nil
}

type gogoByPlayerSource struct {
	File  string `json:"file"`
	Type  string `json:"type"`
	Label string `json:"label"`
}

func (p *GogoanimeBy) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	p.logger.Debug().Str("id", episode.ID).Msg("gogoanime-by: Getting episode sources")

	pageUrl := p.Url + episode.ID
	body, err := p.get(pageUrl, p.Url+"/")
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	var players []string
	doc.Find(".player-type-link[data-src]").Each(func(_ int, s *goquery.Selection) {
		if src := s.AttrOr("data-src", ""); src != "" {
			players = append(players, src)
		}
	})
	if len(players) == 0 {
		return nil, ErrSourceNotFound
	}

	sources := make([]*hibikeonlinestream.VideoSource, 0)
	referer := pageUrl
	for _, player := range players {
		playerBody, err := p.get(player, pageUrl)
		if err != nil {
			continue
		}
		m := gogoByPlayerSourcesRe.FindStringSubmatch(string(playerBody))
		if m == nil {
			continue
		}
		var parsed []gogoByPlayerSource
		if err := json.Unmarshal([]byte(m[1]), &parsed); err != nil {
			continue
		}
		for _, s := range parsed {
			if s.File == "" {
				continue
			}
			t := videoSourceTypeForUrl(s.File)
			if strings.EqualFold(s.Type, "mp4") {
				t = hibikeonlinestream.VideoSourceMP4
			}
			sources = append(sources, &hibikeonlinestream.VideoSource{
				URL:     s.File,
				Type:    t,
				Quality: s.Label,
			})
		}
		if len(sources) > 0 {
			referer = player
			break
		}
	}

	if len(sources) == 0 {
		return nil, ErrSourceNotFound
	}

	sort.SliceStable(sources, func(i, j int) bool {
		return animeggQuality(sources[i].Quality) > animeggQuality(sources[j].Quality)
	})

	return &hibikeonlinestream.EpisodeServer{
		Provider:     GogoanimeByProvider,
		Server:       "default",
		Headers:      map[string]string{"Referer": referer},
		VideoSources: sources,
	}, nil
}
