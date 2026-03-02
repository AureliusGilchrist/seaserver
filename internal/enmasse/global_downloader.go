package enmasse

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/torrents/torrent"
	"seanime/internal/unmatched"
	"seanime/internal/util"

	"github.com/rs/zerolog"
)

const (
	GlobalAnimeOfflineDatabasePath = "/aeternae/Soul/Otaku Media/Databases/anime-offline-database-minified.json"
	GlobalAnimeProgressFilePath    = "/aeternae/Soul/Otaku Media/Databases/enmasse-global-progress.json"
	GlobalMaxConcurrentSearches   = 2
	GlobalDelayBetweenAnime       = 3 * time.Second
	GlobalDelayBetweenSearches    = 1 * time.Second
	GlobalMaxAnimeLogEntries      = 300
)

type (
	GlobalDownloader struct {
		logger                     *zerolog.Logger
		torrentRepository          *torrent.Repository
		torrentClientRepositoryRef *util.Ref[*torrent_client.Repository]
		wsEventManager             events.WSEventManagerInterface
		unmatchedRepository        *unmatched.Repository
		database                   *db.Database

		mu              sync.Mutex
		isRunning       bool
		isPaused        bool
		cancelFunc      context.CancelFunc
		currentAnime    *AnimeOfflineItem
		processedCount  int
		totalCount      int
		downloadedAnime []string
		failedAnime     []string
		status          string
		searchSemaphore chan struct{}
		importingDatabase bool
		cachedDatabaseCount int64
	}

	NewGlobalDownloaderOptions struct {
		Logger                     *zerolog.Logger
		TorrentRepository          *torrent.Repository
		TorrentClientRepositoryRef *util.Ref[*torrent_client.Repository]
		WSEventManager             events.WSEventManagerInterface
		UnmatchedRepository        *unmatched.Repository
		Database                   *db.Database
	}

	GlobalDownloaderStatus struct {
		IsRunning        bool     `json:"isRunning"`
		IsPaused         bool     `json:"isPaused"`
		CurrentAnime     string   `json:"currentAnime"`
		CurrentAnimeId   int      `json:"currentAnimeId"`
		ProcessedCount   int      `json:"processedCount"`
		TotalCount       int      `json:"totalCount"`
		DownloadedAnime  []string `json:"downloadedAnime"`
		FailedAnime      []string `json:"failedAnime"`
		Status           string   `json:"status"`
		HasSavedProgress bool     `json:"hasSavedProgress"`
		DatabaseCount    int64    `json:"databaseCount"`
	}

	GlobalDownloaderProgress struct {
		ProcessedTitles []string `json:"processed_titles"`
		DownloadedAnime []string `json:"downloaded_anime"`
		FailedAnime     []string `json:"failed_anime"`
	}

	// AnimeOfflineDatabase represents the anime-offline-database JSON structure
	AnimeOfflineDatabase struct {
		License    interface{}          `json:"license"`
		Repository string               `json:"repository"`
		LastUpdate string               `json:"lastUpdate"`
		Data       []*AnimeOfflineItem  `json:"data"`
	}

	// AnimeOfflineItem represents a single anime entry from anime-offline-database
	AnimeOfflineItem struct {
		Sources      []string           `json:"sources"`
		Title        string             `json:"title"`
		Type         string             `json:"type"`         // TV, MOVIE, OVA, ONA, SPECIAL, UNKNOWN
		Episodes     int                `json:"episodes"`
		Status       string             `json:"status"`       // FINISHED, ONGOING, UPCOMING, UNKNOWN
		AnimeSeason  *AnimeOfflineSeason `json:"animeSeason"`
		Picture      string             `json:"picture"`
		Thumbnail    string             `json:"thumbnail"`
		Synonyms     []string           `json:"synonyms"`
		Studios      []string           `json:"studios"`
		Tags         []string           `json:"tags"`
		// Parsed IDs from sources
		AnilistID    int                `json:"-"`
		MalID        int                `json:"-"`
	}

	AnimeOfflineSeason struct {
		Season string `json:"season"` // SPRING, SUMMER, FALL, WINTER, UNDEFINED
		Year   int    `json:"year"`
	}
)

