package enmasse

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/extension"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/manga"
	manga_providers "seanime/internal/manga/providers"
	"seanime/internal/platforms/platform"
	"seanime/internal/util"
	"seanime/internal/util/comparison"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

const (
	HakunekoMangasPath       = "/aeternae/Soul/Otaku Media/Databases/weebcentral.json"
	MangaProgressFilePath    = "/aeternae/Soul/Otaku Media/Databases/enmasse-manga-progress.json"
	DefaultMangaProvider     = "weebcentral"
	// Rate limiting: max concurrent requests and delay between manga processing
	MaxConcurrentManga       = 1  // Process one manga at a time
	MaxConcurrentChapters    = 3  // Download up to 3 chapters concurrently per manga
	DelayBetweenManga        = 3 * time.Second  // Wait between each manga
	DelayBetweenChapters     = 300 * time.Millisecond  // Wait between chapter queuing
	DelayBetweenAPIRequests  = 500 * time.Millisecond  // Wait between API requests to same provider
	MaxLogEntries            = 100  // Maximum entries to keep in each log category
	// Retry settings for queue full / rate limiting - will wait indefinitely
	QueueFullRetryDelay      = 30 * time.Second  // Wait before retrying when queue is full
	RateLimitRetryDelay      = 60 * time.Second  // Wait before retrying on rate limit errors
)

type (
	MangaDownloader struct {
		logger            *zerolog.Logger
		mangaRepository   *manga.Repository
		mangaDownloader   *manga.Downloader
		wsEventManager    events.WSEventManagerInterface
		platformRef       *util.Ref[platform.Platform]

		mu              sync.Mutex
		isRunning       bool
		isPaused        bool
		cancelFunc      context.CancelFunc
		currentManga    *HakunekoMangaItem
		currentChapter  string
		processedCount  int
		totalCount      int
		downloadedManga []string
		failedManga     []string
		skippedManga    []string
		status          string
		// Rate limiting semaphores
		mangaSemaphore    chan struct{}  // Controls concurrent manga processing
		chapterSemaphore  chan struct{}  // Controls concurrent chapter downloads
	}

	MangaDownloaderProgress struct {
		ProcessedTitles  []string `json:"processed_titles"`
		DownloadedManga  []string `json:"downloaded_manga"`
		FailedManga      []string `json:"failed_manga"`
		SkippedManga     []string `json:"skipped_manga"`
	}

	HakunekoMangaItem struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}

	MangaDownloaderStatus struct {
		IsRunning        bool     `json:"isRunning"`
		IsPaused         bool     `json:"isPaused"`
		CurrentManga     *string  `json:"currentManga"`
		CurrentChapter   *string  `json:"currentChapter"`
		ProcessedCount   int      `json:"processedCount"`
		TotalCount       int      `json:"totalCount"`
		DownloadedManga  []string `json:"downloadedManga"`
		FailedManga      []string `json:"failedManga"`
		SkippedManga     []string `json:"skippedManga"`
		Status           string   `json:"status"`
		HasSavedProgress bool     `json:"hasSavedProgress"`
	}

	NewMangaDownloaderOptions struct {
		Logger           *zerolog.Logger
		MangaRepository  *manga.Repository
		MangaDownloader  *manga.Downloader
		WSEventManager   events.WSEventManagerInterface
		PlatformRef      *util.Ref[platform.Platform]
	}
)

func NewMangaDownloader(opts *NewMangaDownloaderOptions) *MangaDownloader {
	return &MangaDownloader{
		logger:           opts.Logger,
		mangaRepository:  opts.MangaRepository,
		mangaDownloader:  opts.MangaDownloader,
		wsEventManager:   opts.WSEventManager,
		platformRef:      opts.PlatformRef,
		downloadedManga:  make([]string, 0, MaxLogEntries),
		failedManga:      make([]string, 0, MaxLogEntries),
		skippedManga:     make([]string, 0, MaxLogEntries),
		mangaSemaphore:   make(chan struct{}, MaxConcurrentManga),
		chapterSemaphore: make(chan struct{}, MaxConcurrentChapters),
	}
}

