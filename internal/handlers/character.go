package handlers

import (
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/util/result"
	"strconv"
	"time"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
)

type CharacterDetailsResponse struct {
	ID          int                       `json:"id"`
	Name        *CharacterName            `json:"name"`
	Image       *CharacterImage           `json:"image"`
	Description string                    `json:"description"`
	Gender      string                    `json:"gender"`
	Age         string                    `json:"age"`
	BloodType   string                    `json:"bloodType"`
	SiteUrl     string                    `json:"siteUrl"`
	DateOfBirth *CharacterDate            `json:"dateOfBirth"`
	Favourites  int                       `json:"favourites"`
	Media       *CharacterMediaConnection `json:"media"`
}

type CharacterName struct {
	First              string   `json:"first"`
	Middle             string   `json:"middle"`
	Last               string   `json:"last"`
	Full               string   `json:"full"`
	Native             string   `json:"native"`
	UserPreferred      string   `json:"userPreferred"`
	Alternative        []string `json:"alternative"`
	AlternativeSpoiler []string `json:"alternativeSpoiler"`
}

type CharacterImage struct {
	Large  string `json:"large"`
	Medium string `json:"medium"`
}

type CharacterDate struct {
	Year  *int `json:"year"`
	Month *int `json:"month"`
	Day   *int `json:"day"`
}

type CharacterMediaConnection struct {
	Edges []*CharacterMediaEdge `json:"edges"`
}

type CharacterMediaEdge struct {
	CharacterRole string `json:"characterRole"`
	// Every language's voice actor for this role (the role's dub notes are on VoiceActorRoles).
	VoiceActors     []*CharacterVoiceActor     `json:"voiceActors"`
	VoiceActorRoles []*CharacterVoiceActorRole `json:"voiceActorRoles"`
	Node            *CharacterMediaNode        `json:"node"`
}

type CharacterVoiceActorRole struct {
	RoleNotes  string               `json:"roleNotes"`
	DubGroup   string               `json:"dubGroup"`
	VoiceActor *CharacterVoiceActor `json:"voiceActor"`
}

type CharacterVoiceActor struct {
	ID         int              `json:"id"`
	Name       *CharacterVAName `json:"name"`
	Image      *CharacterImage  `json:"image"`
	LanguageV2 string           `json:"languageV2"`
}

type CharacterVAName struct {
	Full   string `json:"full"`
	Native string `json:"native"`
}

type CharacterMediaNode struct {
	ID              int             `json:"id"`
	IDMal           *int            `json:"idMal"`
	SiteUrl         string          `json:"siteUrl"`
	Status          string          `json:"status"`
	Season          string          `json:"season"`
	SeasonYear      *int            `json:"seasonYear"`
	Type            string          `json:"type"`
	Format          string          `json:"format"`
	BannerImage     string          `json:"bannerImage"`
	Episodes        *int            `json:"episodes"`
	Chapters        *int            `json:"chapters"`
	Volumes         *int            `json:"volumes"`
	Synonyms        []string        `json:"synonyms"`
	IsAdult         bool            `json:"isAdult"`
	CountryOfOrigin string          `json:"countryOfOrigin"`
	MeanScore       *int            `json:"meanScore"`
	AverageScore    *int            `json:"averageScore"`
	Popularity      *int            `json:"popularity"`
	Description     string          `json:"description"`
	Genres          []string        `json:"genres"`
	Title           *CharacterTitle `json:"title"`
	CoverImage      *CharacterCover `json:"coverImage"`
	StartDate       *CharacterDate  `json:"startDate"`
	EndDate         *CharacterDate  `json:"endDate"`
}

type CharacterTitle struct {
	UserPreferred string `json:"userPreferred"`
	Romaji        string `json:"romaji"`
	English       string `json:"english"`
	Native        string `json:"native"`
}

type CharacterCover struct {
	ExtraLarge string `json:"extraLarge"`
	Large      string `json:"large"`
	Medium     string `json:"medium"`
	Color      string `json:"color"`
}

// characterCacheTTL keeps AniList character data fresh enough (favourites, new appearances) without
// asking for it on every visit.
const characterCacheTTL = 6 * time.Hour

type cachedCharacter struct {
	at   time.Time
	data *CharacterDetailsResponse
}

var characterDetailsMap = result.NewMap[int, cachedCharacter]()

// anilistDataQuery runs a raw AniList query with the request's context and the account token, and
// decodes `data` into out.
func (h *Handler) anilistDataQuery(c echo.Context, query string, variables map[string]interface{}, out interface{}) error {
	token := ""
	if acc, err := h.App.Database.GetAccount(); err == nil && acc.Token != "" {
		token = acc.Token
	}
	bodyBytes, err := json.Marshal(map[string]interface{}{"query": query, "variables": variables})
	if err != nil {
		return err
	}
	rawData, err := anilist.CustomQueryCtx(c.Request().Context(), bodyBytes, h.App.Logger, token)
	if err != nil {
		return err
	}
	dataMap, ok := rawData.(map[string]interface{})
	if !ok {
		return echo.NewHTTPError(500, "invalid response from AniList")
	}
	jsonBytes, err := json.Marshal(dataMap)
	if err != nil {
		return err
	}
	return json.Unmarshal(jsonBytes, out)
}