func NewGlobalDownloader(opts *NewGlobalDownloaderOptions) *GlobalDownloader {
	return &GlobalDownloader{
		logger:                     opts.Logger,
		torrentRepository:          opts.TorrentRepository,
		torrentClientRepositoryRef: opts.TorrentClientRepositoryRef,
		wsEventManager:             opts.WSEventManager,
		unmatchedRepository:        opts.UnmatchedRepository,
		database:                   opts.Database,
		status:                     "Idle",
		downloadedAnime:            make([]string, 0, GlobalMaxAnimeLogEntries),
		failedAnime:                make([]string, 0, GlobalMaxAnimeLogEntries),
		searchSemaphore:            make(chan struct{}, GlobalMaxConcurrentSearches),
	}
}

func (d *GlobalDownloader) GetStatus() *GlobalDownloaderStatus {
	d.mu.Lock()
	currentAnime := ""
	currentAnimeId := 0
	if d.currentAnime != nil {
		currentAnime = d.currentAnime.Title
		currentAnimeId = d.generateSyntheticId(d.currentAnime.Title)
	}
	statusSnapshot := GlobalDownloaderStatus{
		IsRunning:        d.isRunning,
		IsPaused:         d.isPaused,
		CurrentAnime:     currentAnime,
		CurrentAnimeId:   currentAnimeId,
		ProcessedCount:   d.processedCount,
		TotalCount:       d.totalCount,
		DownloadedAnime:  append([]string{}, d.downloadedAnime...),
		FailedAnime:      append([]string{}, d.failedAnime...),
		Status:           d.status,
		HasSavedProgress: d.hasSavedProgress(),
		DatabaseCount:    d.cachedDatabaseCount,
	}
	importing := d.importingDatabase
	d.mu.Unlock()

	if d.database != nil {
		if importing {
			return &statusSnapshot
		}
		if count, err := d.database.GetSyntheticAnimeCount(); err == nil {
			statusSnapshot.DatabaseCount = count
			d.mu.Lock()
			d.cachedDatabaseCount = count
			d.mu.Unlock()
		}
	}

	return &statusSnapshot
}

func (d *GlobalDownloader) hasSavedProgress() bool {
	_, err := os.Stat(GlobalAnimeProgressFilePath)
	return err == nil
}

// DownloadDatabase downloads the latest anime-offline-database
func (d *GlobalDownloader) ensureDatabaseAvailable() error {
	d.logger.Info().Msgf("global-enmasse: Using %s", GlobalAnimeOfflineDatabasePath)
	d.setStatus("Verifying database file...")

	if _, err := os.Stat(GlobalAnimeOfflineDatabasePath); err != nil {
		return fmt.Errorf("database file missing: %w", err)
	}

	return nil
}

// ImportDatabase imports anime from anime-offline-database into SyntheticAnime table
func (d *GlobalDownloader) ImportDatabase() error {
	d.logger.Info().Msg("global-enmasse: Importing anime-offline-database...")
	d.setStatus("Importing database...")
	d.setImporting(true)
	defer d.setImporting(false)

	animeList, err := d.loadAnimeList()
	if err != nil {
		return err
	}

	d.logger.Info().Int("count", len(animeList)).Msg("global-enmasse: Loaded anime list")

	// Import each anime into the database
	imported := 0
	for _, item := range animeList {
		syntheticAnime := d.convertToSyntheticAnime(item)
		if err := d.database.UpsertSyntheticAnime(syntheticAnime); err != nil {
			d.logger.Warn().Err(err).Str("title", item.Title).Msg("global-enmasse: Failed to import anime")
			continue
		}
		imported++
		if imported%1000 == 0 {
			d.logger.Info().Int("imported", imported).Msg("global-enmasse: Import progress")
		}
	}

	d.logger.Info().Int("imported", imported).Msg("global-enmasse: Database import completed")
	d.setStatus(fmt.Sprintf("Imported %d anime", imported))
	return nil
}

