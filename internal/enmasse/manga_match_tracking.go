package enmasse

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"time"
)

// recordMatch records a manga match for later review
func (d *MangaDownloader) recordMatch(
	originalTitle string,
	providerID string,
	matchedID int,
	matchedTitle string,
	isSynthetic bool,
	confidenceScore float64,
	searchResults []*anilist.BaseManga,
	status string,
) {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Limit search results to top 10 to save space
	limitedResults := searchResults
	if len(searchResults) > 10 {
		limitedResults = searchResults[:10]
	}

	record := &MangaMatchRecord{
		OriginalTitle:   originalTitle,
		ProviderID:      providerID,
		MatchedID:       matchedID,
		MatchedTitle:    matchedTitle,
		IsSynthetic:     isSynthetic,
		ConfidenceScore: confidenceScore,
		SearchResults:   limitedResults,
		Status:          status,
		Timestamp:       time.Now(),
	}

	d.matchRecords = append(d.matchRecords, record)
}

// GetMatchHistory returns all match records
func (d *MangaDownloader) GetMatchHistory() []*MangaMatchRecord {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Return a copy to avoid race conditions
	records := make([]*MangaMatchRecord, len(d.matchRecords))
	copy(records, d.matchRecords)
	return records
}

// GetLowConfidenceMatchCount returns count of matches below threshold
func (d *MangaDownloader) GetLowConfidenceMatchCount(threshold float64) int {
	d.mu.Lock()
	defer d.mu.Unlock()

	count := 0
	for _, record := range d.matchRecords {
		if !record.IsSynthetic && record.ConfidenceScore < threshold && record.Status == "downloaded" {
			count++
		}
	}
	return count
}

// CorrectMatch updates a manga's AniList match
func (d *MangaDownloader) CorrectMatch(ctx context.Context, providerID string, newAnilistID int) error {
	db := d.mangaRepository.GetDatabase()
	if db == nil {
		return fmt.Errorf("database not available")
	}

	// Find the match record
	d.mu.Lock()
	var record *MangaMatchRecord
	for _, r := range d.matchRecords {
		if r.ProviderID == providerID {
			record = r
			break
		}
	}
	d.mu.Unlock()

	if record == nil {
		return fmt.Errorf("match record not found for provider ID: %s", providerID)
	}

	// Get new AniList manga details
	platform := d.platformRef.Get()
	if platform == nil {
		return fmt.Errorf("platform not available")
	}

	newManga, err := platform.GetAnilistClient().BaseMangaByID(ctx, &newAnilistID)
	if err != nil {
		return fmt.Errorf("failed to fetch new AniList manga: %w", err)
	}

	oldMediaID := record.MatchedID
	newMediaID := newManga.Media.ID
	newTitle := newManga.Media.GetTitleSafe()

	// If old match was synthetic, delete it
	if record.IsSynthetic {
		syntheticManga, found := db.GetSyntheticManga(oldMediaID)
		if found {
			// Move downloaded chapters folder
			// Get download directory from manga repository
			downloadDir := filepath.Join(filepath.Dir(MangaProgressFilePath), "manga")
			oldPath := filepath.Join(downloadDir, syntheticManga.Title)
			newPath := filepath.Join(downloadDir, newTitle)

			if _, err := os.Stat(oldPath); err == nil {
				if err := os.Rename(oldPath, newPath); err != nil {
					d.logger.Warn().Err(err).
						Str("oldPath", oldPath).
						Str("newPath", newPath).
						Msg("Failed to move manga folder")
				}
			}

			// Delete synthetic manga entry
			if err := db.DeleteSyntheticManga(oldMediaID); err != nil {
				d.logger.Warn().Err(err).Msg("Failed to delete synthetic manga")
			}
		}
	} else {
		// Move folder from old AniList title to new
		// Get old manga title
		oldManga, err := platform.GetAnilistClient().BaseMangaByID(ctx, &oldMediaID)
		if err == nil {
			oldTitle := oldManga.Media.GetTitleSafe()
			downloadDir := filepath.Join(filepath.Dir(MangaProgressFilePath), "manga")
			oldPath := filepath.Join(downloadDir, oldTitle)
			newPath := filepath.Join(downloadDir, newTitle)

			if _, err := os.Stat(oldPath); err == nil {
				if err := os.Rename(oldPath, newPath); err != nil {
					d.logger.Warn().Err(err).
						Str("oldPath", oldPath).
						Str("newPath", newPath).
						Msg("Failed to move manga folder")
				}
			}
		}
	}

	// Update chapter containers in database
	if err := db.UpdateChapterContainerMediaID(oldMediaID, newMediaID); err != nil {
		d.logger.Warn().Err(err).Msg("Failed to update chapter container media IDs")
	}

	// Add to AniList planning list
	_ = d.addToAniListPlanningList(ctx, newManga.Media)

	// Update match record
	d.mu.Lock()
	record.MatchedID = newMediaID
	record.MatchedTitle = newTitle
	record.IsSynthetic = false
	record.ConfidenceScore = 1.0 // User-corrected, so 100% confidence
	d.mu.Unlock()

	// Save progress to persist the correction
	d.saveProgress()

	d.logger.Info().
		Str("providerID", providerID).
		Int("oldMediaID", oldMediaID).
		Int("newMediaID", newMediaID).
		Str("newTitle", newTitle).
		Msg("Successfully corrected manga match")

	return nil
}

