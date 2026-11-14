package handlers

import (
	"fmt"
	"html"
	"regexp"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/goccy/go-json"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/sharedthemes"
)

// HandleListThemeBackgrounds returns all downloaded background images from datadir/theme-backgrounds/.
func (h *Handler) HandleListThemeBackgrounds(c echo.Context) error {
	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-backgrounds")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type BgFile struct {
		Filename string `json:"filename"`
		URL      string `json:"url"`
	}

	files := make([]BgFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
			continue
		}
		files = append(files, BgFile{
			Filename: entry.Name(),
			URL:      "/theme-bg/" + entry.Name(),
		})
	}

	return h.RespondWithData(c, files)
}

// HandleDownloadThemeBackground downloads a full-res wallpaper from Wallhaven and saves it to datadir/theme-backgrounds/.
func (h *Handler) HandleDownloadThemeBackground(c echo.Context) error {
	type body struct {
		URL     string `json:"url"`
		ThemeID string `json:"themeId"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.URL == "" {
		return h.RespondWithError(c, fmt.Errorf("url is required"))
	}
	// Only the full-resolution image hosts of Wallhaven and Alpha Coders.
	isAlphaCoders := alphaCodersImageRe.MatchString(b.URL)
	if !strings.HasPrefix(b.URL, "https://w.wallhaven.cc/") && !isAlphaCoders {
		return h.RespondWithError(c, fmt.Errorf("only Wallhaven (https://w.wallhaven.cc/...) or Alpha Coders (https://images.alphacoders.com/...) image URLs are accepted"))
	}

	// Sanitise optional themeId so it is safe for filenames.
	themeID := b.ThemeID
	for _, ch := range []string{"/", "\\", "..", ":", "*", "?", "\"", "<", ">", "|"} {
		themeID = strings.ReplaceAll(themeID, ch, "")
	}

	// Preserve original file extension.
	ext := strings.ToLower(filepath.Ext(b.URL))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
		// accepted
	default:
		ext = ".jpg"
	}

	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-backgrounds")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	// Extract the Wallhaven wallpaper ID from the CDN URL so we can correlate
	// local files back to their source wallpaper (e.g. "wallhaven-abc123" → "abc123").
	// URL form: https://w.wallhaven.cc/full/ab/wallhaven-abc123.jpg
	base := strings.TrimSuffix(filepath.Base(b.URL), filepath.Ext(b.URL)) // "wallhaven-abc123"
	wallhavenID := strings.TrimPrefix(base, "wallhaven-")                 // "abc123"
	if isAlphaCoders {
		// "https://images6.alphacoders.com/133/1337729.png" → "ac1337729": the same "wh-<theme>-<id>"
		// name as a Wallhaven file, so it is filed under the theme the same way.
		base, wallhavenID = "ac-"+base, "ac"+base
	}
	var filename string
	if wallhavenID != "" && wallhavenID != base {
		if themeID != "" {
			filename = "wh-" + themeID + "-" + wallhavenID + ext // "wh-naruto-abc123.jpg"
		} else {
			filename = "wh-" + wallhavenID + ext // "wh-abc123.jpg" — legacy / no theme
		}
	} else {
		filename = uuid.New().String() + ext
	}

	// Skip download if already on disk (idempotent). Also check legacy name without themeId prefix.
	dest := filepath.Join(dir, filename)
	if _, statErr := os.Stat(dest); statErr == nil {
		type BgFile struct {
			Filename string `json:"filename"`
			URL      string `json:"url"`
		}
		return h.RespondWithData(c, BgFile{Filename: filename, URL: "/theme-bg/" + filename})
	}
	// Check legacy filename (no theme prefix) and rename it if found.
	if themeID != "" && wallhavenID != "" {
		legacyFilename := "wh-" + wallhavenID + ext
		legacyDest := filepath.Join(dir, legacyFilename)
		if _, statErr := os.Stat(legacyDest); statErr == nil {
			_ = os.Rename(legacyDest, dest)
			type BgFile struct {
				Filename string `json:"filename"`
				URL      string `json:"url"`
			}
			return h.RespondWithData(c, BgFile{Filename: filename, URL: "/theme-bg/" + filename})
		}
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(b.URL)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return h.RespondWithError(c, fmt.Errorf("upstream returned HTTP %d", resp.StatusCode))
	}

	f, err := os.Create(dest)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if _, err = io.Copy(f, resp.Body); err != nil {
		f.Close()
		_ = os.Remove(dest)
		return h.RespondWithError(c, err)
	}
	f.Close()

	type BgFile struct {
		Filename string `json:"filename"`
		URL      string `json:"url"`
	}
	return h.RespondWithData(c, BgFile{Filename: filename, URL: "/theme-bg/" + filename})
}

// HandleDeleteThemeBackground removes a downloaded wallpaper from datadir/theme-backgrounds/.
func (h *Handler) HandleDeleteThemeBackground(c echo.Context) error {
	filename := c.Param("filename")

	// Prevent path traversal.
	if filename == "" || strings.ContainsAny(filename, "/\\") || strings.Contains(filename, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid filename"))
	}

	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-backgrounds")
	dest := filepath.Join(dir, filename)

	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// HandleListSharedThemes returns all downloaded themes from datadir/themes/.
// These themes are shared across all profiles.
func (h *Handler) HandleListSharedThemes(c echo.Context) error {
	dir := filepath.Join(h.App.Config.Data.AppDataDir, "themes")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type ThemeInfo struct {
		ID          string `json:"id"`
		DisplayName string `json:"displayName"`
		// Description and Author are what the theme says about itself, read from its own theme.json
		// so the picker can show them without a second request per card.
		Description string `json:"description,omitempty"`
		Author      string `json:"author,omitempty"`
		URL         string `json:"url"`
	}

	themes := make([]ThemeInfo, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// Check if theme.json exists in the directory
		themeJsonPath := filepath.Join(dir, entry.Name(), "theme.json")
		if _, statErr := os.Stat(themeJsonPath); statErr != nil {
			continue // Skip directories without theme.json
		}
		// Bring the installed copy up to date with the marketplace so the list shows current names.
		if _, refreshErr := sharedthemes.Refresh(h.App.Config.Marketplace.Dir, dir, entry.Name()); refreshErr != nil {
			h.App.Logger.Warn().Err(refreshErr).Str("theme", entry.Name()).Msg("themes: Could not refresh installed theme from the marketplace")
		}

		// Try to read theme.json to get display name and what the theme says about itself
		displayName := entry.Name()
		var description, author string
		if data, readErr := os.ReadFile(themeJsonPath); readErr == nil {
			var theme struct {
				DisplayName string `json:"displayName"`
				Description string `json:"description"`
				Author      string `json:"author"`
			}
			if json.Unmarshal(data, &theme) == nil {
				if theme.DisplayName != "" {
					displayName = theme.DisplayName
				}
				description = theme.Description
				author = theme.Author
			}
		}

		themes = append(themes, ThemeInfo{
			ID:          entry.Name(),
			DisplayName: displayName,
			Description: description,
			Author:      author,
			URL:         "/shared-themes/" + entry.Name() + "/theme.json",
		})
	}

	return h.RespondWithData(c, themes)
}

// HandleDownloadSharedTheme downloads a theme from the marketplace to the shared themes directory.
// This makes the theme available to all profiles.
func (h *Handler) HandleDownloadSharedTheme(c echo.Context) error {
	type body struct {
		ThemeID string `json:"themeId"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ThemeID == "" {
		return h.RespondWithError(c, fmt.Errorf("themeId is required"))
	}

	// Sanitize themeId
	themeID := b.ThemeID
	for _, ch := range []string{"/", "\\", "..", ":", "*", "?", "\"", "<", ">", "|"} {
		themeID = strings.ReplaceAll(themeID, ch, "")
	}
	if themeID == "" {
		return h.RespondWithError(c, fmt.Errorf("invalid themeId"))
	}

	// Check if marketplace is configured
	if h.App.Config.Marketplace.Dir == "" {
		return h.RespondWithError(c, fmt.Errorf("marketplace not configured"))
	}

	// Source: marketplace themes directory
	sourceDir := filepath.Join(h.App.Config.Marketplace.Dir, "themes", themeID)
	sourceJson := filepath.Join(sourceDir, "theme.json")

	// Verify source exists
	if _, statErr := os.Stat(sourceJson); statErr != nil {
		return h.RespondWithError(c, fmt.Errorf("theme not found in marketplace: %s", themeID))
	}

	// Destination: shared themes directory
	destDir := filepath.Join(h.App.Config.Data.AppDataDir, "themes", themeID)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	// Copy theme.json
	if err := copyFile(sourceJson, filepath.Join(destDir, "theme.json")); err != nil {
		return h.RespondWithError(c, err)
	}

	// Copy all files from source directory
	sourceEntries, err := os.ReadDir(sourceDir)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	for _, entry := range sourceEntries {
		if entry.IsDir() {
			continue
		}
		srcPath := filepath.Join(sourceDir, entry.Name())
		dstPath := filepath.Join(destDir, entry.Name())
		if err := copyFile(srcPath, dstPath); err != nil {
			// Log error but continue
			h.App.Logger.Warn().Err(err).Str("file", entry.Name()).Msg("Failed to copy theme file")
		}
	}

	type Result struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	return h.RespondWithData(c, Result{
		ID:  themeID,
		URL: "/shared-themes/" + themeID + "/theme.json",
	})
}

// HandleDeleteSharedTheme removes a downloaded theme from the shared themes directory.
func (h *Handler) HandleDeleteSharedTheme(c echo.Context) error {
	themeID := c.Param("id")
	if themeID == "" || strings.ContainsAny(themeID, "/\\") || strings.Contains(themeID, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid theme id"))
	}

	dir := filepath.Join(h.App.Config.Data.AppDataDir, "themes", themeID)
	if err := os.RemoveAll(dir); err != nil && !os.IsNotExist(err) {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-PROFILE THEME STORAGE (Cloud)
// Themes are stored per-profile in the database, surviving client rebuilds
// ─────────────────────────────────────────────────────────────────────────────

// getProfileDB extracts the profile ID from context and returns the per-profile database
func (h *Handler) getProfileDB(c echo.Context) (*db.Database, error) {
	profileID := c.Get("profile_id")
	if profileID == nil || profileID.(uint) == 0 {
		return nil, fmt.Errorf("profile session required")
	}
	return h.App.ProfileDatabaseManager.GetDatabase(profileID.(uint))
}

// HandleListUserThemes returns all themes downloaded by the current profile (stored in per-profile DB).
func (h *Handler) HandleListUserThemes(c echo.Context) error {
	profileDB, err := h.getProfileDB(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type ThemeInfo struct {
		ID          string `json:"id"`
		DisplayName string `json:"displayName"`
		URL         string `json:"url"`
		IsActive    bool   `json:"isActive"`
	}

	var themes []models.UserTheme
	if err := profileDB.Gorm().Find(&themes).Error; err != nil {
		return h.RespondWithError(c, err)
	}

	// Get the active theme preference
	var activeThemeID string
	var pref models.ProfileThemePreference
	if err := profileDB.Gorm().First(&pref).Error; err == nil {
		activeThemeID = pref.ThemeID
	}

	result := make([]ThemeInfo, 0, len(themes))
	for _, t := range themes {
		result = append(result, ThemeInfo{
			ID:          t.ThemeID,
			DisplayName: t.DisplayName,
			URL:         "/user-themes/" + t.ThemeID + "/theme.json",
			IsActive:    t.ThemeID == activeThemeID,
		})
	}

	return h.RespondWithData(c, result)
}

// HandleDownloadUserTheme downloads a theme from the marketplace and stores it in the user's profile DB.
func (h *Handler) HandleDownloadUserTheme(c echo.Context) error {
	profileDB, err := h.getProfileDB(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type body struct {
		ThemeID string `json:"themeId"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ThemeID == "" {
		return h.RespondWithError(c, fmt.Errorf("themeId is required"))
	}

	// Sanitize themeId
	themeID := b.ThemeID
	for _, ch := range []string{"/", "\\", "..", ":", "*", "?", "\"", "<", ">", "|"} {
		themeID = strings.ReplaceAll(themeID, ch, "")
	}
	if themeID == "" {
		return h.RespondWithError(c, fmt.Errorf("invalid themeId"))
	}

	// Check if marketplace is configured
	if h.App.Config.Marketplace.Dir == "" {
		return h.RespondWithError(c, fmt.Errorf("marketplace not configured"))
	}

	// Source: marketplace themes directory
	sourceJson := filepath.Join(h.App.Config.Marketplace.Dir, "themes", themeID, "theme.json")

	// Verify source exists
	data, err := os.ReadFile(sourceJson)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("theme not found in marketplace: %s", themeID))
	}

	// Parse to get display name
	var themeData struct {
		DisplayName string `json:"displayName"`
	}
	var displayName = themeID
	if json.Unmarshal(data, &themeData) == nil && themeData.DisplayName != "" {
		displayName = themeData.DisplayName
	}

	// Upsert into user's profile database
	userTheme := models.UserTheme{
		ThemeID:      themeID,
		DisplayName:  displayName,
		ThemeJSON:    string(data),
		DownloadedAt: time.Now(),
	}

	// Save or update (upsert)
	if err := profileDB.Gorm().Where("theme_id = ?", themeID).
		Assign(userTheme).
		FirstOrCreate(&userTheme).Error; err != nil {
		return h.RespondWithError(c, err)
	}

	type Result struct {
		ID          string `json:"id"`
		DisplayName string `json:"displayName"`
		URL         string `json:"url"`
	}
	return h.RespondWithData(c, Result{
		ID:          themeID,
		DisplayName: displayName,
		URL:         "/user-themes/" + themeID + "/theme.json",
	})
}

// HandleDeleteUserTheme removes a theme from the user's profile database.
func (h *Handler) HandleDeleteUserTheme(c echo.Context) error {
	profileDB, err := h.getProfileDB(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	themeID := c.Param("id")
	if themeID == "" || strings.ContainsAny(themeID, "/\\") || strings.Contains(themeID, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid theme id"))
	}

	if err := profileDB.Gorm().Where("theme_id = ?", themeID).Delete(&models.UserTheme{}).Error; err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}

// HandleGetUserTheme serves a theme.json from the user's profile database.
func (h *Handler) HandleGetUserTheme(c echo.Context) error {
	profileDB, err := h.getProfileDB(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	themeID := c.Param("id")
	if themeID == "" || strings.ContainsAny(themeID, "/\\") || strings.Contains(themeID, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid theme id"))
	}

	var userTheme models.UserTheme
	if err := profileDB.Gorm().Where("theme_id = ?", themeID).First(&userTheme).Error; err != nil {
		return h.RespondWithError(c, fmt.Errorf("theme not found"))
	}

	return c.Blob(http.StatusOK, "application/json", []byte(userTheme.ThemeJSON))
}

// HandleGetProfileThemePreference returns the active theme for the current profile.
func (h *Handler) HandleGetProfileThemePreference(c echo.Context) error {
	profileDB, err := h.getProfileDB(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	var pref models.ProfileThemePreference
	if err := profileDB.Gorm().First(&pref).Error; err != nil {
		// No preference set yet, return empty
		return h.RespondWithData(c, map[string]string{"themeId": ""})
	}

	return h.RespondWithData(c, map[string]string{"themeId": pref.ThemeID})
}

// HandleSetProfileThemePreference sets the active theme for the current profile.
// Also recalculates and stores the milestone name based on the theme's milestones and current level.
func (h *Handler) HandleSetProfileThemePreference(c echo.Context) error {
	profileDB, err := h.getProfileDB(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type body struct {
		ThemeID string `json:"themeId"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Validate themeId format
	if b.ThemeID == "" || strings.ContainsAny(b.ThemeID, "/\\..") {
		return h.RespondWithError(c, fmt.Errorf("invalid themeId"))
	}

	// Upsert the preference
	pref := models.ProfileThemePreference{ThemeID: b.ThemeID}
	if err := profileDB.Gorm().Where("1=1"). // There's only ever one row
							Assign(pref).
							FirstOrCreate(&pref).Error; err != nil {
		return h.RespondWithError(c, err)
	}

	// Get current level
	lp, _ := profileDB.GetLevelProgress()
	currentLevel := lp.CurrentLevel

	// Calculate milestone name from the theme
	milestoneName := h.calculateMilestoneName(b.ThemeID, currentLevel)
	if milestoneName != "" {
		profileDB.SetCurrentMilestoneName(milestoneName)
	}

	return h.RespondWithData(c, map[string]string{
		"themeId":              b.ThemeID,
		"currentMilestoneName": milestoneName,
	})
}

// HandleUpdateMilestoneName allows the user to manually set their publicly visible milestone title.
// This overrides the automatically calculated one from their theme.
func (h *Handler) HandleUpdateMilestoneName(c echo.Context) error {
	profileDB, err := h.getProfileDB(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type body struct {
		MilestoneName string `json:"milestoneName"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Validate - max 50 chars
	if len(b.MilestoneName) > 50 {
		b.MilestoneName = b.MilestoneName[:50]
	}

	if err := profileDB.SetCurrentMilestoneName(b.MilestoneName); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, map[string]string{
		"currentMilestoneName": b.MilestoneName,
	})
}

// calculateMilestoneName looks up the milestone name for a given level from a theme.
func (h *Handler) calculateMilestoneName(themeID string, level int) string {
	if themeID == "" || themeID == "seanime" {
		return "" // Default theme has no milestone names
	}

	// Note: Finding theme in user's downloaded themes requires access to the profileDB
	// which we don't have in this context, so we'll try marketplace themes instead

	// Try marketplace themes directory
	if h.App.Config.Marketplace.Dir == "" {
		return ""
	}

	themeJsonPath := filepath.Join(h.App.Config.Marketplace.Dir, "themes", themeID, "theme.json")
	data, err := os.ReadFile(themeJsonPath)
	if err != nil {
		return ""
	}

	var theme struct {
		MilestoneNames map[string]string `json:"milestoneNames"`
	}
	if err := json.Unmarshal(data, &theme); err != nil {
		return ""
	}

	// Find the highest milestone threshold <= current level
	var milestoneName string
	var maxThreshold int
	for thresholdStr, name := range theme.MilestoneNames {
		threshold, err := strconv.Atoi(thresholdStr)
		if err != nil {
			continue
		}
		if threshold <= level && threshold > maxThreshold {
			maxThreshold = threshold
			milestoneName = name
		}
	}

	return milestoneName
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

// HandleSearchWallhaven proxies a search query to the Wallhaven public API (SFW anime wallpapers).
// Uses relevance sorting so specific anime name queries return plentiful, on-target results.
func (h *Handler) HandleSearchWallhaven(c echo.Context) error {
	q := c.QueryParam("q")
	page := c.QueryParam("page")
	if page == "" {
		page = "1"
	}

	apiURL := fmt.Sprintf(
		"https://wallhaven.cc/api/v1/search?q=%s&categories=110&purity=100&sorting=relevance&page=%s",
		url.QueryEscape(q), page,
	)

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	req.Header.Set("User-Agent", "Seanime/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	var result interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, result)
}

// alphaCodersImageRe matches Alpha Coders' full-size image URLs ("https://images6.alphacoders.com/133/1337729.png").
var alphaCodersImageRe = regexp.MustCompile(`^https://images[0-9]*\.alphacoders\.com/[0-9]+/[0-9]+\.(?:jpe?g|png|webp)$`)

// alphaCodersItemRe reads one wallpaper of an Alpha Coders listing from its schema.org block.
var alphaCodersItemRe = regexp.MustCompile(`(?s)itemprop="contentUrl" content="([^"]+)".*?itemprop="thumbnailUrl" content="([^"]+)".*?itemprop="width" content="([0-9]+)".*?itemprop="height" content="([0-9]+)"`)

// HandleSearchAlphaCoders
//
//	@summary searches Alpha Coders (wall.alphacoders.com) for wallpapers.
//	@desc Alpha Coders' API needs a key, so its public listing is read instead. The answer has the
//	@desc shape of a Wallhaven search, so the picker shows both the same way.
//	@route /api/v1/theme-backgrounds/alphacoders/search [GET]
func (h *Handler) HandleSearchAlphaCoders(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	if q == "" {
		q = "anime"
	}

	client := &http.Client{Timeout: 20 * time.Second}
	get := func(u string) (string, string, error) {
		req, err := http.NewRequest(http.MethodGet, u, nil)
		if err != nil {
			return "", "", err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
		req.Header.Set("Accept", "text/html")
		resp, err := client.Do(req)
		if err != nil {
			return "", "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return "", "", fmt.Errorf("alpha coders returned HTTP %d", resp.StatusCode)
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		return string(body), resp.Request.URL.String(), err
	}

	body, finalURL, err := get(fmt.Sprintf("https://wall.alphacoders.com/search.php?search=%s&page=%d", url.QueryEscape(q), page))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	// A search that names a known tag redirects to the tag's page, which drops the page number:
	// that page takes it as ?page=.
	if page > 1 && !strings.Contains(finalURL, "search.php") {
		sep := "?"
		if strings.Contains(finalURL, "?") {
			sep = "&"
		}
		body, _, err = get(fmt.Sprintf("%s%spage=%d", finalURL, sep, page))
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	type thumbs struct {
		Large    string `json:"large"`
		Original string `json:"original"`
		Small    string `json:"small"`
	}
	type wallpaper struct {
		ID         string `json:"id"`
		URL        string `json:"url"`
		Path       string `json:"path"`
		ShortURL   string `json:"short_url"`
		Resolution string `json:"resolution"`
		DimensionX int    `json:"dimension_x"`
		DimensionY int    `json:"dimension_y"`
		FileType   string `json:"file_type"`
		Thumbs     thumbs `json:"thumbs"`
	}
	out := make([]wallpaper, 0, 30)
	seen := map[string]bool{}
	for _, m := range alphaCodersItemRe.FindAllStringSubmatch(body, -1) {
		full := html.UnescapeString(m[1])
		if !alphaCodersImageRe.MatchString(full) || seen[full] {
			continue
		}
		seen[full] = true
		thumb := html.UnescapeString(m[2])
		w, _ := strconv.Atoi(m[3])
		hgt, _ := strconv.Atoi(m[4])
		id := strings.TrimSuffix(filepath.Base(full), filepath.Ext(full))
		ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(full)), ".")
		if ext == "jpg" {
			ext = "jpeg"
		}
		out = append(out, wallpaper{
			ID:         "ac" + id,
			URL:        "https://wall.alphacoders.com/big.php?i=" + id,
			Path:       full,
			ShortURL:   "https://wall.alphacoders.com/big.php?i=" + id,
			Resolution: fmt.Sprintf("%dx%d", w, hgt),
			DimensionX: w,
			DimensionY: hgt,
			FileType:   "image/" + ext,
			Thumbs: thumbs{
				Large:    strings.Replace(thumb, "thumb-350-", "thumb-440-", 1),
				Original: strings.Replace(thumb, "thumb-350-", "thumb-440-", 1),
				Small:    thumb,
			},
		})
	}

	lastPage := page
	if len(out) >= 20 {
		lastPage = page + 1
	}
	return h.RespondWithData(c, map[string]any{
		"data": out,
		"meta": map[string]any{
			"current_page": page,
			"last_page":    lastPage,
			"per_page":     len(out),
			"total":        len(out),
		},
	})
}