func (d *GlobalDownloader) Start(resume bool) error {
	d.mu.Lock()
	if d.isRunning {
		d.mu.Unlock()
		return fmt.Errorf("global en masse downloader is already running")
	}
	d.isRunning = true
	d.isPaused = false

	if !resume {
		d.processedCount = 0
		d.downloadedAnime = make([]string, 0, GlobalMaxAnimeLogEntries)
		d.failedAnime = make([]string, 0, GlobalMaxAnimeLogEntries)
		d.clearProgress()
	}
	d.status = "Starting..."
	d.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	d.cancelFunc = cancel

	go d.run(ctx, resume)

	return nil
}

func (d *GlobalDownloader) Stop(saveProgress bool) {
	d.mu.Lock()

	if d.cancelFunc != nil {
		d.cancelFunc()
	}

	if saveProgress {
		d.isPaused = true
		d.status = "Paused"
	} else {
		d.clearProgressUnlocked()
		d.isPaused = false
		d.status = "Stopped"
	}

	d.isRunning = false
	d.mu.Unlock()

	d.sendStatusUpdate()
}

func (d *GlobalDownloader) run(ctx context.Context, resume bool) {
	defer func() {
		d.mu.Lock()
		d.isRunning = false
		d.currentAnime = nil
		d.mu.Unlock()
		d.sendStatusUpdate()
	}()

	// Ensure local database available
	if err := d.ensureDatabaseAvailable(); err != nil {
		d.setStatus(fmt.Sprintf("Error accessing database: %v", err))
		d.logger.Error().Err(err).Msg("global-enmasse: Failed to access database file")
		return
	}

	// Import database into SyntheticAnime table
	if err := d.ImportDatabase(); err != nil {
		d.setStatus(fmt.Sprintf("Error importing database: %v", err))
		d.logger.Error().Err(err).Msg("global-enmasse: Failed to import database")
		return
	}

	// Load anime list
	animeList, err := d.loadAnimeList()
	if err != nil {
		d.setStatus(fmt.Sprintf("Error loading anime list: %v", err))
		d.logger.Error().Err(err).Msg("global-enmasse: Failed to load anime list")
		return
	}

	d.mu.Lock()
	d.totalCount = len(animeList)
	d.mu.Unlock()

	d.logger.Info().Int("count", len(animeList)).Msg("global-enmasse: Starting download process")

	// Load progress if resuming
	processedTitles := make(map[string]bool)
	if resume {
		if progress := d.loadProgress(); progress != nil {
			for _, title := range progress.ProcessedTitles {
				processedTitles[title] = true
			}
			d.mu.Lock()
			d.downloadedAnime = progress.DownloadedAnime
			d.failedAnime = progress.FailedAnime
			d.processedCount = len(processedTitles)
			d.mu.Unlock()
			d.logger.Info().Int("processed", len(processedTitles)).Msg("global-enmasse: Resumed from saved progress")
		}
	}

	// Start torrent client if not running
	torrentClientRepo := d.torrentClientRepositoryRef.Get()
	if torrentClientRepo == nil {
		d.setStatus("Error: Torrent client repository not available")
		d.logger.Error().Msg("global-enmasse: Torrent client repository not available")
		return
	}

	if !torrentClientRepo.Start() {
		d.setStatus("Error: Could not start torrent client")
		d.logger.Error().Msg("global-enmasse: Could not start torrent client")
		return
	}

	// Process each anime
	processedCount := d.processedCount
	for _, animeItem := range animeList {
		select {
		case <-ctx.Done():
			d.saveCurrentProgress(processedTitles)
			d.setStatus("Stopped")
			return
		default:
		}

		// Skip already processed
		if processedTitles[animeItem.Title] {
			continue
		}

		processedCount++

		d.mu.Lock()
		d.currentAnime = animeItem
		d.processedCount = processedCount
		d.status = fmt.Sprintf("Processing %d/%d: %s", processedCount, len(animeList), animeItem.Title)
		d.mu.Unlock()
		d.sendStatusUpdate()

		d.logger.Info().Str("title", animeItem.Title).Msg("global-enmasse: Processing anime")

		err := d.processAnime(ctx, animeItem)
		processedTitles[animeItem.Title] = true

		if err != nil {
			d.logger.Error().Err(err).Str("title", animeItem.Title).Msg("global-enmasse: Failed to process anime")
			d.addToFailed(animeItem.Title)
		} else {
			d.addToDownloaded(animeItem.Title)
		}

		// Save progress periodically
		if processedCount%10 == 0 {
			d.saveCurrentProgress(processedTitles)
		}

		// Delay between anime
		time.Sleep(GlobalDelayBetweenAnime)
	}

	d.clearProgress()
	d.setStatus("Completed! Redirecting to unmatched...")
	d.sendStatusUpdate()

	d.wsEventManager.SendEvent(events.InfoToast, "Global En Masse Download completed!")
}