func (d *MangaDownloader) GetStatus() *MangaDownloaderStatus {
	d.mu.Lock()
	defer d.mu.Unlock()

	status := &MangaDownloaderStatus{
		IsRunning:        d.isRunning,
		IsPaused:         d.isPaused,
		ProcessedCount:   d.processedCount,
		TotalCount:       d.totalCount,
		DownloadedManga:  d.downloadedManga,
		FailedManga:      d.failedManga,
		SkippedManga:     d.skippedManga,
		Status:           d.status,
		HasSavedProgress: d.hasSavedProgress(),
	}

	if d.currentManga != nil {
		title := d.currentManga.Title
		status.CurrentManga = &title
		if d.currentChapter != "" {
			cc := d.currentChapter
			status.CurrentChapter = &cc
		}
	}

	return status
}

func (d *MangaDownloader) hasSavedProgress() bool {
	_, err := os.Stat(MangaProgressFilePath)
	return err == nil
}

func (d *MangaDownloader) Start(resume bool) error {
	d.mu.Lock()
	if d.isRunning {
		d.mu.Unlock()
		return fmt.Errorf("manga en masse downloader is already running")
	}
	d.isRunning = true
	d.isPaused = false

	// Auto-resume if saved progress exists and resume not explicitly requested
	autoResume := resume
	if !resume && d.hasSavedProgress() {
		autoResume = true
		d.logger.Info().Msg("enmasse-manga: Saved progress found; auto-resuming")
	}

	if !autoResume {
		d.processedCount = 0
		d.downloadedManga = make([]string, 0, MaxLogEntries)
		d.failedManga = make([]string, 0, MaxLogEntries)
		d.skippedManga = make([]string, 0, MaxLogEntries)
		d.clearProgress()
	}
	d.status = "Starting..."
	d.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	d.cancelFunc = cancel

	go d.run(ctx, autoResume)

	return nil
}

func (d *MangaDownloader) Stop(saveProgress bool) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.cancelFunc != nil {
		d.cancelFunc()
	}
	d.isRunning = false
	d.isPaused = saveProgress

	if saveProgress {
		d.status = "Paused - Progress saved"
	} else {
		d.status = "Stopped"
		d.clearProgressUnlocked()
	}
	d.sendStatusUpdate()
}

func (d *MangaDownloader) run(ctx context.Context, resume bool) {
	defer func() {
		d.mu.Lock()
		d.isRunning = false
		d.currentManga = nil
		d.mu.Unlock()
		d.sendStatusUpdate()
	}()

	d.setStatus("Loading manga list from hakuneko-mangas.json...")

	mangaList, err := d.loadMangaList()
	if err != nil {
		d.logger.Error().Err(err).Msg("enmasse-manga: Failed to load manga list")
		d.setStatus(fmt.Sprintf("Error: %v", err))
		return
	}

	// Load saved progress if resuming
	processedTitles := make(map[string]bool)
	if resume {
		progress := d.loadProgress()
		if progress != nil {
			for _, title := range progress.ProcessedTitles {
				processedTitles[title] = true
			}
			d.mu.Lock()
			d.downloadedManga = progress.DownloadedManga
			d.failedManga = progress.FailedManga
			d.skippedManga = progress.SkippedManga
			d.processedCount = len(progress.ProcessedTitles)
			d.mu.Unlock()
			d.logger.Info().Int("skipping", len(processedTitles)).Msg("enmasse-manga: Resuming from saved progress")
		}
	}

	d.mu.Lock()
	d.totalCount = len(mangaList)
	d.mu.Unlock()

	d.logger.Info().Int("count", len(mangaList)).Msg("enmasse-manga: Loaded manga list")
	d.setStatus(fmt.Sprintf("Processing %d manga...", len(mangaList)))

	processedCount := d.processedCount
	for _, mangaItem := range mangaList {
		select {
		case <-ctx.Done():
			d.saveCurrentProgress(processedTitles)
			d.setStatus("Paused - Progress saved")
			return
		default:
		}

		// Skip already processed manga
		if processedTitles[mangaItem.Title] {
			continue
		}

		processedCount++
		d.mu.Lock()
		d.currentManga = mangaItem
		d.currentChapter = ""
		d.processedCount = processedCount
		d.status = fmt.Sprintf("Processing %d/%d: %s", processedCount, len(mangaList), mangaItem.Title)
		d.mu.Unlock()
		d.sendStatusUpdate()

		d.logger.Info().Str("title", mangaItem.Title).Msg("enmasse-manga: Processing manga")

		err := d.processManga(ctx, mangaItem)
		processedTitles[mangaItem.Title] = true

		if err != nil {
			if strings.Contains(err.Error(), "no chapters found") || strings.Contains(err.Error(), "WeebCentral") {
				d.logger.Warn().Str("title", mangaItem.Title).Err(err).Msg("enmasse-manga: Manga not available, skipping")
				d.addToSkipped(mangaItem.Title)
			} else {
				d.logger.Error().Err(err).Str("title", mangaItem.Title).Msg("enmasse-manga: Failed to process manga")
				d.addToFailed(mangaItem.Title)
			}
		} else {
			d.addToDownloaded(mangaItem.Title)
		}

		// Save progress after every manga for reliable resume
		d.saveCurrentProgress(processedTitles)

		// Delay between manga to avoid rate limiting
		time.Sleep(DelayBetweenManga)
	}

	d.clearProgress()
	d.setStatus("Completed!")
	d.sendStatusUpdate()

	d.wsEventManager.SendEvent(events.InfoToast, "Manga En Masse Download completed!")
}

