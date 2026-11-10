package onlinestream_providers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
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

// MegaPlay is an onlinestream provider for megaplay.buzz, the embedded player behind AniFlix's
// Japanese and English episodes, and many other sites. It needs no search: every episode has a
// page addressed by AniList ID, episode number and language —
//
//	/stream/ani/{anilistId}/{episode}/{sub|dub}
//
// The page carries the player's file id; /stream/getSources?id=… answers with the source
// AES-encrypted ("enc") and the subtitle tracks; the decrypted master playlist needs a signed
// token (an HMAC of the file's two ids and an expiry 90 seconds ahead). The keys and the signing
// match the site's player script, as the animestream app (frostnova721/animestream) uses them.
type MegaPlay struct {
	Url       string
	Client    *http.Client
	UserAgent string
	logger    *zerolog.Logger
}

const MegaPlayProvider string = "megaplay"

const (
	megaPlayAESKey   = "i?LMTAx0Q6,:}50U"
	megaPlayIV       = "W0;27ToaUpl_P%'c"
	megaPlayTokenKey = "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s"
	// megaPlayMaxEpisodes bounds the episode probe for an anime whose episode count is unknown.
	megaPlayMaxEpisodes = 3000
)

func NewMegaPlay(logger *zerolog.Logger) hibikeonlinestream.Provider {
	return &MegaPlay{
		Url:       "https://megaplay.buzz",
		Client:    &http.Client{Timeout: 25 * time.Second},
		UserAgent: util.GetSharedUserAgent(),
		logger:    logger,
	}
}

func (p *MegaPlay) GetSettings() hibikeonlinestream.Settings {
	return hibikeonlinestream.Settings{
		EpisodeServers: []string{"megaplay"},
		SupportsDub:    true,
	}
}

var (
	megaPlayPace    sync.Mutex
	megaPlayLastReq time.Time
)

// megaPlayPaceRequest spaces requests out: episode probes and downloads share one site.
func megaPlayPaceRequest() {
	megaPlayPace.Lock()
	defer megaPlayPace.Unlock()
	if gap := 400*time.Millisecond - time.Since(megaPlayLastReq); gap > 0 {
		time.Sleep(gap)
	}
	megaPlayLastReq = time.Now()
}

func (p *MegaPlay) fetch(u string, headers map[string]string) (int, []byte, error) {
	megaPlayPaceRequest()
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("User-Agent", p.UserAgent)
	req.Header.Set("Referer", p.Url+"/")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return resp.StatusCode, body, err
}

// megaPlayID is what a search result carries: the AniList ID, the episode count when AniList
// knows it, and the language ("387:13" or "387:13/dub"; "387:0" when the count is unknown).
type megaPlayID struct {
	anilistID int
	episodes  int
	dub       bool
}

func (m megaPlayID) String() string {
	s := fmt.Sprintf("%d:%d", m.anilistID, m.episodes)
	if m.dub {
		s += "/dub"
	}
	return s
}

func (m megaPlayID) lang() string {
	if m.dub {
		return "dub"
	}
	return "sub"
}

func parseMegaPlayID(id string) (megaPlayID, error) {
	var out megaPlayID
	if strings.HasSuffix(id, "/dub") {
		out.dub = true
		id = strings.TrimSuffix(id, "/dub")
	}
	id = strings.TrimSuffix(id, "/sub")
	parts := strings.SplitN(id, ":", 2)
	n, err := strconv.Atoi(parts[0])
	if err != nil || n <= 0 {
		return out, fmt.Errorf("megaplay: bad id %q", id)
	}
	out.anilistID = n
	if len(parts) == 2 {
		out.episodes, _ = strconv.Atoi(parts[1])
	}
	return out, nil
}

// Search needs nothing but the AniList ID: MegaPlay files every anime under it. The result
// carries the titles it was asked about, so a title match always agrees.
func (p *MegaPlay) Search(opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
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
		URL:      fmt.Sprintf("%s/stream/ani/%d/1/%s", p.Url, id.anilistID, id.lang()),
		SubOrDub: subOrDub,
	}}, nil
}

var megaPlayFileIDRe = regexp.MustCompile(`data-id="(\d+)"`)

// fileID is the player's file id on an episode's page, or "" when MegaPlay does not have the
// episode (its page is then titled "Error - MegaPlay").
func (p *MegaPlay) fileID(anilistID, episode int, lang string) (string, string, error) {
	page := fmt.Sprintf("%s/stream/ani/%d/%d/%s", p.Url, anilistID, episode, lang)
	status, body, err := p.fetch(page, nil)
	if err != nil {
		return "", page, err
	}
	if status == http.StatusNotFound {
		return "", page, nil
	}
	if status != http.StatusOK {
		return "", page, fmt.Errorf("megaplay: episode page returned %d", status)
	}
	if m := megaPlayFileIDRe.FindSubmatch(body); m != nil {
		return string(m[1]), page, nil
	}
	return "", page, nil
}