func (d *GlobalDownloader) processAnime(ctx context.Context, animeItem *AnimeOfflineItem) error {
	// Acquire semaphore
	d.searchSemaphore <- struct{}{}
	defer func() { <-d.searchSemaphore }()

	// Build a BaseAnime from the offline database item for torrent search
	baseAnime := d.buildBaseAnime(animeItem)

	// Get default provider
	providerExt, ok := d.torrentRepository.GetDefaultAnimeProviderExtension()
	if !ok {
		return fmt.Errorf("no torrent provider available")
	}

	// Check if provider supports smart search
	canSmartSearch := providerExt.GetProvider().GetSettings().CanSmartSearch

	var searchData *torrent.SearchData
	var err error

	if canSmartSearch {
		// Use smart search for providers that support it
		searchOpts := torrent.AnimeSearchOptions{
			Provider:      providerExt.GetID(),
			Type:          torrent.AnimeSearchTypeSmart,
			Media:         baseAnime,
			Query:         "",
			Batch:         true,
			EpisodeNumber: 0,
			BestReleases:  true,
			Resolution:    "1080",
			SkipPreviews:  true,
		}

		time.Sleep(GlobalDelayBetweenSearches)

		searchData, err = d.torrentRepository.SearchAnime(ctx, searchOpts)
		if err != nil || searchData == nil || len(searchData.Torrents) == 0 {
			// Fallback to non-batch search
			searchOpts.Batch = false
			searchOpts.BestReleases = false
			time.Sleep(GlobalDelayBetweenSearches)
			searchData, err = d.torrentRepository.SearchAnime(ctx, searchOpts)
		}
	} else {
		// For providers without smart search, use simple search with multiple query variants
		searchData, err = d.simpleSearchWithVariants(ctx, providerExt.GetID(), baseAnime, animeItem)
	}

	if err != nil {
		return fmt.Errorf("torrent search failed: %w", err)
	}

	if searchData == nil || len(searchData.Torrents) == 0 {
		return fmt.Errorf("no torrents found")
	}

	// Select best torrent
	selectedTorrent := d.selectBestTorrent(searchData.Torrents)
	if selectedTorrent == nil {
		return fmt.Errorf("no suitable torrent found")
	}

	d.logger.Info().
		Str("title", animeItem.Title).
		Str("torrent", selectedTorrent.Name).
		Int("seeders", selectedTorrent.Seeders).
		Msg("global-enmasse: Selected torrent")

	// Get magnet link
	magnet, err := providerExt.GetProvider().GetTorrentMagnetLink(selectedTorrent)
	if err != nil {
		return fmt.Errorf("failed to get magnet link: %w", err)
	}

	// Download to unmatched directory
	destination := d.unmatchedRepository.GetUnmatchedDestination(selectedTorrent.Name)

	torrentClientRepo := d.torrentClientRepositoryRef.Get()
	if torrentClientRepo == nil {
		return fmt.Errorf("torrent client not available")
	}

	err = torrentClientRepo.AddMagnets([]string{magnet}, destination)
	if err != nil {
		return fmt.Errorf("failed to add torrent: %w", err)
	}

	// Save metadata for later matching
	syntheticId := d.generateSyntheticId(animeItem.Title)
	if err := d.unmatchedRepository.SaveTorrentMetadata(selectedTorrent.Name, syntheticId, animeItem.Title, ""); err != nil {
		d.logger.Warn().Err(err).Str("torrent", selectedTorrent.Name).Msg("global-enmasse: Failed to save torrent metadata")
	}

	d.logger.Info().
		Str("title", animeItem.Title).
		Str("destination", destination).
		Msg("global-enmasse: Added torrent to download queue")

	return nil
}

