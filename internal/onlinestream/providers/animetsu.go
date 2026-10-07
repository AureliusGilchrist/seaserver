package onlinestream_providers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/util"
)

// Animetsu is an onlinestream provider for animetsu.net — the site the GojoWtf extension talks to.
//
// The API is plain JSON, and the four things a provider needs each have their own endpoint —
//
//	search        /v2/api/anime/search?query=…&page=1&year=…
//	episodes      /v2/api/anime/eps/{id}
//	servers       /v2/api/anime/servers/{id}/{episode}
//	sources       /v2/api/anime/oppai/{id}/{episode}?server={server}&source_type=sub|dub
//
// Sources come back relative to the blob domain (swiftstream.top), prefixed with "proxy/" when the
// source itself asks for one. Sub and dub are separate entries on the site, so the dub is the same
// ID with /dub on the end, which is the convention the GojoWtf extension established.
type Animetsu struct {
	Url        string
	BlobDomain string
	Client     *http.Client
	UserAgent  string
	logger     *zerolog.Logger
}

const AnimetsuProvider string = "gojowtf"

func NewAnimetsu(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &Animetsu{
		Url:        "https://animetsu.net",
		BlobDomain: "https://swiftstream.top",
		Client:     &http.Client{Timeout: time.Second * 20},
		UserAgent:  util.GetRandomUserAgent(),
		logger:     logger,
	}
}

const (
	animetsuMinInterval = 700 * time.Millisecond
	animetsuBackoff     = 15 * time.Second
)

var (
	animetsuPace    sync.Mutex
	animetsuLastReq time.Time
	animetsuPaused  time.Time
)

func animetsuPaceRequest() {
	animetsuPace.Lock()
	defer animetsuPace.Unlock()

	now := time.Now()
	if now.Before(animetsuPaused) {
		time.Sleep(time.Until(animetsuPaused))
		now = time.Now()
	}
	if gap := animetsuMinInterval - now.Sub(animetsuLastReq); gap > 0 {
		time.Sleep(gap)
	}
	animetsuLastReq = time.Now()
}

func animetsuNoteRateLimited() {
	animetsuPace.Lock()
	defer animetsuPace.Unlock()
	until := time.Now().Add(animetsuBackoff)
	if until.After(animetsuPaused) {
		animetsuPaused = until
	}
}

func (p *Animetsu) fetch(url string) ([]byte, error) {
	animetsuPaceRequest()

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Referer", p.Url+"/")

	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		animetsuNoteRateLimited()
		return nil, fmt.Errorf("animetsu: rate limited (429)")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("animetsu: unexpected status %s", resp.Status)
	}

	return io.ReadAll(resp.Body)
}

func (p *Animetsu) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"pahe", "zoro", "zaza"},
		SupportsDub:    true,
	}
}

type animetsuSearchResult struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Year     int    `json:"year"`
	Episodes int    `json:"episodes"`
}

func (p *Animetsu) Search(opts hibikeonlinestream.SearchOptions) (ret []*hibikeonlinestream.SearchResult, err error) {
	p.logger.Debug().Str("query", opts.Query).Msg("animetsu: Searching anime")

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

		endpoint := fmt.Sprintf("%s/v2/api/anime/search?query=%s&page=1&year=%d", p.Url, url.QueryEscape(q), opts.Year)

		body, err := p.fetch(endpoint)
		if err != nil {
			continue
		}

		var res struct {
			Data  []animetsuSearchResult `json:"data"`
			Total int                    `json:"total"`
		}
		if err := json.Unmarshal(body, &res); err != nil {
			continue
		}

		for _, item := range res.Data {
			if _, ok := seen[item.ID]; ok {
				continue
			}
			seen[item.ID] = struct{}{}
			ret = append(ret, &hibikeonlinestream.SearchResult{
				ID:    item.ID,
				Title: item.Title,
				URL:   fmt.Sprintf("%s/watch/%s", p.Url, item.ID),
			})
		}
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("anime not found")
	}

	return ret, nil
}