func (p *MegaPlay) hasEpisode(anilistID, episode int, lang string) (bool, error) {
	id, _, err := p.fileID(anilistID, episode, lang)
	return id != "", err
}

// FindEpisodes lists the episodes MegaPlay has. With AniList's count it checks the first and the
// last; without one (a series still airing) it finds the last episode by doubling, then halving.
func (p *MegaPlay) FindEpisodes(rawID string) ([]*hibikeonlinestream.EpisodeDetails, error) {
	id, err := parseMegaPlayID(rawID)
	if err != nil {
		return nil, err
	}
	lang := id.lang()
	ok, err := p.hasEpisode(id.anilistID, 1, lang)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrSourceNotFound
	}

	last, err := lastEpisodeOf(func(n int) (bool, error) { return p.hasEpisode(id.anilistID, n, lang) }, id.episodes, megaPlayMaxEpisodes)
	if err != nil {
		return nil, err
	}

	out := make([]*hibikeonlinestream.EpisodeDetails, 0, last)
	for n := 1; n <= last; n++ {
		out = append(out, &hibikeonlinestream.EpisodeDetails{
			Provider: MegaPlayProvider,
			ID:       fmt.Sprintf("%d/%d/%s", id.anilistID, n, lang),
			Number:   n,
			URL:      fmt.Sprintf("%s/stream/ani/%d/%d/%s", p.Url, id.anilistID, n, lang),
		})
	}
	return out, nil
}

// lastEpisodeOf finds the last episode a site has, given that episode 1 exists. known is the
// count AniList gave (0 when unknown). Both ends of it are checked, and one past it, since a show
// still airing outgrows the count a saved match carries; past it, or with no count at all, the
// count doubles until an episode is missing and then halves between.
func lastEpisodeOf(has func(n int) (bool, error), known int, max int) (int, error) {
	bisect := func(lo, hi int) (int, error) {
		for hi-lo > 1 {
			mid := (lo + hi) / 2
			ok, err := has(mid)
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
	lo := 1
	if known > 1 {
		ok, err := has(known)
		if err != nil {
			return 0, err
		}
		if !ok {
			return bisect(1, known)
		}
		lo = known
	}
	if known == 1 {
		return 1, nil
	}
	// Past the known end (or with none): double, then halve.
	hi := lo + 1
	if known <= 1 {
		hi = 2
	}
	for hi <= max {
		ok, err := has(hi)
		if err != nil {
			return 0, err
		}
		if !ok {
			break
		}
		step := hi - lo
		lo, hi = hi, hi+step*2
	}
	if hi > max+1 {
		hi = max + 1
	}
	return bisect(lo, hi)
}

type megaPlaySources struct {
	Enc     string `json:"enc"`
	Sources any    `json:"sources"`
	Tracks  []struct {
		File    string `json:"file"`
		Label   string `json:"label"`
		Kind    string `json:"kind"`
		Default bool   `json:"default"`
	} `json:"tracks"`
	Intro struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
	} `json:"intro"`
	Outro struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
	} `json:"outro"`
}

// sourceFile is the master playlist a sources answer points at: decrypted when it is "enc".
func (s *megaPlaySources) sourceFile() (string, error) {
	if s.Enc != "" {
		return megaPlayDecrypt(s.Enc)
	}
	switch v := s.Sources.(type) {
	case map[string]any:
		f, _ := v["file"].(string)
		return f, nil
	case []any:
		if len(v) > 0 {
			if m, ok := v[0].(map[string]any); ok {
				f, _ := m["file"].(string)
				return f, nil
			}
		}
	}
	return "", nil
}

func megaPlayDecrypt(enc string) (string, error) {
	ct, err := base64.URLEncoding.DecodeString(enc + strings.Repeat("=", (4-len(enc)%4)%4))
	if err != nil {
		return "", fmt.Errorf("megaplay: bad encrypted source: %w", err)
	}
	if len(ct) == 0 || len(ct)%aes.BlockSize != 0 {
		return "", errors.New("megaplay: encrypted source has a bad length")
	}
	key := make([]byte, 32)
	copy(key, megaPlayAESKey)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	pt := make([]byte, len(ct))
	cipher.NewCBCDecrypter(block, []byte(megaPlayIV)).CryptBlocks(pt, ct)
	pad := int(pt[len(pt)-1])
	if pad < 1 || pad > aes.BlockSize || pad > len(pt) {
		return "", errors.New("megaplay: could not decrypt the source (the player's key may have changed)")
	}
	var out struct {
		File string `json:"file"`
	}
	if err := json.Unmarshal(pt[:len(pt)-pad], &out); err != nil {
		return "", fmt.Errorf("megaplay: decrypted source is not JSON: %w", err)
	}
	return out.File, nil
}