func (d *GlobalDownloader) buildBaseAnime(item *AnimeOfflineItem) *anilist.BaseAnime {
	status := anilist.MediaStatus(item.Status)
	format := d.convertTypeToFormat(item.Type)
	episodes := item.Episodes
	isAdult := false

	// Convert synonyms to pointers
	synonyms := make([]*string, len(item.Synonyms))
	for i := range item.Synonyms {
		synonyms[i] = &item.Synonyms[i]
	}

	var year int
	var season anilist.MediaSeason
	if item.AnimeSeason != nil {
		year = item.AnimeSeason.Year
		season = anilist.MediaSeason(item.AnimeSeason.Season)
	}

	return &anilist.BaseAnime{
		ID: d.generateSyntheticId(item.Title),
		IDMal: &item.MalID,
		Title: &anilist.BaseAnime_Title{
			Romaji:  &item.Title,
			English: &item.Title,
		},
		Status:   &status,
		Format:   &format,
		Episodes: &episodes,
		IsAdult:  &isAdult,
		Synonyms: synonyms,
		Season:   &season,
		SeasonYear: &year,
	}
}

func (d *GlobalDownloader) convertTypeToFormat(t string) anilist.MediaFormat {
	switch strings.ToUpper(t) {
	case "TV":
		return anilist.MediaFormatTv
	case "MOVIE":
		return anilist.MediaFormatMovie
	case "OVA":
		return anilist.MediaFormatOva
	case "ONA":
		return anilist.MediaFormatOna
	case "SPECIAL":
		return anilist.MediaFormatSpecial
	default:
		return anilist.MediaFormatTv
	}
}

func (d *GlobalDownloader) selectBestTorrent(torrents []*hibiketorrent.AnimeTorrent) *hibiketorrent.AnimeTorrent {
	if len(torrents) == 0 {
		return nil
	}

	var best *hibiketorrent.AnimeTorrent
	bestScore := -1

	for _, t := range torrents {
		score := 0
		nameLower := strings.ToLower(t.Name)

		// Dual audio bonus
		if strings.Contains(nameLower, "dual") || strings.Contains(nameLower, "multi") {
			score += 100
		}

		// Resolution bonus
		if strings.Contains(nameLower, "1080") || t.Resolution == "1080p" {
			score += 50
		} else if strings.Contains(nameLower, "720") || t.Resolution == "720p" {
			score += 25
		}

		// Batch bonus
		if t.IsBatch {
			score += 30
		}

		// Best release bonus
		if t.IsBestRelease {
			score += 40
		}

		// Seeder bonus (capped)
		seederBonus := t.Seeders
		if seederBonus > 50 {
			seederBonus = 50
		}
		score += seederBonus

		if score > bestScore {
			bestScore = score
			best = t
		}
	}

	return best
}

func (d *GlobalDownloader) loadAnimeList() ([]*AnimeOfflineItem, error) {
	file, err := os.Open(GlobalAnimeOfflineDatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open anime-offline-database: %w", err)
	}
	defer file.Close()

	reader := bufio.NewReaderSize(file, 1024*1024)
	decoder := json.NewDecoder(reader)

	var database AnimeOfflineDatabase
	if err := decoder.Decode(&database); err != nil {
		return nil, fmt.Errorf("failed to decode anime database: %w", err)
	}

	// Parse IDs from sources
	for _, item := range database.Data {
		d.parseSourceIDs(item)
	}

	return database.Data, nil
}

func (d *GlobalDownloader) parseSourceIDs(item *AnimeOfflineItem) {
	anilistRegex := regexp.MustCompile(`anilist\.co/anime/(\d+)`)
	malRegex := regexp.MustCompile(`myanimelist\.net/anime/(\d+)`)

	for _, source := range item.Sources {
		if matches := anilistRegex.FindStringSubmatch(source); len(matches) > 1 {
			item.AnilistID, _ = strconv.Atoi(matches[1])
		}
		if matches := malRegex.FindStringSubmatch(source); len(matches) > 1 {
			item.MalID, _ = strconv.Atoi(matches[1])
		}
	}
}

