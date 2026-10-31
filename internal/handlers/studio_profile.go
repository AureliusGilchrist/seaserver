package handlers

import (
	"context"
	"errors"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/anilist"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/singleflight"
)

// The studio page: the studio's whole filmography with the people who directed it, and the numbers
// that describe a studio — how long it has worked, what it makes, how well it is received. Fetched
// through the paced raw-query path (CustomQueryCtx) and cached, since a large studio is several pages
// of AniList. Someone is waiting on the page, so it runs in the user lane: the background lane is often
// full for minutes at a time, and every studio then came back refused.

const (
	studioProfileTTL      = 12 * time.Hour
	studioPartialTTL      = 5 * time.Minute // a filmography cut short by a busy AniList is soon asked for again
	studioProfileMaxPages = 12              // 300 titles (AniList pages a studio's media 25 at a time)
)

type studioProfileEntry struct {
	data *StudioProfile
	at   time.Time
}

func (e *studioProfileEntry) fresh() bool {
	if e.data.Partial {
		return time.Since(e.at) < studioPartialTTL
	}
	return time.Since(e.at) < studioProfileTTL
}

var (
	studioProfileMu     sync.Mutex
	studioProfileCache  = map[int]*studioProfileEntry{}
	studioProfileFlight singleflight.Group
)

type StudioWork struct {
	ID           int                  `json:"id"`
	IDMal        int                  `json:"idMal,omitempty"`
	Format       string               `json:"format,omitempty"`
	Status       string               `json:"status,omitempty"`
	Episodes     int                  `json:"episodes,omitempty"`
	Duration     int                  `json:"duration,omitempty"`
	Season       string               `json:"season,omitempty"`
	SeasonYear   int                  `json:"seasonYear,omitempty"`
	StartDate    *anilist.FamilyDate  `json:"startDate,omitempty"`
	Title        *anilist.FamilyTitle `json:"title,omitempty"`
	CoverImage   *anilist.FamilyCover `json:"coverImage,omitempty"`
	BannerImage  string               `json:"bannerImage,omitempty"`
	MeanScore    int                  `json:"meanScore,omitempty"`
	Popularity   int                  `json:"popularity,omitempty"`
	Favourites   int                  `json:"favourites,omitempty"`
	Genres       []string             `json:"genres,omitempty"`
	IsAdult      bool                 `json:"isAdult,omitempty"`
	IsMainStudio bool                 `json:"isMainStudio"`
	Directors    []int                `json:"directors,omitempty"` // staff ids
}

type StudioPerson struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Native string `json:"native,omitempty"`
	Image  string `json:"image,omitempty"`
	Role   string `json:"role"`  // the most senior directing role they held here
	Works  []int  `json:"works"` // media ids, newest first
}

type StudioCount struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

type StudioProfile struct {
	ID                int             `json:"id"`
	Name              string          `json:"name"`
	IsAnimationStudio bool            `json:"isAnimationStudio"`
	SiteURL           string          `json:"siteUrl,omitempty"`
	Favourites        int             `json:"favourites"`
	TotalWorks        int             `json:"totalWorks"`        // AniList's count, which may exceed Works
	Partial           bool            `json:"partial,omitempty"` // AniList stopped answering before the last page
	Works             []*StudioWork   `json:"works"`
	Directors         []*StudioPerson `json:"directors"`
	Stats             StudioStats     `json:"stats"`
}

type StudioStats struct {
	MainCount       int           `json:"mainCount"`
	SupportingCount int           `json:"supportingCount"`
	FirstYear       int           `json:"firstYear,omitempty"`
	LastYear        int           `json:"lastYear,omitempty"`
	MeanScore       float64       `json:"meanScore,omitempty"` // popularity-weighted, main works
	TotalEpisodes   int           `json:"totalEpisodes"`
	TotalMinutes    int           `json:"totalMinutes"`
	TotalPopularity int           `json:"totalPopularity"`
	TotalFavourites int           `json:"totalFavourites"`
	Airing          int           `json:"airing"`
	Upcoming        int           `json:"upcoming"`
	Formats         []StudioCount `json:"formats"`
	Genres          []StudioCount `json:"genres"`
	Years           []StudioCount `json:"years"` // main works per start year, oldest first
}

