package enmasse

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"hash/fnv"

	"seanime/internal/api/anilist"
	"seanime/internal/events"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/platforms/platform"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/torrents/torrent"
	"seanime/internal/unmatched"
	"seanime/internal/util"

	"github.com/5rahim/habari"
	"github.com/rs/zerolog"
)

// Progress helpers
func (d *Downloader) clearProgress() {
	os.Remove(AnimeProgressFilePath)
}

func (d *Downloader) clearProgressUnlocked() {
	os.Remove(AnimeProgressFilePath)
}

func (d *Downloader) setStatus(status string) {
	d.mu.Lock()
	d.status = status
	d.mu.Unlock()
	d.sendStatusUpdate()
}

func (d *Downloader) sendStatusUpdate() {
	defer util.HandlePanicInModuleThen("enmasse-anime/sendStatusUpdate", func() {})
	d.wsEventManager.SendEvent("enMasseAnimeDownloaderStatus", d.GetStatus())
}

// primarySearchQuery picks the first non-empty sanitized variant to use as the main query.
func (d *Downloader) primarySearchQuery(animeItem *AnilistMinifiedItem) string {
	variants := d.generateSearchVariants(animeItem)
	if len(variants) == 0 {
		return ""
	}
	return variants[0]
}

func (d *Downloader) saveCurrentProgress(processedTitles map[string]bool) {
	titles := make([]string, 0, len(processedTitles))
	for title := range processedTitles {
		titles = append(titles, title)
	}
	progress := &DownloaderProgress{
		ProcessedTitles: titles,
		DownloadedAnime: d.downloadedAnime,
		FailedAnime:     d.failedAnime,
	}

	data, err := json.Marshal(progress)
	if err != nil {
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to marshal progress")
		return
	}

	if err := os.WriteFile(AnimeProgressFilePath, data, 0644); err != nil {
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to save progress")
	}
}

func (d *Downloader) loadProgress() *DownloaderProgress {
	data, err := os.ReadFile(AnimeProgressFilePath)
	if err != nil {
		return nil
	}
	var progress DownloaderProgress
	if err := json.Unmarshal(data, &progress); err != nil {
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to unmarshal progress")
		return nil
	}
	return &progress
}

// minifyBaseAnime converts AniList BaseAnime to AnilistMinifiedItem
func (d *Downloader) minifyBaseAnime(media *anilist.BaseAnime) *AnilistMinifiedItem {
	if media == nil {
		return nil
	}

	romaji := ""
	english := ""
	if media.Title != nil {
		if media.Title.Romaji != nil {
			romaji = *media.Title.Romaji
		}
		if media.Title.English != nil {
			english = *media.Title.English
		}
	}

	episodes := 0
	if media.Episodes != nil {
		episodes = *media.Episodes
	}

	status := "UNKNOWN"
	if media.Status != nil {
		status = string(*media.Status)
	}

	format := "UNKNOWN"
	if media.Format != nil {
		format = string(*media.Format)
	}

	syns := make([]string, 0)
	for _, s := range media.Synonyms {
		if s != nil {
			syns = append(syns, *s)
		}
	}

	return &AnilistMinifiedItem{
		ID:           media.GetID(),
		Title:        romaji,
		TitleRomaji:  romaji,
		TitleEnglish: english,
		Episodes:     episodes,
		Status:       status,
		Format:       format,
		Synonyms:     syns,
	}
}

// generateTitleVariants returns possible title strings for AniList search
func (d *Downloader) generateTitleVariants(animeItem *AnimeOfflineItem) []string {
	variants := make([]string, 0, 4)

	add := func(val string) {
		val = strings.TrimSpace(val)
		if val == "" {
			return
		}
		if d.containsVariant(variants, val) {
			return
		}
		variants = append(variants, val)
	}

	add(animeItem.Title)
	if animeItem.Title != "" {
		add(strings.ReplaceAll(animeItem.Title, "/", " "))
	}

	for i, syn := range animeItem.Synonyms {
		if i >= 2 {
			break
		}
		add(syn)
	}

	return variants
}

