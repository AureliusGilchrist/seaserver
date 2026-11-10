package onlinestream_providers

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

// ReAnime is an onlinestream provider for reanime.to. It serves no stream: every episode is the
// release file itself (usually a dual-audio MKV with its subtitle tracks and fonts) on flixcloud,
// downloaded directly. Like MegaPlay it is addressed by AniList ID —
//
//	reanime.to/api/flix/{anilistId}/{episode}     the servers (empty when it lacks the episode)
//	flixcloud.cc/d/{aid}/__data.json              the file id, a download token and the CDN
//	{cdn}/download/{fileId}/progress?token=…      "ready" once the file can be downloaded
//	{cdn}/download/{fileId}?token=…&file=.mkv     the file (a redirect to the storage host)
//
// as the animestream app (frostnova721/animestream) uses them.
type ReAnime struct {
	Url       string
	FlixURL   string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const ReAnimeProvider string = "reanime"

// reAnimeMaxEpisodes bounds the episode probe for an anime whose episode count is unknown.
const reAnimeMaxEpisodes = 3000

func NewReAnime(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &ReAnime{
		Url:       "https://reanime.to",
		FlixURL:   "https://flixcloud.cc",
		Client:    &http.Client{Timeout: 25 * time.Second},
		UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
		logger:    logger,
	}
}

func (p *ReAnime) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"HD-1", "HD-2"},
		SupportsDub:    true,
	}
}

var (
	reAnimePace    sync.Mutex
	reAnimeLastReq time.Time
)

func reAnimePaceRequest() {
	reAnimePace.Lock()
	defer reAnimePace.Unlock()
	if gap := 400*time.Millisecond - time.Since(reAnimeLastReq); gap > 0 {
		time.Sleep(gap)
	}
	reAnimeLastReq = time.Now()
}

func (p *ReAnime) fetch(u string, headers map[string]string) (int, []byte, error) {
	reAnimePaceRequest()
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	return resp.StatusCode, body, err
}

type reAnimeServer struct {
	ServerName string `json:"serverName"`
	DataLink   string `json:"dataLink"`
	DataType   string `json:"dataType"`
}

