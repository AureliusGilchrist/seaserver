package chapter_downloader

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
)

// SeriesRegistry is stored at the series level (e.g., "$Manga/Death Note/registry.json")
// It contains metadata for all downloaded chapters in the series.
type SeriesRegistry struct {
	MediaId  int                        `json:"mediaId"`
	Provider string                     `json:"provider"`
	Chapters map[string]*ChapterEntry   `json:"chapters"` // Key is the folder name (chapter title)
}

// ChapterEntry contains metadata for a single downloaded chapter
type ChapterEntry struct {
	ChapterId     string              `json:"chapterId"`
	ChapterNumber string              `json:"chapterNumber"`
	ChapterTitle  string              `json:"chapterTitle"`  // Original chapter title from provider
	Provider      string              `json:"provider"`
	FolderName    string              `json:"folderName"`    // Sanitized folder name on disk
	Pages         map[int]PageInfo    `json:"pages"`         // Page index -> PageInfo
}

// SanitizeFolderName sanitizes a chapter title for use as a folder name
// Removes/replaces invalid filesystem characters while keeping the name readable
func SanitizeFolderName(title string) string {
	if title == "" {
		return ""
	}
	
	// Replace invalid filesystem characters
	invalidChars := map[string]string{
		"/":  "-",
		"\\": "-",
		":":  "-",
		"*":  "",
		"?":  "",
		"\"": "'",
		"<":  "",
		">":  "",
		"|":  "-",
	}
	
	result := title
	for char, replacement := range invalidChars {
		result = strings.ReplaceAll(result, char, replacement)
	}
	
	// Remove leading/trailing spaces and dots (Windows restriction)
	result = strings.TrimSpace(result)
	result = strings.TrimRight(result, ".")
	
	// Collapse multiple spaces/dashes into single ones
	spaceRegex := regexp.MustCompile(`\s+`)
	result = spaceRegex.ReplaceAllString(result, " ")
	dashRegex := regexp.MustCompile(`-+`)
	result = dashRegex.ReplaceAllString(result, "-")
	
	// Limit length to avoid filesystem issues (leave room for path)
	if len(result) > 200 {
		result = result[:200]
	}
	
	// If the result is empty after sanitization, return a fallback
	if result == "" {
		return "Chapter"
	}
	
	return result
}

// GenerateUniqueFolderName generates a unique folder name for a chapter
// If the sanitized title already exists, it appends a suffix
func (sr *SeriesRegistry) GenerateUniqueFolderName(chapterTitle string, chapterNumber string) string {
	baseName := SanitizeFolderName(chapterTitle)
	
	// If no title provided, use chapter number as base
	if baseName == "" || baseName == "Chapter" {
		if chapterNumber != "" {
			baseName = fmt.Sprintf("Chapter %s", chapterNumber)
		} else {
			baseName = "Chapter"
		}
	}
	
	// Check if this folder name already exists
	if sr.Chapters == nil {
		return baseName
	}
	
	// If the name doesn't exist, use it
	if _, exists := sr.Chapters[baseName]; !exists {
		return baseName
	}
	
	// Otherwise, append a suffix to make it unique
	for i := 2; i < 1000; i++ {
		candidate := fmt.Sprintf("%s (%d)", baseName, i)
		if _, exists := sr.Chapters[candidate]; !exists {
			return candidate
		}
	}
	
	// Fallback (should never happen)
	return fmt.Sprintf("%s_%s", baseName, chapterNumber)
}

// LoadSeriesRegistry loads a series registry from the given series directory
func LoadSeriesRegistry(seriesDir string, logger *zerolog.Logger) (*SeriesRegistry, error) {
	registryPath := filepath.Join(seriesDir, "registry.json")
	
	data, err := os.ReadFile(registryPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty registry if file doesn't exist
			return &SeriesRegistry{
				Chapters: make(map[string]*ChapterEntry),
			}, nil
		}
		return nil, fmt.Errorf("failed to read series registry: %w", err)
	}
	
	var registry SeriesRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		if logger != nil {
			logger.Warn().Err(err).Str("path", registryPath).Msg("series registry: Failed to parse registry, creating new one")
		}
		return &SeriesRegistry{
			Chapters: make(map[string]*ChapterEntry),
		}, nil
	}
	
	if registry.Chapters == nil {
		registry.Chapters = make(map[string]*ChapterEntry)
	}
	
	return &registry, nil
}

// Save saves the series registry to the given series directory
func (sr *SeriesRegistry) Save(seriesDir string) error {
	registryPath := filepath.Join(seriesDir, "registry.json")
	
	data, err := json.MarshalIndent(sr, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal series registry: %w", err)
	}
	
	if err := os.WriteFile(registryPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write series registry: %w", err)
	}
	
	return nil
}

// AddChapter adds or updates a chapter entry in the registry
func (sr *SeriesRegistry) AddChapter(folderName string, entry *ChapterEntry) {
	if sr.Chapters == nil {
		sr.Chapters = make(map[string]*ChapterEntry)
	}
	entry.FolderName = folderName
	sr.Chapters[folderName] = entry
}

// GetChapterByID finds a chapter entry by its chapter ID
func (sr *SeriesRegistry) GetChapterByID(chapterId string) (*ChapterEntry, string, bool) {
	for folderName, entry := range sr.Chapters {
		if entry.ChapterId == chapterId {
			return entry, folderName, true
		}
	}
	return nil, "", false
}

// GetChapterByNumber finds a chapter entry by its chapter number
func (sr *SeriesRegistry) GetChapterByNumber(chapterNumber string) (*ChapterEntry, string, bool) {
	for folderName, entry := range sr.Chapters {
		if entry.ChapterNumber == chapterNumber {
			return entry, folderName, true
		}
	}
	return nil, "", false
}

// RemoveChapter removes a chapter entry from the registry
func (sr *SeriesRegistry) RemoveChapter(folderName string) {
	delete(sr.Chapters, folderName)
}

// SeriesRegistryManager manages series registries with thread-safe access
type SeriesRegistryManager struct {
	mu          sync.RWMutex
	registries  map[string]*SeriesRegistry // Key is series directory path
	logger      *zerolog.Logger
}

// NewSeriesRegistryManager creates a new registry manager
func NewSeriesRegistryManager(logger *zerolog.Logger) *SeriesRegistryManager {
	return &SeriesRegistryManager{
		registries: make(map[string]*SeriesRegistry),
		logger:     logger,
	}
}

// GetRegistry gets or loads a series registry for the given series directory
func (m *SeriesRegistryManager) GetRegistry(seriesDir string) (*SeriesRegistry, error) {
	m.mu.RLock()
	if reg, exists := m.registries[seriesDir]; exists {
		m.mu.RUnlock()
		return reg, nil
	}
	m.mu.RUnlock()
	
	// Load the registry
	m.mu.Lock()
	defer m.mu.Unlock()
	
	// Double-check after acquiring write lock
	if reg, exists := m.registries[seriesDir]; exists {
		return reg, nil
	}
	
	reg, err := LoadSeriesRegistry(seriesDir, m.logger)
	if err != nil {
		return nil, err
	}
	
	m.registries[seriesDir] = reg
	return reg, nil
}

// SaveRegistry saves a series registry
func (m *SeriesRegistryManager) SaveRegistry(seriesDir string, registry *SeriesRegistry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	
	if err := registry.Save(seriesDir); err != nil {
		return err
	}
	
	m.registries[seriesDir] = registry
	return nil
}

// InvalidateCache removes a registry from the cache
func (m *SeriesRegistryManager) InvalidateCache(seriesDir string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.registries, seriesDir)
}
