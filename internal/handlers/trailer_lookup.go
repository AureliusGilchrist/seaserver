package handlers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/anilist"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/singleflight"
)

// Trailers for the hover previews, in the version the profile watches. AniList stores one trailer
// per show — almost always the original Japanese PV — so a dubbed trailer has to be found: a YouTube
// search for the show's English dub trailer, keeping a result only when its title says it's a dub and
// names the show. Nothing found falls back to AniList's trailer. Results are cached for a week.

const trailerLookupTTL = 7 * 24 * time.Hour

type trailerLookupEntry struct {
	res *TrailerLookup
	at  time.Time
}

var (
	trailerLookupMu     sync.Mutex
	trailerLookupCache  = map[string]*trailerLookupEntry{}
	trailerLookupFlight singleflight.Group
	trailerHTTP         = &http.Client{Timeout: 15 * time.Second}
)

// TrailerLookup is the trailer to play.
type TrailerLookup struct {
	ID string `json:"id"` // YouTube video id; empty when there is none
	// Dub is true when this is an English dub trailer (found by search).
	Dub bool `json:"dub"`
}

// HandleGetMediaTrailer
//
//	@summary returns the YouTube trailer to preview for a media, in sub or dub.
//	@desc With lang=dub, an English dub trailer is searched for on YouTube and AniList's trailer is
//	@desc the fallback. With lang=sub (default) it is AniList's trailer.
//	@returns handlers.TrailerLookup
//	@param id - int - true - "The AniList media ID"
//	@route /api/v1/anilist/media/{id}/trailer [GET]
func (h *Handler) HandleGetMediaTrailer(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return h.RespondWithError(c, errors.New("invalid media id"))
	}
	dub := c.QueryParam("lang") == "dub"
	key := strconv.Itoa(id) + map[bool]string{true: ":dub", false: ":sub"}[dub]

	trailerLookupMu.Lock()
	cached := trailerLookupCache[key]
	trailerLookupMu.Unlock()
	if cached != nil && time.Since(cached.at) < trailerLookupTTL {
		return h.RespondWithData(c, cached.res)
	}

	ch := trailerLookupFlight.DoChan(key, func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		res := &TrailerLookup{}
		original, titles, err := h.trailerAndTitles(ctx, id)
		if err != nil {
			return nil, err
		}
		res.ID = original
		if dub {
			if found := searchDubTrailer(ctx, titles); found != "" {
				res.ID, res.Dub = found, true
			}
		} else if found := searchJapaneseTrailer(ctx, titles); found != "" {
			// AniList's trailer is not always the Japanese one (some shows list an English promo), so
			// the original PV is looked for by the show's Japanese and romaji titles.
			res.ID = found
		}
		trailerLookupMu.Lock()
		trailerLookupCache[key] = &trailerLookupEntry{res: res, at: time.Now()}
		trailerLookupMu.Unlock()
		return res, nil
	})
	select {
	case r := <-ch:
		if r.Err != nil {
			return h.RespondWithError(c, r.Err)
		}
		return h.RespondWithData(c, r.Val)
	case <-c.Request().Context().Done():
		return c.Request().Context().Err()
	}
}