// loadMangaList reads the hakuneko-mangas.json file using streaming to handle large files
func (d *MangaDownloader) loadMangaList() ([]*HakunekoMangaItem, error) {
	file, err := os.Open(HakunekoMangasPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open hakuneko-mangas.json: %w", err)
	}
	defer file.Close()

	// Use a buffered reader for better performance with large files
	reader := bufio.NewReaderSize(file, 1024*1024) // 1MB buffer

	decoder := json.NewDecoder(reader)

	// Read opening bracket
	_, err = decoder.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to read JSON array start: %w", err)
	}

	mangaList := make([]*HakunekoMangaItem, 0, 100000) // Pre-allocate for ~100k items

	// Read each item
	for decoder.More() {
		var item HakunekoMangaItem
		if err := decoder.Decode(&item); err != nil {
			d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to decode manga item, skipping")
			continue
		}
		mangaList = append(mangaList, &item)
	}

	return mangaList, nil
}

func (d *MangaDownloader) loadProgress() *MangaDownloaderProgress {
	data, err := os.ReadFile(MangaProgressFilePath)
	if err != nil {
		return nil
	}

	var progress MangaDownloaderProgress
	if err := json.Unmarshal(data, &progress); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to parse progress file")
		return nil
	}

	return &progress
}

func (d *MangaDownloader) saveCurrentProgress(processedTitles map[string]bool) {
	d.mu.Lock()
	progress := MangaDownloaderProgress{
		ProcessedTitles:  make([]string, 0, len(processedTitles)),
		DownloadedManga:  d.downloadedManga,
		FailedManga:      d.failedManga,
		SkippedManga:     d.skippedManga,
	}
	d.mu.Unlock()

	for title := range processedTitles {
		progress.ProcessedTitles = append(progress.ProcessedTitles, title)
	}

	data, err := json.MarshalIndent(progress, "", "  ")
	if err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to marshal progress")
		return
	}

	dir := filepath.Dir(MangaProgressFilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to create progress directory")
		return
	}

	if err := os.WriteFile(MangaProgressFilePath, data, 0644); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to save progress")
	} else {
		d.logger.Debug().Int("processed", len(processedTitles)).Msg("enmasse-manga: Progress saved")
	}
}

func (d *MangaDownloader) clearProgress() {
	os.Remove(MangaProgressFilePath)
}

func (d *MangaDownloader) clearProgressUnlocked() {
	os.Remove(MangaProgressFilePath)
}

