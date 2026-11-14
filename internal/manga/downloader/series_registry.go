package chapter_downloader

import (
	"container/list"
	stdjson "encoding/json"
	"errors"
	"fmt"
	"golang.org/x/sync/singleflight"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"seanime/internal/util"
	"strings"
	"sync"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
)

// SeriesRegistry is stored at the series level (e.g., "$Manga/Death Note/registry.json")
// It contains metadata for all downloaded chapters in the series.
type SeriesRegistry struct {
	MediaId  int                      `json:"mediaId"`
	Provider string                   `json:"provider"`
	Chapters map[string]*ChapterEntry `json:"chapters"` // Key is the folder name (chapter title)
}

// ChapterEntry contains metadata for a single downloaded chapter
type ChapterEntry struct {
	ChapterId     string           `json:"chapterId"`
	ChapterNumber string           `json:"chapterNumber"`
	ChapterTitle  string           `json:"chapterTitle"` // Original chapter title from provider
	Provider      string           `json:"provider"`
	FolderName    string           `json:"folderName"` // Sanitized folder name on disk
	Pages         map[int]PageInfo `json:"pages"`      // Page index -> PageInfo
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

// SeriesRegistrySummary omits page metadata, which library-wide scans do not need.
type SeriesRegistrySummary struct {
	MediaId  int                             `json:"mediaId"`
	Provider string                          `json:"provider"`
	Chapters map[string]*ChapterEntrySummary `json:"chapters"`
}

type ChapterEntrySummary struct {
	ChapterId     string `json:"chapterId"`
	ChapterNumber string `json:"chapterNumber"`
	ChapterTitle  string `json:"chapterTitle"`
	Provider      string `json:"provider"`
}

type cachedSeriesRegistry struct {
	dir      string
	modTime  int64
	size     int64
	cost     int64
	registry *SeriesRegistrySummary
}

const seriesRegistryCacheLimit = 128 << 20

var seriesRegistryReadCache = struct {
	sync.Mutex
	entries map[string]*list.Element
	order   list.List
	cost    int64
}{entries: make(map[string]*list.Element)}

func removeCachedSeriesRegistry(dir string) {
	if elem, ok := seriesRegistryReadCache.entries[dir]; ok {
		seriesRegistryReadCache.cost -= elem.Value.(*cachedSeriesRegistry).cost
		seriesRegistryReadCache.order.Remove(elem)
		delete(seriesRegistryReadCache.entries, dir)
	}
}

func invalidateSeriesRegistryCache(dir string) {
	seriesRegistryReadCache.Lock()
	defer seriesRegistryReadCache.Unlock()
	removeCachedSeriesRegistry(dir)
}

func cacheSeriesRegistry(entry *cachedSeriesRegistry) {
	removeCachedSeriesRegistry(entry.dir)
	if entry.cost > seriesRegistryCacheLimit {
		return
	}
	for seriesRegistryReadCache.cost+entry.cost > seriesRegistryCacheLimit {
		oldest := seriesRegistryReadCache.order.Back().Value.(*cachedSeriesRegistry)
		removeCachedSeriesRegistry(oldest.dir)
	}
	seriesRegistryReadCache.entries[entry.dir] = seriesRegistryReadCache.order.PushFront(entry)
	seriesRegistryReadCache.cost += entry.cost
}

// LoadSeriesRegistrySummary returns shared, read-only chapter metadata for library scans.
// Full registries are loaded separately when page information is needed.
//
// The cache lock covers only the cache itself. It used to be held across the stat and the decode
// too, which put every registry read in the server behind one lock: a library of thousands of
// series meant thousands of reads in single file per scan, and with the chapter list, the downloads
// list and the background jobs all scanning at once, every one of them waited for all the others —
// long enough for the chapter list to time out. Decodes of the same file are still combined, so
// simultaneous scans do not decode one large registry several times over.
func LoadSeriesRegistrySummary(seriesDir string, logger *zerolog.Logger) (*SeriesRegistrySummary, error) {
	registryPath := filepath.Join(seriesDir, "registry.json")

	info, err := os.Stat(registryPath)
	if err != nil {
		invalidateSeriesRegistryCache(seriesDir)
		if os.IsNotExist(err) {
			return &SeriesRegistrySummary{Chapters: make(map[string]*ChapterEntrySummary)}, nil
		}
		return nil, fmt.Errorf("failed to stat series registry: %w", err)
	}
	modTime, size := info.ModTime().UnixNano(), info.Size()

	if cached := cachedSeriesRegistrySummary(seriesDir, modTime, size); cached != nil {
		return cached, nil
	}

	key := fmt.Sprintf("%s|%d|%d", seriesDir, modTime, size)
	v, err, _ := seriesRegistryDecodes.Do(key, func() (interface{}, error) {
		if cached := cachedSeriesRegistrySummary(seriesDir, modTime, size); cached != nil {
			return cached, nil
		}
		registry, err := decodeSeriesRegistrySummary(registryPath, logger)
		if err != nil {
			return nil, err
		}
		cost := int64(256 + len(seriesDir) + len(registry.Provider))
		for key, chapter := range registry.Chapters {
			cost += int64(256 + len(key))
			if chapter != nil {
				cost += int64(len(chapter.ChapterId) + len(chapter.ChapterNumber) + len(chapter.ChapterTitle) + len(chapter.Provider))
			}
		}
		seriesRegistryReadCache.Lock()
		cacheSeriesRegistry(&cachedSeriesRegistry{dir: seriesDir, modTime: modTime, size: size, cost: cost, registry: registry})
		seriesRegistryReadCache.Unlock()
		return registry, nil
	})
	if err != nil {
		return nil, err
	}
	return v.(*SeriesRegistrySummary), nil
}

var seriesRegistryDecodes singleflight.Group

// cachedSeriesRegistrySummary returns the cached summary when the file is unchanged.
func cachedSeriesRegistrySummary(seriesDir string, modTime, size int64) *SeriesRegistrySummary {
	seriesRegistryReadCache.Lock()
	defer seriesRegistryReadCache.Unlock()
	elem, ok := seriesRegistryReadCache.entries[seriesDir]
	if !ok {
		return nil
	}
	entry := elem.Value.(*cachedSeriesRegistry)
	if entry.modTime != modTime || entry.size != size {
		removeCachedSeriesRegistry(seriesDir)
		return nil
	}
	seriesRegistryReadCache.order.MoveToFront(elem)
	return entry.registry
}

// decodeSeriesRegistrySummary never panics: encoding/json has been seen to run off the end of its
// buffer while skipping the per-page data of a large registry ("index out of range [n] with length
// n" in decodeState.skip). Inside the singleflight that panic is re-raised and takes the whole
// server down, so it is caught here. The streaming decode is retried once as a whole-file decode;
// if that fails too, an error is returned rather than an empty summary, so the series is skipped for
// this scan instead of being cached as having no chapters.
func decodeSeriesRegistrySummary(registryPath string, logger *zerolog.Logger) (registry *SeriesRegistrySummary, err error) {
	registry, err = decodeSeriesRegistrySummaryOnce(registryPath, logger, false)
	if err == nil {
		return registry, nil
	}
	if !errors.Is(err, errSeriesRegistryDecodePanic) {
		return nil, err
	}
	if logger != nil {
		logger.Warn().Err(err).Str("path", registryPath).Msg("series registry: Streaming decode panicked, retrying with a whole-file decode")
	}
	return decodeSeriesRegistrySummaryOnce(registryPath, logger, true)
}

var errSeriesRegistryDecodePanic = errors.New("series registry decode panicked")

func decodeSeriesRegistrySummaryOnce(registryPath string, logger *zerolog.Logger, wholeFile bool) (registry *SeriesRegistrySummary, err error) {
	defer func() {
		if r := recover(); r != nil {
			registry = nil
			err = fmt.Errorf("%w: %v", errSeriesRegistryDecodePanic, r)
		}
	}()
	if wholeFile {
		return unmarshalSeriesRegistrySummary(registryPath, logger)
	}
	return streamSeriesRegistrySummary(registryPath, logger)
}

func unmarshalSeriesRegistrySummary(registryPath string, logger *zerolog.Logger) (*SeriesRegistrySummary, error) {
	data, err := os.ReadFile(registryPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &SeriesRegistrySummary{Chapters: make(map[string]*ChapterEntrySummary)}, nil
		}
		return nil, fmt.Errorf("failed to read series registry: %w", err)
	}
	var registry SeriesRegistrySummary
	if err := stdjson.Unmarshal(data, &registry); err != nil {
		if logger != nil {
			logger.Warn().Err(err).Str("path", registryPath).Msg("series registry: Failed to parse registry, creating new one")
		}
		return &SeriesRegistrySummary{Chapters: make(map[string]*ChapterEntrySummary)}, nil
	}
	if registry.Chapters == nil {
		registry.Chapters = make(map[string]*ChapterEntrySummary)
	}
	return &registry, nil
}