// simpleSearchWithVariants performs torrent search using multiple query variants for providers without smart search.
func (d *Downloader) simpleSearchWithVariants(ctx context.Context, providerID string, baseAnime *anilist.BaseAnime, animeItem *AnilistMinifiedItem) (*torrent.SearchData, error) {
	queryVariants := d.generateSearchVariants(animeItem)
	if len(queryVariants) == 0 {
		d.logger.Warn().Str("title", animeItem.TitleRomaji).Str("provider", providerID).Msg("enmasse-anime: No query variants for simple search")
		return nil, fmt.Errorf("no query variants available")
	}

	searchOpts := torrent.AnimeSearchOptions{
		Provider: providerID,
		Type:     torrent.AnimeSearchTypeSimple,
		Media:    baseAnime,
		Batch:    true,
		Resolution: "1080",
	}

	for _, query := range queryVariants {
		if query == "" {
			continue
		}
		d.logger.Debug().Str("query", query).Str("provider", providerID).Msg("enmasse-anime: Simple search")
		time.Sleep(DelayBetweenSearches)
		searchOpts.Query = query
		res, err := d.torrentRepository.SearchAnime(ctx, searchOpts)
		if err == nil && res != nil && len(res.Torrents) > 0 {
			return res, nil
		}
	}

	return nil, fmt.Errorf("no torrents found with query variants")
}

// addToDownloaded adds an anime title to the downloaded list, keeping only the last MaxAnimeLogEntries
func (d *Downloader) addToDownloaded(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.downloadedAnime = append(d.downloadedAnime, title)
	if len(d.downloadedAnime) > MaxAnimeLogEntries {
		d.downloadedAnime = d.downloadedAnime[len(d.downloadedAnime)-MaxAnimeLogEntries:]
	}
}

// addToFailed adds an anime title to the failed list, keeping only the last MaxAnimeLogEntries
func (d *Downloader) addToFailed(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.failedAnime = append(d.failedAnime, title)
	if len(d.failedAnime) > MaxAnimeLogEntries {
		d.failedAnime = d.failedAnime[len(d.failedAnime)-MaxAnimeLogEntries:]
	}
}

// filterOutSeasonEpisodePattern skips torrents that look like single-episode season/episode (e.g., S01E02)
// when the media only has one episode. Allows ranges (e.g., S01E01-E12).
func (d *Downloader) filterOutSeasonEpisodePattern(torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	seasonEpisodeRe := regexp.MustCompile(`(?i)S\d{2}E\d{2,8}`)
	rangeRe := regexp.MustCompile(`(?i)S\d{2}E\d{2,8}\s*-?E\d{2,8}`)
	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))
	for _, t := range torrents {
		if t == nil {
			continue
		}
		matches := seasonEpisodeRe.FindAllString(t.Name, -1)
		if len(matches) == 1 && !rangeRe.MatchString(t.Name) {
			d.logger.Debug().Str("torrent", t.Name).Msg("enmasse-anime: Skipping season/episode formatted torrent for single-episode media")
			continue
		}
		filtered = append(filtered, t)
	}
	return filtered
}

const (
	GlobalAnimeOfflineDatabasePath = "/aeternae/Soul/Otaku Media/Databases/anime-offline-database-minified.json"
	AnimeProgressFilePath   = "/aeternae/Soul/Otaku Media/Databases/enmasse-anime-progress.json"
	MaxConcurrentSearches   = 3
	DelayBetweenAnime       = 2 * time.Second
	DelayBetweenSearches    = 1 * time.Second
	MaxAnimeLogEntries      = 300
	AniListRateLimitBackoff = 60 * time.Second
)