const studioProfileQuery = `query ($id: Int, $page: Int) { Studio(id: $id) {
	id name isAnimationStudio siteUrl favourites
	media(page: $page, perPage: 25, sort: [START_DATE_DESC]) {
		pageInfo { total hasNextPage }
		edges { isMainStudio node {
			id idMal format status episodes duration season seasonYear isAdult
			startDate { year month day }
			title { userPreferred romaji english native }
			coverImage { extraLarge large medium color }
			bannerImage meanScore popularity favourites genres
			staff(perPage: 8, sort: [RELEVANCE]) { edges { role node { id name { full native } image { medium } } } }
		} }
	}
} }`

// HandleGetStudioProfile
//
//	@summary returns a studio's filmography, directors and statistics.
//	@desc Every title the studio worked on (main or supporting), newest first, with the directors
//	@desc credited on each, plus totals: years active, formats, genres, scores, episodes.
//	@returns handlers.StudioProfile
//	@param id - int - true - "The AniList studio ID"
//	@route /api/v1/anilist/studio/{id}/profile [GET]
func (h *Handler) HandleGetStudioProfile(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return h.RespondWithError(c, errors.New("invalid studio id"))
	}

	studioProfileMu.Lock()
	cached := studioProfileCache[id]
	studioProfileMu.Unlock()
	if cached != nil && cached.fresh() {
		return h.RespondWithData(c, cached.data)
	}

	ch := studioProfileFlight.DoChan(strconv.Itoa(id), func() (any, error) {
		ctx, cancel := context.WithTimeout(anilist.WithUserInitiated(context.Background()), 3*time.Minute)
		defer cancel()
		profile, err := h.fetchStudioProfile(ctx, id)
		if err != nil {
			return nil, err
		}
		studioProfileMu.Lock()
		studioProfileCache[id] = &studioProfileEntry{data: profile, at: time.Now()}
		studioProfileMu.Unlock()
		return profile, nil
	})

	select {
	case res := <-ch:
		if res.Err != nil {
			if cached != nil {
				return h.RespondWithData(c, cached.data)
			}
			return h.RespondWithError(c, res.Err)
		}
		return h.RespondWithData(c, res.Val)
	case <-c.Request().Context().Done():
		return c.Request().Context().Err()
	}
}

type rawStudioPage struct {
	Studio *struct {
		ID                int    `json:"id"`
		Name              string `json:"name"`
		IsAnimationStudio bool   `json:"isAnimationStudio"`
		SiteURL           string `json:"siteUrl"`
		Favourites        int    `json:"favourites"`
		Media             struct {
			PageInfo struct {
				Total       int  `json:"total"`
				HasNextPage bool `json:"hasNextPage"`
			} `json:"pageInfo"`
			Edges []struct {
				IsMainStudio bool `json:"isMainStudio"`
				Node         *struct {
					StudioWork
					Staff struct {
						Edges []struct {
							Role string `json:"role"`
							Node *struct {
								ID   int `json:"id"`
								Name struct {
									Full   string `json:"full"`
									Native string `json:"native"`
								} `json:"name"`
								Image struct {
									Medium string `json:"medium"`
								} `json:"image"`
							} `json:"node"`
						} `json:"edges"`
					} `json:"staff"`
				} `json:"node"`
			} `json:"edges"`
		} `json:"media"`
	} `json:"Studio"`
}

// directorRole matches the directing credits, most senior first: "Director", "Chief Director",
// "Series Director", "Assistant Director"… but not "Episode Director", "Sound Director" or
// "Art Director", which are other jobs.
var directorRole = regexp.MustCompile(`(?i)^(chief |series |general )?director\b|^(co-|assistant )director\b`)

// isDirectorCredit is a directing credit for the work as a whole — not "Director of Photography",
// and not a single episode's "Director (ep 3)", which is an episode director by another name.
func isDirectorCredit(role string) bool {
	r := strings.ToLower(strings.TrimSpace(role))
	if strings.Contains(r, "photography") || strings.Contains(r, "(ep") {
		return false
	}
	return directorRole.MatchString(strings.TrimSpace(role))
}

func directorRank(role string) int {
	r := strings.ToLower(role)
	switch {
	case strings.HasPrefix(r, "chief director"), strings.HasPrefix(r, "general director"), strings.HasPrefix(r, "series director"):
		return 0
	case strings.HasPrefix(r, "director"):
		return 1
	case strings.HasPrefix(r, "co-director"):
		return 2
	default:
		return 3
	}
}

