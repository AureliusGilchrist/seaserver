package handlers

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
)

// ─── Marketplace Pack Types ───────────────────────────────────────────────────

// MarketplaceCursorPack represents a cursor pack in the marketplace index
type MarketplaceCursorPack struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	Author          string   `json:"author"`
	Type            string   `json:"type"` // "png" | "recolor"
	PreviewImageUrl string   `json:"previewImageUrl"`
	RequiredLevel   int      `json:"requiredLevel"`
	Tags            []string `json:"tags"`
	Version         string   `json:"version"`
	// Recolor-specific fields
	BaseTheme  string  `json:"baseTheme,omitempty"`
	HueRotate  float64 `json:"hueRotate,omitempty"`
	Saturate   float64 `json:"saturate,omitempty"`
	Brightness float64 `json:"brightness,omitempty"`
}

// MarketplaceSoundPack represents a sound pack in the marketplace index
type MarketplaceSoundPack struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	Author          string            `json:"author"`
	Emoji           string            `json:"emoji"`
	PreviewImageUrl string            `json:"previewImageUrl"`
	RequiredLevel   int               `json:"requiredLevel"`
	Tags            []string          `json:"tags"`
	Version         string            `json:"version"`
	Sounds          map[string]string `json:"sounds"` // soundName -> filename
}

// CursorPackIndex is the top-level index.json for the cursor pack marketplace
type CursorPackIndex struct {
	Version     string                  `json:"version"`
	GeneratedAt string                  `json:"generatedAt"`
	Packs       []MarketplaceCursorPack `json:"packs"`
}

// SoundPackIndex is the top-level index.json for the sound pack marketplace
type SoundPackIndex struct {
	Version     string                 `json:"version"`
	GeneratedAt string                 `json:"generatedAt"`
	Packs       []MarketplaceSoundPack `json:"packs"`
}

// DownloadedCursorPack is stored in AppDataDir/cursor-packs/{id}/pack.json
type DownloadedCursorPack struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	Author          string            `json:"author"`
	Type            string            `json:"type"` // "png" | "recolor"
	PreviewImageUrl string            `json:"previewImageUrl"`
	RequiredLevel   int               `json:"requiredLevel"`
	Tags            []string          `json:"tags"`
	Version         string            `json:"version"`
	BaseTheme       string            `json:"baseTheme,omitempty"`
	HueRotate       float64           `json:"hueRotate,omitempty"`
	Saturate        float64           `json:"saturate,omitempty"`
	Brightness      float64           `json:"brightness,omitempty"`
}

// DownloadedSoundPack is stored in AppDataDir/sound-packs/{id}/pack.json
type DownloadedSoundPack struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	Author          string            `json:"author"`
	Emoji           string            `json:"emoji"`
	PreviewImageUrl string            `json:"previewImageUrl"`
	RequiredLevel   int               `json:"requiredLevel"`
	Tags            []string          `json:"tags"`
	Version         string            `json:"version"`
	Sounds          map[string]string `json:"sounds"` // soundName -> filename
}

// ─── Cursor Pack Handlers ──────────────────────────────────────────────────────

// HandleGetCursorMarketplace returns cursor packs from the marketplace index.json
func (h *Handler) HandleGetCursorMarketplace(c echo.Context) error {
	dir := h.App.Config.Marketplace.CursorPacksDir
	if dir == "" {
		return h.RespondWithData(c, []MarketplaceCursorPack{})
	}

	indexPath := filepath.Join(dir, "index.json")
	data, err := ioutil.ReadFile(indexPath)
	if err != nil {
		// Not found is not a fatal error — the marketplace directory may not exist yet
		return h.RespondWithData(c, []MarketplaceCursorPack{})
	}

	var index CursorPackIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return h.RespondWithError(c, fmt.Errorf("failed to parse cursor pack index: %w", err))
	}

	return h.RespondWithData(c, index.Packs)
}

// HandleListDownloadedCursorPacks lists all cursor packs that have been downloaded
func (h *Handler) HandleListDownloadedCursorPacks(c echo.Context) error {
	packsDir := filepath.Join(h.App.Config.Data.AppDataDir, "cursor-packs")
	entries, err := os.ReadDir(packsDir)
	if err != nil {
		// Directory doesn't exist yet — return empty list
		return h.RespondWithData(c, []DownloadedCursorPack{})
	}

	packs := make([]DownloadedCursorPack, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		packJsonPath := filepath.Join(packsDir, entry.Name(), "pack.json")
		data, err := ioutil.ReadFile(packJsonPath)
		if err != nil {
			continue
		}
		var pack DownloadedCursorPack
		if err := json.Unmarshal(data, &pack); err != nil {
			continue
		}
		packs = append(packs, pack)
	}

	return h.RespondWithData(c, packs)
}

