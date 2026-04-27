package chapter_downloader

import (
	"fmt"
	"os"
	"path/filepath"
	manga_providers "seanime/internal/manga/providers"
	"sort"
	"strings"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
)

// MigrationResult contains information about a migration operation
type MigrationResult struct {
	SeriesDir       string
	ChaptersMigrated int
	ChaptersFailed   int
	Errors          []string
}

type MigrationProgress struct {
	CurrentSeries int    `json:"currentSeries"`
	TotalSeries   int    `json:"totalSeries"`
	SeriesDir     string `json:"seriesDir"`
	Migrated      int    `json:"migrated"`
	Failed        int    `json:"failed"`
	Status        string `json:"status"`
}

// MigrateDownloadDirectory migrates all manga in the download directory to the new format
// Old format: {downloadDir}/{MediaTitle}/{provider}_{mediaId}_{chapterId}_{chapterTitle}_{chapterNumber}/registry.json
// New format: {downloadDir}/{MediaTitle}/registry.json + {downloadDir}/{MediaTitle}/{ChapterTitle}/
func MigrateDownloadDirectory(downloadDir string, logger *zerolog.Logger) ([]MigrationResult, error) {
	return MigrateDownloadDirectoryWithProgress(downloadDir, logger, 0, nil)
}

// MigrateDownloadDirectoryWithProgress migrates all manga in the download directory to the new format.
// It can optionally emit progress updates and throttle per-series processing.
func MigrateDownloadDirectoryWithProgress(
	downloadDir string,
	logger *zerolog.Logger,
	rateLimitDelay time.Duration,
	progressFn func(MigrationProgress),
) ([]MigrationResult, error) {
	results := make([]MigrationResult, 0)
	
	// Read all media directories
	mediaDirs, err := os.ReadDir(downloadDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read download directory: %w", err)
	}

	totalSeries := 0
	for _, mediaDir := range mediaDirs {
		if mediaDir.IsDir() {
			totalSeries++
		}
	}

	currentSeries := 0
	totalMigrated := 0
	totalFailed := 0
	
	for _, mediaDir := range mediaDirs {
		if !mediaDir.IsDir() {
			continue
		}

		currentSeries++
		
		seriesDir := filepath.Join(downloadDir, mediaDir.Name())
		if progressFn != nil {
			progressFn(MigrationProgress{
				CurrentSeries: currentSeries,
				TotalSeries:   totalSeries,
				SeriesDir:     seriesDir,
				Migrated:      totalMigrated,
				Failed:        totalFailed,
				Status:        "migrating",
			})
		}

		result := MigrateSeriesDirectory(seriesDir, logger)
		totalMigrated += result.ChaptersMigrated
		totalFailed += result.ChaptersFailed
		if result.ChaptersMigrated > 0 || result.ChaptersFailed > 0 || len(result.Errors) > 0 {
			results = append(results, result)
		}

		if progressFn != nil {
			progressFn(MigrationProgress{
				CurrentSeries: currentSeries,
				TotalSeries:   totalSeries,
				SeriesDir:     seriesDir,
				Migrated:      totalMigrated,
				Failed:        totalFailed,
				Status:        "migrating",
			})
		}

		if rateLimitDelay > 0 {
			time.Sleep(rateLimitDelay)
		}
	}

	if progressFn != nil {
		progressFn(MigrationProgress{
			CurrentSeries: totalSeries,
			TotalSeries:   totalSeries,
			Migrated:      totalMigrated,
			Failed:        totalFailed,
			Status:        "completed",
		})
	}
	
	return results, nil
}

