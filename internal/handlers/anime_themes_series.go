package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/util/result"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
)

// The Anime Themes tab of an anime's page: the openings and endings of that anime and of every other
// anime animethemes.moe files in the same series, in airing order.

const animeThemesAPI = "https://api.animethemes.moe"

// animeThemesSeriesMaxAnime bounds how many anime of one series are read (a long franchise has
// dozens); the anime being looked at is always among them.
const animeThemesSeriesMaxAnime = 30

type AnimeThemesSeriesAnime struct {
	Slug      string        `json:"slug"`
	Name      string        `json:"name"`
	Year      int           `json:"year"`
	Season    string        `json:"season"`
	AnilistID int           `json:"anilistId"`
	Image     string        `json:"image"`
	Current   bool          `json:"current"`
	Themes    []*AnimeTheme `json:"themes"`
}

type AnimeThemesSeriesResponse struct {
	Series []string                  `json:"series"`
	Anime  []*AnimeThemesSeriesAnime `json:"anime"`
}

type animeThemesSeriesCacheItem struct {
	at   time.Time
	resp *AnimeThemesSeriesResponse
}

var animeThemesSeriesCache = result.NewBoundedCache[int, *animeThemesSeriesCacheItem](300)

// atAPIAnime is the part of an animethemes.moe anime this reads.
type atAPIAnime struct {
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	Year      int    `json:"year"`
	Season    string `json:"season"`
	Resources []struct {
		Site       string `json:"site"`
		ExternalID int    `json:"external_id"`
	} `json:"resources"`
	Images []struct {
		Facet string `json:"facet"`
		Link  string `json:"link"`
	} `json:"images"`
	Series []struct {
		Slug string `json:"slug"`
		Name string `json:"name"`
	} `json:"series"`
	AnimeThemes []struct {
		Type     string `json:"type"`
		Sequence int    `json:"sequence"`
		Slug     string `json:"slug"`
		Song     *struct {
			Title   string `json:"title"`
			Artists []struct {
				Name string `json:"name"`
				Slug string `json:"slug"`
			} `json:"artists"`
		} `json:"song"`
		AnimeThemeEntries []struct {
			Version  int    `json:"version"`
			Episodes string `json:"episodes"`
			NSFW     bool   `json:"nsfw"`
			Spoiler  bool   `json:"spoiler"`
			Videos   []struct {
				Link       string `json:"link"`
				Resolution int    `json:"resolution"`
				NC         bool   `json:"nc"`
				Subbed     bool   `json:"subbed"`
				Tags       string `json:"tags"`
				Basename   string `json:"basename"`
				Audio      *struct {
					Link string `json:"link"`
				} `json:"audio"`
			} `json:"videos"`
		} `json:"animethemeentries"`
	} `json:"animethemes"`
}

func animeThemesGet(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, animeThemesAPI+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Seanime/1.0")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("animethemes API returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(body, out)
}

func (a *atAPIAnime) anilistID() int {
	for _, r := range a.Resources {
		if strings.EqualFold(r.Site, "AniList") {
			return r.ExternalID
		}
	}
	return 0
}

func (a *atAPIAnime) image() string {
	for _, want := range []string{"Large Cover", "Small Cover"} {
		for _, im := range a.Images {
			if im.Facet == want {
				return im.Link
			}
		}
	}
	return ""
}

func (a *atAPIAnime) themes() []*AnimeTheme {
	out := make([]*AnimeTheme, 0, len(a.AnimeThemes))
	for _, at := range a.AnimeThemes {
		theme := &AnimeTheme{Type: at.Type, Sequence: at.Sequence, Slug: at.Slug, Entries: make([]*AnimeThemeEntry, 0)}
		if at.Song != nil {
			theme.Song = &AnimeThemeSong{Title: at.Song.Title, Artists: make([]*AnimeThemeArtist, 0)}
			for _, ar := range at.Song.Artists {
				theme.Song.Artists = append(theme.Song.Artists, &AnimeThemeArtist{Name: ar.Name, Slug: ar.Slug})
			}
		}
		for _, e := range at.AnimeThemeEntries {
			te := &AnimeThemeEntry{Version: e.Version, Episodes: e.Episodes, NSFW: e.NSFW, Spoiler: e.Spoiler, Videos: make([]*AnimeThemeVideo, 0)}
			for _, v := range e.Videos {
				vid := &AnimeThemeVideo{Link: v.Link, Resolution: v.Resolution, NC: v.NC, Subbed: v.Subbed, Tags: v.Tags, Basename: v.Basename}
				if v.Audio != nil {
					vid.Audio = v.Audio.Link
				}
				te.Videos = append(te.Videos, vid)
			}
			theme.Entries = append(theme.Entries, te)
		}
		out = append(out, theme)
	}
	// Openings first, each kind in its own order.
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Type != out[j].Type {
			return out[i].Type == "OP"
		}
		return out[i].Sequence < out[j].Sequence
	})
	return out
}

var animeThemesSeasonOrder = map[string]int{"winter": 0, "spring": 1, "summer": 2, "fall": 3}

const animeThemesInclude = "animethemes.animethemeentries.videos.audio,animethemes.song.artists,images,resources"