// HandleDownloadCursorPack copies a cursor pack from the marketplace to AppDataDir/cursor-packs/{id}/
func (h *Handler) HandleDownloadCursorPack(c echo.Context) error {
	type body struct {
		PackID string `json:"packId"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.PackID == "" {
		return h.RespondWithError(c, fmt.Errorf("packId is required"))
	}

	packID := sanitizePackID(b.PackID)
	if packID == "" {
		return h.RespondWithError(c, fmt.Errorf("invalid packId"))
	}

	if h.App.Config.Marketplace.CursorPacksDir == "" {
		return h.RespondWithError(c, fmt.Errorf("cursor pack marketplace not configured"))
	}

	sourceDir := filepath.Join(h.App.Config.Marketplace.CursorPacksDir, "packs", packID)
	packJsonPath := filepath.Join(sourceDir, "pack.json")
	if _, err := os.Stat(packJsonPath); err != nil {
		return h.RespondWithError(c, fmt.Errorf("pack not found in marketplace: %s", packID))
	}

	destDir := filepath.Join(h.App.Config.Data.AppDataDir, "cursor-packs", packID)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	// Copy all files from source
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if err := copyFile(filepath.Join(sourceDir, entry.Name()), filepath.Join(destDir, entry.Name())); err != nil {
			h.App.Logger.Warn().Err(err).Str("file", entry.Name()).Msg("Failed to copy cursor pack file")
		}
	}

	// Read back the pack.json to return
	data, err := ioutil.ReadFile(filepath.Join(destDir, "pack.json"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	var pack DownloadedCursorPack
	if err := json.Unmarshal(data, &pack); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, pack)
}

// HandleDeleteCursorPack removes a downloaded cursor pack from AppDataDir/cursor-packs/{id}/
func (h *Handler) HandleDeleteCursorPack(c echo.Context) error {
	packID := sanitizePackID(c.Param("id"))
	if packID == "" {
		return h.RespondWithError(c, fmt.Errorf("invalid pack id"))
	}

	packDir := filepath.Join(h.App.Config.Data.AppDataDir, "cursor-packs", packID)
	if _, err := os.Stat(packDir); err != nil {
		return h.RespondWithError(c, fmt.Errorf("pack not found: %s", packID))
	}

	if err := os.RemoveAll(packDir); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// ─── Sound Pack Handlers ───────────────────────────────────────────────────────

// HandleGetSoundMarketplace returns sound packs from the marketplace index.json
func (h *Handler) HandleGetSoundMarketplace(c echo.Context) error {
	dir := h.App.Config.Marketplace.SoundPacksDir
	if dir == "" {
		return h.RespondWithData(c, []MarketplaceSoundPack{})
	}

	indexPath := filepath.Join(dir, "index.json")
	data, err := ioutil.ReadFile(indexPath)
	if err != nil {
		return h.RespondWithData(c, []MarketplaceSoundPack{})
	}

	var index SoundPackIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return h.RespondWithError(c, fmt.Errorf("failed to parse sound pack index: %w", err))
	}

	return h.RespondWithData(c, index.Packs)
}

// HandleListDownloadedSoundPacks lists all sound packs that have been downloaded
func (h *Handler) HandleListDownloadedSoundPacks(c echo.Context) error {
	packsDir := filepath.Join(h.App.Config.Data.AppDataDir, "sound-packs")
	entries, err := os.ReadDir(packsDir)
	if err != nil {
		return h.RespondWithData(c, []DownloadedSoundPack{})
	}

	packs := make([]DownloadedSoundPack, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		packJsonPath := filepath.Join(packsDir, entry.Name(), "pack.json")
		data, err := ioutil.ReadFile(packJsonPath)
		if err != nil {
			continue
		}
		var pack DownloadedSoundPack
		if err := json.Unmarshal(data, &pack); err != nil {
			continue
		}
		packs = append(packs, pack)
	}

	return h.RespondWithData(c, packs)
}

// HandleDownloadSoundPack copies a sound pack from the marketplace to AppDataDir/sound-packs/{id}/
func (h *Handler) HandleDownloadSoundPack(c echo.Context) error {
	type body struct {
		PackID string `json:"packId"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.PackID == "" {
		return h.RespondWithError(c, fmt.Errorf("packId is required"))
	}

	packID := sanitizePackID(b.PackID)
	if packID == "" {
		return h.RespondWithError(c, fmt.Errorf("invalid packId"))
	}

	if h.App.Config.Marketplace.SoundPacksDir == "" {
		return h.RespondWithError(c, fmt.Errorf("sound pack marketplace not configured"))
	}

	sourceDir := filepath.Join(h.App.Config.Marketplace.SoundPacksDir, "packs", packID)
	packJsonPath := filepath.Join(sourceDir, "pack.json")
	if _, err := os.Stat(packJsonPath); err != nil {
		return h.RespondWithError(c, fmt.Errorf("pack not found in marketplace: %s", packID))
	}

	destDir := filepath.Join(h.App.Config.Data.AppDataDir, "sound-packs", packID)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}

	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if err := copyFile(filepath.Join(sourceDir, entry.Name()), filepath.Join(destDir, entry.Name())); err != nil {
			h.App.Logger.Warn().Err(err).Str("file", entry.Name()).Msg("Failed to copy sound pack file")
		}
	}

	data, err := ioutil.ReadFile(filepath.Join(destDir, "pack.json"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	var pack DownloadedSoundPack
	if err := json.Unmarshal(data, &pack); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, pack)
}

// HandleDeleteSoundPack removes a downloaded sound pack from AppDataDir/sound-packs/{id}/
func (h *Handler) HandleDeleteSoundPack(c echo.Context) error {
	packID := sanitizePackID(c.Param("id"))
	if packID == "" {
		return h.RespondWithError(c, fmt.Errorf("invalid pack id"))
	}

	packDir := filepath.Join(h.App.Config.Data.AppDataDir, "sound-packs", packID)
	if _, err := os.Stat(packDir); err != nil {
		return h.RespondWithError(c, fmt.Errorf("pack not found: %s", packID))
	}

	if err := os.RemoveAll(packDir); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// sanitizePackID removes path traversal characters from a pack ID
func sanitizePackID(id string) string {
	for _, ch := range []string{"/", "\\", "..", ":", "*", "?", "\"", "<", ">", "|"} {
		id = strings.ReplaceAll(id, ch, "")
	}
	return id
}