type (
	Downloader struct {
		logger                     *zerolog.Logger
		torrentRepository          *torrent.Repository
		torrentClientRepositoryRef *util.Ref[*torrent_client.Repository]
		wsEventManager             events.WSEventManagerInterface
		platformRef                *util.Ref[platform.Platform]
		unmatchedRepository        *unmatched.Repository

		mu              sync.Mutex
		isRunning       bool
		isPaused        bool
		cancelFunc      context.CancelFunc
		currentAnime    *AnilistMinifiedItem
		processedCount  int
		totalCount      int
		downloadedAnime []string
		failedAnime     []string
		status          string
		// Rate limiting semaphore
		searchSemaphore chan struct{}
	}

	NewDownloaderOptions struct {
		Logger                     *zerolog.Logger
		TorrentRepository          *torrent.Repository
		TorrentClientRepositoryRef *util.Ref[*torrent_client.Repository]
		WSEventManager             events.WSEventManagerInterface
		PlatformRef                *util.Ref[platform.Platform]
		UnmatchedRepository        *unmatched.Repository
	}

	DownloaderStatus struct {
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
	}

	DownloaderProgress struct {
		ProcessedTitles []string `json:"processed_titles"`
		DownloadedAnime []string `json:"downloaded_anime"`
		FailedAnime     []string `json:"failed_anime"`
	}

	// AnimeOfflineDatabase represents the offline JSON structure
	AnimeOfflineDatabase struct {
		Data []*AnimeOfflineItem `json:"data"`
	}

	// AnimeOfflineItem represents an entry from anime-offline-database
	AnimeOfflineItem struct {
		Sources     []string `json:"sources"`
		Title       string   `json:"title"`
		Type        string   `json:"type"`
		Episodes    int      `json:"episodes"`
		Status      string   `json:"status"`
		AnimeSeason *struct {
			Season string `json:"season"`
			Year   int    `json:"year"`
		} `json:"animeSeason"`
		Picture   string   `json:"picture"`
		Thumbnail string   `json:"thumbnail"`
		Synonyms  []string `json:"synonyms"`
		Studios   []string `json:"studios"`
		Tags      []string `json:"tags"`
		// Parsed IDs
		AnilistID int `json:"-"`
		MalID     int `json:"-"`
	}

	AnilistMinifiedItem struct {
		ID           int      `json:"id"`
		Title        string   `json:"title"`
		TitleRomaji  string   `json:"title_romaji"`
		TitleEnglish string   `json:"title_english,omitempty"`
		Episodes     int      `json:"episodes"`
		Status       string   `json:"status"`
		Format       string   `json:"format"`
		Synonyms     []string `json:"synonyms,omitempty"`
	}
)

func NewDownloader(opts *NewDownloaderOptions) *Downloader {
	return &Downloader{
		logger:                     opts.Logger,
		torrentRepository:          opts.TorrentRepository,
		torrentClientRepositoryRef: opts.TorrentClientRepositoryRef,
		wsEventManager:             opts.WSEventManager,
		platformRef:                opts.PlatformRef,
		unmatchedRepository:        opts.UnmatchedRepository,
		status:                     "Idle",
		downloadedAnime:            make([]string, 0, MaxAnimeLogEntries),
		failedAnime:                make([]string, 0, MaxAnimeLogEntries),
		searchSemaphore:            make(chan struct{}, MaxConcurrentSearches),
	}
}

func (d *Downloader) GetStatus() *DownloaderStatus {
	d.mu.Lock()
	defer d.mu.Unlock()

	currentAnime := ""
	currentAnimeId := 0
	if d.currentAnime != nil {
		currentAnime = d.currentAnime.TitleRomaji
		if currentAnime == "" {
			currentAnime = d.currentAnime.Title
		}
		currentAnimeId = d.currentAnime.ID
	}

	return &DownloaderStatus{
		IsRunning:        d.isRunning,
		IsPaused:         d.isPaused,
		CurrentAnime:     currentAnime,
		CurrentAnimeId:   currentAnimeId,
		ProcessedCount:   d.processedCount,
		TotalCount:       d.totalCount,
		DownloadedAnime:  d.downloadedAnime,
		FailedAnime:      d.failedAnime,
		Status:           d.status,
		HasSavedProgress: d.hasSavedProgress(),
	}
}

func (d *Downloader) hasSavedProgress() bool {
	_, err := os.Stat(AnimeProgressFilePath)
	return err == nil
}

func (d *Downloader) Start(resume bool) error {
	d.mu.Lock()
	if d.isRunning {
		d.mu.Unlock()
		return fmt.Errorf("anime en masse downloader is already running")
	}
	d.isRunning = true
	d.isPaused = false

	// Only resume when explicitly requested; otherwise start fresh even if progress exists
	autoResume := resume
	if !autoResume && d.hasSavedProgress() {
		d.logger.Info().Msg("enmasse-anime: Saved progress found but resume not enabled; starting from scratch")
	}

	if !autoResume {
		d.processedCount = 0
		d.downloadedAnime = make([]string, 0, MaxAnimeLogEntries)
		d.failedAnime = make([]string, 0, MaxAnimeLogEntries)
		d.clearProgress()
	}
	d.status = "Starting..."
	d.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	d.cancelFunc = cancel

	go d.run(ctx, autoResume)

	return nil
}