// HandleGetAnilistCharacterDetails
//
//	@summary returns details about a character.
//	@desc This fetches media associated with the character, voice actors, and other info.
//	@param id - int - true - "The AniList character ID"
//	@returns CharacterDetailsResponse
//	@route /api/v1/anilist/character-details/{id} [GET]
func (h *Handler) HandleGetAnilistCharacterDetails(c echo.Context) error {
	mId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if cached, ok := characterDetailsMap.Get(mId); ok && time.Since(cached.at) < characterCacheTTL {
		return h.RespondWithData(c, cached.data)
	}

	// Kept in sync with internal/api/anilist/queries/character.graphql.
	query := `query CharacterDetails($id: Int) {
  Character(id: $id) {
    id
    name { first middle last full native userPreferred alternative alternativeSpoiler }
    image { large medium }
    description(asHtml: false)
    gender
    age
    bloodType
    siteUrl
    dateOfBirth { year month day }
    favourites
    media(sort: POPULARITY_DESC, perPage: 80) {
      edges {
        characterRole
        voiceActorRoles(sort: [RELEVANCE, ID]) {
          roleNotes
          dubGroup
          voiceActor {
            id
            name { full native }
            image { large medium }
            languageV2
          }
        }
        node {
          id idMal siteUrl status(version: 2) season seasonYear type format bannerImage
          episodes chapters volumes synonyms isAdult countryOfOrigin meanScore averageScore popularity description genres
          title { userPreferred romaji english native }
          coverImage { extraLarge large medium color }
          startDate { year month day }
          endDate { year month day }
        }
      }
    }
  }
}`

	var resp struct {
		Character *CharacterDetailsResponse `json:"Character"`
	}
	if err := h.anilistDataQuery(c, query, map[string]interface{}{"id": mId}, &resp); err != nil {
		return h.RespondWithError(c, err)
	}
	if resp.Character == nil {
		return h.RespondWithError(c, echo.NewHTTPError(404, "character not found"))
	}

	// voiceActors mirrors the roles' actors for callers that read the flat list.
	if resp.Character.Media != nil {
		for _, edge := range resp.Character.Media.Edges {
			if edge == nil {
				continue
			}
			edge.VoiceActors = edge.VoiceActors[:0]
			for _, role := range edge.VoiceActorRoles {
				if role != nil && role.VoiceActor != nil {
					edge.VoiceActors = append(edge.VoiceActors, role.VoiceActor)
				}
			}
		}
	}

	characterDetailsMap.Set(mId, cachedCharacter{at: time.Now(), data: resp.Character})

	return h.RespondWithData(c, resp.Character)
}

type MediaCharactersResponse struct {
	Total       int                   `json:"total"`
	HasNextPage bool                  `json:"hasNextPage"`
	Page        int                   `json:"page"`
	Edges       []*MediaCharacterEdge `json:"edges"`
}

type MediaCharacterEdge struct {
	Role        string                 `json:"role"`
	Node        *MediaCharacterNode    `json:"node"`
	VoiceActors []*CharacterVoiceActor `json:"voiceActors"`
}

type MediaCharacterNode struct {
	ID          int             `json:"id"`
	Name        *CharacterName  `json:"name"`
	Image       *CharacterImage `json:"image"`
	Age         string          `json:"age"`
	Gender      string          `json:"gender"`
	Favourites  int             `json:"favourites"`
	IsFavourite bool            `json:"isFavourite"`
}

type cachedMediaCharacters struct {
	at   time.Time
	data *MediaCharactersResponse
}

var mediaCharactersMap = result.NewMap[string, cachedMediaCharacters]()

// HandleGetAnilistMediaCharacters
//
//	@summary returns one page of a media's characters.
//	@desc Every character of an anime or manga, 25 per page, main roles first, with Japanese voice actors.
//	@param id - int - true - "The AniList media ID"
//	@returns MediaCharactersResponse
//	@route /api/v1/anilist/media-characters/{id} [GET]
func (h *Handler) HandleGetAnilistMediaCharacters(c echo.Context) error {
	mId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}

	key := fmt.Sprintf("%d:%d", mId, page)
	if cached, ok := mediaCharactersMap.Get(key); ok && time.Since(cached.at) < characterCacheTTL {
		return h.RespondWithData(c, cached.data)
	}

	query := `query MediaCharacters($id: Int, $page: Int) {
  Media(id: $id) {
    characters(page: $page, perPage: 25, sort: [ROLE, RELEVANCE, ID]) {
      pageInfo { total hasNextPage currentPage }
      edges {
        role
        node {
          id
          name { full native userPreferred }
          image { large medium }
          age
          gender
          favourites
          isFavourite
        }
        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
          id
          name { full native }
          image { large medium }
          languageV2
        }
      }
    }
  }
}`

	var resp struct {
		Media *struct {
			Characters *struct {
				PageInfo *struct {
					Total       int  `json:"total"`
					HasNextPage bool `json:"hasNextPage"`
					CurrentPage int  `json:"currentPage"`
				} `json:"pageInfo"`
				Edges []*MediaCharacterEdge `json:"edges"`
			} `json:"characters"`
		} `json:"Media"`
	}
	if err := h.anilistDataQuery(c, query, map[string]interface{}{"id": mId, "page": page}, &resp); err != nil {
		return h.RespondWithError(c, err)
	}

	out := &MediaCharactersResponse{Page: page, Edges: []*MediaCharacterEdge{}}
	if resp.Media != nil && resp.Media.Characters != nil {
		out.Edges = resp.Media.Characters.Edges
		if pi := resp.Media.Characters.PageInfo; pi != nil {
			out.Total = pi.Total
			out.HasNextPage = pi.HasNextPage
		}
	}

	mediaCharactersMap.Set(key, cachedMediaCharacters{at: time.Now(), data: out})

	return h.RespondWithData(c, out)
}