func (d *GlobalDownloader) convertToSyntheticAnime(item *AnimeOfflineItem) *models.SyntheticAnime {
	synonymsJSON, _ := json.Marshal(item.Synonyms)
	tagsJSON, _ := json.Marshal(item.Tags)
	studiosJSON, _ := json.Marshal(item.Studios)
	sourcesJSON, _ := json.Marshal(item.Sources)

	var season string
	var seasonYear int
	if item.AnimeSeason != nil {
		season = item.AnimeSeason.Season
		seasonYear = item.AnimeSeason.Year
	}

	return &models.SyntheticAnime{
		SyntheticID:  d.generateSyntheticId(item.Title),
		Title:        item.Title,
		TitleEnglish: item.Title, // anime-offline-database uses main title
		CoverImage:   item.Picture,
		Thumbnail:    item.Thumbnail,
		Type:         item.Type,
		Episodes:     item.Episodes,
		Status:       item.Status,
		Season:       season,
		SeasonYear:   seasonYear,
		Synonyms:     string(synonymsJSON),
		Tags:         string(tagsJSON),
		Studios:      string(studiosJSON),
		Sources:      string(sourcesJSON),
		AnilistID:    item.AnilistID,
		MalID:        item.MalID,
	}
}

func (d *GlobalDownloader) generateSyntheticId(title string) int {
	h := fnv.New64a()
	h.Write([]byte(title))
	hash := int(h.Sum64() & 0x7FFFFFFF)
	return -hash
}

func (d *GlobalDownloader) loadProgress() *GlobalDownloaderProgress {
	data, err := os.ReadFile(GlobalAnimeProgressFilePath)
	if err != nil {
		return nil
	}

	var progress GlobalDownloaderProgress
	if err := json.Unmarshal(data, &progress); err != nil {
		d.logger.Warn().Err(err).Msg("global-enmasse: Failed to parse progress file")
		return nil
	}

	return &progress
}

func (d *GlobalDownloader) saveCurrentProgress(processedTitles map[string]bool) {
	d.mu.Lock()
	progress := GlobalDownloaderProgress{
		ProcessedTitles: make([]string, 0, len(processedTitles)),
		DownloadedAnime: d.downloadedAnime,
		FailedAnime:     d.failedAnime,
	}
	d.mu.Unlock()

	for title := range processedTitles {
		progress.ProcessedTitles = append(progress.ProcessedTitles, title)
	}

	data, err := json.MarshalIndent(progress, "", "  ")
	if err != nil {
		d.logger.Warn().Err(err).Msg("global-enmasse: Failed to marshal progress")
		return
	}

	dir := filepath.Dir(GlobalAnimeProgressFilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		d.logger.Warn().Err(err).Msg("global-enmasse: Failed to create progress directory")
		return
	}

	if err := os.WriteFile(GlobalAnimeProgressFilePath, data, 0644); err != nil {
		d.logger.Warn().Err(err).Msg("global-enmasse: Failed to save progress")
	} else {
		d.logger.Debug().Int("processed", len(processedTitles)).Msg("global-enmasse: Progress saved")
	}
}

func (d *GlobalDownloader) clearProgress() {
	d.mu.Lock()
	d.importingDatabase = false
	d.mu.Unlock()
	os.Remove(GlobalAnimeProgressFilePath)
}

func (d *GlobalDownloader) clearProgressUnlocked() {
	os.Remove(GlobalAnimeProgressFilePath)
}

func (d *GlobalDownloader) setImporting(value bool) {
	d.mu.Lock()
	d.importingDatabase = value
	d.mu.Unlock()
}

func (d *GlobalDownloader) setStatus(status string) {
	d.mu.Lock()
	d.status = status
	d.mu.Unlock()
	d.sendStatusUpdate()
}

func (d *GlobalDownloader) sendStatusUpdate() {
	defer util.HandlePanicInModuleThen("global-enmasse/sendStatusUpdate", func() {})
	d.wsEventManager.SendEvent("globalEnMasseDownloaderStatus", d.GetStatus())
}

func (d *GlobalDownloader) addToDownloaded(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.downloadedAnime = append(d.downloadedAnime, title)
	if len(d.downloadedAnime) > GlobalMaxAnimeLogEntries {
		d.downloadedAnime = d.downloadedAnime[len(d.downloadedAnime)-GlobalMaxAnimeLogEntries:]
	}
}

