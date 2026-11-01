package handlers

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	"seanime/internal/api/anilist"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/singleflight"
)

// The staff page: everything a person has worked on, and the characters they have voiced. StaffDetails
// stays the quick first answer; this walks every page behind it the way the studio page does, through
// the paced raw-query path and cached, in the user lane because someone is waiting on the page.

const (
	staffCareerTTL        = 12 * time.Hour
	staffCareerPartialTTL = 5 * time.Minute
	staffCareerMaxPages   = 40 // 1000 titles on each list (AniList pages these 25 at a time)
)

const staffMediaFields = `id idMal siteUrl status(version: 2) season type format bannerImage episodes chapters volumes
	synonyms isAdult countryOfOrigin meanScore description genres
	title { userPreferred romaji english native }
	coverImage { extraLarge large medium color }
	startDate { year month day }
	endDate { year month day }`

const staffCreditsQuery = `query ($id: Int, $page: Int) { Staff(id: $id) {
	age gender homeTown yearsActive languageV2 favourites siteUrl
	dateOfBirth { year month day }
	dateOfDeath { year month day }
	staffMedia(page: $page, perPage: 25, sort: [START_DATE_DESC]) {
		pageInfo { hasNextPage }
		edges { staffRole node { ` + staffMediaFields + ` } }
	}
} }`

const staffCharactersQuery = `query ($id: Int, $page: Int) { Staff(id: $id) {
	characterMedia(page: $page, perPage: 25, sort: [START_DATE_DESC]) {
		pageInfo { hasNextPage }
		edges {
			characterRole
			characters { id name { full native } image { large } }
			node { ` + staffMediaFields + ` }
		}
	}
} }`

type StaffCareerDate struct {
	Year  int `json:"year,omitempty"`
	Month int `json:"month,omitempty"`
	Day   int `json:"day,omitempty"`
}

// StaffCareerCredit is one job on one title. The title keeps AniList's shape, which is what the media
// cards take.
type StaffCareerCredit struct {
	StaffRole string          `json:"staffRole"`
	Node      json.RawMessage `json:"node"`
}

type StaffCareerCharacter struct {
	ID   int `json:"id"`
	Name struct {
		Full   string `json:"full"`
		Native string `json:"native"`
	} `json:"name"`
	Image struct {
		Large string `json:"large"`
	} `json:"image"`
}

// StaffCareerVoiceRole is a title and the characters voiced in it.
type StaffCareerVoiceRole struct {
	CharacterRole string                  `json:"characterRole"`
	Characters    []*StaffCareerCharacter `json:"characters"`
	Node          json.RawMessage         `json:"node"`
}

type StaffCareer struct {
	Age         int                     `json:"age,omitempty"`
	Gender      string                  `json:"gender,omitempty"`
	HomeTown    string                  `json:"homeTown,omitempty"`
	YearsActive []int                   `json:"yearsActive,omitempty"`
	Language    string                  `json:"languageV2,omitempty"`
	Favourites  int                     `json:"favourites,omitempty"`
	SiteURL     string                  `json:"siteUrl,omitempty"`
	DateOfBirth *StaffCareerDate        `json:"dateOfBirth,omitempty"`
	DateOfDeath *StaffCareerDate        `json:"dateOfDeath,omitempty"`
	Partial     bool                    `json:"partial,omitempty"` // AniList stopped answering before the last page
	Credits     []*StaffCareerCredit    `json:"credits"`
	Characters  []*StaffCareerVoiceRole `json:"characters"`
}

type staffCareerEntry struct {
	data *StaffCareer
	at   time.Time
}

func (e *staffCareerEntry) fresh() bool {
	if e.data.Partial {
		return time.Since(e.at) < staffCareerPartialTTL
	}
	return time.Since(e.at) < staffCareerTTL
}

var (
	staffCareerMu     sync.Mutex
	staffCareerCache  = map[int]*staffCareerEntry{}
	staffCareerFlight singleflight.Group
)

