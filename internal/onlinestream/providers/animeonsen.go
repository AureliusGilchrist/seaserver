package onlinestream_providers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

// AnimeOnsen is an onlinestream provider for animeonsen.xyz: Japanese audio with soft subtitles
// (ASS, from the original releases), 720p, as MPEG-DASH. Its API takes a bearer token from an
// OAuth client-credentials login with the site's public app credentials, the ones the Aniyomi
// extension and the animestream app (frostnova721/animestream) use —
//
//	auth.animeonsen.xyz/oauth/token            the token (good for a week)
//	api.animeonsen.xyz/v4/search/{query}       search
//	api.animeonsen.xyz/v4/content/{id}/episodes the episode list
//	api.animeonsen.xyz/v4/content/{id}/video/{n} the stream and the subtitles of an episode
type AnimeOnsen struct {
	API       string
	Auth      string
	Site      string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger

	mu      sync.Mutex
	token   string
	expires time.Time
}

const AnimeOnsenProvider string = "animeonsen"

const (
	animeOnsenClientID     = "f296be26-28b5-4358-b5a1-6259575e23b7"
	animeOnsenClientSecret = "349038c4157d0480784753841217270c3c5b35f4281eaee029de21cb04084235"
)

func NewAnimeOnsen(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &AnimeOnsen{
		API:       "https://api.animeonsen.xyz",
		Auth:      "https://auth.animeonsen.xyz",
		Site:      "https://www.animeonsen.xyz",
		Client:    &http.Client{Timeout: 25 * time.Second},
		UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
		logger:    logger,
	}
}

func (p *AnimeOnsen) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"animeonsen"},
		SupportsDub:    false,
	}
}

// bearer is the API token, logged in again an hour before it runs out.
func (p *AnimeOnsen) bearer() (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.token != "" && time.Now().Add(time.Hour).Before(p.expires) {
		return p.token, nil
	}
	form := url.Values{
		"client_id":     {animeOnsenClientID},
		"client_secret": {animeOnsenClientSecret},
		"grant_type":    {"client_credentials"},
	}
	req, err := http.NewRequest("POST", p.Auth+"/oauth/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", p.UserAgent)
	resp, err := p.Client.Do(req)
	if err != nil {
		return "", fmt.Errorf("animeonsen: login failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("animeonsen: login returned %d", resp.StatusCode)
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil || tok.AccessToken == "" {
		return "", fmt.Errorf("animeonsen: no token in the login answer")
	}
	p.token = tok.AccessToken
	p.expires = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)
	return p.token, nil
}

// get fetches an API path. A 404 is "not there", not an error: it comes back as (nil, nil).
func (p *AnimeOnsen) get(path string) ([]byte, error) {
	token, err := p.bearer()
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("GET", p.API+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Referer", p.Site+"/")
	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	switch resp.StatusCode {
	case http.StatusOK:
		return body, nil
	case http.StatusNotFound:
		return nil, nil
	case http.StatusUnauthorized:
		p.mu.Lock()
		p.token = ""
		p.mu.Unlock()
	}
	return nil, fmt.Errorf("animeonsen: %s returned %d", path, resp.StatusCode)
}

func (p *AnimeOnsen) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	query := strings.TrimSpace(strings.ReplaceAll(opts.Query, "-", " "))
	if query == "" {
		query = opts.Media.RomajiTitle
	}
	if query == "" {
		return nil, nil
	}
	body, err := p.get("/v4/search/" + url.PathEscape(query))
	if err != nil || body == nil {
		return nil, err
	}
	var res struct {
		Result []struct {
			ContentID      string `json:"content_id"`
			ContentTitle   string `json:"content_title"`
			ContentTitleEn string `json:"content_title_en"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("animeonsen: search is not JSON: %w", err)
	}
	out := make([]*hibikeonlinestream.SearchResult, 0, len(res.Result)*2)
	for _, r := range res.Result {
		if r.ContentID == "" {
			continue
		}
		// Both titles are offered so a match on either the English or the romaji title counts.
		for _, title := range []string{r.ContentTitleEn, r.ContentTitle} {
			if title == "" {
				continue
			}
			out = append(out, &hibikeonlinestream.SearchResult{
				ID:       r.ContentID,
				Title:    title,
				URL:      p.Site + "/details/" + r.ContentID,
				SubOrDub: hibikeonlinestream.Sub,
			})
		}
	}
	return out, nil
}

func (p *AnimeOnsen) FindEpisodes(id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	body, err := p.get("/v4/content/" + url.PathEscape(id) + "/episodes")
	if err != nil {
		return nil, err
	}
	if body == nil {
		return nil, ErrSourceNotFound
	}
	var eps map[string]struct {
		TitleEn string `json:"contentTitle_episode_en"`
	}
	if err := json.Unmarshal(body, &eps); err != nil {
		return nil, fmt.Errorf("animeonsen: episode list is not JSON: %w", err)
	}
	out := make([]*hibikeonlinestream.EpisodeDetails, 0, len(eps))
	for key, ep := range eps {
		n, err := strconv.Atoi(key)
		if err != nil || n <= 0 {
			continue
		}
		out = append(out, &hibikeonlinestream.EpisodeDetails{
			Provider: AnimeOnsenProvider,
			ID:       id + "/" + key,
			Number:   n,
			URL:      p.Site + "/watch/" + id + "?episode=" + key,
			Title:    ep.TitleEn,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Number < out[j].Number })
	return out, nil
}

func (p *AnimeOnsen) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, _ string) (*hibikeonlinestream.EpisodeServer, error) {
	i := strings.LastIndex(episode.ID, "/")
	if i <= 0 {
		return nil, fmt.Errorf("animeonsen: episode id is malformed: %q", episode.ID)
	}
	contentID, number := episode.ID[:i], episode.ID[i+1:]
	body, err := p.get("/v4/content/" + url.PathEscape(contentID) + "/video/" + url.PathEscape(number))
	if err != nil {
		return nil, err
	}
	if body == nil {
		return nil, ErrSourceNotFound
	}
	var res struct {
		URI struct {
			Stream    string            `json:"stream"`
			Subtitles map[string]string `json:"subtitles"`
		} `json:"uri"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("animeonsen: video answer is not JSON: %w", err)
	}
	if res.URI.Stream == "" {
		return nil, ErrSourceNotFound
	}
	var subs []*hibikeonlinestream.VideoSubtitle
	if u := res.URI.Subtitles["en-US"]; u != "" {
		subs = append(subs, &hibikeonlinestream.VideoSubtitle{ID: "en-US", URL: u, Language: "English", IsDefault: true})
	}
	token, err := p.bearer()
	if err != nil {
		return nil, err
	}
	return &hibikeonlinestream.EpisodeServer{
		Provider: AnimeOnsenProvider,
		Server:   "animeonsen",
		// The subtitles need the token; the video CDN only the Referer, and takes the token too.
		Headers: map[string]string{
			"Referer":       p.Site + "/",
			"User-Agent":    p.UserAgent,
			"Authorization": "Bearer " + token,
		},
		VideoSources: []*hibikeonlinestream.VideoSource{{
			URL:       res.URI.Stream,
			Type:      hibikeonlinestream.VideoSourceUnknown,
			Quality:   "720p",
			Subtitles: subs,
		}},
	}, nil
}