var megaPlayFileIDsRe = regexp.MustCompile(`(?i)/([a-f0-9]{32})/([a-f0-9]{32})/`)

// megaPlaySign adds the token the CDN asks for: base64url(expiry|id1/id2) "." base64url(HMAC).
func megaPlaySign(fileURL string, now time.Time) string {
	u, err := url.Parse(fileURL)
	if err != nil {
		return fileURL
	}
	ids := megaPlayFileIDsRe.FindStringSubmatch(u.Path)
	if ids == nil {
		return fileURL
	}
	payload := fmt.Sprintf("%d|%s/%s", now.Unix()+90, strings.ToLower(ids[1]), strings.ToLower(ids[2]))
	mac := hmac.New(sha256.New, []byte(megaPlayTokenKey))
	mac.Write([]byte(payload))
	enc := base64.RawURLEncoding
	q := u.Query()
	q.Set("token", enc.EncodeToString([]byte(payload))+"."+enc.EncodeToString(mac.Sum(nil)))
	u.RawQuery = q.Encode()
	return u.String()
}

func (p *MegaPlay) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (*hibikeonlinestream.EpisodeServer, error) {
	parts := strings.Split(episode.ID, "/")
	if len(parts) != 3 {
		return nil, fmt.Errorf("megaplay: episode id is malformed: %q", episode.ID)
	}
	anilistID, err1 := strconv.Atoi(parts[0])
	number, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return nil, fmt.Errorf("megaplay: episode id is malformed: %q", episode.ID)
	}
	lang := parts[2]

	fileID, page, err := p.fileID(anilistID, number, lang)
	if err != nil {
		return nil, err
	}
	if fileID == "" {
		return nil, ErrSourceNotFound
	}

	var src *megaPlaySources
	var file string
	var lastErr error
	for _, endpoint := range []string{"getSources", "getSourcesNew"} {
		status, body, err := p.fetch(p.Url+"/stream/"+endpoint+"?id="+url.QueryEscape(fileID), map[string]string{
			"X-Requested-With": "XMLHttpRequest",
			"Referer":          page,
		})
		if err != nil {
			lastErr = err
			continue
		}
		if status != http.StatusOK {
			lastErr = fmt.Errorf("megaplay: %s returned %d", endpoint, status)
			continue
		}
		var s megaPlaySources
		if err := json.Unmarshal(body, &s); err != nil {
			lastErr = fmt.Errorf("megaplay: %s is not JSON: %w", endpoint, err)
			continue
		}
		f, err := s.sourceFile()
		if err != nil {
			lastErr = err
			continue
		}
		if f != "" {
			src, file = &s, f
			break
		}
	}
	if src == nil {
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, ErrSourceNotFound
	}

	subs := make([]*hibikeonlinestream.VideoSubtitle, 0, len(src.Tracks))
	for i, t := range src.Tracks {
		if t.File == "" || (t.Kind != "captions" && t.Kind != "subtitles") {
			continue
		}
		label := t.Label
		if label == "" {
			label = "English"
		}
		subs = append(subs, &hibikeonlinestream.VideoSubtitle{
			ID:        strconv.Itoa(i),
			URL:       strings.ReplaceAll(t.File, `\`, ""),
			Language:  label,
			IsDefault: t.Default || strings.EqualFold(label, "english"),
		})
	}

	source := &hibikeonlinestream.VideoSource{
		URL:       megaPlaySign(strings.ReplaceAll(file, `\`, ""), time.Now()),
		Type:      hibikeonlinestream.VideoSourceM3U8,
		Quality:   "auto",
		Subtitles: subs,
	}
	if src.Intro.End > src.Intro.Start || src.Outro.End > src.Outro.Start {
		skips := &hibikeonlinestream.VideoSourceSkips{}
		if src.Intro.End > src.Intro.Start {
			skips.Intro = &hibikeonlinestream.VideoSourceSkipInterval{Start: src.Intro.Start, End: src.Intro.End}
		}
		if src.Outro.End > src.Outro.Start {
			skips.Outro = &hibikeonlinestream.VideoSourceSkipInterval{Start: src.Outro.Start, End: src.Outro.End}
		}
		source.Skips = skips
	}

	return &hibikeonlinestream.EpisodeServer{
		Provider: MegaPlayProvider,
		Server:   "megaplay",
		Headers: map[string]string{
			"Referer":    p.Url + "/",
			"Origin":     p.Url,
			"User-Agent": p.UserAgent,
		},
		VideoSources: []*hibikeonlinestream.VideoSource{source},
	}, nil
}
