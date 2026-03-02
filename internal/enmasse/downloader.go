package enmasse

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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

	"github.com/rs/zerolog"
)

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

	// Auto-resume if saved progress exists and resume not explicitly requested
	autoResume := resume
	if !resume && d.hasSavedProgress() {
		autoResume = true
		d.logger.Info().Msg("enmasse-anime: Saved progress found; auto-resuming")
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

	var searchData *torrent.SearchData

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

		time.Sleep(DelayBetweenSearches)

		res, err := d.torrentRepository.SearchAnime(ctx, searchOpts)
		searchData = res
		if err != nil || searchData == nil || len(searchData.Torrents) == 0 {
			// Fallback to non-batch search
			searchOpts.Batch = false
			searchOpts.BestReleases = false
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

	// Select best torrent (first one after sorting by seeders/best release)
	selectedTorrent := d.selectBestTorrent(searchData.Torrents)
	if selectedTorrent == nil {
		return fmt.Errorf("no suitable torrent found")
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
	romajiTitle := resolved.TitleRomaji
	if romajiTitle == "" {
		romajiTitle = resolved.Title
	}
	nativeTitle := ""
	if err := d.unmatchedRepository.SaveTorrentMetadata(selectedTorrent.Name, resolved.ID, romajiTitle, nativeTitle); err != nil {
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

func (d *Downloader) selectBestTorrent(torrents []*hibiketorrent.AnimeTorrent) *hibiketorrent.AnimeTorrent {
	if len(torrents) == 0 {
		return nil
	}

	// Prefer: dual-audio > 1080p > high seeders > batch
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

// generateTitleVariants builds search titles from main title and synonyms
func (d *Downloader) generateTitleVariants(animeItem *AnimeOfflineItem) []string {
	seen := make(map[string]struct{})
	variants := make([]string, 0, len(animeItem.Synonyms)+2)
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		key := strings.ToLower(s)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		variants = append(variants, s)
	}

	// 1) Original title
	add(animeItem.Title)
	// 2) No-symbol version of title
	add(d.sanitizeSearchQuery(animeItem.Title))
	for _, syn := range animeItem.Synonyms {
		add(syn)
	}
	return variants
}

func (d *Downloader) minifyBaseAnime(media *anilist.BaseAnime) *AnilistMinifiedItem {
	title := safeStr(media.GetTitle().GetRomaji())
	if title == "" {
		title = safeStr(media.GetTitle().GetEnglish())
	}
	format := "UNKNOWN"
	if media.Format != nil {
		format = string(*media.Format)
	}
	status := "UNKNOWN"
	if media.Status != nil {
		status = string(*media.Status)
	}
	episodes := 0
	if media.Episodes != nil {
		episodes = *media.Episodes
	}

	syns := make([]string, len(media.GetSynonyms()))
	for i, s := range media.GetSynonyms() {
		if s != nil {
			syns[i] = *s
		}
	}

	return &AnilistMinifiedItem{
		ID:           media.GetID(),
		Title:        title,
		TitleRomaji:  title,
		TitleEnglish: safeStr(media.GetTitle().GetEnglish()),
		Episodes:     episodes,
		Status:       status,
		Format:       format,
		Synonyms:     syns,
	}
}

func (d *Downloader) fetchBaseAnimeWithRetry(ctx context.Context, client anilist.AnilistClient, mediaId int) (*anilist.BaseAnimeByID, error) {
	for {
		if err := acquireAniList(ctx, IsUserInitiated(ctx)); err != nil {
			return nil, err
		}

		base, err := client.BaseAnimeByID(ctx, &mediaId)
		if err != nil {
			if isAniListRateLimitErr(err) {
				backoff := AniListRateLimitBackoff
				if sec := extractRetryAfterSeconds(err); sec > 0 {
					backoff = time.Duration(sec+1) * time.Second
				}
				d.logger.Warn().Err(err).Int("id", mediaId).Dur("backoff", backoff).Msg("anilist rate limited, backing off")
				time.Sleep(backoff)
				continue
			}
			return nil, err
		}

		return base, nil
	}
}

func isAniListRateLimitErr(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "rate limit") || strings.Contains(errStr, "429") || strings.Contains(errStr, "too many")
}

func isAniListNotFoundErr(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "404") || strings.Contains(errStr, "not found")
}

// extractRetryAfterSeconds tries to find a Retry-After value in the error string.
func extractRetryAfterSeconds(err error) int {
	if err == nil {
		return 0
	}
	match := regexp.MustCompile(`(?i)retrying in (\d+) seconds?`).FindStringSubmatch(err.Error())
	if len(match) == 2 {
		if sec, convErr := strconv.Atoi(match[1]); convErr == nil {
			return sec
		}
	}
	// fallback: look for Retry-After: N
	match = regexp.MustCompile(`(?i)retry-after[:=]?[\s]*?(\d+)`).FindStringSubmatch(err.Error())
	if len(match) == 2 {
		if sec, convErr := strconv.Atoi(match[1]); convErr == nil {
			return sec
		}
	}
	return 0
}

func safeStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (d *Downloader) loadProgress() *DownloaderProgress {
	data, err := os.ReadFile(AnimeProgressFilePath)
	if err != nil {
		return nil
	}

	var progress DownloaderProgress
	if err := json.Unmarshal(data, &progress); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-anime: Failed to parse progress file")
		return nil
	}

	return &progress
}

func (d *Downloader) saveCurrentProgress(processedTitles map[string]bool) {
	d.mu.Lock()
	progress := DownloaderProgress{
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
		d.logger.Warn().Err(err).Msg("enmasse-anime: Failed to marshal progress")
		return
	}

	dir := filepath.Dir(AnimeProgressFilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-anime: Failed to create progress directory")
		return
	}

	if err := os.WriteFile(AnimeProgressFilePath, data, 0644); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-anime: Failed to save progress")
	} else {
		d.logger.Debug().Int("processed", len(processedTitles)).Msg("enmasse-anime: Progress saved")
	}
}

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
	d.wsEventManager.SendEvent("enMasseDownloaderStatus", d.GetStatus())
}

