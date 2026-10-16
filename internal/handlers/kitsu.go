package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"seanime/internal/util/result"
	"strconv"
	"time"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
)

// KitsuAnimeInfo is supplementary metadata for an anime pulled from Kitsu.
type KitsuAnimeInfo struct {
	Found          bool              `json:"found"`
	ID             string            `json:"id"`
	Slug           string            `json:"slug"`
	URL            string            `json:"url"`
	CanonicalTitle string            `json:"canonicalTitle"`
	Titles         map[string]string `json:"titles"`
	Synopsis       string            `json:"synopsis"`
	Subtype        string            `json:"subtype"`
	Status         string            `json:"status"`
	AgeRating      string            `json:"ageRating"`
	AgeRatingGuide string            `json:"ageRatingGuide"`
	AverageRating  string            `json:"averageRating"`
	UserCount      int               `json:"userCount"`
	FavoritesCount int               `json:"favoritesCount"`
	PopularityRank int               `json:"popularityRank"`
	RatingRank     int               `json:"ratingRank"`
	StartDate      string            `json:"startDate"`
	EndDate        string            `json:"endDate"`
	EpisodeCount   int               `json:"episodeCount"`
	EpisodeLength  int               `json:"episodeLength"`
	TotalLength    int               `json:"totalLength"`
	YoutubeVideoID string            `json:"youtubeVideoId"`
	PosterImage    string            `json:"posterImage"`
	CoverImage     string            `json:"coverImage"`
}

var kitsuAnimeCache = result.NewMap[int, *KitsuAnimeInfo]()

// HandleGetKitsuAnimeInfo
//
//	@summary returns supplementary metadata for an anime from Kitsu.
//	@desc This queries the Kitsu API using the anime's MAL ID. Returns found=false when there is no match.
//	@param id - int - true - "The MyAnimeList ID"
//	@returns handlers.KitsuAnimeInfo
//	@route /api/v1/kitsu/anime/{id} [GET]
func (h *Handler) HandleGetKitsuAnimeInfo(c echo.Context) error {
	malID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if malID <= 0 {
		return h.RespondWithData(c, &KitsuAnimeInfo{})
	}

	if cached, ok := kitsuAnimeCache.Get(malID); ok {
		return h.RespondWithData(c, cached)
	}

	info, err := fetchKitsuAnimeInfo(malID)
	if err != nil {
		h.App.Logger.Warn().Err(err).Int("malId", malID).Msg("kitsu: Failed to fetch anime info")
		// Kitsu is supplementary, so return an empty result instead of an error
		return h.RespondWithData(c, &KitsuAnimeInfo{})
	}

	kitsuAnimeCache.Set(malID, info)

	return h.RespondWithData(c, info)
}

func fetchKitsuAnimeInfo(malID int) (*KitsuAnimeInfo, error) {
	q := url.Values{}
	q.Set("filter[externalSite]", "myanimelist/anime")
	q.Set("filter[externalId]", strconv.Itoa(malID))
	q.Set("include", "item")
	endpoint := "https://kitsu.io/api/edge/mappings?" + q.Encode()

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.api+json")
	req.Header.Set("User-Agent", "Seanime/1.0")

	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kitsu API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var apiResp struct {
		Included []struct {
			ID         string `json:"id"`
			Type       string `json:"type"`
			Attributes struct {
				Slug           string            `json:"slug"`
				Synopsis       string            `json:"synopsis"`
				CanonicalTitle string            `json:"canonicalTitle"`
				Titles         map[string]string `json:"titles"`
				AverageRating  string            `json:"averageRating"`
				UserCount      int               `json:"userCount"`
				FavoritesCount int               `json:"favoritesCount"`
				StartDate      string            `json:"startDate"`
				EndDate        string            `json:"endDate"`
				PopularityRank int               `json:"popularityRank"`
				RatingRank     int               `json:"ratingRank"`
				AgeRating      string            `json:"ageRating"`
				AgeRatingGuide string            `json:"ageRatingGuide"`
				Subtype        string            `json:"subtype"`
				Status         string            `json:"status"`
				EpisodeCount   int               `json:"episodeCount"`
				EpisodeLength  int               `json:"episodeLength"`
				TotalLength    int               `json:"totalLength"`
				YoutubeVideoID string            `json:"youtubeVideoId"`
				PosterImage    *struct {
					Large string `json:"large"`
				} `json:"posterImage"`
				CoverImage *struct {
					Large string `json:"large"`
				} `json:"coverImage"`
			} `json:"attributes"`
		} `json:"included"`
	}

	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse kitsu response: %w", err)
	}

	for _, item := range apiResp.Included {
		if item.Type != "anime" {
			continue
		}
		a := item.Attributes
		info := &KitsuAnimeInfo{
			Found:          true,
			ID:             item.ID,
			Slug:           a.Slug,
			URL:            "https://kitsu.io/anime/" + a.Slug,
			CanonicalTitle: a.CanonicalTitle,
			Titles:         a.Titles,
			Synopsis:       a.Synopsis,
			Subtype:        a.Subtype,
			Status:         a.Status,
			AgeRating:      a.AgeRating,
			AgeRatingGuide: a.AgeRatingGuide,
			AverageRating:  a.AverageRating,
			UserCount:      a.UserCount,
			FavoritesCount: a.FavoritesCount,
			PopularityRank: a.PopularityRank,
			RatingRank:     a.RatingRank,
			StartDate:      a.StartDate,
			EndDate:        a.EndDate,
			EpisodeCount:   a.EpisodeCount,
			EpisodeLength:  a.EpisodeLength,
			TotalLength:    a.TotalLength,
			YoutubeVideoID: a.YoutubeVideoID,
		}
		if a.PosterImage != nil {
			info.PosterImage = a.PosterImage.Large
		}
		if a.CoverImage != nil {
			info.CoverImage = a.CoverImage.Large
		}
		return info, nil
	}

	return &KitsuAnimeInfo{}, nil
}