func (p *Animetsu) FindEpisodes(id string) (ret []*hibikeonlinestream.EpisodeDetails, err error) {
	p.logger.Debug().Str("id", id).Msg("animetsu: Getting episode list")

	baseId := strings.Split(id, "/dub")[0]
	baseId = strings.Split(baseId, "/sub")[0]

	endpoint := fmt.Sprintf("%s/v2/api/anime/eps/%s", p.Url, baseId)
	body, err := p.fetch(endpoint)
	if err != nil {
		return nil, err
	}

	var eps []struct {
		ID    string `json:"id"`
		EpNum int    `json:"ep_num"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(body, &eps); err != nil {
		return nil, fmt.Errorf("animetsu: could not parse episodes: %w", err)
	}

	ret = make([]*hibikeonlinestream.EpisodeDetails, 0, len(eps))
	for i, ep := range eps {
		number := ep.EpNum
		if number == 0 {
			number = i + 1
		}
		ret = append(ret, &hibikeonlinestream.EpisodeDetails{
			ID:     fmt.Sprintf("animeid=%s&ep_id=%s", baseId, ep.ID),
			Number: number,
			URL:    "",
			Title:  ep.Name,
		})
	}

	if len(ret) == 0 {
		return nil, fmt.Errorf("no episodes found")
	}

	return ret, nil
}

func (p *Animetsu) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	p.logger.Debug().Str("id", episode.ID).Int("number", episode.Number).Msg("animetsu: Getting episode servers")

	animeId := strings.Split(episode.ID, "&")[0]
	animeId = strings.TrimPrefix(animeId, "animeid=")
	epId := ""
	if parts := strings.Split(episode.ID, "&"); len(parts) > 1 {
		epId = strings.TrimPrefix(parts[1], "ep_id=")
	}
	if epId == "" {
		return nil, fmt.Errorf("animetsu: episode id is malformed")
	}

	serverName := "zaza"
	if server != "" && server != "default" {
		serverName = server
	}

	sourceType := "sub"
	if strings.HasSuffix(episode.ID, "/dub") {
		sourceType = "dub"
	}

	endpoint := fmt.Sprintf("%s/v2/api/anime/oppai/%s/%d?server=%s&source_type=%s", p.Url, animeId, episode.Number, serverName, sourceType)
	body, err := p.fetch(endpoint)
	if err != nil {
		return nil, err
	}

	var res struct {
		Sources []struct {
			URL       string `json:"url"`
			Quality   string `json:"quality"`
			NeedProxy any    `json:"need_proxy"`
			Subtitles []struct {
				URL  string `json:"url"`
				Lang string `json:"lang"`
			} `json:"subtitles"`
		} `json:"sources"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("animetsu: could not parse sources: %w", err)
	}

	if len(res.Sources) == 0 {
		return nil, ErrSourceNotFound
	}

	videoSources := make([]*hibikeonlinestream.VideoSource, 0, len(res.Sources))
	for _, src := range res.Sources {
		if src.URL == "" {
			continue
		}
		fullUrl := p.BlobDomain + "/" + src.URL
		if src.NeedProxy != nil {
			fullUrl = p.BlobDomain + "/proxy/" + src.URL
		}
		subs := make([]*hibikeonlinestream.VideoSubtitle, 0, len(src.Subtitles))
		for i, s := range src.Subtitles {
			if s.URL == "" {
				continue
			}
			subs = append(subs, &hibikeonlinestream.VideoSubtitle{
				ID:        fmt.Sprintf("%d", i),
				URL:       p.BlobDomain + "/" + s.URL,
				Language:  s.Lang,
				IsDefault: len(src.Subtitles) == 1,
			})
		}
		videoSources = append(videoSources, &hibikeonlinestream.VideoSource{
			URL:       fullUrl,
			Type:      videoSourceTypeForUrl(fullUrl),
			Quality:   src.Quality,
			Subtitles: subs,
		})
	}

	if len(videoSources) == 0 {
		return nil, ErrSourceNotFound
	}

	return &hibikeonlinestream.EpisodeServer{
		Provider:     AnimetsuProvider,
		Server:       serverName,
		Headers:      map[string]string{"Referer": p.Url + "/"},
		VideoSources: videoSources,
	}, nil
}

func videoSourceTypeForUrl(u string) hibikeonlinestream.VideoSourceType {
	if strings.Contains(u, ".m3u8") {
		return hibikeonlinestream.VideoSourceM3U8
	}
	if strings.Contains(u, ".mp4") {
		return hibikeonlinestream.VideoSourceMP4
	}
	return hibikeonlinestream.VideoSourceUnknown
}
