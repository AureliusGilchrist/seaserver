package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/goccy/go-json"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

const wallpaperDownloadLimit = 5

// bgMetadata tracks per-profile wallpaper downloads.
type bgMetadata struct {
	mu        sync.Mutex
	Downloads map[string][]string `json:"downloads"` // profileID string -> filenames
}

var (
	bgMeta     *bgMetadata
	bgMetaOnce sync.Once
)

func loadBgMetadata(dir string) *bgMetadata {
	bgMetaOnce.Do(func() {
		bgMeta = &bgMetadata{Downloads: make(map[string][]string)}
		path := filepath.Join(dir, "bg-metadata.json")
		data, err := os.ReadFile(path)
		if err == nil {
			_ = json.Unmarshal(data, bgMeta)
			if bgMeta.Downloads == nil {
				bgMeta.Downloads = make(map[string][]string)
			}
		}
	})
	return bgMeta
}

func saveBgMetadata(dir string, m *bgMetadata) {
	path := filepath.Join(dir, "bg-metadata.json")
	data, _ := json.MarshalIndent(m, "", "  ")
	_ = os.WriteFile(path, data, 0644)
}

// HandleListThemeBackgrounds returns all downloaded background images with per-profile download count.
func (h *Handler) HandleListThemeBackgrounds(c echo.Context) error {
	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-backgrounds")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	session := h.GetProfileSession(c)
	isAdmin := session == nil || session.IsAdmin
	profileKey := "0"
	if session != nil {
		profileKey = strconv.FormatUint(uint64(session.ProfileID), 10)
	}

	meta := loadBgMetadata(dir)
	meta.mu.Lock()
	userDownloads := len(meta.Downloads[profileKey])
	meta.mu.Unlock()

	type BgFile struct {
		Filename      string `json:"filename"`
		URL           string `json:"url"`
		DownloadedBy  string `json:"downloadedBy,omitempty"`
		CanDelete     bool   `json:"canDelete"`
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
		canDelete := isAdmin
		files = append(files, BgFile{
			Filename:  entry.Name(),
			URL:       "/theme-bg/" + entry.Name(),
			CanDelete: canDelete,
		})
	}

	type Response struct {
		Files         []BgFile `json:"files"`
		UserCount     int      `json:"userCount"`
		Limit         int      `json:"limit"`
		IsAdmin       bool     `json:"isAdmin"`
	}

	return h.RespondWithData(c, Response{
		Files:     files,
		UserCount: userDownloads,
		Limit:     wallpaperDownloadLimit,
		IsAdmin:   isAdmin,
	})
}

// HandleDownloadThemeBackground downloads a full-res wallpaper from Wallhaven.
// Non-admins are limited to wallpaperDownloadLimit downloads.
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
	if !strings.HasPrefix(b.URL, "https://w.wallhaven.cc/") {
		return h.RespondWithError(c, fmt.Errorf("only Wallhaven full-res URLs (https://w.wallhaven.cc/...) are accepted"))
	}

	session := h.GetProfileSession(c)
	isAdmin := session == nil || session.IsAdmin
	profileKey := "0"
	if session != nil {
		profileKey = strconv.FormatUint(uint64(session.ProfileID), 10)
	}

	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-backgrounds")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	meta := loadBgMetadata(dir)
	meta.mu.Lock()
	if !isAdmin && len(meta.Downloads[profileKey]) >= wallpaperDownloadLimit {
		meta.mu.Unlock()
		return h.RespondWithError(c, fmt.Errorf("download limit reached: you can only save %d wallpapers", wallpaperDownloadLimit))
	}
	meta.mu.Unlock()

	ext := strings.ToLower(filepath.Ext(b.URL))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		ext = ".jpg"
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

	meta.mu.Lock()
	meta.Downloads[profileKey] = append(meta.Downloads[profileKey], filename)
	saveBgMetadata(dir, meta)
	meta.mu.Unlock()

	type BgFile struct {
		Filename  string `json:"filename"`
		URL       string `json:"url"`
		UserCount int    `json:"userCount"`
		Limit     int    `json:"limit"`
	}

	meta.mu.Lock()
	count := len(meta.Downloads[profileKey])
	meta.mu.Unlock()

	return h.RespondWithData(c, BgFile{
		Filename:  filename,
		URL:       "/theme-bg/" + filename,
		UserCount: count,
		Limit:     wallpaperDownloadLimit,
	})
}

// HandleDeleteThemeBackground removes a downloaded wallpaper. Admin only.
func (h *Handler) HandleDeleteThemeBackground(c echo.Context) error {
	session := h.GetProfileSession(c)
	isAdmin := session == nil || session.IsAdmin
	if !isAdmin {
		return h.RespondWithError(c, fmt.Errorf("only admins can delete wallpapers"))
	}

	filename := c.Param("filename")
	if filename == "" || strings.ContainsAny(filename, "/\\") || strings.Contains(filename, "..") {
		return h.RespondWithError(c, fmt.Errorf("invalid filename"))
	}

	dir := filepath.Join(h.App.Config.Data.AppDataDir, "theme-backgrounds")
	dest := filepath.Join(dir, filename)

	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		return h.RespondWithError(c, err)
	}

	// Remove from all user download records
	meta := loadBgMetadata(dir)
	meta.mu.Lock()
	for key, files := range meta.Downloads {
		updated := files[:0]
		for _, f := range files {
			if f != filename {
				updated = append(updated, f)
			}
		}
		meta.Downloads[key] = updated
	}
	saveBgMetadata(dir, meta)
	meta.mu.Unlock()

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