func streamSeriesRegistrySummary(registryPath string, logger *zerolog.Logger) (*SeriesRegistrySummary, error) {
	file, err := os.Open(registryPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &SeriesRegistrySummary{Chapters: make(map[string]*ChapterEntrySummary)}, nil
		}
		return nil, fmt.Errorf("failed to read series registry: %w", err)
	}
	defer file.Close()

	var registry SeriesRegistrySummary
	decoder := stdjson.NewDecoder(file)
	err = decoder.Decode(&registry)
	if err == nil {
		var extra stdjson.RawMessage
		if nextErr := decoder.Decode(&extra); nextErr != io.EOF {
			if nextErr == nil {
				err = fmt.Errorf("unexpected trailing JSON value")
			} else {
				err = nextErr
			}
		}
	}
	if err != nil {
		if logger != nil {
			logger.Warn().Err(err).Str("path", registryPath).Msg("series registry: Failed to parse registry, creating new one")
		}
		return &SeriesRegistrySummary{Chapters: make(map[string]*ChapterEntrySummary)}, nil
	}
	if registry.Chapters == nil {
		registry.Chapters = make(map[string]*ChapterEntrySummary)
	}
	return &registry, nil
}

// Save saves the series registry to the given series directory
func (sr *SeriesRegistry) Save(seriesDir string) error {
	// Coarse file timestamps could let a same-size rewrite look unchanged to the read cache.
	defer invalidateSeriesRegistryCache(seriesDir)
	registryPath := filepath.Join(seriesDir, "registry.json")

	data, err := json.MarshalIndent(sr, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal series registry: %w", err)
	}

	if err := util.WriteFileCrashSafe(registryPath, data, 0644); err != nil {
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
	mu         sync.RWMutex
	registries map[string]*SeriesRegistry // Key is series directory path
	logger     *zerolog.Logger
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