// ConvertToSynthetic converts an AniList match to synthetic
func (d *MangaDownloader) ConvertToSynthetic(ctx context.Context, providerID string) error {
	db := d.mangaRepository.GetDatabase()
	if db == nil {
		return fmt.Errorf("database not available")
	}

	// Find the match record
	d.mu.Lock()
	var record *MangaMatchRecord
	for _, r := range d.matchRecords {
		if r.ProviderID == providerID {
			record = r
			break
		}
	}
	d.mu.Unlock()

	if record == nil {
		return fmt.Errorf("match record not found for provider ID: %s", providerID)
	}

	if record.IsSynthetic {
		return fmt.Errorf("manga is already synthetic")
	}

	oldMediaID := record.MatchedID
	platform := d.platformRef.Get()
	if platform == nil {
		return fmt.Errorf("platform not available")
	}

	// Get old manga title for folder rename
	oldManga, err := platform.GetAnilistClient().BaseMangaByID(ctx, &oldMediaID)
	if err != nil {
		return fmt.Errorf("failed to fetch old AniList manga: %w", err)
	}
	oldTitle := oldManga.Media.GetTitleSafe()

	// Create synthetic manga entry
	syntheticID := d.generateSyntheticId(providerID)
	syntheticManga := &models.SyntheticManga{
		SyntheticID: syntheticID,
		Title:       record.OriginalTitle,
		Provider:    DefaultMangaProvider,
		ProviderID:  providerID,
		Status:      "RELEASING",
	}

	if err := db.InsertSyntheticManga(syntheticManga); err != nil {
		return fmt.Errorf("failed to create synthetic manga: %w", err)
	}

	// Move folder
	downloadDir := filepath.Join(filepath.Dir(MangaProgressFilePath), "manga")
	oldPath := filepath.Join(downloadDir, oldTitle)
	newPath := filepath.Join(downloadDir, record.OriginalTitle)

	if _, err := os.Stat(oldPath); err == nil {
		if err := os.Rename(oldPath, newPath); err != nil {
			d.logger.Warn().Err(err).
				Str("oldPath", oldPath).
				Str("newPath", newPath).
				Msg("Failed to move manga folder")
		}
	}

	// Update chapter containers
	if err := db.UpdateChapterContainerMediaID(oldMediaID, syntheticID); err != nil {
		d.logger.Warn().Err(err).Msg("Failed to update chapter container media IDs")
	}

	// Update match record
	d.mu.Lock()
	record.MatchedID = syntheticID
	record.MatchedTitle = record.OriginalTitle
	record.IsSynthetic = true
	record.ConfidenceScore = 0.0 // Synthetic, no confidence score
	d.mu.Unlock()

	// Save progress
	d.saveProgress()

	d.logger.Info().
		Str("providerID", providerID).
		Int("oldMediaID", oldMediaID).
		Int("syntheticID", syntheticID).
		Msg("Successfully converted to synthetic manga")

	return nil
}

