package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/goccy/go-json"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
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
	// Only allow Wallhaven full-resolution CDN paths.
	if !strings.HasPrefix(b.URL, "https://w.wallhaven.cc/") {
		return h.RespondWithError(c, fmt.Errorf("only Wallhaven full-res URLs (https://w.wallhaven.cc/...) are accepted"))
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
	wallhavenID := strings.TrimPrefix(base, "wallhaven-")                  // "abc123"
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

// HandleListThemeMusicTracks returns a list of audio tracks from appdata/theme-music/{themeId}/.
// The files are served at /theme-music/{themeId}/{filename} via the static file server.
func (h *Handler) HandleListThemeMusicTracks(c echo.Context) error {
	themeID := c.QueryParam("themeId")
	if themeID == "" || strings.ContainsAny(themeID, "/\\..") {
		return h.RespondWithError(c, fmt.Errorf("invalid themeId"))
	}

	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-music", themeID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	type Track struct {
		Filename string `json:"filename"`
		URL      string `json:"url"`
		Name     string `json:"name"` // human-readable: filename without extension
	}

	tracks := make([]Track, 0)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if ext != ".mp3" && ext != ".ogg" && ext != ".flac" && ext != ".m4a" && ext != ".wav" {
			continue
		}
		name := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		tracks = append(tracks, Track{
			Filename: e.Name(),
			URL:      "/theme-music/" + themeID + "/" + e.Name(),
			Name:     name,
		})
	}

	return h.RespondWithData(c, tracks)
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