func (d *Downloader) Stop(saveProgress bool) {
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

func (d *Downloader) run(ctx context.Context, resume bool) {
	defer func() {
		d.mu.Lock()
		d.isRunning = false
		d.currentAnime = nil
		d.mu.Unlock()
		d.sendStatusUpdate()
	}()

	// Load anime list from offline database
	animeList, err := d.loadAnimeList()
	if err != nil {
		d.setStatus(fmt.Sprintf("Error loading anime list: %v", err))
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to load anime list")
		return
	}

	d.mu.Lock()
	d.totalCount = len(animeList)
	d.mu.Unlock()

	d.logger.Info().Int("count", len(animeList)).Msg("enmasse-anime: Loaded anime list")

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
			d.logger.Info().Int("processed", len(processedTitles)).Msg("enmasse-anime: Resumed from saved progress")
		}
	}

	// Start torrent client if not running
	torrentClientRepo := d.torrentClientRepositoryRef.Get()
	if torrentClientRepo == nil {
		d.setStatus("Error: Torrent client repository not available")
		d.logger.Error().Msg("enmasse-anime: Torrent client repository not available")
		return
	}

	if !torrentClientRepo.Start() {
		d.setStatus("Error: Could not start torrent client")
		d.logger.Error().Msg("enmasse-anime: Could not start torrent client")
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

		// Rate limit: anime en masse 12 per minute
		if err := acquireAnimeEnMasse(ctx); err != nil {
			d.logger.Warn().Err(err).Msg("enmasse-anime: Rate limiter blocked, aborting")
			d.saveCurrentProgress(processedTitles)
			d.setStatus("Stopped")
			return
		}

		// Skip already processed
		if processedTitles[animeItem.Title] {
			continue
		}

		processedCount++

		d.mu.Lock()
		d.currentAnime = &AnilistMinifiedItem{Title: animeItem.Title}
		d.processedCount = processedCount
		d.status = fmt.Sprintf("Processing %d/%d: %s", processedCount, len(animeList), animeItem.Title)
		d.mu.Unlock()
		d.sendStatusUpdate()

		d.logger.Info().Str("title", animeItem.Title).Msg("enmasse-anime: Processing anime")

		err := d.processAnime(ctx, animeItem)
		processedTitles[animeItem.Title] = true

		if err != nil {
			d.logger.Error().Err(err).Str("title", animeItem.Title).Msg("enmasse-anime: Failed to process anime")
			d.addToFailed(animeItem.Title)
		} else {
			d.addToDownloaded(animeItem.Title)
		}

		// Save progress after every anime for reliable resume
		d.saveCurrentProgress(processedTitles)

		// Delay between anime
		time.Sleep(DelayBetweenAnime)
	}

	d.clearProgress()
	d.setStatus("Completed! Redirecting to unmatched...")
	d.sendStatusUpdate()

	d.wsEventManager.SendEvent(events.InfoToast, "Anime En Masse Download completed!")
}

