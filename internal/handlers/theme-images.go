package handlers

import (
	"encoding/json"
	"io/ioutil"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
)

// Theme represents a theme in the index
type ThemeEntry struct {
	ID                  string                 `json:"id"`
	Name                string                 `json:"name"`
	Title               string                 `json:"title"`
	Description         string                 `json:"description"`
	Author              string                 `json:"author"`
	Tags                []string               `json:"tags"`
	PreviewColors       map[string]string      `json:"previewColors"`
	ThemeRef            string                 `json:"themeRef"`
	BackgroundImageUrl  string                 `json:"backgroundImageUrl"`
	CreatedAt           string                 `json:"createdAt"`
	Level               int                    `json:"level,omitempty"`
}

// ThemeIndex represents the theme index.json structure
type ThemeIndex struct {
	Version     string        `json:"version"`
	GeneratedAt string        `json:"generatedAt"`
	Themes      []ThemeEntry  `json:"themes"`
}

// HandleGetMarketplaceThemes returns themes from the marketplace index.json
func (h *Handler) HandleGetMarketplaceThemes(c echo.Context) error {
	// Path to marketplace index.json
	indexPath := filepath.Join(h.App.Config.Data.AppDataDir, "..", "seanime-themes", "index.json")

	// Read index.json
	indexData, err := ioutil.ReadFile(indexPath)
	if err != nil {
		return h.RespondWithError(c, "Failed to read theme marketplace index", err)
	}

	var themeIndex ThemeIndex
	if err := json.Unmarshal(indexData, &themeIndex); err != nil {
		return h.RespondWithError(c, "Failed to parse theme marketplace index", err)
	}

	return h.RespondWithData(c, themeIndex.Themes)
}

// HandlePopulateThemeImages fetches anime images from AniList and caches them in index.json
func (h *Handler) HandlePopulateThemeImages(c echo.Context) error {
	// Path to themes directory and index.json
	indexPath := filepath.Join(h.App.Config.Data.AppDataDir, "..", "seanime-themes", "index.json")

	// Read current index.json
	indexData, err := ioutil.ReadFile(indexPath)
	if err != nil {
		return h.RespondWithError(c, "Failed to read theme index", err)
	}

	var themeIndex ThemeIndex
	if err := json.Unmarshal(indexData, &themeIndex); err != nil {
		return h.RespondWithError(c, "Failed to parse theme index", err)
	}

	// For each theme, fetch anime data from AniList if image URL is empty
	for i, theme := range themeIndex.Themes {
		if theme.BackgroundImageUrl != "" {
			continue // Skip if already has image
		}

		// Convert folder name to anime title for search
		// E.g., "attack-on-titan" -> "Attack on Titan"
		searchQuery := convertFolderNameToTitle(theme.ID)

		// Search AniList for the anime
		ctx := c.Request().Context()
		client := h.GetProfileAnilistClient(c)
		results, err := client.ListAnime(
			ctx,
			nil, // page
			&searchQuery,
			nil, // perPage
			nil, // sort
			nil, // status
			nil, // genres
			nil, // averageScoreGreater
			nil, // season
			nil, // seasonYear
			nil, // format
			nil, // isAdult
		)

		if err != nil || results == nil || len(results.Page.Media) == 0 {
			// Log but continue - image fetch failed
			h.App.Logger.Warn().Str("theme", theme.ID).Err(err).Msg("Failed to fetch anime data from AniList")
			continue
		}

		// Get first result (best match)
		anime := results.Page.Media[0]

		// Try to get banner image first, then cover image
		imageUrl := ""
		if anime.BannerImage != nil && *anime.BannerImage != "" {
			imageUrl = *anime.BannerImage
		} else if anime.CoverImage != nil && anime.CoverImage.ExtraLarge != nil && *anime.CoverImage.ExtraLarge != "" {
			imageUrl = *anime.CoverImage.ExtraLarge
		}

		if imageUrl != "" {
			themeIndex.Themes[i].BackgroundImageUrl = imageUrl
			h.App.Logger.Info().Str("theme", theme.ID).Str("image", imageUrl).Msg("Updated theme image URL")
		}
	}

	// Write updated index back to file
	updatedData, err := json.MarshalIndent(themeIndex, "", "    ")
	if err != nil {
		return h.RespondWithError(c, "Failed to marshal updated index", err)
	}

	if err := ioutil.WriteFile(indexPath, updatedData, 0644); err != nil {
		return h.RespondWithError(c, "Failed to write updated index", err)
	}

	return h.RespondWithData(c, map[string]interface{}{
		"message": "Theme images populated successfully",
		"count":   len(themeIndex.Themes),
		"themes":  themeIndex.Themes,
	})
}

// convertFolderNameToTitle converts kebab-case folder names to title case
// E.g., "attack-on-titan" -> "Attack on Titan"
func convertFolderNameToTitle(folderName string) string {
	// Remove special characters and trim
	folderName = strings.TrimSpace(folderName)
	
	// Split by hyphen
	parts := strings.Split(folderName, "-")
	
	// Capitalize first letter of each word (except certain small words)
	for i, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			// Convert "86" or other numbers to spelled out, or leave as is
			if strings.ToLower(part) == "of" || strings.ToLower(part) == "and" || strings.ToLower(part) == "the" {
				if i > 0 {
					parts[i] = strings.ToLower(part)
					continue
				}
			}
			// Capitalize first letter
			parts[i] = strings.ToUpper(string(part[0])) + strings.ToLower(part[1:])
		}
	}
	
	return strings.Join(parts, " ")
}
