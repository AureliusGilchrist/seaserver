package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/goccy/go-json"
)

// When api.animethemes.moe is down (it answers 503 for hours at a time), the animethemes.moe website
// still serves every anime and series page pre-built, with the same data embedded as Next.js page
// props. This reads those pages instead. There is no search without the API, so the anime is found
// by its slug, guessed from its titles, and confirmed by its AniList link.

const animeThemesSite = "https://animethemes.moe"

var (
	atNextDataRe    = regexp.MustCompile(`(?s)<script id="__NEXT_DATA__"[^>]*>(.*?)</script>`)
	atSlugCleanRe   = regexp.MustCompile(`[^a-z0-9]+`)
	atAnilistLinkRe = regexp.MustCompile(`anilist\.co/anime/(\d+)`)
)

type atSiteTitle struct {
	Romaji  string `json:"romaji"`
	English string `json:"english"`
}

type atSiteImages struct {
	Nodes []struct {
		Link  string `json:"link"`
		Facet string `json:"facet"`
	} `json:"nodes"`
}

type atSiteAnime struct {
	Slug      string       `json:"slug"`
	Title     atSiteTitle  `json:"title"`
	Season    string       `json:"season"`
	Year      int          `json:"year"`
	Images    atSiteImages `json:"images"`
	Resources struct {
		Edges []struct {
			Node struct {
				Site string `json:"site"`
				Link string `json:"link"`
			} `json:"node"`
		} `json:"edges"`
	} `json:"resources"`
	Series struct {
		Nodes []struct {
			Slug  string      `json:"slug"`
			Title atSiteTitle `json:"title"`
		} `json:"nodes"`
	} `json:"series"`
	Themes []struct {
		Type     string `json:"type"`
		Sequence *int   `json:"sequence"`
		Song     *struct {
			Title atSiteTitle `json:"title"`
			Staff []struct {
				Artist *struct {
					Slug string `json:"slug"`
					Name struct {
						Main string `json:"main"`
					} `json:"name"`
				} `json:"artist"`
			} `json:"staff"`
		} `json:"song"`
		Entries []struct {
			Version  int    `json:"version"`
			Episodes string `json:"episodes"`
			NSFW     bool   `json:"nsfw"`
			Spoiler  bool   `json:"spoiler"`
			Videos   struct {
				Nodes []struct {
					Tags       string `json:"tags"`
					Resolution int    `json:"resolution"`
					NC         bool   `json:"nc"`
					Subbed     bool   `json:"subbed"`
					Basename   string `json:"basename"`
					Audio      *struct {
						Basename string `json:"basename"`
					} `json:"audio"`
				} `json:"nodes"`
			} `json:"videos"`
		} `json:"entries"`
	} `json:"themes"`
}

var errAnimeThemesPageMissing = errors.New("animethemes page not found")

func animeThemesSitePage(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, animeThemesSite+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/html")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Seanime)")
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return errAnimeThemesPageMissing
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("animethemes.moe returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 24<<20))
	if err != nil {
		return err
	}
	m := atNextDataRe.FindSubmatch(body)
	if m == nil {
		return errAnimeThemesPageMissing
	}
	var next struct {
		Props struct {
			PageProps json.RawMessage `json:"pageProps"`
		} `json:"props"`
	}
	if err := json.Unmarshal(m[1], &next); err != nil {
		return err
	}
	return json.Unmarshal(next.Props.PageProps, out)
}

func animeThemesSiteAnime(ctx context.Context, slug string) (*atAPIAnime, error) {
	var page struct {
		Anime *atSiteAnime `json:"anime"`
	}
	if err := animeThemesSitePage(ctx, "/anime/"+url.PathEscape(slug), &page); err != nil {
		return nil, err
	}
	if page.Anime == nil || page.Anime.Slug == "" {
		return nil, errAnimeThemesPageMissing
	}
	return page.Anime.toAPI(), nil
}

// toAPI turns a site page's anime into the API's shape, so the rest of the tab code is shared.
func (s *atSiteAnime) toAPI() *atAPIAnime {
	a := &atAPIAnime{Slug: s.Slug, Name: s.Title.Romaji, Year: s.Year, Season: s.Season}
	if a.Name == "" {
		a.Name = s.Title.English
	}
	for _, e := range s.Resources.Edges {
		if strings.EqualFold(e.Node.Site, "ANILIST") {
			if m := atAnilistLinkRe.FindStringSubmatch(e.Node.Link); m != nil {
				id, _ := strconv.Atoi(m[1])
				a.Resources = append(a.Resources, atAPIResource{Site: "AniList", ExternalID: id})
			}
		}
	}
	for _, im := range s.Images.Nodes {
		facet := map[string]string{"LARGE_COVER": "Large Cover", "SMALL_COVER": "Small Cover"}[im.Facet]
		a.Images = append(a.Images, atAPIImage{Facet: facet, Link: im.Link})
	}
	for _, sr := range s.Series.Nodes {
		a.Series = append(a.Series, atAPISeries{Slug: sr.Slug, Name: sr.Title.Romaji})
	}
	for _, t := range s.Themes {
		seq := 0
		if t.Sequence != nil {
			seq = *t.Sequence
		}
		slug := t.Type
		if seq > 0 {
			slug += strconv.Itoa(seq)
		}
		th := atAPITheme{Type: t.Type, Sequence: seq, Slug: slug}
		if t.Song != nil {
			th.Song = &atAPISong{Title: t.Song.Title.Romaji}
			seen := map[string]bool{}
			for _, st := range t.Song.Staff {
				if st.Artist == nil || seen[st.Artist.Slug] {
					continue
				}
				seen[st.Artist.Slug] = true
				th.Song.Artists = append(th.Song.Artists, atAPIArtist{Name: st.Artist.Name.Main, Slug: st.Artist.Slug})
			}
		}
		for _, e := range t.Entries {
			entry := atAPIEntry{Version: e.Version, Episodes: e.Episodes, NSFW: e.NSFW, Spoiler: e.Spoiler}
			for _, v := range e.Videos.Nodes {
				if v.Basename == "" {
					continue
				}
				vid := atAPIVideo{Link: "https://v.animethemes.moe/" + v.Basename, Resolution: v.Resolution, NC: v.NC, Subbed: v.Subbed, Tags: v.Tags, Basename: v.Basename}
				if v.Audio != nil && v.Audio.Basename != "" {
					vid.Audio = &struct {
						Link string `json:"link"`
					}{Link: "https://a.animethemes.moe/" + v.Audio.Basename}
				}
				entry.Videos = append(entry.Videos, vid)
			}
			th.AnimeThemeEntries = append(th.AnimeThemeEntries, entry)
		}
		a.AnimeThemes = append(a.AnimeThemes, th)
	}
	return a
}