func (d *Downloader) processAnime(ctx context.Context, animeItem *AnimeOfflineItem) error {
	// Acquire semaphore then provider rate limiter (excluding torrent client)
	d.searchSemaphore <- struct{}{}
	defer func() { <-d.searchSemaphore }()

	if err := acquireProvider(ctx); err != nil {
		return err
	}

	// Resolve AniList (fallback MAL) using title/synonyms
	resolved, err := d.resolveAniList(ctx, animeItem)
	if err != nil {
		return fmt.Errorf("failed to resolve AniList: %w", err)
	}

	// Build a BaseAnime from the resolved item for torrent search
	baseAnime := d.buildBaseAnime(resolved)

	// Get default provider
	providerExt, ok := d.torrentRepository.GetDefaultAnimeProviderExtension()
	if !ok {
		return fmt.Errorf("no torrent provider available")
	}

	// Check if provider supports smart search
	canSmartSearch := providerExt.GetProvider().GetSettings().CanSmartSearch
	providerID := providerExt.GetID()

	var searchData *torrent.SearchData

	if canSmartSearch {
		primaryQuery := d.primarySearchQuery(resolved)
		if primaryQuery == "" {
			d.logger.Warn().Str("title", resolved.TitleRomaji).Str("provider", providerID).Msg("enmasse-anime: No valid query for smart search; skipping")
			return fmt.Errorf("torrent search failed: no valid query for smart search")
		}

		// Use smart search for providers that support it
		searchOpts := torrent.AnimeSearchOptions{
			Provider:      providerID,
			Type:          torrent.AnimeSearchTypeSmart,
			Media:         baseAnime,
			Query:         primaryQuery,
			Batch:         true,
			EpisodeNumber: 0,
			BestReleases:  true,
			Resolution:    "1080",
			SkipPreviews:  true,
			IncludeSpecialProviders: true,
		}

		d.logger.Debug().Str("query", primaryQuery).Str("provider", providerExt.GetID()).Msg("enmasse-anime: Smart search")
		time.Sleep(DelayBetweenSearches)

		res, err := d.torrentRepository.SearchAnime(ctx, searchOpts)
		searchData = res
		if err != nil || searchData == nil || len(searchData.Torrents) == 0 {
			// Fallback to non-batch search
			searchOpts.Batch = false
			searchOpts.BestReleases = false
			d.logger.Debug().Str("query", primaryQuery).Str("provider", providerExt.GetID()).Msg("enmasse-anime: Smart search fallback")
			time.Sleep(DelayBetweenSearches)
			res2, err2 := d.torrentRepository.SearchAnime(ctx, searchOpts)
			if err2 != nil {
				return fmt.Errorf("torrent search failed: %w", err2)
			}
			searchData = res2
		}
	} else {
		// For providers without smart search, use simple search with multiple query variants
		var err error
		searchData, err = d.simpleSearchWithVariants(ctx, providerExt.GetID(), baseAnime, resolved)
		if err != nil {
			return fmt.Errorf("torrent search failed: %w", err)
		}
	}

	if searchData == nil || len(searchData.Torrents) == 0 {
		return fmt.Errorf("no torrents found")
	}

	// Filter out single-episode torrents for series (movies are exempt)
	searchData.Torrents = d.filterMultiEpisodeTorrents(baseAnime, searchData.Torrents)

	// Prefer torrents that meet or exceed expected episode count for non-movies (enforce >=2 for all non-movie formats)
	expectedEpisodes := animeItem.Episodes
	searchData.Torrents = d.filterByEpisodeMinimum(baseAnime, expectedEpisodes, searchData.Torrents)

	// Only apply season/episode pattern drop to single-episode movies (non-movies are forced to expect >=2)
	if (baseAnime == nil || baseAnime.IsMovie()) && expectedEpisodes <= 1 {
		searchData.Torrents = d.filterOutSeasonEpisodePattern(searchData.Torrents)
	}

	// Select best torrent (first one after sorting by seeders/best release) with season preference
	selectedTorrent := d.selectBestTorrent(searchData.Torrents, animeItem)
	if selectedTorrent == nil {
		d.logger.Warn().Str("title", resolved.TitleRomaji).Str("provider", providerID).Msg("enmasse-anime: No suitable torrent after filtering")
		return fmt.Errorf("no suitable torrent found")
	}
	// Final safety: ensure selected torrent meets expected episode count
	if !d.torrentMeetsEpisodeMinimum(baseAnime, expectedEpisodes, selectedTorrent) {
		return fmt.Errorf("selected torrent does not meet episode minimum")
	}

	d.logger.Info().
		Str("title", resolved.TitleRomaji).
		Str("torrent", selectedTorrent.Name).
		Int("seeders", selectedTorrent.Seeders).
		Msg("enmasse-anime: Selected torrent")

	// Get magnet link
	magnet, err := providerExt.GetProvider().GetTorrentMagnetLink(selectedTorrent)
	if err != nil {
		return fmt.Errorf("failed to get magnet link: %w", err)
	}
	if magnet == "" {
		// Fallback to info hash if available
		if selectedTorrent.InfoHash != "" {
			magnet = fmt.Sprintf("magnet:?xt=urn:btih:%s", selectedTorrent.InfoHash)
			if magnet == "magnet:?xt=urn:btih:" {
				return fmt.Errorf("empty magnet and info hash; cannot add torrent")
			}
		} else {
			return fmt.Errorf("empty magnet link and no info hash; cannot add torrent")
		}
	}

	// Download to unmatched directory
	destination := d.unmatchedRepository.GetUnmatchedDestination(selectedTorrent.Name)

	torrentClientRepo := d.torrentClientRepositoryRef.Get()
	if torrentClientRepo == nil {
		return fmt.Errorf("torrent client not available")
	}

	d.logger.Debug().Str("destination", destination).Str("magnet", magnet).Str("infoHash", selectedTorrent.InfoHash).Msg("enmasse-anime: adding torrent to client")
	err = torrentClientRepo.AddMagnets([]string{magnet}, destination)
	if err != nil {
		return fmt.Errorf("failed to add torrent: %w", err)
	}

	// Save metadata for later matching
	romajiTitle := resolved.TitleRomaji
	if romajiTitle == "" {
		romajiTitle = resolved.Title
	}
	nativeTitle := ""
	format := resolved.Format
	startYear := baseAnime.GetStartYearSafe()
	if startYear == 0 && animeItem.AnimeSeason != nil {
		startYear = animeItem.AnimeSeason.Year
	}
	if err := d.unmatchedRepository.SaveTorrentMetadata(selectedTorrent.Name, resolved.ID, romajiTitle, nativeTitle, format, startYear); err != nil {
		d.logger.Warn().Err(err).Str("torrent", selectedTorrent.Name).Msg("enmasse-anime: Failed to save torrent metadata")
	}

	d.logger.Info().
		Str("title", resolved.TitleRomaji).
		Str("destination", destination).
		Msg("enmasse-anime: Added torrent to download queue")

	return nil
}