func (d *GlobalDownloader) addToFailed(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.failedAnime = append(d.failedAnime, title)
	if len(d.failedAnime) > GlobalMaxAnimeLogEntries {
		d.failedAnime = d.failedAnime[len(d.failedAnime)-GlobalMaxAnimeLogEntries:]
	}
}

func (d *GlobalDownloader) simpleSearchWithVariants(ctx context.Context, providerID string, baseAnime *anilist.BaseAnime, animeItem *AnimeOfflineItem) (*torrent.SearchData, error) {
	queryVariants := d.generateSearchVariants(animeItem)

	var allTorrents []*hibiketorrent.AnimeTorrent

	for i, query := range queryVariants {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		if i > 0 {
			time.Sleep(GlobalDelayBetweenSearches * 2)
		}

		d.logger.Debug().
			Str("title", animeItem.Title).
			Str("query", query).
			Int("variant", i+1).
			Msg("global-enmasse: Trying search variant")

		searchOpts := torrent.AnimeSearchOptions{
			Provider:     providerID,
			Type:         torrent.AnimeSearchTypeSimple,
			Media:        baseAnime,
			Query:        query,
			Batch:        false,
			SkipPreviews: true,
		}

		searchData, err := d.torrentRepository.SearchAnime(ctx, searchOpts)
		if err != nil {
			d.logger.Debug().Err(err).Str("query", query).Msg("global-enmasse: Search variant failed")
			continue
		}

		if searchData != nil && len(searchData.Torrents) > 0 {
			allTorrents = append(allTorrents, searchData.Torrents...)
			d.logger.Debug().
				Str("query", query).
				Int("found", len(searchData.Torrents)).
				Msg("global-enmasse: Found torrents with variant")
			if len(allTorrents) >= 10 {
				break
			}
		}
	}

	if len(allTorrents) == 0 {
		return nil, fmt.Errorf("no torrents found with any search variant")
	}

	return &torrent.SearchData{
		Torrents: allTorrents,
	}, nil
}

func (d *GlobalDownloader) generateSearchVariants(animeItem *AnimeOfflineItem) []string {
	variants := make([]string, 0, 6)

	// Variant 1: Main title
	if animeItem.Title != "" {
		variants = append(variants, d.sanitizeSearchQuery(animeItem.Title))
	}

	// Variant 2: First few words of title (for long titles)
	if animeItem.Title != "" {
		words := strings.Fields(animeItem.Title)
		if len(words) > 3 {
			shortTitle := strings.Join(words[:3], " ")
			sanitized := d.sanitizeSearchQuery(shortTitle)
			if sanitized != "" && !d.containsVariant(variants, sanitized) {
				variants = append(variants, sanitized)
			}
		}
	}

	// Variant 3-5: Synonyms (up to 3)
	for i, syn := range animeItem.Synonyms {
		if i >= 3 {
			break
		}
		sanitized := d.sanitizeSearchQuery(syn)
		if sanitized != "" && !d.containsVariant(variants, sanitized) {
			variants = append(variants, sanitized)
		}
	}

	return variants
}

func (d *GlobalDownloader) sanitizeSearchQuery(query string) string {
	query = strings.TrimSpace(query)
	query = strings.ReplaceAll(query, ":", " ")
	query = strings.ReplaceAll(query, "/", " ")
	query = strings.ReplaceAll(query, "\\", " ")
	query = strings.ReplaceAll(query, "?", "")
	query = strings.ReplaceAll(query, "!", "")
	query = strings.ReplaceAll(query, "\"", "")
	query = strings.ReplaceAll(query, "'", "")
	query = strings.ReplaceAll(query, "(", " ")
	query = strings.ReplaceAll(query, ")", " ")
	query = strings.ReplaceAll(query, "[", " ")
	query = strings.ReplaceAll(query, "]", " ")

	for strings.Contains(query, "  ") {
		query = strings.ReplaceAll(query, "  ", " ")
	}

	return strings.TrimSpace(query)
}

func (d *GlobalDownloader) containsVariant(variants []string, variant string) bool {
	variantLower := strings.ToLower(variant)
	for _, v := range variants {
		if strings.ToLower(v) == variantLower {
			return true
		}
	}
	return false
}