// animeThemesSlugGuesses: the slugs animethemes.moe would give an anime with these titles
// ("Kusuriya no Hitorigoto 2nd Season" -> kusuriya_no_hitorigoto_2nd_season), then the same
// without a subtitle, so a sequel still lands somewhere in its series.
func animeThemesSlugGuesses(titles []string) []string {
	var out []string
	seen := map[string]bool{}
	add := func(t string) {
		s := strings.Trim(atSlugCleanRe.ReplaceAllString(strings.ToLower(t), "_"), "_")
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, t := range titles {
		add(t)
	}
	for _, t := range titles {
		if i := strings.IndexAny(t, ":："); i > 0 {
			add(t[:i])
		}
	}
	return out
}

// fetchAnimeThemesSeriesFromSite is fetchAnimeThemesSeries read from the website's pages.
func fetchAnimeThemesSeriesFromSite(ctx context.Context, anilistID int, titles []string) (*AnimeThemesSeriesResponse, error) {
	out := &AnimeThemesSeriesResponse{Series: []string{}, Anime: []*AnimeThemesSeriesAnime{}}

	// The first guessed page that exists gives the series; the anime itself is the page whose
	// AniList link matches.
	var found *atAPIAnime
	var lastErr error
	for i, slug := range animeThemesSlugGuesses(titles) {
		if i >= 6 {
			break
		}
		a, err := animeThemesSiteAnime(ctx, slug)
		if err != nil {
			if !errors.Is(err, errAnimeThemesPageMissing) {
				lastErr = err
			}
			continue
		}
		if found == nil || a.anilistID() == anilistID {
			found = a
		}
		if a.anilistID() == anilistID {
			break
		}
	}
	if found == nil {
		return out, lastErr
	}

	bySlug := map[string]*atAPIAnime{found.Slug: found}
	order := []string{found.Slug}
	for _, s := range found.Series {
		out.Series = append(out.Series, s.Name)
		var page struct {
			Series struct {
				Anime struct {
					Nodes []struct {
						Slug   string      `json:"slug"`
						Title  atSiteTitle `json:"title"`
						Year   int         `json:"year"`
						Season string      `json:"season"`
					} `json:"nodes"`
				} `json:"anime"`
			} `json:"series"`
		}
		if err := animeThemesSitePage(ctx, "/series/"+url.PathEscape(s.Slug), &page); err != nil {
			continue
		}
		for _, n := range page.Series.Anime.Nodes {
			if n.Slug != "" && bySlug[n.Slug] == nil {
				bySlug[n.Slug] = &atAPIAnime{Slug: n.Slug, Name: n.Title.Romaji, Year: n.Year, Season: n.Season}
				order = append(order, n.Slug)
			}
		}
	}

	list := make([]*AnimeThemesSeriesAnime, 0, len(order))
	for _, slug := range order {
		a := bySlug[slug]
		list = append(list, &AnimeThemesSeriesAnime{Slug: a.Slug, Name: a.Name, Year: a.Year, Season: a.Season, Current: a == found && a.anilistID() == anilistID})
	}
	sortAnimeThemesSeries(list)
	list = nearestAnimeThemesSeries(list, animeThemesSeriesMaxAnime)

	// Each anime's own page has its videos (the series page does not).
	type res struct {
		i int
		a *atAPIAnime
	}
	results := make(chan res, len(list))
	sem := make(chan struct{}, 4)
	pending := 0
	for i, item := range list {
		if item.Slug == found.Slug {
			results <- res{i, found}
			pending++
			continue
		}
		pending++
		go func(i int, slug string) {
			sem <- struct{}{}
			defer func() { <-sem }()
			a, err := animeThemesSiteAnime(ctx, slug)
			if err != nil {
				a = nil
			}
			results <- res{i, a}
		}(i, item.Slug)
	}
	for ; pending > 0; pending-- {
		r := <-results
		item := list[r.i]
		if r.a == nil {
			item.Themes = []*AnimeTheme{}
			continue
		}
		item.AnilistID = r.a.anilistID()
		item.Image = r.a.image()
		item.Themes = r.a.themes()
		if item.AnilistID == anilistID {
			item.Current = true
		}
	}

	for _, a := range list {
		if len(a.Themes) > 0 || a.Current {
			out.Anime = append(out.Anime, a)
		}
	}
	return out, nil
}