// MigrateSeriesDirectory migrates a single series directory to the new format
func MigrateSeriesDirectory(seriesDir string, logger *zerolog.Logger) MigrationResult {
	result := MigrationResult{
		SeriesDir: seriesDir,
		Errors:    make([]string, 0),
	}
	
	// Check if this directory needs migration by looking for old-format chapter directories
	entries, err := os.ReadDir(seriesDir)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("failed to read series directory: %v", err))
		return result
	}
	
	// Check if a series registry already exists
	seriesRegistryPath := filepath.Join(seriesDir, "registry.json")
	var seriesRegistry *SeriesRegistry
	
	if _, err := os.Stat(seriesRegistryPath); err == nil {
		// Load existing series registry
		seriesRegistry, err = LoadSeriesRegistry(seriesDir, logger)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("failed to load existing registry: %v", err))
			return result
		}
	} else {
		// Create new series registry
		seriesRegistry = &SeriesRegistry{
			Chapters: make(map[string]*ChapterEntry),
		}
	}
	
	// Find old-format chapter directories
	seriesTitles := make([]string, 0)
	for _, entry := range seriesRegistry.Chapters {
		if entry == nil {
			continue
		}
		seriesTitles = append(seriesTitles, entry.ChapterTitle)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		
		dirName := entry.Name()
		
		// Try to parse as old format
		downloadId, ok := ParseChapterDirName(dirName)
		if !ok {
			// Not an old-format directory, skip
			continue
		}
		
		// This is an old-format directory, migrate it
		oldChapterDir := filepath.Join(seriesDir, dirName)
		
		// Read the old chapter registry
		oldRegistryPath := filepath.Join(oldChapterDir, "registry.json")
		oldRegistryData, err := os.ReadFile(oldRegistryPath)
		var oldRegistry Registry
		if err != nil {
			if os.IsNotExist(err) {
				reconstructed, reconErr := buildLegacyRegistryFromChapterDir(oldChapterDir)
				if reconErr != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("failed to reconstruct old registry for %s: %v", dirName, reconErr))
					result.ChaptersFailed++
					continue
				}
				oldRegistry = reconstructed
				if logger != nil {
					logger.Warn().
						Str("chapterDir", oldChapterDir).
						Int("pages", len(reconstructed)).
						Msg("migration: Missing legacy registry.json, reconstructed from chapter files")
				}
			} else {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to read old registry for %s: %v", dirName, err))
				result.ChaptersFailed++
				continue
			}
		} else {
			if err := json.Unmarshal(oldRegistryData, &oldRegistry); err != nil {
				reconstructed, reconErr := buildLegacyRegistryFromChapterDir(oldChapterDir)
				if reconErr != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("failed to parse old registry for %s: %v", dirName, err))
					result.ChaptersFailed++
					continue
				}
				oldRegistry = reconstructed
				if logger != nil {
					logger.Warn().
						Str("chapterDir", oldChapterDir).
						Int("pages", len(reconstructed)).
						Msg("migration: Invalid legacy registry.json, reconstructed from chapter files")
				}
			}
		}
		
		// Determine the new folder name from chapter title
		chapterTitle := downloadId.ChapterTitle
		if chapterTitle == "" {
			chapterTitle = ""
		} else {
			// The title was stored with underscores replacing spaces
			chapterTitle = strings.ReplaceAll(chapterTitle, "_", " ")
		}
		seriesTitles = append(seriesTitles, chapterTitle)
		
		// Generate unique folder name
		newFolderName := seriesRegistry.GenerateUniqueFolderName(chapterTitle, downloadId.ChapterNumber)
		newFolderName = ensureAvailableFolderName(seriesDir, newFolderName, oldChapterDir)
		newChapterDir := filepath.Join(seriesDir, newFolderName)
		
		// Update series registry metadata if not set
		if seriesRegistry.MediaId == 0 {
			seriesRegistry.MediaId = downloadId.MediaId
		}
		if seriesRegistry.Provider == "" {
			seriesRegistry.Provider = downloadId.Provider
		}
		
		// Create chapter entry
		chapterEntry := &ChapterEntry{
			ChapterId:     downloadId.ChapterId,
			ChapterNumber: downloadId.ChapterNumber,
			ChapterTitle:  chapterTitle,
			Provider:      downloadId.Provider,
			FolderName:    newFolderName,
			Pages:         make(map[int]PageInfo),
		}
		
		// Copy page info from old registry
		for pageIndex, pageInfo := range oldRegistry {
			chapterEntry.Pages[pageIndex] = pageInfo
		}
		
		// Rename the directory
		if oldChapterDir != newChapterDir {
			if err := os.Rename(oldChapterDir, newChapterDir); err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to rename %s to %s: %v", dirName, newFolderName, err))
				result.ChaptersFailed++
				continue
			}
		}
		
		// Remove the old registry.json from the chapter directory
		newRegistryInChapter := filepath.Join(newChapterDir, "registry.json")
		_ = os.Remove(newRegistryInChapter)
		
		// Add to series registry
		seriesRegistry.AddChapter(newFolderName, chapterEntry)
		
		if logger != nil {
			logger.Info().
				Str("old", dirName).
				Str("new", newFolderName).
				Msg("migration: Migrated chapter")
		}
		
		result.ChaptersMigrated++
	}

	dynamicPrefix := manga_providers.InferDynamicChapterPrefixForSeries(seriesTitles, filepath.Base(seriesDir))
	for _, entry := range seriesRegistry.Chapters {
		if entry == nil {
			continue
		}
		entry.ChapterTitle = manga_providers.GetPreferredChapterTitle(dynamicPrefix, entry.ChapterTitle, entry.ChapterNumber)
	}

	// Normalize chapter folder names in registries that are already in the new format.
	if len(seriesRegistry.Chapters) > 0 {
		replacements := make(map[string]*ChapterEntry)
		for oldFolderName, entry := range seriesRegistry.Chapters {
			if entry == nil {
				continue
			}
			preferredTitle := manga_providers.GetPreferredChapterTitle(dynamicPrefix, entry.ChapterTitle, entry.ChapterNumber)
			preferredFolderName := SanitizeFolderName(preferredTitle)
			if preferredFolderName == "" || preferredFolderName == oldFolderName {
				continue
			}

			oldPath := filepath.Join(seriesDir, oldFolderName)
			newFolderName := preferredFolderName
			if _, exists := seriesRegistry.Chapters[newFolderName]; exists {
				newFolderName = seriesRegistry.GenerateUniqueFolderName(preferredTitle, entry.ChapterNumber)
			}
			newFolderName = ensureAvailableFolderName(seriesDir, newFolderName, oldPath)
			newPath := filepath.Join(seriesDir, newFolderName)
			if oldPath != newPath {
				if err := os.Rename(oldPath, newPath); err != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("failed to rename %s to %s: %v", oldFolderName, newFolderName, err))
					result.ChaptersFailed++
					continue
				}
			}

			entry.ChapterTitle = preferredTitle
			entry.FolderName = newFolderName
			replacements[oldFolderName] = entry
			result.ChaptersMigrated++
		}

		for oldFolderName := range replacements {
			delete(seriesRegistry.Chapters, oldFolderName)
		}
		for _, entry := range replacements {
			seriesRegistry.Chapters[entry.FolderName] = entry
		}
	}
	
	// Save the series registry if we migrated any chapters
	if result.ChaptersMigrated > 0 {
		if err := seriesRegistry.Save(seriesDir); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("failed to save series registry: %v", err))
		}
	}
	
	return result
}

