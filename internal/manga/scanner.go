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
		// Synthetic folders are deliberately *not* skipped.
		//
		// A synthetic entry is an unresolved folder, not a resolved one: it means "nothing was
		// found for this name", which is a statement about one moment and one search. Treating it
		// as settled is what made the state permanent — a scan during a rate-limited minute wrote
		// synthetics for half a library, and every scan afterwards skipped exactly those folders,
		// so the only way out was a full force-rematch of everything.
		//
		// Retried instead, and a retry costs one search for a folder that has no answer yet, which
		// is the cheapest thing a scan can spend a request on. Folders with a real mapping are
		// still skipped; those are answered.
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

		// The folder's own name, exactly as it is on disk.
		//
		// Searching with the stripped version was losing the very characters that identify a
		// series: the colon in a subtitle, the exclamation mark that is part of the title, the
		// comma in a list of names. AniList indexes those, so removing them made the query a
		// slightly wrong version of the right name — and a slightly wrong name is what a fuzzy
		// match at 0.85 is least able to forgive.
		//
		// The stripped version is still built, and still used, but only as a second thing to
		// compare against once the results are in. That costs nothing: no extra request, one more
		// candidate string.
		rawName := strings.TrimSpace(folder.name)
		cleanedName := cleanMangaTitle(folder.name)
		if rawName == "" && cleanedName == "" {
			scanFolder.Status = "unmatched"
			result.ScannedFolders = append(result.ScannedFolders, scanFolder)
			result.UnmatchedCount++
			continue
		}

		searchName := rawName
		if searchName == "" {
			searchName = cleanedName
		}

		// Search AniList
		matched := false
		page := 1
		perPage := 10
		searchResult, err := anilistClient.SearchBaseManga(ctx, &page, &perPage, nil, &searchName, nil)

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
				// Every name AniList knows this series by, not only the three main ones.
				//
				// Synonyms are where the alternative spellings, the abbreviations and the
				// alternate romanisations live — and they are exactly what a folder tends to be
				// named after, because whoever made the folder named it after the release, not
				// after AniList's preferred title. Leaving them out meant a series whose folder
				// used any name but the main three could not be matched at all, however obviously
				// right it was.
				//
				// The native title is included for the same reason: a folder named in Japanese
				// matched nothing before.
				var names []string
				if media.Title != nil {
					for _, tp := range []*string{media.Title.Romaji, media.Title.English, media.Title.UserPreferred, media.Title.Native} {
						if tp != nil && *tp != "" {
							names = append(names, *tp)
						}
					}
				}
				for _, syn := range media.Synonyms {
					if syn != nil && *syn != "" {
						names = append(names, *syn)
					}
				}

				cover := ""
				if media.CoverImage != nil && media.CoverImage.Large != nil {
					cover = *media.CoverImage.Large
				}
				preferred := ""
				if media.Title != nil && media.Title.UserPreferred != nil {
					preferred = *media.Title.UserPreferred
				}

				for _, name := range names {
					t := name
					candidateTitles = append(candidateTitles, &t)
					candidates = append(candidates, titleEntry{
						mediaID:    media.ID,
						title:      preferred,
						coverImage: cover,
					})
				}
			}

			if len(candidateTitles) > 0 {
				// Scored against the folder's real name and against the stripped one, keeping
				// whichever does better. Neither is reliably the closer of the two: a title whose
				// punctuation AniList also carries matches the raw name best, while a folder that
				// merely borrowed some punctuation matches the stripped one. Trying both is free —
				// the results are already in hand — and the better score is the better answer.
				bestMatch, found := comparison.FindBestMatchWithSorensenDice(&rawName, candidateTitles)
				if cleanedName != "" && cleanedName != rawName {
					if alt, altFound := comparison.FindBestMatchWithSorensenDice(&cleanedName, candidateTitles); altFound {
						if !found || alt.Rating > bestMatch.Rating {
							bestMatch, found = alt, true
						}
					}
				}
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

						// A folder that has found its series is no longer a series of its own.
						// Without this the synthetic entry written by an earlier failed scan
						// survives the match and the manga goes on being listed as synthetic
						// beside the real one it has just been matched to.
						if synthetic, foundSynthetic := database.GetSyntheticMangaByProviderID("local", folder.name); foundSynthetic && synthetic != nil {
							_ = database.DeleteSyntheticManga(synthetic.SyntheticID)
						}

						result.MatchedCount++
					}
				}
			}
		} else if err != nil {
			// A search that failed is not a manga that does not exist.
			//
			// Everything below treats "not matched" as "AniList has never heard of this" and
			// writes a synthetic entry for it — a permanent record, created from a folder name,
			// that the manga is not a real series. A rate limit, a timeout or a moment of network
			// trouble produced exactly the same outcome, and once written it stands: the folder is
			// mapped to the synthetic id and later scans skip it. One contended minute during a
			// scan is enough to turn most of a library synthetic, permanently.
			//
			// So a failure is reported and the folder left alone. It stays unmatched, nothing is
			// recorded, and the next scan asks again — which is what a scan is for.
			logger.Warn().Err(err).Str("folder", folder.name).Msg("manga-scan: AniList search failed, leaving the folder for the next scan")
			scanFolder.Status = "search-failed"
			result.ScannedFolders = append(result.ScannedFolders, scanFolder)
			result.UnmatchedCount++
			time.Sleep(700 * time.Millisecond)
			continue
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