func (d *MangaDownloader) processManga(ctx context.Context, mangaItem *HakunekoMangaItem) error {
	provider := DefaultMangaProvider

	// Get the provider extension
	extensionBank := d.mangaRepository.GetProviderExtensionBank()
	if extensionBank == nil {
		return fmt.Errorf("extension bank not available")
	}

	providerExtension, ok := extensionBank.Get(provider)
	if !ok {
		return fmt.Errorf("WeebCentral provider not found")
	}

	mangaProvider, ok := providerExtension.(extension.MangaProviderExtension)
	if !ok {
		return fmt.Errorf("provider is not a manga provider")
	}

	// Strip the /series/ prefix from the hakuneko ID if present
	// The hakuneko ID format is "/series/01J76XYGY3JKS5JFEFK86BQGJJ/manga-title"
	// but the WeebCentral extension expects just "01J76XYGY3JKS5JFEFK86BQGJJ/manga-title"
	mangaId := strings.TrimPrefix(mangaItem.ID, "/series/")

	d.logger.Debug().
		Str("title", mangaItem.Title).
		Str("mangaId", mangaId).
		Msg("enmasse-manga: Fetching chapters from WeebCentral")

	time.Sleep(DelayBetweenAPIRequests)

	chapters, err := mangaProvider.GetProvider().FindChapters(mangaId)
	if err != nil {
		return fmt.Errorf("failed to get chapters from WeebCentral: %w", err)
	}
	// Provider rate limit (per provider, excluding torrent client)
	if err := acquireProvider(ctx); err != nil {
		return err
	}

	if len(chapters) == 0 {
		return fmt.Errorf("no chapters found on WeebCentral")
	}

	d.logger.Info().
		Str("title", mangaItem.Title).
		Int("chapterCount", len(chapters)).
		Msg("enmasse-manga: Found chapters on WeebCentral")

	// Step 2: Try to find the manga on AniList for proper media ID and folder organization
	// This is optional - if not found, we'll create a synthetic manga entry
	var mediaId int
	var mediaTitle string

	anilistManga, err := d.searchAniListManga(ctx, mangaItem.Title)
	if err != nil {
		// AniList not found - create or get synthetic manga entry
		syntheticManga, synErr := d.getOrCreateSyntheticManga(ctx, mangaProvider, mangaItem, mangaId, len(chapters))
		if synErr != nil {
			d.logger.Warn().Err(synErr).
				Str("title", mangaItem.Title).
				Msg("enmasse-manga: Failed to create synthetic manga entry, using fallback")
			// Fallback to pseudo ID
			mediaId = d.generatePseudoMediaId(mangaItem.Title)
			mediaTitle = mangaItem.Title
		} else {
			mediaId = syntheticManga.SyntheticID
			mediaTitle = syntheticManga.Title
			d.logger.Info().
				Str("title", mangaItem.Title).
				Int("syntheticId", mediaId).
				Msg("enmasse-manga: Using synthetic manga entry")
		}
	} else {
		mediaId = anilistManga.ID
		if anilistManga.Title != nil && anilistManga.Title.Romaji != nil {
			mediaTitle = *anilistManga.Title.Romaji
		} else {
			mediaTitle = mangaItem.Title
		}

		d.logger.Info().
			Str("title", mangaItem.Title).
			Int("anilistId", mediaId).
			Str("anilistTitle", mediaTitle).
			Msg("enmasse-manga: Found manga on AniList")

		// Optionally add to planning list
		_ = d.addToAniListPlanningList(ctx, anilistManga)
	}

	// Step 3: Queue all chapters for download using semaphore for rate limiting
	queuedCount := 0
	for _, chapter := range chapters {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Acquire chapter semaphore
		d.chapterSemaphore <- struct{}{}

		// Fetch chapter pages with retry for rate limiting
		var pages []*hibikemanga.ChapterPage
		for {
			select {
			case <-ctx.Done():
				<-d.chapterSemaphore
				return ctx.Err()
			default:
			}

			time.Sleep(DelayBetweenAPIRequests)
			if err := acquireProvider(ctx); err != nil {
				<-d.chapterSemaphore
				return err
			}
			pages, err = mangaProvider.GetProvider().FindChapterPages(chapter.ID)
			if err != nil {
				if d.isRetryableError(err) {
					d.logger.Warn().Err(err).
						Str("title", mangaItem.Title).
						Str("chapterId", chapter.ID).
						Msg("enmasse-manga: Rate limited fetching chapter pages, waiting to retry...")
					d.setStatus(fmt.Sprintf("Rate limited on %s - waiting %v to retry...", mangaItem.Title, RateLimitRetryDelay))
					time.Sleep(RateLimitRetryDelay)
					continue
				}
				d.logger.Warn().Err(err).
					Str("title", mangaItem.Title).
					Str("chapterId", chapter.ID).
					Msg("enmasse-manga: Failed to get chapter pages")
				break
			}
			break
		}

		if err != nil || len(pages) == 0 {
			<-d.chapterSemaphore
			continue
		}

		// Add to download queue with retry for queue full
		for {
			select {
			case <-ctx.Done():
				<-d.chapterSemaphore
				return ctx.Err()
			default:
			}

			err = d.mangaDownloader.DownloadChapterDirect(manga.DownloadChapterDirectOptions{
				Provider:      provider,
				MediaId:       mediaId,
				ChapterId:     chapter.ID,
				ChapterNumber: manga_providers.GetNormalizedChapter(chapter.Chapter),
				MediaTitle:    mediaTitle,
				Pages:         pages,
				StartNow:      false,
			})

			if err != nil {
				if d.isQueueFullError(err) {
					d.logger.Info().
						Str("title", mangaItem.Title).
						Str("chapterId", chapter.ID).
						Msg("enmasse-manga: Queue full (50 series limit), waiting for space...")
					d.setStatus(fmt.Sprintf("Queue full - waiting %v for space (processing %s)...", QueueFullRetryDelay, mangaItem.Title))
					time.Sleep(QueueFullRetryDelay)
					continue
				}
				if d.isRetryableError(err) {
					d.logger.Warn().Err(err).
						Str("title", mangaItem.Title).
						Str("chapterId", chapter.ID).
						Msg("enmasse-manga: Rate limited queuing chapter, waiting to retry...")
					d.setStatus(fmt.Sprintf("Rate limited - waiting %v to retry...", RateLimitRetryDelay))
					time.Sleep(RateLimitRetryDelay)
					continue
				}
				d.logger.Warn().Err(err).
					Str("title", mangaItem.Title).
					Str("chapterId", chapter.ID).
					Msg("enmasse-manga: Failed to queue chapter download")
			} else {
				queuedCount++
			}
			break
		}

		<-d.chapterSemaphore

		// Small delay between chapter queuing
		time.Sleep(DelayBetweenChapters)
	}

	d.logger.Info().
		Str("title", mangaItem.Title).
		Int("queued", queuedCount).
		Int("total", len(chapters)).
		Msg("enmasse-manga: Queued chapters for download")

	return nil
}