func (d *Downloader) buildBaseAnime(item *AnilistMinifiedItem) *anilist.BaseAnime {
	// Build a BaseAnime struct from the minified item
	status := anilist.MediaStatus(item.Status)
	format := anilist.MediaFormat(item.Format)
	episodes := item.Episodes
	isAdult := false

	var englishTitle *string
	if item.TitleEnglish != "" {
		englishTitle = &item.TitleEnglish
	}

	romajiTitle := item.TitleRomaji
	if romajiTitle == "" {
		romajiTitle = item.Title
	}
	if englishTitle == nil && item.Title != "" {
		t := item.Title
		englishTitle = &t
	}

	// Convert []string to []*string for Synonyms
	synonyms := make([]*string, len(item.Synonyms))
	for i := range item.Synonyms {
		synonyms[i] = &item.Synonyms[i]
	}

	return &anilist.BaseAnime{
		ID: item.ID,
		Title: &anilist.BaseAnime_Title{
			Romaji:  &romajiTitle,
			English: englishTitle,
		},
		Status:   &status,
		Format:   &format,
		Episodes: &episodes,
		IsAdult:  &isAdult,
		Synonyms: synonyms,
	}
}

func (d *Downloader) selectBestTorrent(torrents []*hibiketorrent.AnimeTorrent, animeItem *AnimeOfflineItem) *hibiketorrent.AnimeTorrent {
	if len(torrents) == 0 {
		return nil
	}

	// Prefer: dual-audio > 1080p > high seeders > batch
	var best *hibiketorrent.AnimeTorrent
	bestScore := -1

	seasonName := ""
	seasonYear := 0
	if animeItem != nil && animeItem.AnimeSeason != nil {
		seasonName = strings.ToLower(animeItem.AnimeSeason.Season)
		seasonYear = animeItem.AnimeSeason.Year
	}

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

		// Season/year preference from torrent name
		if seasonYear > 0 {
			yearStr := strconv.Itoa(seasonYear)
			if strings.Contains(nameLower, yearStr) {
				score += 10
			}
		}
		if seasonName != "" {
			if strings.Contains(nameLower, seasonName) {
				score += 150
			}
		}

		if score > bestScore {
			bestScore = score
			best = t
		}
	}

	return best
}

// torrentMeetsEpisodeMinimum rechecks episode count for the chosen torrent.
// Movies with single episode are exempt.
func (d *Downloader) torrentMeetsEpisodeMinimum(media *anilist.BaseAnime, expectedEpisodes int, t *hibiketorrent.AnimeTorrent) bool {
	if t == nil {
		return true
	}
	if media != nil && media.IsMovie() {
		return true
	}

	// Non-movie media must have at least 2 episodes to avoid single-file picks
	requiredEpisodes := expectedEpisodes
	if requiredEpisodes < 2 {
		requiredEpisodes = 2
	}

	// Treat batches as valid
	if t.IsBatch {
		return true
	}

	// Parse name for maximum episode
	parsed := habari.Parse(t.Name)
	maxEp := 0
	for _, epStr := range parsed.EpisodeNumber {
		val := util.StringToIntMust(epStr)
		if val > maxEp {
			maxEp = val
		}
	}
	return maxEp >= requiredEpisodes
}