// servers lists an episode's servers; none when ReAnime does not have it.
func (p *ReAnime) servers(anilistID, episode int) ([]reAnimeServer, error) {
	status, body, err := p.fetch(fmt.Sprintf("%s/api/flix/%d/%d", p.Url, anilistID, episode), map[string]string{
		"Accept":  "application/json, text/plain, */*",
		"Referer": fmt.Sprintf("%s/watch/%d?ep=%d", p.Url, anilistID, episode),
		"Origin":  p.Url,
	})
	if err != nil {
		return nil, err
	}
	if status == http.StatusNotFound {
		return nil, nil
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("reanime: servers returned %d", status)
	}
	var res struct {
		Success bool            `json:"success"`
		Servers []reAnimeServer `json:"servers"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("reanime: servers are not JSON: %w", err)
	}
	out := res.Servers[:0]
	for _, s := range res.Servers {
		if s.DataLink != "" {
			out = append(out, s)
		}
	}
	return out, nil
}

func (p *ReAnime) hasEpisode(anilistID, episode int) (bool, error) {
	s, err := p.servers(anilistID, episode)
	return len(s) > 0, err
}

// Search needs nothing but the AniList ID, as with MegaPlay: the ID carries the episode count
// AniList knows ("387:13"), and "/dub" when the dub was asked for (the file is the same: it
// carries both languages when the release does).
func (p *ReAnime) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
	if opts.Media.ID <= 0 {
		return nil, nil
	}
	id := megaPlayID{anilistID: opts.Media.ID, dub: opts.Dub}
	if opts.Media.EpisodeCount > 0 {
		id.episodes = opts.Media.EpisodeCount
	}
	title := opts.Media.RomajiTitle
	if title == "" && opts.Media.EnglishTitle != nil {
		title = *opts.Media.EnglishTitle
	}
	if title == "" {
		title = opts.Query
	}
	subOrDub := hibikeonlinestream.Sub
	if opts.Dub {
		subOrDub = hibikeonlinestream.Dub
	}
	return []*hibikeonlinestream.SearchResult{{
		ID:       id.String(),
		Title:    title,
		URL:      fmt.Sprintf("%s/watch/%d?ep=1", p.Url, id.anilistID),
		SubOrDub: subOrDub,
	}}, nil
}

// FindEpisodes lists the episodes ReAnime has, checked the way MegaPlay's are: both ends of
// AniList's count, or doubling then halving when the count is unknown.
func (p *ReAnime) FindEpisodes(rawID string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	id, err := parseMegaPlayID(rawID)
	if err != nil {
		return nil, fmt.Errorf("reanime: %w", err)
	}
	ok, err := p.hasEpisode(id.anilistID, 1)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrSourceNotFound
	}
	last := 1
	bisect := func(lo, hi int) (int, error) {
		for hi-lo > 1 {
			mid := (lo + hi) / 2
			ok, err := p.hasEpisode(id.anilistID, mid)
			if err != nil {
				return 0, err
			}
			if ok {
				lo = mid
			} else {
				hi = mid
			}
		}
		return lo, nil
	}
	switch {
	case id.episodes > 1:
		ok, err := p.hasEpisode(id.anilistID, id.episodes)
		if err != nil {
			return nil, err
		}
		if ok {
			last = id.episodes
		} else if last, err = bisect(1, id.episodes); err != nil {
			return nil, err
		}
	case id.episodes == 0:
		lo, hi := 1, 2
		for hi <= reAnimeMaxEpisodes {
			ok, err := p.hasEpisode(id.anilistID, hi)
			if err != nil {
				return nil, err
			}
			if !ok {
				break
			}
			lo, hi = hi, hi*2
		}
		if hi > reAnimeMaxEpisodes {
			hi = reAnimeMaxEpisodes + 1
		}
		if last, err = bisect(lo, hi); err != nil {
			return nil, err
		}
	}
	lang := id.lang()
	out := make([]*hibikeonlinestream.EpisodeDetails, 0, last)
	for n := 1; n <= last; n++ {
		out = append(out, &hibikeonlinestream.EpisodeDetails{
			Provider: ReAnimeProvider,
			ID:       fmt.Sprintf("%d/%d/%s", id.anilistID, n, lang),
			Number:   n,
			URL:      fmt.Sprintf("%s/watch/%d?ep=%d", p.Url, id.anilistID, n),
		})
	}
	return out, nil
}

var (
	reAnimeEmbedAidRe   = regexp.MustCompile(`/e/([a-z0-9]+)`)
	reAnimeFileIDRe     = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	reAnimeJWTRe        = regexp.MustCompile(`eyJ[\w-]+\.[\w-]+\.[\w-]+`)
	reAnimeFetchBaseRe  = regexp.MustCompile(`https://fetch\d*\.flixcloud\.cc`)
	reAnimeResolutionRe = regexp.MustCompile(`(\d{3,4})p`)
	reAnimeStatusRe     = regexp.MustCompile(`"status":\s*"(\w+)"`)
	reAnimeFileNameRe   = regexp.MustCompile(`[^"/\\]{3,200}\.(?:mkv|mp4)`)
)

func (p *ReAnime) flixHeaders() map[string]string {
	return map[string]string{
		"Accept":  "*/*",
		"Origin":  p.FlixURL,
		"Referer": p.FlixURL + "/",
	}
}

// reAnimeReadyWait is how long a file still being prepared on flixcloud is waited for.
const reAnimeReadyWait = 90 * time.Second

func (p *ReAnime) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	parts := strings.Split(episode.ID, "/")
	if len(parts) != 3 {
		return nil, fmt.Errorf("reanime: episode id is malformed: %q", episode.ID)
	}
	anilistID, err1 := strconv.Atoi(parts[0])
	number, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return nil, fmt.Errorf("reanime: episode id is malformed: %q", episode.ID)
	}
	wantDub := parts[2] == "dub"

	servers, err := p.servers(anilistID, number)
	if err != nil {
		return nil, err
	}
	// The requested language first, the named server first within it; every server of the
	// episode after, since sub and dub are usually the same dual-audio file.
	var ordered []reAnimeServer
	for pass := 0; pass < 2; pass++ {
		for _, s := range servers {
			isDub := strings.EqualFold(s.DataType, "dub")
			if (isDub == wantDub) == (pass == 0) {
				if pass == 0 && server != "" && server != DefaultServer && strings.EqualFold(s.ServerName, server) {
					ordered = append([]reAnimeServer{s}, ordered...)
				} else {
					ordered = append(ordered, s)
				}
			}
		}
	}
	tried := map[string]bool{}
	var lastErr error
	for _, s := range ordered {
		m := reAnimeEmbedAidRe.FindStringSubmatch(s.DataLink)
		if m == nil || tried[m[1]] {
			continue
		}
		tried[m[1]] = true
		src, err := p.fileSource(m[1])
		if err != nil {
			lastErr = err
			continue
		}
		return &hibikeonlinestream.EpisodeServer{
			Provider: ReAnimeProvider,
			Server:   s.ServerName,
			Headers: map[string]string{
				"Origin":     p.FlixURL,
				"Referer":    p.FlixURL + "/",
				"User-Agent": p.UserAgent,
			},
			VideoSources: []*hibikeonlinestream.VideoSource{src},
		}, nil
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, ErrSourceNotFound
}

// fileSource is the direct download of one flixcloud file, once it is ready.
func (p *ReAnime) fileSource(aid string) (*hibikeonlinestream.VideoSource, error) {
	status, body, err := p.fetch(p.FlixURL+"/d/"+aid+"/__data.json", p.flixHeaders())
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("reanime: flixcloud file data returned %d", status)
	}
	data := string(body)
	fileID := reAnimeFileIDRe.FindString(data)
	token := reAnimeJWTRe.FindString(data)
	if fileID == "" || token == "" {
		return nil, ErrSourceNotFound
	}
	base := reAnimeFetchBaseRe.FindString(data)
	if base == "" {
		base = p.FlixURL
	}

	deadline := time.Now().Add(reAnimeReadyWait)
	for {
		status, body, err := p.fetch(base+"/download/"+fileID+"/progress?token="+token, p.flixHeaders())
		if err == nil && status == http.StatusOK {
			if m := reAnimeStatusRe.FindStringSubmatch(string(body)); m != nil && m[1] == "ready" {
				break
			}
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("reanime: the file was not ready in time")
		}
		time.Sleep(3 * time.Second)
	}

	quality := "1080p"
	if m := reAnimeResolutionRe.FindStringSubmatch(data); m != nil {
		quality = m[1] + "p"
	}
	label := ""
	if m := reAnimeFileNameRe.FindString(data); m != "" {
		label = m
	}
	return &hibikeonlinestream.VideoSource{
		URL:     base + "/download/" + fileID + "?token=" + token + "&file=.mkv",
		Type:    hibikeonlinestream.VideoSourceMP4,
		Label:   label,
		Quality: quality,
	}, nil
}