// generatePseudoMediaId generates a consistent pseudo media ID from a title
// This is used when the manga is not found on AniList
func (d *MangaDownloader) generatePseudoMediaId(title string) int {
	// Use a simple hash to generate a consistent ID
	// We use negative IDs to distinguish from real AniList IDs
	hash := 0
	for _, c := range title {
		hash = 31*hash + int(c)
	}
	// Make it negative and ensure it's not 0
	if hash >= 0 {
		hash = -hash - 1
	}
	return hash
}

// isQueueFullError checks if an error indicates the download queue is full (50 series limit)
func (d *MangaDownloader) isQueueFullError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "maximum of 50 series") ||
		strings.Contains(errStr, "queue") && strings.Contains(errStr, "full")
}

// isRetryableError checks if an error is a rate limiting or temporary error that should be retried
func (d *MangaDownloader) isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "rate limit") ||
		strings.Contains(errStr, "too many requests") ||
		strings.Contains(errStr, "429") ||
		strings.Contains(errStr, "503") ||
		strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "temporarily unavailable")
}

// generateSearchVariants creates multiple search variants from a title, from most specific to least.
// This helps handle cases where AniList's API returns 500 errors for certain character combinations.
func (d *MangaDownloader) generateSearchVariants(title string) []string {
	variants := make([]string, 0, 4)
	
	// Variant 1: Basic sanitization (remove quotes and common problematic chars)
	v1 := strings.TrimSpace(title)
	v1 = strings.ReplaceAll(v1, "\"", "")
	v1 = strings.ReplaceAll(v1, "'", "")
	v1 = strings.ReplaceAll(v1, "…", " ")
	v1 = strings.ReplaceAll(v1, "?", "")
	v1 = strings.ReplaceAll(v1, "!", "")
	v1 = strings.ReplaceAll(v1, ",", " ")
	v1 = strings.ReplaceAll(v1, ".", " ")
	v1 = strings.ReplaceAll(v1, ":", " ")
	v1 = strings.ReplaceAll(v1, ";", " ")
	v1 = strings.ReplaceAll(v1, "(", " ")
	v1 = strings.ReplaceAll(v1, ")", " ")
	v1 = strings.ReplaceAll(v1, "[", " ")
	v1 = strings.ReplaceAll(v1, "]", " ")
	v1 = strings.ReplaceAll(v1, "-", " ")
	v1 = strings.ReplaceAll(v1, "~", " ")
	v1 = strings.ReplaceAll(v1, "@", " ")
	v1 = strings.ReplaceAll(v1, "#", " ")
	v1 = strings.ReplaceAll(v1, "&", " ")
	v1 = strings.ReplaceAll(v1, "*", " ")
	v1 = strings.ReplaceAll(v1, "+", " ")
	v1 = strings.ReplaceAll(v1, "=", " ")
	v1 = strings.ReplaceAll(v1, "/", " ")
	v1 = strings.ReplaceAll(v1, "\\", " ")
	v1 = strings.ReplaceAll(v1, "|", " ")
	v1 = strings.ReplaceAll(v1, "<", " ")
	v1 = strings.ReplaceAll(v1, ">", " ")
	// Collapse multiple spaces
	for strings.Contains(v1, "  ") {
		v1 = strings.ReplaceAll(v1, "  ", " ")
	}
	v1 = strings.TrimSpace(v1)
	
	// Truncate if too long
	if len(v1) > 80 {
		v1 = v1[:80]
		if lastSpace := strings.LastIndex(v1, " "); lastSpace > 40 {
			v1 = v1[:lastSpace]
		}
		v1 = strings.TrimSpace(v1)
	}
	
	if len(v1) >= 3 {
		variants = append(variants, v1)
	}
	
	// Variant 2: Only keep alphanumeric and spaces (most aggressive sanitization)
	v2 := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ' ' {
			return r
		}
		return ' '
	}, title)
	for strings.Contains(v2, "  ") {
		v2 = strings.ReplaceAll(v2, "  ", " ")
	}
	v2 = strings.TrimSpace(v2)
	if len(v2) > 80 {
		v2 = v2[:80]
		if lastSpace := strings.LastIndex(v2, " "); lastSpace > 40 {
			v2 = v2[:lastSpace]
		}
		v2 = strings.TrimSpace(v2)
	}
	
	if len(v2) >= 3 && v2 != v1 {
		variants = append(variants, v2)
	}
	
	// Variant 3: First few significant words only (for very long/complex titles)
	words := strings.Fields(v2)
	if len(words) > 3 {
		// Skip leading numbers/short words and take first 3-4 significant words
		significantWords := make([]string, 0, 4)
		for _, word := range words {
			// Skip very short words or pure numbers at the start
			if len(significantWords) == 0 && (len(word) <= 2 || isNumeric(word)) {
				continue
			}
			significantWords = append(significantWords, word)
			if len(significantWords) >= 4 {
				break
			}
		}
		if len(significantWords) >= 2 {
			v3 := strings.Join(significantWords, " ")
			if v3 != v1 && v3 != v2 && len(v3) >= 3 {
				variants = append(variants, v3)
			}
		}
	}
	
	return variants
}