// HandleGetStaffCareer
//
//	@summary returns everything a staff member has worked on and the characters they voiced.
//	@param id - int - true - "The AniList staff ID"
//	@returns handlers.StaffCareer
//	@route /api/v1/anilist/staff/{id}/career [GET]
func (h *Handler) HandleGetStaffCareer(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return h.RespondWithError(c, errors.New("invalid staff id"))
	}

	staffCareerMu.Lock()
	cached := staffCareerCache[id]
	staffCareerMu.Unlock()
	if cached != nil && cached.fresh() {
		return h.RespondWithData(c, cached.data)
	}

	ch := staffCareerFlight.DoChan(strconv.Itoa(id), func() (any, error) {
		ctx, cancel := context.WithTimeout(anilist.WithUserInitiated(context.Background()), 3*time.Minute)
		defer cancel()
		career, err := h.fetchStaffCareer(ctx, id)
		if err != nil {
			return nil, err
		}
		staffCareerMu.Lock()
		staffCareerCache[id] = &staffCareerEntry{data: career, at: time.Now()}
		staffCareerMu.Unlock()
		return career, nil
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

// walkStaffPages asks for pages until one says it is the last. An error past the first page keeps what
// arrived and reports it as partial.
func walkStaffPages(fetch func(page int) (hasNext bool, err error)) (partial bool, err error) {
	for page := 1; page <= staffCareerMaxPages; page++ {
		hasNext, err := fetch(page)
		if err != nil {
			if page > 1 {
				return true, nil
			}
			return false, err
		}
		if !hasNext {
			return false, nil
		}
	}
	return true, nil
}

func (h *Handler) staffCareerQuery(ctx context.Context, query string, id int, page int, into any) error {
	body, err := json.Marshal(map[string]any{"query": query, "variables": map[string]any{"id": id, "page": page}})
	if err != nil {
		return err
	}
	data, err := anilist.CustomQueryCtx(ctx, body, h.App.Logger)
	if err != nil {
		return err
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, into)
}

func (h *Handler) fetchStaffCareer(ctx context.Context, id int) (*StaffCareer, error) {
	career := &StaffCareer{Credits: []*StaffCareerCredit{}, Characters: []*StaffCareerVoiceRole{}}

	partial, err := walkStaffPages(func(page int) (bool, error) {
		var res struct {
			Staff *struct {
				StaffCareer
				StaffMedia struct {
					PageInfo struct {
						HasNextPage bool `json:"hasNextPage"`
					} `json:"pageInfo"`
					Edges []*StaffCareerCredit `json:"edges"`
				} `json:"staffMedia"`
			} `json:"Staff"`
		}
		if err := h.staffCareerQuery(ctx, staffCreditsQuery, id, page, &res); err != nil {
			return false, err
		}
		if res.Staff == nil {
			return false, errors.New("staff not found")
		}
		if page == 1 {
			s := res.Staff
			career.Age, career.Gender, career.HomeTown, career.YearsActive = s.Age, s.Gender, s.HomeTown, s.YearsActive
			career.Language, career.Favourites, career.SiteURL = s.Language, s.Favourites, s.SiteURL
			career.DateOfBirth, career.DateOfDeath = s.DateOfBirth, s.DateOfDeath
		}
		career.Credits = append(career.Credits, res.Staff.StaffMedia.Edges...)
		return res.Staff.StaffMedia.PageInfo.HasNextPage, nil
	})
	if err != nil {
		return nil, err
	}

	voicePartial, err := walkStaffPages(func(page int) (bool, error) {
		var res struct {
			Staff *struct {
				CharacterMedia struct {
					PageInfo struct {
						HasNextPage bool `json:"hasNextPage"`
					} `json:"pageInfo"`
					Edges []*StaffCareerVoiceRole `json:"edges"`
				} `json:"characterMedia"`
			} `json:"Staff"`
		}
		if err := h.staffCareerQuery(ctx, staffCharactersQuery, id, page, &res); err != nil {
			return false, err
		}
		if res.Staff == nil {
			return false, errors.New("staff not found")
		}
		career.Characters = append(career.Characters, res.Staff.CharacterMedia.Edges...)
		return res.Staff.CharacterMedia.PageInfo.HasNextPage, nil
	})
	// The credits are worth showing even if the voice roles could not be read.
	career.Partial = partial || voicePartial || err != nil
	return career, nil
}