// filterMultiEpisodeTorrents removes single-episode torrents when the media is a series.
// Movies are exempt and retain all torrents.
func (d *Downloader) filterMultiEpisodeTorrents(media *anilist.BaseAnime, torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	// Only movies keep single-episode torrents
	if media != nil && media.IsMovie() {
		return torrents
	}

	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))

	for _, t := range torrents {
		if t == nil {
			continue
		}

		// Keep batches early
		if t.IsBatch {
			filtered = append(filtered, t)
			continue
		}

		// Parse name to detect episode span
		parsed := habari.Parse(t.Name)
		episodesParsed := len(parsed.EpisodeNumber)

		// Keep torrents that clearly include multiple episodes
		if episodesParsed > 1 {
			filtered = append(filtered, t)
			continue
		}

		// At this point, single-episode only — skip for series
		d.logger.Debug().
			Str("torrent", t.Name).
			Msg("enmasse-anime: Skipping single-episode torrent for series")
	}

	return filtered
}

// filterByEpisodeMinimum keeps torrents that meet or exceed the expected episode count for TV/OVA.
// Movies are exempt. If expectedEpisodes <= 0, returns original slice.
func (d *Downloader) filterByEpisodeMinimum(media *anilist.BaseAnime, expectedEpisodes int, torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	if media != nil && media.IsMovie() {
		return torrents
	}

	// Non-movie media must expect at least 2 episodes to avoid single-file torrents
	requiredEpisodes := expectedEpisodes
	if requiredEpisodes < 2 {
		requiredEpisodes = 2
	}

	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))

	for _, t := range torrents {
		if t == nil {
			continue
		}

		// Treat batches as valid
		if t.IsBatch {
			filtered = append(filtered, t)
			continue
		}

		// Use provider episode number only when flagged as batch
		if t.IsBatch && t.EpisodeNumber >= requiredEpisodes {
			filtered = append(filtered, t)
			continue
		}

		// Parse name for episode span
		parsed := habari.Parse(t.Name)
		if len(parsed.EpisodeNumber) > 0 {
			maxEp := 0
			for _, epStr := range parsed.EpisodeNumber {
				val := util.StringToIntMust(epStr)
				if val > maxEp {
					maxEp = val
				}
			}
			if maxEp >= requiredEpisodes {
				filtered = append(filtered, t)
				continue
			}
		}
	}

	return filtered
}