// IsOldFormatDirectory checks if a chapter directory is in the old format
func IsOldFormatDirectory(dirName string) bool {
	_, ok := ParseChapterDirName(dirName)
	return ok
}

// NeedsMigration checks if a series directory contains old-format chapter directories
func NeedsMigration(seriesDir string) (bool, error) {
	entries, err := os.ReadDir(seriesDir)
	if err != nil {
		return false, err
	}
	
	for _, entry := range entries {
		if entry.IsDir() && IsOldFormatDirectory(entry.Name()) {
			return true, nil
		}
	}
	
	return false, nil
}

func ensureAvailableFolderName(seriesDir, preferredFolderName, skipPath string) string {
	if preferredFolderName == "" {
		preferredFolderName = "Chapter"
	}

	candidate := preferredFolderName
	suffix := 2

	for {
		candidatePath := filepath.Join(seriesDir, candidate)
		if candidatePath == skipPath {
			return candidate
		}

		if _, err := os.Stat(candidatePath); err != nil {
			if os.IsNotExist(err) {
				return candidate
			}
		}

		candidate = fmt.Sprintf("%s (%d)", preferredFolderName, suffix)
		suffix++
	}
}

func buildLegacyRegistryFromChapterDir(chapterDir string) (Registry, error) {
	entries, err := os.ReadDir(chapterDir)
	if err != nil {
		return nil, err
	}

	imageFiles := make([]os.DirEntry, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if strings.EqualFold(name, "registry.json") {
			continue
		}

		ext := strings.ToLower(filepath.Ext(name))
		switch ext {
		case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif":
			imageFiles = append(imageFiles, entry)
		}
	}

	sort.Slice(imageFiles, func(i, j int) bool {
		return imageFiles[i].Name() < imageFiles[j].Name()
	})

	reg := make(Registry)
	for i, file := range imageFiles {
		var size int64
		if info, err := file.Info(); err == nil {
			size = info.Size()
		}

		reg[i] = PageInfo{
			Index:    i,
			Filename: file.Name(),
			Size:     size,
		}
	}

	return reg, nil
}
