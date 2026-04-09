package manga

import (
	"context"
	"hash/fnv"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/util/comparison"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

const (
	ScanMatchThreshold = 0.85
)

// MangaScanResult is the top-level response for a manga directory scan.
type MangaScanResult struct {
	ScannedFolders []MangaScanFolder `json:"scannedFolders"`
	MatchedCount   int               `json:"matchedCount"`
	UnmatchedCount int               `json:"unmatchedCount"`
	SkippedCount   int               `json:"skippedCount"`
	StartedAt      string            `json:"startedAt"`
	CompletedAt    string            `json:"completedAt"`
}

// MangaScanFolder represents one scanned folder and its match status.
type MangaScanFolder struct {
	FolderPath     string  `json:"folderPath"`
	FolderName     string  `json:"folderName"`
	ChapterCount   int     `json:"chapterCount"`
	Status         string  `json:"status"` // "matched", "unmatched", "skipped"
	MatchedMediaID int     `json:"matchedMediaId"`
	MatchedTitle   string  `json:"matchedTitle"`
	MatchedImage   string  `json:"matchedImage"`
	Confidence     float64 `json:"confidence"`
	IsSynthetic    bool    `json:"isSynthetic"`
}

// MangaScanProgressEvent is sent via WebSocket during scanning.
type MangaScanProgressEvent struct {
	Current    int    `json:"current"`
	Total      int    `json:"total"`
	FolderName string `json:"folderName"`
}

// ScanMangaDirectories scans local + download directories and auto-matches folders to AniList manga.
func ScanMangaDirectories(
	ctx context.Context,
	localDir string,
	downloadDir string,
	forceRematch bool,
	database *db.Database,
	wsEventManager events.WSEventManagerInterface,
	logger *zerolog.Logger,
) (*MangaScanResult, error) {
	startedAt := time.Now()

	// Collect all unique folder names across both directories
	folderMap := make(map[string]string) // folderName -> fullPath (first seen wins)

	for _, dir := range []string{localDir, downloadDir} {
		if dir == "" {
			continue
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			logger.Warn().Err(err).Str("dir", dir).Msg("manga-scan: Failed to read directory")
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				name := entry.Name()
				if _, exists := folderMap[name]; !exists {
					folderMap[name] = filepath.Join(dir, name)
				}
			}
		}
	}

	if len(folderMap) == 0 {
		return &MangaScanResult{
			ScannedFolders: []MangaScanFolder{},
			StartedAt:      startedAt.Format(time.RFC3339),
			CompletedAt:    time.Now().Format(time.RFC3339),
		}, nil
	}

	// Build ordered list
	type folderItem struct {
		name string
		path string
	}
	folders := make([]folderItem, 0, len(folderMap))
	for name, path := range folderMap {
		folders = append(folders, folderItem{name: name, path: path})
	}

	total := len(folders)
	result := &MangaScanResult{
		ScannedFolders: make([]MangaScanFolder, 0, total),
		StartedAt:      startedAt.Format(time.RFC3339),
	}

	// Check existing mappings (provider="local") to know what to skip
	existingMappings := make(map[string]bool) // mangaId (folder name) -> mapped
	if !forceRematch {
		// Query all local mappings
		var mappings []models.MangaMapping
		database.Gorm().Where("provider = ?", "local").Find(&mappings)
		for _, m := range mappings {
			existingMappings[m.MangaID] = true
		}
		// Also check synthetic manga with local provider
		synthetics, _ := database.GetAllSyntheticManga()
		for _, s := range synthetics {
			if s.Provider == "local" {
				existingMappings[s.ProviderID] = true
			}
		}
	}

	anilistClient := anilist.NewAnilistClient("", "")

	for i, folder := range folders {
		// Send progress event
		if wsEventManager != nil {
			wsEventManager.SendEvent(events.MangaScanProgress, MangaScanProgressEvent{
				Current:    i + 1,
				Total:      total,
				FolderName: folder.name,
			})
		}

		scanFolder := MangaScanFolder{
			FolderPath: folder.path,
			FolderName: folder.name,
		}

		// Count chapters (quick: count subdirs + archive files at depth 1)
		scanFolder.ChapterCount = countChapters(folder.path)

		// Skip if already mapped and not force rematch
		if !forceRematch && existingMappings[folder.name] {
			scanFolder.Status = "skipped"
			result.ScannedFolders = append(result.ScannedFolders, scanFolder)
			result.SkippedCount++
			continue
		}

		// Clean folder name for search
		cleanedName := cleanMangaTitle(folder.name)
		if cleanedName == "" {
			scanFolder.Status = "unmatched"
			result.ScannedFolders = append(result.ScannedFolders, scanFolder)
			result.UnmatchedCount++
			continue
		}

		// Search AniList
		matched := false
		page := 1
		perPage := 10
		searchResult, err := anilistClient.SearchBaseManga(ctx, &page, &perPage, nil, &cleanedName, nil)

		if err == nil && searchResult != nil && searchResult.Page != nil && len(searchResult.Page.Media) > 0 {
			// Collect all titles from results for comparison
			var candidateTitles []*string
			type titleEntry struct {
				mediaID    int
				title      string
				coverImage string
			}
			var candidates []titleEntry

			for _, media := range searchResult.Page.Media {
				if media.Title != nil {
					titles := []**string{&media.Title.Romaji, &media.Title.English, &media.Title.UserPreferred}
					for _, tp := range titles {
						if *tp != nil && **tp != "" {
							t := **tp
							candidateTitles = append(candidateTitles, &t)
							cover := ""
							if media.CoverImage != nil && media.CoverImage.Large != nil {
								cover = *media.CoverImage.Large
							}
							preferred := ""
							if media.Title.UserPreferred != nil {
								preferred = *media.Title.UserPreferred
							}
							candidates = append(candidates, titleEntry{
								mediaID:    media.ID,
								title:      preferred,
								coverImage: cover,
							})
						}
					}
				}
			}

			if len(candidateTitles) > 0 {
				bestMatch, found := comparison.FindBestMatchWithSorensenDice(&cleanedName, candidateTitles)
				if found && bestMatch.Rating >= ScanMatchThreshold {
					// Find the candidate that owns this title
					matchIdx := -1
					for j, ct := range candidateTitles {
						if ct == bestMatch.Value {
							matchIdx = j
							break
						}
					}
					if matchIdx >= 0 && matchIdx < len(candidates) {
						c := candidates[matchIdx]
						scanFolder.Status = "matched"
						scanFolder.MatchedMediaID = c.mediaID
						scanFolder.MatchedTitle = c.title
						scanFolder.MatchedImage = c.coverImage
						scanFolder.Confidence = bestMatch.Rating
						matched = true

						// Create or update MangaMapping
						if forceRematch {
							_ = database.DeleteMangaMapping("local", c.mediaID)
						}
						_ = database.InsertMangaMapping("local", c.mediaID, folder.name)

						result.MatchedCount++
					}
				}
			}
		} else if err != nil {
			logger.Warn().Err(err).Str("folder", folder.name).Msg("manga-scan: AniList search failed")
		}

		if !matched {
			scanFolder.Status = "unmatched"

			// Create SyntheticManga if one doesn't already exist for this folder
			existing, found := database.GetSyntheticMangaByProviderID("local", folder.name)
			if !found || existing == nil {
				syntheticID := generateSyntheticID(folder.name)
				_ = database.InsertSyntheticManga(&models.SyntheticManga{
					SyntheticID: syntheticID,
					Title:       folder.name,
					Provider:    "local",
					ProviderID:  folder.name,
					Status:      "RELEASING",
					Chapters:    scanFolder.ChapterCount,
				})
				scanFolder.MatchedMediaID = syntheticID
				scanFolder.IsSynthetic = true
			} else {
				scanFolder.MatchedMediaID = existing.SyntheticID
				scanFolder.IsSynthetic = true
			}

			result.UnmatchedCount++
		}

		result.ScannedFolders = append(result.ScannedFolders, scanFolder)

		// Small delay to avoid AniList rate limiting (90 req/min)
		time.Sleep(700 * time.Millisecond)
	}

	result.CompletedAt = time.Now().Format(time.RFC3339)

	// Send completion event
	if wsEventManager != nil {
		wsEventManager.SendEvent(events.MangaScanCompleted, nil)
	}

	return result, nil
}

func cleanMangaTitle(title string) string {
	title = strings.TrimSpace(title)
	title = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '!' || r == '"' || r == '<' || r == '>' || r == '|' || r == ',' {
			return -1
		}
		return r
	}, title)
	return strings.TrimSpace(title)
}

func countChapters(dirPath string) int {
	count := 0
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return 0
	}
	for _, entry := range entries {
		name := strings.ToLower(entry.Name())
		if entry.IsDir() {
			count++
		} else if strings.HasSuffix(name, ".cbz") || strings.HasSuffix(name, ".cbr") ||
			strings.HasSuffix(name, ".zip") || strings.HasSuffix(name, ".pdf") {
			count++
		}
	}
	return count
}

func generateSyntheticID(providerID string) int {
	h := fnv.New64a()
	h.Write([]byte(providerID))
	hash := int(h.Sum64() & 0x7FFFFFFF)
	return -hash
}
