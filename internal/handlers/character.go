package handlers

import (
	"seanime/internal/api/anilist"
	"seanime/internal/util/result"
	"strconv"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
)

type CharacterDetailsResponse struct {
	ID          int                         `json:"id"`
	Name        *CharacterName              `json:"name"`
	Image       *CharacterImage             `json:"image"`
	Description string                      `json:"description"`
	Gender      string                      `json:"gender"`
	Age         string                      `json:"age"`
	DateOfBirth *CharacterDate              `json:"dateOfBirth"`
	Favourites  int                         `json:"favourites"`
	Media       *CharacterMediaConnection   `json:"media"`
}

type CharacterName struct {
	Full        string   `json:"full"`
	Native      string   `json:"native"`
	Alternative []string `json:"alternative"`
}

type CharacterImage struct {
	Large string `json:"large"`
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
	CharacterRole string                  `json:"characterRole"`
	VoiceActors   []*CharacterVoiceActor  `json:"voiceActors"`
	Node          *CharacterMediaNode     `json:"node"`
}

type CharacterVoiceActor struct {
	ID         int                 `json:"id"`
	Name       *CharacterVAName    `json:"name"`
	Image      *CharacterImage     `json:"image"`
	LanguageV2 string              `json:"languageV2"`
}

type CharacterVAName struct {
	Full   string `json:"full"`
	Native string `json:"native"`
}

type CharacterMediaNode struct {
	ID             int              `json:"id"`
	IDMal          *int             `json:"idMal"`
	SiteUrl        string           `json:"siteUrl"`
	Status         string           `json:"status"`
	Season         string           `json:"season"`
	Type           string           `json:"type"`
	Format         string           `json:"format"`
	BannerImage    string           `json:"bannerImage"`
	Episodes       *int             `json:"episodes"`
	Chapters       *int             `json:"chapters"`
	Volumes        *int             `json:"volumes"`
	Synonyms       []string         `json:"synonyms"`
	IsAdult        bool             `json:"isAdult"`
	CountryOfOrigin string          `json:"countryOfOrigin"`
	MeanScore      *int             `json:"meanScore"`
	Description    string           `json:"description"`
	Genres         []string         `json:"genres"`
	Title          *CharacterTitle  `json:"title"`
	CoverImage     *CharacterCover  `json:"coverImage"`
	StartDate      *CharacterDate   `json:"startDate"`
	EndDate        *CharacterDate   `json:"endDate"`
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

var characterDetailsMap = result.NewMap[int, *CharacterDetailsResponse]()

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

	if details, ok := characterDetailsMap.Get(mId); ok {
		return h.RespondWithData(c, details)
	}

	query := `query CharacterDetails($id: Int) {
  Character(id: $id) {
    id
    name { full native alternative }
    image { large }
    description(asHtml: false)
    gender
    age
    dateOfBirth { year month day }
    favourites
    media(sort: POPULARITY_DESC, perPage: 80) {
      edges {
        characterRole
        voiceActors(language: JAPANESE, sort: RELEVANCE) {
          id
          name { full native }
          image { large }
          languageV2
        }
        node {
          id idMal siteUrl status(version: 2) season type format bannerImage
          episodes chapters volumes synonyms isAdult countryOfOrigin meanScore description genres
          title { userPreferred romaji english native }
          coverImage { extraLarge large medium color }
          startDate { year month day }
          endDate { year month day }
        }
      }
    }
  }
}`

	token := ""
	if acc, err := h.App.Database.GetAccount(); err == nil && acc.Token != "" {
		token = acc.Token
	}

	body := map[string]interface{}{
		"query":     query,
		"variables": map[string]interface{}{"id": mId},
	}

	rawData, err := anilist.CustomQuery(body, h.App.Logger, token)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Parse the response
	type gqlResponse struct {
		Character *CharacterDetailsResponse `json:"Character"`
	}
	dataMap, ok := rawData.(map[string]interface{})
	if !ok {
		return h.RespondWithError(c, echo.NewHTTPError(500, "invalid response from AniList"))
	}

	// Re-marshal and unmarshal into typed struct
	jsonBytes, err := json.Marshal(dataMap)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	var resp gqlResponse
	if err := json.Unmarshal(jsonBytes, &resp); err != nil {
		return h.RespondWithError(c, err)
	}

	if resp.Character == nil {
		return h.RespondWithError(c, echo.NewHTTPError(404, "character not found"))
	}

	go func() {
		characterDetailsMap.Set(mId, resp.Character)
	}()

	return h.RespondWithData(c, resp.Character)
}