// HandleGetAnimeThemesSeries
//
//	@summary returns the openings and endings of an anime and of the rest of its series.
//	@desc Reads animethemes.moe by the AniList ID (the MAL ID as a fallback). Anime are in airing order; the one asked about is marked current.
//	@param id - int - true - "The AniList media ID"
//	@returns AnimeThemesSeriesResponse
//	@route /api/v1/anime-themes/series/{id} [GET]
func (h *Handler) HandleGetAnimeThemesSeries(c echo.Context) error {
	anilistID, err := strconv.Atoi(c.Param("id"))
	if err != nil || anilistID <= 0 {
		return h.RespondWithData(c, &AnimeThemesSeriesResponse{Series: []string{}, Anime: []*AnimeThemesSeriesAnime{}})
	}
	malID, _ := strconv.Atoi(c.QueryParam("malId"))

	if cached, ok := animeThemesSeriesCache.Get(anilistID); ok && time.Since(cached.at) < 6*time.Hour {
		return h.RespondWithData(c, cached.resp)
	}

	resp, err := fetchAnimeThemesSeries(c.Request().Context(), anilistID, malID)
	if err != nil {
		h.App.Logger.Warn().Err(err).Int("mediaId", anilistID).Msg("animethemes: Failed to fetch the series themes")
		return h.RespondWithError(c, err)
	}
	animeThemesSeriesCache.Set(anilistID, &animeThemesSeriesCacheItem{at: time.Now(), resp: resp})
	return h.RespondWithData(c, resp)
}

func fetchAnimeThemesSeries(ctx context.Context, anilistID, malID int) (*AnimeThemesSeriesResponse, error) {
	find := func(site string, id int) (*atAPIAnime, error) {
		var r struct {
			Anime []*atAPIAnime `json:"anime"`
		}
		q := url.Values{}
		q.Set("filter[has]", "resources")
		q.Set("filter[site]", site)
		q.Set("filter[external_id]", strconv.Itoa(id))
		q.Set("include", animeThemesInclude+",series")
		if err := animeThemesGet(ctx, "/anime?"+q.Encode(), &r); err != nil {
			return nil, err
		}
		if len(r.Anime) == 0 {
			return nil, nil
		}
		return r.Anime[0], nil
	}

	current, err := find("AniList", anilistID)
	if err != nil {
		return nil, err
	}
	if current == nil && malID > 0 {
		if current, err = find("MyAnimeList", malID); err != nil {
			return nil, err
		}
	}
	out := &AnimeThemesSeriesResponse{Series: []string{}, Anime: []*AnimeThemesSeriesAnime{}}
	if current == nil {
		return out, nil
	}

	// Every anime of every series the anime is in.
	bySlug := map[string]*AnimeThemesSeriesAnime{}
	add := func(a *atAPIAnime) *AnimeThemesSeriesAnime {
		if e, ok := bySlug[a.Slug]; ok {
			return e
		}
		e := &AnimeThemesSeriesAnime{Slug: a.Slug, Name: a.Name, Year: a.Year, Season: a.Season}
		bySlug[a.Slug] = e
		return e
	}
	cur := add(current)
	cur.Current = true
	cur.AnilistID = anilistID
	cur.Image = current.image()
	cur.Themes = current.themes()

	for _, s := range current.Series {
		out.Series = append(out.Series, s.Name)
		var r struct {
			Series struct {
				Anime []*atAPIAnime `json:"anime"`
			} `json:"series"`
		}
		if err := animeThemesGet(ctx, "/series/"+url.PathEscape(s.Slug)+"?include=anime", &r); err != nil {
			continue
		}
		for _, a := range r.Series.Anime {
			if a != nil && a.Slug != "" {
				add(a)
			}
		}
	}

	list := make([]*AnimeThemesSeriesAnime, 0, len(bySlug))
	for _, a := range bySlug {
		list = append(list, a)
	}
	sortAnimeThemesSeries(list)
	list = nearestAnimeThemesSeries(list, animeThemesSeriesMaxAnime)

	// The others' themes, a few at a time.
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for _, a := range list {
		if a.Current {
			continue
		}
		wg.Add(1)
		go func(a *AnimeThemesSeriesAnime) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			var r struct {
				Anime *atAPIAnime `json:"anime"`
			}
			if err := animeThemesGet(ctx, "/anime/"+url.PathEscape(a.Slug)+"?include="+animeThemesInclude, &r); err != nil || r.Anime == nil {
				return
			}
			a.AnilistID = r.Anime.anilistID()
			a.Image = r.Anime.image()
			a.Themes = r.Anime.themes()
		}(a)
	}
	wg.Wait()

	for _, a := range list {
		if a.Themes == nil {
			a.Themes = []*AnimeTheme{}
		}
		if len(a.Themes) > 0 || a.Current {
			out.Anime = append(out.Anime, a)
		}
	}
	return out, nil
}

// sortAnimeThemesSeries puts anime in airing order; anime without a year go last.
func sortAnimeThemesSeries(list []*AnimeThemesSeriesAnime) {
	sort.SliceStable(list, func(i, j int) bool {
		a, b := list[i], list[j]
		ay, by := a.Year, b.Year
		if ay == 0 {
			ay = 9999
		}
		if by == 0 {
			by = 9999
		}
		if ay != by {
			return ay < by
		}
		as, bs := animeThemesSeasonOrder[strings.ToLower(a.Season)], animeThemesSeasonOrder[strings.ToLower(b.Season)]
		if as != bs {
			return as < bs
		}
		return a.Name < b.Name
	})
}

// nearestAnimeThemesSeries keeps at most max anime of a sorted list: those nearest the current one.
func nearestAnimeThemesSeries(list []*AnimeThemesSeriesAnime, max int) []*AnimeThemesSeriesAnime {
	if len(list) <= max {
		return list
	}
	idx := 0
	for i, a := range list {
		if a.Current {
			idx = i
		}
	}
	start := idx - max/2
	if start < 0 {
		start = 0
	}
	if start+max > len(list) {
		start = len(list) - max
	}
	return list[start : start+max]
}