func (d *Downloader) loadAnimeList() ([]*AnimeOfflineItem, error) {
	file, err := os.Open(GlobalAnimeOfflineDatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open anime-offline-database: %w", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)

	var db AnimeOfflineDatabase
	if err := decoder.Decode(&db); err != nil {
		return nil, fmt.Errorf("failed to decode anime-offline-database: %w", err)
	}

	for _, item := range db.Data {
		d.parseSourceIDs(item)
	}

	if len(db.Data) == 0 {
		return nil, fmt.Errorf("no entries found in anime-offline-database")
	}

	return db.Data, nil
}

func (d *Downloader) parseSourceIDs(item *AnimeOfflineItem) {
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

func (d *Downloader) resolveAniList(ctx context.Context, animeItem *AnimeOfflineItem) (*AnilistMinifiedItem, error) {
	plat := d.platformRef.Get()
	if plat == nil {
		return d.minifyOfflineItem(animeItem), nil
	}
	client := plat.GetAnilistClient()
	if client == nil {
		return d.minifyOfflineItem(animeItem), nil
	}

	// 1) Prefer direct AniList ID from sources
	if animeItem.AnilistID > 0 {
		base, err := client.BaseAnimeByID(ctx, &animeItem.AnilistID)
		if err == nil && base != nil && base.Media != nil {
			return d.minifyBaseAnime(base.Media), nil
		}
	}

	// 2) Fallback to MAL ID via AniList bridge
	if animeItem.MalID > 0 {
		base, err := client.BaseAnimeByMalID(ctx, &animeItem.MalID)
		if err == nil && base != nil && base.Media != nil {
			return d.minifyBaseAnime(base.Media), nil
		}
	}

	// 3) Search AniList by title/synonyms
	variants := d.generateTitleVariants(animeItem)
	page := 1
	perPage := 10
	for _, title := range variants {
		if title == "" {
			continue
		}
		// respect rate limits
		if err := acquireAniList(ctx, IsUserInitiated(ctx)); err != nil {
			d.logger.Debug().Err(err).Msg("enmasse-anime: AniList rate limit/acquire failed")
			continue
		}
		media := d.safeListAnime(ctx, client, &page, &title, &perPage)
		if media != nil {
			return d.minifyBaseAnime(media), nil
		}
		time.Sleep(DelayBetweenSearches)
	}

	return d.minifyOfflineItem(animeItem), nil
}

// safeListAnime wraps ListAnime and recovers from panics caused by client internals
func (d *Downloader) safeListAnime(ctx context.Context, client anilist.AnilistClient, page *int, title *string, perPage *int) *anilist.BaseAnime {
	defer func() {
		if r := recover(); r != nil {
			d.logger.Warn().Interface("panic", r).Msg("enmasse-anime: Recovered from AniList client panic during search")
		}
	}()

	res, err := client.ListAnime(ctx, page, title, perPage, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	if err != nil || res == nil || res.Page == nil || len(res.Page.Media) == 0 {
		if err != nil {
			d.logger.Debug().Err(err).Str("title", *title).Msg("enmasse-anime: AniList search variant failed")
		}
		return nil
	}
	return res.Page.Media[0]
}

// minifyOfflineItem builds a minimal AnilistMinifiedItem from offline data when AniList lookup fails
func (d *Downloader) minifyOfflineItem(item *AnimeOfflineItem) *AnilistMinifiedItem {
	format := item.Type
	status := item.Status
	id := -int(d.syntheticID(item.Title))
	return &AnilistMinifiedItem{
		ID:           id,
		Title:        item.Title,
		TitleRomaji:  item.Title,
		TitleEnglish: item.Title,
		Episodes:     item.Episodes,
		Status:       status,
		Format:       format,
		Synonyms:     item.Synonyms,
	}
}

func (d *Downloader) syntheticID(title string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(title))
	return h.Sum32()
}
func (d *Downloader) generateSearchVariants(animeItem *AnilistMinifiedItem) []string {
	variants := make([]string, 0, 6)

	addVariant := func(val string) {
		if val == "" {
			return
		}
		s := d.sanitizeSearchQuery(val)
		if s == "" || d.containsVariant(variants, s) {
			return
		}
		variants = append(variants, s)
	}

	// Variant 1: Romaji title (most common)
	addVariant(animeItem.TitleRomaji)

	// Variant 1b: Sanitized Romaji title (no-symbol variation)
	addVariant(d.sanitizeSearchQuery(animeItem.TitleRomaji))
	
	// Variant 2: English title
	if animeItem.TitleEnglish != "" && animeItem.TitleEnglish != animeItem.TitleRomaji {
		addVariant(animeItem.TitleEnglish)
		addVariant(d.sanitizeSearchQuery(animeItem.TitleEnglish))
	}

	// Variant 3: Original title if different
	if animeItem.Title != "" && animeItem.Title != animeItem.TitleRomaji && animeItem.Title != animeItem.TitleEnglish {
		addVariant(animeItem.Title)
		addVariant(d.sanitizeSearchQuery(animeItem.Title))
	}

	// Variant 4: First few words of romaji title (for long titles)
	if animeItem.TitleRomaji != "" {
		words := strings.Fields(animeItem.TitleRomaji)
		if len(words) > 3 {
			shortTitle := strings.Join(words[:3], " ")
			addVariant(shortTitle)
		}
	}

	// Variant 5: Synonyms (up to 2)
	for i, syn := range animeItem.Synonyms {
		if i >= 2 {
			break
		}
		addVariant(syn)
	}

	return variants
}

// sanitizeSearchQuery cleans up a search query for torrent search
func (d *Downloader) sanitizeSearchQuery(query string) string {
	// Remove special characters that might cause issues
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

	// Collapse multiple spaces
	for strings.Contains(query, "  ") {
		query = strings.ReplaceAll(query, "  ", " ")
	}

	return strings.TrimSpace(query)
}

// containsVariant checks if a variant already exists in the list
func (d *Downloader) containsVariant(variants []string, variant string) bool {
	variantLower := strings.ToLower(variant)
	for _, v := range variants {
		if strings.ToLower(v) == variantLower {
			return true
		}
	}
	return false
}