// saveProgress saves current progress including match records
func (d *MangaDownloader) saveProgress() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	progress := &MangaDownloaderProgress{
		ProcessedTitles: d.getProcessedTitles(),
		DownloadedManga: d.downloadedManga,
		FailedManga:     d.failedManga,
		SkippedManga:    d.skippedManga,
		MatchRecords:    d.matchRecords,
	}

	data, err := json.MarshalIndent(progress, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal progress: %w", err)
	}

	if err := os.WriteFile(MangaProgressFilePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write progress file: %w", err)
	}

	return nil
}

// getProcessedTitles returns list of processed titles (must be called with lock held)
func (d *MangaDownloader) getProcessedTitles() []string {
	processed := make(map[string]bool)
	for _, title := range d.downloadedManga {
		processed[title] = true
	}
	for _, title := range d.failedManga {
		processed[title] = true
	}
	for _, title := range d.skippedManga {
		processed[title] = true
	}

	titles := make([]string, 0, len(processed))
	for title := range processed {
		titles = append(titles, title)
	}
	return titles
}

// ScanExistingCollection scans the user's existing manga collection and creates match records
func (d *MangaDownloader) ScanExistingCollection(ctx context.Context) error {
	db := d.mangaRepository.GetDatabase()
	if db == nil {
		return fmt.Errorf("database not available")
	}

	platform := d.platformRef.Get()
	if platform == nil {
		return fmt.Errorf("platform not available")
	}

	d.logger.Info().Msg("Scanning existing manga collection for validation")

	// Get all synthetic manga
	syntheticManga, err := db.GetAllSyntheticManga()
	if err != nil {
		d.logger.Warn().Err(err).Msg("Failed to get synthetic manga")
	}

	// Create records for synthetic manga
	for _, manga := range syntheticManga {
		// Check if already recorded
		if d.isAlreadyRecorded(manga.ProviderID) {
			continue
		}

		d.recordMatch(
			manga.Title,
			manga.ProviderID,
			manga.SyntheticID,
			manga.Title,
			true,
			0.0,
			nil,
			"existing",
		)
		d.logger.Debug().
			Str("title", manga.Title).
			Int("syntheticId", manga.SyntheticID).
			Msg("Recorded existing synthetic manga")
	}

	// Get user's AniList manga collection
	anilistClient := platform.GetAnilistClient()
	collection, err := anilistClient.MangaCollection(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to fetch AniList manga collection: %w", err)
	}

	if collection == nil || collection.MediaListCollection == nil {
		return fmt.Errorf("no manga collection found")
	}

	// Process each list in the collection
	for _, list := range collection.MediaListCollection.Lists {
		if list == nil {
			continue
		}

		for _, entry := range list.Entries {
			if entry == nil || entry.Media == nil {
				continue
			}

			media := entry.Media
			mediaID := media.ID
			mediaTitle := media.GetTitleSafe()

			// Check if already recorded
			providerID := fmt.Sprintf("anilist-%d", mediaID)
			if d.isAlreadyRecorded(providerID) {
				continue
			}

			// For existing AniList manga, we don't have search results or confidence scores
			// Mark them as high confidence since they're already in the user's collection
			d.recordMatch(
				mediaTitle,
				providerID,
				mediaID,
				mediaTitle,
				false,
				1.0, // 100% confidence for existing AniList entries
				nil,
				"existing",
			)

			d.logger.Debug().
				Str("title", mediaTitle).
				Int("anilistId", mediaID).
				Msg("Recorded existing AniList manga")
		}
	}

	// Save the updated match records
	if err := d.saveProgress(); err != nil {
		d.logger.Warn().Err(err).Msg("Failed to save progress after collection scan")
	}

	d.mu.Lock()
	recordCount := len(d.matchRecords)
	d.mu.Unlock()

	d.logger.Info().
		Int("recordCount", recordCount).
		Msg("Completed scanning existing manga collection")

	return nil
}

