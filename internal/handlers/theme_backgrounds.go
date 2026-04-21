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
		URL string `json:"url"`
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

	filename := uuid.New().String() + ext
	dest := filepath.Join(dir, filename)

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

// HandleSearchWallhaven proxies a search query to the Wallhaven public API (SFW anime wallpapers).
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
