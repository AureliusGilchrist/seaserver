package onlinestream_providers

import (
	"fmt"
	"html"
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

// AnimeHeaven is an onlinestream provider for animeheaven.me.
//
//	search    /fastsearch.php?xhr=1&s=…   → a.ac links to /anime.php?{id}
//	episodes  /anime.php?{id}             → one link per episode, each carrying a 32-hex key
//	episode   /gate.php  + cookie key={k} → a <video> with direct MP4 <source> elements
//
// The site is a single English-subtitled catalogue; dubs are separate entries titled "(Dub)", so
// the dub is picked at search time by the title rather than at episode time.
type AnimeHeaven struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const AnimeHeavenProvider string = "animeheaven"

func NewAnimeHeaven(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &AnimeHeaven{
		Url: "https://animeheaven.me",
		// Redirects are not followed for the gate: it answers with the page itself.
		Client:    &http.Client{Timeout: time.Second * 20},
		UserAgent: util.GetSharedUserAgent(),
		logger:    logger,
	}
}

var (
	animeheavenKeyRe    = regexp.MustCompile(`^[0-9a-f]{32}$`)
	animeheavenSourceRe = regexp.MustCompile(`<source\s+src=['"]([^'"]+)['"]`)
)

func animeheavenSourceMatchesEpisode(sourceURL, episodeID string) bool {
	parsedURL, err := url.Parse(sourceURL)
	if err != nil {
		return false
	}
	_, ok := parsedURL.Query()[episodeID]
	return ok
}

func sortAnimeHeavenSources(sources []*hibikeonlinestream.VideoSource, episodeID string) {
	sort.SliceStable(sources, func(i, j int) bool {
		return animeheavenSourceMatchesEpisode(sources[i].URL, episodeID) &&
			!animeheavenSourceMatchesEpisode(sources[j].URL, episodeID)
	})
}

func (p *AnimeHeaven) get(rawUrl string, cookie string) ([]byte, error) {
	req, err := http.NewRequest("GET", rawUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Referer", p.Url+"/")
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("animeheaven: unexpected status %s", resp.Status)
	}
	return io.ReadAll(resp.Body)
}

func (p *AnimeHeaven) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"default"},
		SupportsDub:    true,
	}
}

func (p *AnimeHeaven) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	p.logger.Debug().Str("query", opts.Query).Msg("animeheaven: Searching anime")

	seen := make(map[string]struct{})
	ret := make([]*hibikeonlinestream.SearchResult, 0)

	for _, q := range mediaSearchQueries(opts) {
		body, err := p.get(fmt.Sprintf("%s/fastsearch.php?xhr=1&s=%s", p.Url, url.QueryEscape(q)), "")
		if err != nil {
			continue
		}
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
		if err != nil {
			continue
		}

		doc.Find("a.ac").Each(func(_ int, s *goquery.Selection) {
			href, _ := s.Attr("href")
			id := strings.TrimPrefix(href, "/anime.php?")
			if id == "" || id == href {
				return
			}
			if _, ok := seen[id]; ok {
				return
			}

			title := strings.TrimSpace(s.Find(".fastname").First().Text())
			isDub := strings.Contains(strings.ToLower(title), "(dub)") || strings.Contains(strings.ToLower(title), " dub")
			if isDub != opts.Dub {
				return
			}
			seen[id] = struct{}{}

			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:       id,
				Title:    title,
				URL:      p.Url + href,
				SubOrDub: dubOrSub(isDub),
			})
		})
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("anime not found")
	}
	return ret, nil
}

func (p *AnimeHeaven) FindEpisodes(id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	p.logger.Debug().Str("id", id).Msg("animeheaven: Getting episode list")

	body, err := p.get(fmt.Sprintf("%s/anime.php?%s", p.Url, id), "")
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	seen := make(map[int]struct{})
	ret := make([]*hibikeonlinestream.EpisodeDetails, 0)

	doc.Find("a.c[id]").Each(func(_ int, s *goquery.Selection) {
		key, _ := s.Attr("id")
		key = strings.TrimSpace(key)
		if !animeheavenKeyRe.MatchString(key) {
			return
		}
		number, err := strconv.Atoi(strings.TrimSpace(s.Find(".watch2").First().Text()))
		if err != nil {
			return
		}
		if _, ok := seen[number]; ok {
			return
		}
		seen[number] = struct{}{}

		ret = append(ret, &hibikeonlinestream.EpisodeDetails{
			Provider: AnimeHeavenProvider,
			ID:       key,
			Number:   number,
			URL:      fmt.Sprintf("%s/anime.php?%s", p.Url, id),
		})
	})

	if len(ret) == 0 {
		return nil, fmt.Errorf("no episodes found")
	}

	sort.Slice(ret, func(i, j int) bool { return ret[i].Number < ret[j].Number })
	return ret, nil
}

func (p *AnimeHeaven) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	p.logger.Debug().Str("key", episode.ID).Msg("animeheaven: Getting episode sources")

	if !animeheavenKeyRe.MatchString(episode.ID) {
		return nil, fmt.Errorf("animeheaven: episode id is malformed")
	}

	// The episode is chosen by a cookie, not by the address.
	body, err := p.get(p.Url+"/gate.php", "key="+episode.ID)
	if err != nil {
		return nil, err
	}

	matches := animeheavenSourceRe.FindAllStringSubmatch(string(body), -1)
	sources := make([]*hibikeonlinestream.VideoSource, 0, len(matches))
	seen := make(map[string]struct{})
	for _, m := range matches {
		src := html.UnescapeString(m[1])
		// The "&error" variants are the page's own fallbacks for when the first mirror fails.
		if strings.HasSuffix(src, "&error") || strings.HasSuffix(src, "&error2") {
			continue
		}
		if _, ok := seen[src]; ok {
			continue
		}
		seen[src] = struct{}{}
		sources = append(sources, &hibikeonlinestream.VideoSource{
			URL:     src,
			Type:    hibikeonlinestream.VideoSourceMP4,
			Quality: "default",
		})
	}

	if len(sources) == 0 {
		return nil, ErrSourceNotFound
	}

	sortAnimeHeavenSources(sources, episode.ID)

	return &hibikeonlinestream.EpisodeServer{
		Provider:     AnimeHeavenProvider,
		Server:       "default",
		Headers:      map[string]string{"Referer": p.Url + "/"},
		VideoSources: sources,
	}, nil
}
