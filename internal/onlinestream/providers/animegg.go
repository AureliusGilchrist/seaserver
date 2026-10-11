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

// AnimeGG is an onlinestream provider for animegg.org.
//
// Plain server-rendered HTML, no scripts needed:
//
//	search    /search/?q=…                 → a.mse links to /series/{slug}
//	episodes  /series/{slug}               → a.anm_det_pop links to /{slug}-episode-{n}
//	episode   /{slug}-episode-{n}          → one iframe per version, "subbed" and "dubbed"
//	embed     /embed/{id}                  → a `videoSources` array of direct MP4s per quality
//
// Sub and dub are two versions of the same page, so the dub is chosen when the episode is fetched,
// not when it is listed. The search result carries a "/dub" suffix when a dub was asked for.
type AnimeGG struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const AnimeGGProvider string = "animegg"

func NewAnimeGG(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &AnimeGG{
		Url:       "https://www.animegg.org",
		Client:    &http.Client{Timeout: time.Second * 20},
		UserAgent: util.GetRandomUserAgent(),
		logger:    logger,
	}
}

var (
	animeggEpisodeRe = regexp.MustCompile(`episode-(\d+)$`)
	animeggSourceRe  = regexp.MustCompile(`file:\s*"([^"]+)"\s*,\s*label:\s*"([^"]*)"`)
)

func (p *AnimeGG) get(rawUrl, referer string) ([]byte, error) {
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
		return nil, fmt.Errorf("animegg: unexpected status %s", resp.Status)
	}
	return io.ReadAll(resp.Body)
}

func (p *AnimeGG) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"default"},
		SupportsDub:    true,
	}
}

func (p *AnimeGG) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	p.logger.Debug().Str("query", opts.Query).Msg("animegg: Searching anime")

	suffix := ""
	if opts.Dub {
		suffix = "/dub"
	}

	seen := make(map[string]struct{})
	ret := make([]*hibikeonlinestream.SearchResult, 0)

	for _, q := range azSearchQueries(opts) {
		body, err := p.get(fmt.Sprintf("%s/search/?q=%s", p.Url, url.QueryEscape(q)), p.Url+"/")
		if err != nil {
			continue
		}
		doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
		if err != nil {
			continue
		}

		doc.Find("a.mse").Each(func(_ int, s *goquery.Selection) {
			href, _ := s.Attr("href")
			slug := strings.TrimPrefix(href, "/series/")
			if slug == "" || slug == href {
				return
			}
			if _, ok := seen[slug]; ok {
				return
			}
			seen[slug] = struct{}{}

			title := strings.TrimSpace(s.Find("h2").First().Text())
			// Alternative titles sit in the same card; they let the caller's title matching see the
			// english name even when the site's own title is the romaji one.
			s.Find("div").EachWithBreak(func(_ int, d *goquery.Selection) bool {
				text := strings.TrimSpace(d.Text())
				if strings.HasPrefix(text, "Alt Titles") {
					alt := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(text, "Alt Titles"), ":"))
					if alt != "" {
						title = title + " / " + alt
					}
					return false
				}
				return true
			})

			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:       slug + suffix,
				Title:    title,
				URL:      p.Url + href,
				SubOrDub: dubOrSub(opts.Dub),
			})
		})
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("anime not found")
	}
	return ret, nil
}

func dubOrSub(dub bool) hibikeonlinestream.SubOrDub {
	if dub {
		return hibikeonlinestream.Dub
	}
	return hibikeonlinestream.Sub
}

func (p *AnimeGG) FindEpisodes(id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	p.logger.Debug().Str("id", id).Msg("animegg: Getting episode list")

	slug := strings.TrimSuffix(id, "/dub")
	version := "subbed"
	if strings.HasSuffix(id, "/dub") {
		version = "dubbed"
	}

	body, err := p.get(fmt.Sprintf("%s/series/%s", p.Url, slug), p.Url+"/")
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	seen := make(map[int]struct{})
	ret := make([]*hibikeonlinestream.EpisodeDetails, 0)

	doc.Find("a.anm_det_pop").Each(func(_ int, s *goquery.Selection) {
		href, _ := s.Attr("href")
		path := strings.TrimPrefix(href, "/")
		m := animeggEpisodeRe.FindStringSubmatch(path)
		if m == nil {
			return
		}
		number, _ := strconv.Atoi(m[1])
		if _, ok := seen[number]; ok {
			return
		}
		seen[number] = struct{}{}

		ret = append(ret, &hibikeonlinestream.EpisodeDetails{
			Provider: AnimeGGProvider,
			ID:       path + "#" + version,
			Number:   number,
			URL:      p.Url + href,
			Title:    strings.TrimSpace(s.Parent().Find("i.anititle").First().Text()),
		})
	})

	if len(ret) == 0 {
		return nil, fmt.Errorf("no episodes found")
	}

	sort.Slice(ret, func(i, j int) bool { return ret[i].Number < ret[j].Number })
	return ret, nil
}

func (p *AnimeGG) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	p.logger.Debug().Str("id", episode.ID).Msg("animegg: Getting episode sources")

	path, version, _ := strings.Cut(episode.ID, "#")
	if version == "" {
		version = "subbed"
	}
	pageUrl := fmt.Sprintf("%s/%s", p.Url, path)

	body, err := p.get(pageUrl, p.Url+"/")
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	embed, ok := doc.Find(fmt.Sprintf(`div[id^="%s-"] iframe`, version)).First().Attr("src")
	if !ok || embed == "" {
		return nil, ErrSourceNotFound
	}
	if strings.HasPrefix(embed, "/") {
		embed = p.Url + embed
	}

	embedBody, err := p.get(embed, pageUrl)
	if err != nil {
		return nil, err
	}

	matches := animeggSourceRe.FindAllStringSubmatch(string(embedBody), -1)
	if len(matches) == 0 {
		return nil, ErrSourceNotFound
	}

	sources := make([]*hibikeonlinestream.VideoSource, 0, len(matches))
	for _, m := range matches {
		file := html.UnescapeString(m[1])
		if strings.HasPrefix(file, "/") {
			file = p.Url + file
		}
		sources = append(sources, &hibikeonlinestream.VideoSource{
			URL:     file,
			Type:    hibikeonlinestream.VideoSourceMP4,
			Quality: m[2],
		})
	}

	// Highest quality first.
	sort.SliceStable(sources, func(i, j int) bool {
		return animeggQuality(sources[i].Quality) > animeggQuality(sources[j].Quality)
	})

	return &hibikeonlinestream.EpisodeServer{
		Provider:     AnimeGGProvider,
		Server:       "default",
		Headers:      map[string]string{"Referer": embed},
		VideoSources: sources,
	}, nil
}

func animeggQuality(label string) int {
	n, _ := strconv.Atoi(strings.TrimSuffix(label, "p"))
	return n
}