// trailerAndTitles reads AniList's trailer and the show's titles (English first) through the paced path.
func (h *Handler) trailerAndTitles(ctx context.Context, id int) (string, []string, error) {
	body, _ := json.Marshal(map[string]any{
		"query":     `query ($id: Int) { Media(id: $id) { title { english romaji native } synonyms trailer { id site } } }`,
		"variables": map[string]any{"id": id},
	})
	data, err := anilist.CustomQueryCtx(ctx, body, h.App.Logger)
	if err != nil {
		return "", nil, err
	}
	raw, _ := json.Marshal(data)
	var parsed struct {
		Media struct {
			Title struct {
				English string `json:"english"`
				Romaji  string `json:"romaji"`
				Native  string `json:"native"`
			} `json:"title"`
			Trailer *struct {
				ID   string `json:"id"`
				Site string `json:"site"`
			} `json:"trailer"`
		} `json:"Media"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", nil, err
	}
	m := parsed.Media
	trailer := ""
	if m.Trailer != nil && strings.EqualFold(m.Trailer.Site, "youtube") {
		trailer = m.Trailer.ID
	}
	// English, romaji, native: dub searches use the first two, Japanese searches the last two.
	var titles []string
	for _, t := range []string{m.Title.English, m.Title.Romaji, m.Title.Native} {
		if t = strings.TrimSpace(t); t != "" {
			titles = append(titles, t)
		}
	}
	return trailer, titles, nil
}

var (
	ytInitialData = regexp.MustCompile(`(?s)var ytInitialData = (\{.*?\});</script>`)
	titleWord     = regexp.MustCompile(`[\p{L}\p{N}]+`)
)

// searchDubTrailer looks for an English dub trailer of the show on YouTube.
func searchDubTrailer(ctx context.Context, titles []string) string {
	for _, title := range titles {
		if hasJapanese(title) {
			continue // a native title won't name an English dub
		}
		for _, q := range []string{title + " english dub trailer", title + " dub trailer"} {
			for _, v := range youtubeSearch(ctx, q) {
				if isDubTrailerFor(v.title, title) {
					return v.id
				}
			}
		}
	}
	return ""
}

// isDubTrailerFor reports whether a video title reads as an English dub trailer of the show: it says
// "dub" and contains the show's significant title words.
func isDubTrailerFor(videoTitle, showTitle string) bool {
	vt := strings.ToLower(videoTitle)
	if !strings.Contains(vt, "dub") {
		return false
	}
	if !strings.Contains(vt, "trailer") && !strings.Contains(vt, "preview") && !strings.Contains(vt, "clip") && !strings.Contains(vt, "promo") {
		return false
	}
	words := titleWord.FindAllString(strings.ToLower(showTitle), -1)
	matched, needed := 0, 0
	for _, w := range words {
		if len(w) < 3 {
			continue
		}
		needed++
		if strings.Contains(vt, w) {
			matched++
		}
	}
	if needed == 0 {
		return strings.Contains(vt, strings.ToLower(showTitle))
	}
	return matched*3 >= needed*2 // at least two thirds of the title's words
}

type ytResult struct{ id, title string }

func youtubeSearch(ctx context.Context, query string) []ytResult {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.youtube.com/results?search_query="+url.QueryEscape(query)+"&hl=en", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	resp, err := trailerHTTP.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil
	}
	return parseYoutubeResults(body)
}

// parseYoutubeResults pulls (videoId, title) pairs out of a YouTube results page, in order.
func parseYoutubeResults(page []byte) []ytResult {
	m := ytInitialData.FindSubmatch(page)
	if m == nil {
		return nil
	}
	var root any
	if json.Unmarshal(m[1], &root) != nil {
		return nil
	}
	var out []ytResult
	var walk func(any)
	walk = func(n any) {
		switch v := n.(type) {
		case map[string]any:
			if vr, ok := v["videoRenderer"].(map[string]any); ok {
				id, _ := vr["videoId"].(string)
				title := ""
				if t, ok := vr["title"].(map[string]any); ok {
					if runs, ok := t["runs"].([]any); ok {
						for _, r := range runs {
							if rm, ok := r.(map[string]any); ok {
								s, _ := rm["text"].(string)
								title += s
							}
						}
					}
				}
				if id != "" {
					out = append(out, ytResult{id: id, title: title})
				}
				return
			}
			for _, child := range v {
				walk(child)
			}
		case []any:
			for _, child := range v {
				walk(child)
			}
		}
	}
	walk(root)
	return out
}

var japaneseScript = regexp.MustCompile(`[\p{Hiragana}\p{Katakana}\p{Han}]`)

func hasJapanese(s string) bool { return japaneseScript.MatchString(s) }

// searchJapaneseTrailer looks for the show's original Japanese trailer (PV) on YouTube: by its
// native title first ("<title> PV", "<title> 予告"), then its romaji title.
func searchJapaneseTrailer(ctx context.Context, titles []string) string {
	var native, romaji string
	for _, t := range titles {
		if hasJapanese(t) {
			if native == "" {
				native = t
			}
		} else if romaji == "" || native == "" {
			romaji = t // the last non-Japanese title before the native one is the romaji
		}
	}
	type query struct{ q, title string }
	var queries []query
	if native != "" {
		queries = append(queries, query{native + " PV", native}, query{native + " 予告", native})
	}
	if romaji != "" {
		queries = append(queries, query{romaji + " PV", romaji}, query{romaji + " official trailer japanese", romaji})
	}
	for _, q := range queries {
		for _, v := range youtubeSearch(ctx, q.q) {
			if isJapaneseTrailerFor(v.title, q.title) {
				return v.id
			}
		}
	}
	return ""
}

// isJapaneseTrailerFor reports whether a video title reads as the show's Japanese trailer: it names
// the show, is a PV/trailer/teaser, and isn't a dub, a reaction or a fan edit.
func isJapaneseTrailerFor(videoTitle, showTitle string) bool {
	vt := strings.ToLower(videoTitle)
	for _, bad := range []string{"dub", "english", "reaction", "review", "fan edit", "fanmade", "amv", "react"} {
		if strings.Contains(vt, bad) {
			return false
		}
	}
	isTrailer := false
	for _, w := range []string{"pv", "予告", "trailer", "teaser", "ティザー", "cm", "promo"} {
		if strings.Contains(vt, w) {
			isTrailer = true
			break
		}
	}
	if !isTrailer {
		return false
	}
	if hasJapanese(showTitle) {
		// Native titles: the title itself (or its first part) appears in the video's title.
		st := strings.ToLower(strings.TrimSpace(showTitle))
		if strings.Contains(vt, st) {
			return true
		}
		if parts := strings.FieldsFunc(st, func(r rune) bool { return r == ' ' || r == '　' || r == '：' || r == ':' }); len(parts) > 0 && len([]rune(parts[0])) >= 2 {
			return strings.Contains(vt, parts[0])
		}
		return false
	}
	words := titleWord.FindAllString(strings.ToLower(showTitle), -1)
	matched, needed := 0, 0
	for _, w := range words {
		if len(w) < 3 {
			continue
		}
		needed++
		if strings.Contains(vt, w) {
			matched++
		}
	}
	return needed > 0 && matched*3 >= needed*2
}