// isNumeric checks if a string contains only digits
func isNumeric(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func (d *MangaDownloader) searchAniListManga(ctx context.Context, title string) (*anilist.BaseManga, error) {
	platform := d.platformRef.Get()
	if platform == nil {
		return nil, fmt.Errorf("platform not available")
	}

	// Search for manga on AniList using ListManga (more reliable than SearchBaseManga)
	anilistClient := platform.GetAnilistClient()
	page := 1
	perPage := 15

	// Generate multiple search variants to try, from most specific to least
	searchVariants := d.generateSearchVariants(title)
	
	if len(searchVariants) == 0 {
		d.logger.Debug().Str("title", title).Msg("enmasse-manga: No valid search variants generated")
		return nil, fmt.Errorf("title too short after sanitization")
	}

	var searchResult *anilist.ListManga
	var lastErr error
	var usedSearchTitle string

	// Try each search variant until one succeeds
	// Rate limit: AniList is currently limited to 30 req/min, so wait 4s between requests (halved rate)
	for _, searchTitle := range searchVariants {
		d.logger.Debug().Str("originalTitle", title).Str("searchTitle", searchTitle).Msg("enmasse-manga: Trying search variant")

		result, err := anilistClient.ListManga(ctx, &page, &searchTitle, &perPage, nil, nil, nil, nil, nil, nil, nil, nil, nil)
		if err != nil {
			d.logger.Debug().Err(err).Str("searchTitle", searchTitle).Msg("enmasse-manga: Search variant failed")
			lastErr = err
			// Wait before trying next variant to respect rate limits
			time.Sleep(4 * time.Second)
			continue
		}
		
		// Check if we got results
		if result != nil && result.Page != nil && len(result.Page.Media) > 0 {
			searchResult = result
			usedSearchTitle = searchTitle
			break
		}
		
		// No results but no error - try next variant
		d.logger.Debug().Str("searchTitle", searchTitle).Msg("enmasse-manga: Search variant returned no results")
		// Still wait to respect rate limits
		time.Sleep(4 * time.Second)
	}

	if searchResult == nil {
		if lastErr != nil {
			d.logger.Error().Err(lastErr).Str("title", title).Msg("enmasse-manga: All search variants failed")
			return nil, lastErr
		}
		return nil, fmt.Errorf("no results found for any search variant")
	}

	d.logger.Debug().
		Str("usedSearchTitle", usedSearchTitle).
		Int("resultCount", len(searchResult.Page.Media)).
		Msg("enmasse-manga: AniList search returned results")

	// Find the best match using title comparison
	var bestMatch *anilist.BaseManga
	bestScore := 0.0

	for _, result := range searchResult.Page.Media {
		if result == nil {
			continue
		}
		// Compare search title with all titles of this result
		allTitles := result.GetAllTitles()
		
		// Log what titles we're comparing against (only first result to avoid spam)
		if bestMatch == nil {
			titlesStr := make([]string, 0, len(allTitles))
			for _, t := range allTitles {
				if t != nil {
					titlesStr = append(titlesStr, *t)
				}
			}
			d.logger.Debug().
				Str("searchTitle", title).
				Strs("resultTitles", titlesStr).
				Str("resultTitle", result.GetTitleSafe()).
				Msg("enmasse-manga: First result titles")
		}
		
		compRes, found := comparison.FindBestMatchWithSorensenDice(&title, allTitles)
		if found && compRes.Value != nil {
			if compRes.Rating > bestScore {
				bestScore = compRes.Rating
				bestMatch = result
				d.logger.Debug().
					Str("searchTitle", title).
					Str("matchedTitle", *compRes.Value).
					Float64("score", compRes.Rating).
					Str("resultTitle", result.GetTitleSafe()).
					Msg("enmasse-manga: New best match")
			}
		}
	}

	// Require a minimum match score (lowered to 0.4 for more lenient matching)
	if bestScore < 0.4 || bestMatch == nil {
		d.logger.Warn().
			Str("title", title).
			Float64("bestScore", bestScore).
			Msg("enmasse-manga: No good match found")
		return nil, fmt.Errorf("no good match found (best score: %.2f)", bestScore)
	}

	d.logger.Info().
		Str("searchTitle", title).
		Str("matchedTitle", bestMatch.GetTitleSafe()).
		Float64("score", bestScore).
		Int("mediaId", bestMatch.ID).
		Msg("enmasse-manga: Found match on AniList")

	return bestMatch, nil
}

func (d *MangaDownloader) addToAniListPlanningList(ctx context.Context, mangaMedia *anilist.BaseManga) error {
	platform := d.platformRef.Get()
	if platform == nil {
		return fmt.Errorf("platform not available")
	}

	// Add to planning list using AniList API (which syncs to MAL if linked)
	anilistClient := platform.GetAnilistClient()
	status := anilist.MediaListStatusPlanning
	progress := 0

	_, err := anilistClient.UpdateMediaListEntry(ctx, &mangaMedia.ID, &status, nil, &progress, nil, nil)
	if err != nil {
		return err
	}

	d.logger.Debug().
		Int("mediaId", mangaMedia.ID).
		Str("title", mangaMedia.GetTitleSafe()).
		Msg("enmasse-manga: Added to planning list")

	return nil
}

func (d *MangaDownloader) setStatus(status string) {
	d.mu.Lock()
	d.status = status
	d.mu.Unlock()
	d.sendStatusUpdate()
}

func (d *MangaDownloader) sendStatusUpdate() {
	defer util.HandlePanicInModuleThen("enmasse-manga/sendStatusUpdate", func() {})
	d.wsEventManager.SendEvent("enMasseMangaDownloaderStatus", d.GetStatus())
}

// addToDownloaded adds a manga title to the downloaded list, keeping only the last MaxLogEntries
func (d *MangaDownloader) addToDownloaded(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.downloadedManga = append(d.downloadedManga, title)
	if len(d.downloadedManga) > MaxLogEntries {
		d.downloadedManga = d.downloadedManga[len(d.downloadedManga)-MaxLogEntries:]
	}
}

// addToFailed adds a manga title to the failed list, keeping only the last MaxLogEntries
func (d *MangaDownloader) addToFailed(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.failedManga = append(d.failedManga, title)
	if len(d.failedManga) > MaxLogEntries {
		d.failedManga = d.failedManga[len(d.failedManga)-MaxLogEntries:]
	}
}

// addToSkipped adds a manga title to the skipped list, keeping only the last MaxLogEntries
func (d *MangaDownloader) addToSkipped(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.skippedManga = append(d.skippedManga, title)
	if len(d.skippedManga) > MaxLogEntries {
		d.skippedManga = d.skippedManga[len(d.skippedManga)-MaxLogEntries:]
	}
}

// getOrCreateSyntheticManga creates or retrieves a synthetic manga entry for manga not found on AniList.
// It searches WeebCentral to get the cover image and stores the metadata in the database.
func (d *MangaDownloader) getOrCreateSyntheticManga(ctx context.Context, mangaProvider extension.MangaProviderExtension, mangaItem *HakunekoMangaItem, providerId string, chapterCount int) (*models.SyntheticManga, error) {
	db := d.mangaRepository.GetDatabase()
	if db == nil {
		return nil, fmt.Errorf("database not available")
	}

	// Check if synthetic manga already exists for this provider ID
	existing, found := db.GetSyntheticMangaByProviderID(DefaultMangaProvider, providerId)
	if found {
		// Update chapter count if it changed
		if existing.Chapters != chapterCount {
			existing.Chapters = chapterCount
			_ = db.UpdateSyntheticManga(existing)
		}
		return existing, nil
	}

	// Search WeebCentral to get cover image
	var coverImage string
	time.Sleep(DelayBetweenAPIRequests)
	searchResults, err := mangaProvider.GetProvider().Search(hibikemanga.SearchOptions{
		Query: mangaItem.Title,
	})
	if err == nil && len(searchResults) > 0 {
		// Find best match
		for _, result := range searchResults {
			if strings.EqualFold(result.Title, mangaItem.Title) {
				coverImage = result.Image
				break
			}
		}
		// If no exact match, use first result's image
		if coverImage == "" && len(searchResults) > 0 {
			coverImage = searchResults[0].Image
		}
	}

	// Generate a synthetic ID (negative to avoid collision with AniList IDs)
	syntheticId := d.generateSyntheticId(providerId)

	// Create synthetic manga entry
	syntheticManga := &models.SyntheticManga{
		SyntheticID: syntheticId,
		Title:       mangaItem.Title,
		CoverImage:  coverImage,
		Provider:    DefaultMangaProvider,
		ProviderID:  providerId,
		Status:      "RELEASING",
		Chapters:    chapterCount,
	}

	err = db.InsertSyntheticManga(syntheticManga)
	if err != nil {
		return nil, fmt.Errorf("failed to insert synthetic manga: %w", err)
	}

	d.logger.Debug().
		Str("title", mangaItem.Title).
		Int("syntheticId", syntheticId).
		Str("coverImage", coverImage).
		Msg("enmasse-manga: Created synthetic manga entry")

	return syntheticManga, nil
}

// generateSyntheticId generates a negative ID from the provider ID to avoid collision with AniList IDs
func (d *MangaDownloader) generateSyntheticId(providerId string) int {
	h := fnv.New64a()
	h.Write([]byte(providerId))
	// Use negative numbers and ensure it's within int range
	// Take the lower 31 bits and negate
	hash := int(h.Sum64() & 0x7FFFFFFF)
	return -hash
}