// isAlreadyRecorded checks if a provider ID is already in match records
func (d *MangaDownloader) isAlreadyRecorded(providerID string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()

	for _, record := range d.matchRecords {
		if record.ProviderID == providerID {
			return true
		}
	}
	return false
}

// AutoMatchSyntheticManga scans all synthetic manga and attempts to find AniList matches
func (d *MangaDownloader) AutoMatchSyntheticManga(ctx context.Context) error {
	db := d.mangaRepository.GetDatabase()
	if db == nil {
		return fmt.Errorf("database not available")
	}

	platform := d.platformRef.Get()
	if platform == nil {
		return fmt.Errorf("platform not available")
	}

	d.logger.Info().Msg("Starting auto-match for synthetic manga")

	// Clear existing synthetic manga records to force re-evaluation
	d.mu.Lock()
	var filteredRecords []*MangaMatchRecord
	for _, record := range d.matchRecords {
		// Keep only non-synthetic records or records that are not "existing" status
		if !record.IsSynthetic || record.Status != "existing" {
			filteredRecords = append(filteredRecords, record)
		}
	}
	d.matchRecords = filteredRecords
	d.mu.Unlock()

	d.logger.Debug().Msg("Cleared existing synthetic manga records for re-evaluation")

	// Get all synthetic manga
	syntheticManga, err := db.GetAllSyntheticManga()
	if err != nil {
		return fmt.Errorf("failed to get synthetic manga: %w", err)
	}

	if len(syntheticManga) == 0 {
		d.logger.Info().Msg("No synthetic manga found")
		return nil
	}

	matchedCount := 0
	for _, manga := range syntheticManga {
		// Use ProviderID if available, otherwise use synthetic ID as identifier
		identifier := manga.ProviderID
		if identifier == "" {
			identifier = fmt.Sprintf("synthetic-%d", manga.SyntheticID)
		}
		
		// Don't skip - we cleared the records above
		// This ensures all synthetic manga are re-evaluated

		d.logger.Debug().
			Str("title", manga.Title).
			Int("syntheticId", manga.SyntheticID).
			Str("identifier", identifier).
			Msg("Attempting to match synthetic manga to AniList")

		// Search AniList for this manga
		searchResults, err := d.searchAniListMangaWithResults(ctx, manga.Title)
		if err != nil {
			d.logger.Debug().
				Err(err).
				Str("title", manga.Title).
				Msg("No AniList match found for synthetic manga")
			
			// Still create a record for review, but keep it as synthetic
			d.recordMatch(
				manga.Title,
				identifier,
				manga.SyntheticID,
				manga.Title,
				true,
				0.0,
				nil,
				"existing",
			)
			continue
		}

		// Get the best match and all search results
		bestMatch := searchResults.bestMatch
		allResults := searchResults.searchResults

		// Calculate confidence score
		confidenceScore := searchResults.bestScore

		// Record the match for review
		d.recordMatch(
			manga.Title,
			identifier,
			bestMatch.ID,
			bestMatch.GetTitleSafe(),
			false, // Not synthetic anymore - we found an AniList match
			confidenceScore,
			allResults,
			"existing",
		)

		matchedCount++
		d.logger.Info().
			Str("title", manga.Title).
			Str("matched", bestMatch.GetTitleSafe()).
			Float64("confidence", confidenceScore).
			Msg("Found potential AniList match for synthetic manga")

		// Rate limiting
		time.Sleep(DelayBetweenAPIRequests)
	}

	// Save the match records
	if err := d.saveProgress(); err != nil {
		d.logger.Warn().Err(err).Msg("Failed to save progress after auto-matching")
	}

	d.logger.Info().
		Int("total", len(syntheticManga)).
		Int("matched", matchedCount).
		Msg("Completed auto-matching synthetic manga")

	return nil
}
