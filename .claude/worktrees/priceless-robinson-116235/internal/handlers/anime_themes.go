package handlers

import (
	"fmt"
	"io"
	"net/http"
	"seanime/internal/util/result"
	"strconv"
	"time"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
)

// AnimeTheme represents an opening or ending theme
type AnimeTheme struct {
	Type     string             `json:"type"`     // "OP" or "ED"
	Sequence int                `json:"sequence"` // 1, 2, 3...
	Slug     string             `json:"slug"`     // "OP1", "ED2" etc.
	Song     *AnimeThemeSong    `json:"song"`
	Entries  []*AnimeThemeEntry `json:"entries"`
}

type AnimeThemeSong struct {
	Title   string              `json:"title"`
	Artists []*AnimeThemeArtist `json:"artists"`
}

type AnimeThemeArtist struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type AnimeThemeEntry struct {
	Version  int                `json:"version"`
	Episodes string             `json:"episodes"`
	NSFW     bool               `json:"nsfw"`
	Spoiler  bool               `json:"spoiler"`
	Videos   []*AnimeThemeVideo `json:"videos"`
}

type AnimeThemeVideo struct {
	Link       string `json:"link"`
	Resolution int    `json:"resolution"`
	NC         bool   `json:"nc"`
	Subbed     bool   `json:"subbed"`
	Tags       string `json:"tags"`
	Basename   string `json:"basename"`
}

type AnimeThemesResponse struct {
	Themes []*AnimeTheme `json:"themes"`
}

var animeThemesCache = result.NewMap[int, *AnimeThemesResponse]()

// HandleGetAnimeThemes
//
//	@summary returns opening/ending themes for an anime.
//	@desc This proxies the animethemes.moe API using the anime's MAL ID.
//	@param id - int - true - "The MyAnimeList ID"
//	@returns AnimeThemesResponse
//	@route /api/v1/anime-themes/{id} [GET]
func (h *Handler) HandleGetAnimeThemes(c echo.Context) error {
	malID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if malID <= 0 {
		return h.RespondWithData(c, &AnimeThemesResponse{Themes: []*AnimeTheme{}})
	}

	if cached, ok := animeThemesCache.Get(malID); ok {
		return h.RespondWithData(c, cached)
	}

	themes, err := fetchAnimeThemes(malID)
	if err != nil {
		h.App.Logger.Warn().Err(err).Int("malId", malID).Msg("animethemes: Failed to fetch themes")
		// Return empty rather than error — themes are non-critical
		empty := &AnimeThemesResponse{Themes: []*AnimeTheme{}}
		return h.RespondWithData(c, empty)
	}

	go func() {
		animeThemesCache.Set(malID, themes)
	}()

	return h.RespondWithData(c, themes)
}

func fetchAnimeThemes(malID int) (*AnimeThemesResponse, error) {
	url := fmt.Sprintf(
		"https://api.animethemes.moe/anime?filter[has]=resources&filter[site]=MyAnimeList&filter[external_id]=%d&include=animethemes.animethemeentries.videos,animethemes.song.artists",
		malID,
	)

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Seanime/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("animethemes API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Parse the nested animethemes.moe API response
	var apiResp struct {
		Anime []struct {
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
					} `json:"videos"`
				} `json:"animethemeentries"`
			} `json:"animethemes"`
		} `json:"anime"`
	}

	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse animethemes response: %w", err)
	}

	result := &AnimeThemesResponse{Themes: []*AnimeTheme{}}

	if len(apiResp.Anime) == 0 {
		return result, nil
	}

	for _, at := range apiResp.Anime[0].AnimeThemes {
		theme := &AnimeTheme{
			Type:     at.Type,
			Sequence: at.Sequence,
			Slug:     at.Slug,
			Entries:  make([]*AnimeThemeEntry, 0),
		}

		if at.Song != nil {
			theme.Song = &AnimeThemeSong{
				Title:   at.Song.Title,
				Artists: make([]*AnimeThemeArtist, 0),
			}
			for _, a := range at.Song.Artists {
				theme.Song.Artists = append(theme.Song.Artists, &AnimeThemeArtist{
					Name: a.Name,
					Slug: a.Slug,
				})
			}
		}

		for _, entry := range at.AnimeThemeEntries {
			te := &AnimeThemeEntry{
				Version:  entry.Version,
				Episodes: entry.Episodes,
				NSFW:     entry.NSFW,
				Spoiler:  entry.Spoiler,
				Videos:   make([]*AnimeThemeVideo, 0),
			}
			for _, v := range entry.Videos {
				te.Videos = append(te.Videos, &AnimeThemeVideo{
					Link:       v.Link,
					Resolution: v.Resolution,
					NC:         v.NC,
					Subbed:     v.Subbed,
					Tags:       v.Tags,
					Basename:   v.Basename,
				})
			}
			theme.Entries = append(theme.Entries, te)
		}

		result.Themes = append(result.Themes, theme)
	}

	return result, nil
}