func (d *Downloader) addToDownloaded(title string) {
	d.mu.Lock()
	d.downloadedAnime = append(d.downloadedAnime, title)
	if len(d.downloadedAnime) > MaxAnimeLogEntries {
		d.downloadedAnime = d.downloadedAnime[len(d.downloadedAnime)-MaxAnimeLogEntries:]
	}
	d.mu.Unlock()
	// push status update so UI reflects newly downloaded entries
	d.sendStatusUpdate()
}

func (d *Downloader) addToFailed(title string) {
	d.mu.Lock()
	d.failedAnime = append(d.failedAnime, title)
	if len(d.failedAnime) > MaxAnimeLogEntries {
		d.failedAnime = d.failedAnime[len(d.failedAnime)-MaxAnimeLogEntries:]
	}
	d.mu.Unlock()
	// push status update so UI skip pile reflects new failure immediately
	d.sendStatusUpdate()
}

// simpleSearchWithVariants performs multiple simple searches with different query variants
// for providers that don't support smart search (like nyaa-sukebei)
func (d *Downloader) simpleSearchWithVariants(ctx context.Context, providerID string, baseAnime *anilist.BaseAnime, animeItem *AnilistMinifiedItem) (*torrent.SearchData, error) {
	// Generate search query variants from most specific to least
	queryVariants := d.generateSearchVariants(animeItem)

	var allTorrents []*hibiketorrent.AnimeTorrent

	for i, query := range queryVariants {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		// Rate limit between searches to avoid IP ban
		if i > 0 {
			time.Sleep(DelayBetweenSearches * 2) // Double delay for rate limiting
		}

		d.logger.Debug().
			Str("title", animeItem.TitleRomaji).
			Str("query", query).
			Int("variant", i+1).
			Msg("enmasse-anime: Trying search variant")

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
			d.logger.Debug().Err(err).Str("query", query).Msg("enmasse-anime: Search variant failed")
			continue
		}

		if searchData != nil && len(searchData.Torrents) > 0 {
			allTorrents = append(allTorrents, searchData.Torrents...)
			d.logger.Debug().
				Str("query", query).
				Int("found", len(searchData.Torrents)).
				Msg("enmasse-anime: Found torrents with variant")
			// If we found good results, we can stop
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

// generateSearchVariants creates multiple search query variants from anime metadata
func (d *Downloader) generateSearchVariants(animeItem *AnilistMinifiedItem) []string {
	variants := make([]string, 0, 6)

	// Variant 1: Romaji title (most common)
	if animeItem.TitleRomaji != "" {
		variants = append(variants, d.sanitizeSearchQuery(animeItem.TitleRomaji))
	}

	// Variant 2: English title
	if animeItem.TitleEnglish != "" && animeItem.TitleEnglish != animeItem.TitleRomaji {
		variants = append(variants, d.sanitizeSearchQuery(animeItem.TitleEnglish))
	}

	// Variant 3: Original title if different
	if animeItem.Title != "" && animeItem.Title != animeItem.TitleRomaji && animeItem.Title != animeItem.TitleEnglish {
		variants = append(variants, d.sanitizeSearchQuery(animeItem.Title))
	}

	// Variant 4: First few words of romaji title (for long titles)
	if animeItem.TitleRomaji != "" {
		words := strings.Fields(animeItem.TitleRomaji)
		if len(words) > 3 {
			shortTitle := strings.Join(words[:3], " ")
			sanitized := d.sanitizeSearchQuery(shortTitle)
			if sanitized != "" && !d.containsVariant(variants, sanitized) {
				variants = append(variants, sanitized)
			}
		}
	}

	// Variant 5: Synonyms (up to 2)
	for i, syn := range animeItem.Synonyms {
		if i >= 2 {
			break
		}
		sanitized := d.sanitizeSearchQuery(syn)
		if sanitized != "" && !d.containsVariant(variants, sanitized) {
			variants = append(variants, sanitized)
		}
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