func (h *Handler) fetchStudioProfile(ctx context.Context, id int) (*StudioProfile, error) {
	profile := &StudioProfile{ID: id, Works: []*StudioWork{}, Directors: []*StudioPerson{}}
	people := map[int]*StudioPerson{}
	seen := map[int]bool{}

	for page := 1; page <= studioProfileMaxPages; page++ {
		body, _ := json.Marshal(map[string]any{"query": studioProfileQuery, "variables": map[string]any{"id": id, "page": page}})
		data, err := anilist.CustomQueryCtx(ctx, body, h.App.Logger)
		if err != nil {
			if page > 1 {
				profile.Partial = true // what arrived is still worth showing
				break
			}
			return nil, err
		}
		raw, _ := json.Marshal(data)
		var parsed rawStudioPage
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, err
		}
		if parsed.Studio == nil {
			return nil, errors.New("studio not found")
		}
		s := parsed.Studio
		profile.Name, profile.IsAnimationStudio, profile.SiteURL, profile.Favourites = s.Name, s.IsAnimationStudio, s.SiteURL, s.Favourites
		profile.TotalWorks = s.Media.PageInfo.Total

		for _, e := range s.Media.Edges {
			if e.Node == nil || seen[e.Node.ID] {
				continue
			}
			seen[e.Node.ID] = true
			w := e.Node.StudioWork
			w.IsMainStudio = e.IsMainStudio
			for _, se := range e.Node.Staff.Edges {
				if se.Node == nil || !isDirectorCredit(se.Role) {
					continue
				}
				w.Directors = append(w.Directors, se.Node.ID)
				p := people[se.Node.ID]
				if p == nil {
					p = &StudioPerson{ID: se.Node.ID, Name: se.Node.Name.Full, Native: se.Node.Name.Native, Image: se.Node.Image.Medium, Role: se.Role}
					people[se.Node.ID] = p
				} else if directorRank(se.Role) < directorRank(p.Role) {
					p.Role = se.Role
				}
				p.Works = append(p.Works, w.ID)
			}
			work := w
			profile.Works = append(profile.Works, &work)
		}
		if !s.Media.PageInfo.HasNextPage {
			break
		}
	}

	for _, p := range people {
		profile.Directors = append(profile.Directors, p)
	}
	sort.Slice(profile.Directors, func(i, j int) bool {
		a, b := profile.Directors[i], profile.Directors[j]
		if len(a.Works) != len(b.Works) {
			return len(a.Works) > len(b.Works)
		}
		return a.Name < b.Name
	})

	profile.Stats = studioStats(profile.Works)
	return profile, nil
}

func studioStats(works []*StudioWork) StudioStats {
	var st StudioStats
	formats, genres, years := map[string]int{}, map[string]int{}, map[int]int{}
	var scoreSum, scoreWeight float64
	for _, w := range works {
		if w.IsMainStudio {
			st.MainCount++
		} else {
			st.SupportingCount++
		}
		switch w.Status {
		case "RELEASING":
			st.Airing++
		case "NOT_YET_RELEASED":
			st.Upcoming++
		}
		if !w.IsMainStudio {
			continue
		}
		year := w.SeasonYear
		if w.StartDate != nil && w.StartDate.Year > 0 {
			year = w.StartDate.Year
		}
		if year > 0 && w.Status != "NOT_YET_RELEASED" {
			years[year]++
			if st.FirstYear == 0 || year < st.FirstYear {
				st.FirstYear = year
			}
			if year > st.LastYear {
				st.LastYear = year
			}
		}
		if w.Format != "" {
			formats[w.Format]++
		}
		for _, g := range w.Genres {
			genres[g]++
		}
		st.TotalEpisodes += w.Episodes
		st.TotalMinutes += w.Episodes * w.Duration
		st.TotalPopularity += w.Popularity
		st.TotalFavourites += w.Favourites
		if w.MeanScore > 0 {
			weight := float64(w.Popularity) + 50
			scoreSum += float64(w.MeanScore) * weight
			scoreWeight += weight
		}
	}
	if scoreWeight > 0 {
		st.MeanScore = scoreSum / scoreWeight
	}
	st.Formats = sortedCounts(formats, 0)
	st.Genres = sortedCounts(genres, 12)
	for y := st.FirstYear; y > 0 && y <= st.LastYear; y++ {
		st.Years = append(st.Years, StudioCount{Key: strconv.Itoa(y), Count: years[y]})
	}
	return st
}

func sortedCounts(m map[string]int, limit int) []StudioCount {
	out := make([]StudioCount, 0, len(m))
	for k, v := range m {
		out = append(out, StudioCount{Key: k, Count: v})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Key < out[j].Key
	})
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}
