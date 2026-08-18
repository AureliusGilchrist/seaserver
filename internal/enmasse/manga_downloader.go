package enmasse

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	database "seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/extension"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/manga"
	manga_providers "seanime/internal/manga/providers"
	"seanime/internal/platforms/platform"
	"seanime/internal/util"
	"seanime/internal/util/comparison"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

const (
	HakunekoMangasPath       = "/zroot/Soul/Otaku Media/Databases/weebcentral.json"
	MangaProgressFilePath    = "/zroot/Soul/Otaku Media/Databases/enmasse-manga-progress.json"
	DefaultMangaProvider     = "weebcentral"
	// Rate limiting: max concurrent requests and delay between manga processing
	MaxConcurrentManga       = 1  // Process one manga at a time
	MaxConcurrentChapters    = 8  // Download up to 8 chapters concurrently per manga
	DelayBetweenManga        = 1 * time.Second  // Wait between each manga
	DelayBetweenChapters     = 50 * time.Millisecond  // Wait between chapter queuing
	DelayBetweenAPIRequests  = 180 * time.Millisecond  // Wait between API requests to same provider
	MaxLogEntries            = 333 // Maximum entries to keep in each log category
	// Retry settings for queue full / rate limiting - will wait indefinitely
	QueueFullRetryDelay      = 15 * time.Second  // Wait before retrying when queue is full
	RateLimitRetryDelay      = 30 * time.Second  // Wait before retrying on rate limit errors
	// AniListResolveTimeout caps how long one title may spend looking itself up on AniList before
	// the walk gives up and uses a synthetic entry. Metadata is optional; downloading is not.
	AniListResolveTimeout    = 45 * time.Second
	searchMangaAllFormatsQuery = `query SearchMangaAllFormats($page: Int, $perPage: Int, $search: String) {
	  Page(page: $page, perPage: $perPage) {
	    pageInfo {
	      hasNextPage
	    }
	    media(type: MANGA, search: $search) {
	      id
	      idMal
	      siteUrl
	      status(version: 2)
	      season
	      type
	      format
	      bannerImage
	      chapters
	      volumes
	      synonyms
	      isAdult
	      countryOfOrigin
	      meanScore
	      description
	      genres
	      title {
	        userPreferred
	        romaji
	        english
	        native
	      }
	      coverImage {
	        extraLarge
	        large
	        medium
	        color
	      }
	      startDate {
	        year
	        month
	        day
	      }
	      endDate {
	        year
	        month
	        day
	      }
	    }
	  }
	}`
)

type (
	MangaDownloader struct {
		logger            *zerolog.Logger
		mangaRepository   *manga.Repository
		mangaDownloader   *manga.Downloader
		database          *database.Database
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
		details         MangaDownloadDetails
		// Rate limiting semaphores
		mangaSemaphore    chan struct{}  // Controls concurrent manga processing
		chapterSemaphore  chan struct{}  // Controls concurrent chapter downloads
	}

	MangaDownloaderProgress struct {
		ProcessedTitles []string `json:"processed_titles"`
		DownloadedManga []string `json:"downloaded_manga"`
		FailedManga     []string `json:"failed_manga"`
		SkippedManga    []string `json:"skipped_manga"`
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
		Details          MangaDownloadDetails `json:"details"`
		HasSavedProgress bool     `json:"hasSavedProgress"`
	}

	MangaDownloadDetails struct {
		Phase             string `json:"phase"`
		Step              string `json:"step"`
		CurrentMangaIndex int    `json:"currentMangaIndex"`
		CurrentMangaTotal int    `json:"currentMangaTotal"`
		Provider          string `json:"provider"`
		MangaID           string `json:"mangaId"`
		CurrentChapterID  string `json:"currentChapterId"`
		CurrentChapter    string `json:"currentChapter"`
		ChapterIndex      int    `json:"chapterIndex"`
		ChapterTotal      int    `json:"chapterTotal"`
		PageIndex         int    `json:"pageIndex"`
		PageTotal         int    `json:"pageTotal"`
		QueuedChapters    int    `json:"queuedChapters"`
		DownloadedCount   int    `json:"downloadedCount"`
		FailedCount       int    `json:"failedCount"`
		SkippedCount      int    `json:"skippedCount"`
		LastError         string `json:"lastError"`
	}

	NewMangaDownloaderOptions struct {
		Logger           *zerolog.Logger
		MangaRepository  *manga.Repository
		MangaDownloader  *manga.Downloader
		Database         *database.Database
		WSEventManager   events.WSEventManagerInterface
		PlatformRef      *util.Ref[platform.Platform]
	}
)

// searchAniListMangaAllFormats searches AniList without the format_not: NOVEL filter to avoid false negatives and 500s for certain titles.
func (d *MangaDownloader) searchAniListMangaAllFormats(ctx context.Context, search string, page int, perPage int) (*anilist.SearchBaseManga, error) {
	vars := map[string]interface{}{
		"page":    page,
		"perPage": perPage,
		"search":  search,
	}
	body, err := json.Marshal(map[string]interface{}{
		"query":     searchMangaAllFormatsQuery,
		"variables": vars,
	})
	if err != nil {
		return nil, err
	}

	// Deliberately not client.CustomQuery: that form ignores the context and skips the pacer, which
	// on a 10,000-title walk means unmetered requests, 429s, and a metered path that then stalls a
	// minute per request. See anilist.CustomQueryCtx.
	data, err := anilist.CustomQueryCtx(ctx, body, d.logger)
	if err != nil {
		return nil, err
	}

	m, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	var res *anilist.SearchBaseManga
	if err := json.Unmarshal(m, &res); err != nil {
		return nil, err
	}

	return res, nil
}

func NewMangaDownloader(opts *NewMangaDownloaderOptions) *MangaDownloader {
	return &MangaDownloader{
		logger:           opts.Logger,
		mangaRepository:  opts.MangaRepository,
		mangaDownloader:  opts.MangaDownloader,
		database:         opts.Database,
		wsEventManager:   opts.WSEventManager,
		platformRef:      opts.PlatformRef,
		downloadedManga:  make([]string, 0, MaxLogEntries),
		failedManga:      make([]string, 0, MaxLogEntries),
		skippedManga:     make([]string, 0, MaxLogEntries),
		details: MangaDownloadDetails{
			Phase: "idle",
			Step:  "idle",
		},
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
		Details: MangaDownloadDetails{
			Phase:             d.details.Phase,
			Step:              d.details.Step,
			CurrentMangaIndex: d.details.CurrentMangaIndex,
			CurrentMangaTotal: d.details.CurrentMangaTotal,
			Provider:          d.details.Provider,
			MangaID:           d.details.MangaID,
			CurrentChapterID:  d.details.CurrentChapterID,
			CurrentChapter:    d.details.CurrentChapter,
			ChapterIndex:      d.details.ChapterIndex,
			ChapterTotal:      d.details.ChapterTotal,
			PageIndex:         d.details.PageIndex,
			PageTotal:         d.details.PageTotal,
			QueuedChapters:    d.details.QueuedChapters,
			DownloadedCount:   len(d.downloadedManga),
			FailedCount:       len(d.failedManga),
			SkippedCount:      len(d.skippedManga),
			LastError:         d.details.LastError,
		},
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

func (d *MangaDownloader) updateDetails(updateFn func(*MangaDownloadDetails)) {
	d.mu.Lock()
	if updateFn != nil {
		updateFn(&d.details)
	}
	d.mu.Unlock()
	d.sendStatusUpdate()
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
	autoResume := resume
	if resume && d.hasSavedProgress() {
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

	go d.run(ctx, resume)

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
		// Save progress directly to ensure file exists for Resume button
		d.saveProgressFromState()
	} else {
		d.status = "Stopped"
		d.clearProgressUnlocked()
	}
	d.sendStatusUpdate()
}

// saveProgressFromState saves progress using the downloader's current state fields.
// This is called from Stop() to ensure progress file exists even if run() hasn't saved yet.
// Must be called with d.mu held.
func (d *MangaDownloader) saveProgressFromState() {
	progress := MangaDownloaderProgress{
		ProcessedTitles: make([]string, 0),
		DownloadedManga: d.downloadedManga,
		FailedManga:     d.failedManga,
		SkippedManga:    d.skippedManga,
	}

	// Combine all processed titles from downloaded, failed, and skipped
	seen := make(map[string]bool)
	for _, title := range d.downloadedManga {
		if !seen[title] {
			seen[title] = true
			progress.ProcessedTitles = append(progress.ProcessedTitles, title)
		}
	}
	for _, title := range d.failedManga {
		if !seen[title] {
			seen[title] = true
			progress.ProcessedTitles = append(progress.ProcessedTitles, title)
		}
	}
	for _, title := range d.skippedManga {
		if !seen[title] {
			seen[title] = true
			progress.ProcessedTitles = append(progress.ProcessedTitles, title)
		}
	}

	data, err := json.MarshalIndent(progress, "", "  ")
	if err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to marshal progress in Stop")
		return
	}

	dir := filepath.Dir(MangaProgressFilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to create progress directory in Stop")
		return
	}

	if err := util.WriteFileCrashSafe(MangaProgressFilePath, data, 0644); err != nil {
		d.logger.Warn().Err(err).Msg("enmasse-manga: Failed to save progress in Stop")
	}
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
	d.updateDetails(func(details *MangaDownloadDetails) {
		details.Phase = "loading"
		details.Step = "loading manga list"
		details.CurrentMangaIndex = 0
		details.CurrentMangaTotal = 0
		details.Provider = DefaultMangaProvider
		details.MangaID = ""
		details.CurrentChapterID = ""
		details.CurrentChapter = ""
		details.ChapterIndex = 0
		details.ChapterTotal = 0
		details.PageIndex = 0
		details.PageTotal = 0
		details.QueuedChapters = 0
		details.LastError = ""
	})

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

			// Rewind a few entries to reprocess possible missed chapters
			const rewindCount = 3
			processedOrder := make([]string, 0, len(progress.ProcessedTitles))
			for _, mangaItem := range mangaList {
				if processedTitles[mangaItem.Title] {
					processedOrder = append(processedOrder, mangaItem.Title)
				}
			}
			if len(processedOrder) > 0 {
				toRewind := rewindCount
				if toRewind > len(processedOrder) {
					toRewind = len(processedOrder)
				}
				for _, title := range processedOrder[len(processedOrder)-toRewind:] {
					delete(processedTitles, title)
				}
				if toRewind > 0 {
					d.logger.Info().Int("rewound", toRewind).Msg("enmasse-manga: Rewinding processed titles for resume")
				}
			}
			d.mu.Lock()
			d.downloadedManga = progress.DownloadedManga
			d.failedManga = progress.FailedManga
			d.skippedManga = progress.SkippedManga
			d.processedCount = len(processedTitles)
			d.mu.Unlock()
			d.logger.Info().Int("skipping", len(processedTitles)).Msg("enmasse-manga: Resuming from saved progress")
		}
	}

	d.mu.Lock()
	d.totalCount = len(mangaList)
	d.details.CurrentMangaTotal = len(mangaList)
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
		d.details.Phase = "processing"
		d.details.Step = "processing manga"
		d.details.CurrentMangaIndex = processedCount
		d.details.CurrentMangaTotal = len(mangaList)
		d.details.Provider = DefaultMangaProvider
		d.details.MangaID = strings.TrimPrefix(mangaItem.ID, "/series/")
		d.details.CurrentChapterID = ""
		d.details.CurrentChapter = ""
		d.details.ChapterIndex = 0
		d.details.ChapterTotal = 0
		d.details.PageIndex = 0
		d.details.PageTotal = 0
		d.details.QueuedChapters = 0
		d.details.LastError = ""
		d.mu.Unlock()
		d.sendStatusUpdate()

		d.logger.Info().Str("title", mangaItem.Title).Msg("enmasse-manga: Processing manga")

		err := d.processManga(ctx, mangaItem)
		processedTitles[mangaItem.Title] = true

		if err != nil {
			d.updateDetails(func(details *MangaDownloadDetails) {
				details.Step = "manga failed"
				details.LastError = err.Error()
			})
			if strings.Contains(err.Error(), "no chapters found") || strings.Contains(err.Error(), "WeebCentral") {
				d.logger.Warn().Str("title", mangaItem.Title).Err(err).Msg("enmasse-manga: Manga not available, skipping")
				d.addToSkipped(mangaItem.Title)
			} else {
				d.logger.Error().Err(err).Str("title", mangaItem.Title).Msg("enmasse-manga: Failed to process manga")
				d.addToFailed(mangaItem.Title)
			}
		} else {
			d.updateDetails(func(details *MangaDownloadDetails) {
				details.Step = "manga queued successfully"
				details.LastError = ""
			})
			d.addToDownloaded(mangaItem.Title)
			// Start the download queue so chapters download while the next manga is being queued
			d.mangaDownloader.RunChapterDownloadQueue()
		}

		// Save progress after every manga for reliable resume
		d.saveCurrentProgress(processedTitles)

		// Delay between manga to avoid rate limiting
		time.Sleep(DelayBetweenManga)
	}

	d.clearProgress()
	d.setStatus("Completed!")
	d.updateDetails(func(details *MangaDownloadDetails) {
		details.Phase = "completed"
		details.Step = "all manga processed"
		details.CurrentChapterID = ""
		details.CurrentChapter = ""
		details.ChapterIndex = 0
		details.ChapterTotal = 0
		details.PageIndex = 0
		details.PageTotal = 0
	})
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
	reader := bufio.NewReaderSize(file, 1024*4096) // 4MB buffer

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
		ProcessedTitles: make([]string, 0, len(processedTitles)),
		DownloadedManga: d.downloadedManga,
		FailedManga:     d.failedManga,
		SkippedManga:    d.skippedManga,
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

	if err := util.WriteFileCrashSafe(MangaProgressFilePath, data, 0644); err != nil {
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

// buildTitleVariants returns a set of title candidates to match on-disk folders.
// It lowercases, trims, and adds a few simple replacements to catch common variants.
func buildTitleVariants(title string) []string {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil
	}

	lower := strings.ToLower(title)
	spaceToDash := strings.ReplaceAll(lower, " ", "-")
	colonToDash := strings.ReplaceAll(lower, ":", "-")
	ampersandToAnd := strings.ReplaceAll(lower, "&", "and")

	variants := []string{
		title,
		lower,
		spaceToDash,
		colonToDash,
		ampersandToAnd,
	}

	seen := make(map[string]bool)
	uniq := make([]string, 0, len(variants))
	for _, v := range variants {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		uniq = append(uniq, v)
	}

	return uniq
}

func (d *MangaDownloader) processManga(ctx context.Context, mangaItem *HakunekoMangaItem) error {
	provider := DefaultMangaProvider
	d.updateDetails(func(details *MangaDownloadDetails) {
		details.Phase = "processing"
		details.Step = "checking local chapters"
		details.Provider = provider
	})

	// Aggressive fast-skip for en masse runs:
	// if any chapter already exists on disk for this title, skip this series entirely.
	// This avoids expensive provider/API work for partially or fully downloaded series.
	variants := buildTitleVariants(mangaItem.Title)
	if _, diskCount := d.mangaDownloader.CountChaptersByTitles(variants); diskCount > 0 {
		d.logger.Info().
			Str("title", mangaItem.Title).
			Int("found", diskCount).
			Msg("enmasse-manga: Found local chapters on disk; skipping series")
		d.addToSkipped(mangaItem.Title)
		return nil
	}

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
	d.updateDetails(func(details *MangaDownloadDetails) {
		details.Step = "fetching chapters from provider"
		details.MangaID = mangaId
	})

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
		d.updateDetails(func(details *MangaDownloadDetails) {
			details.Step = "searching alternate IDs"
		})
		// Fallback: search by title to resolve alternate IDs and retry
		d.logger.Warn().
			Str("title", mangaItem.Title).
			Str("mangaId", mangaId).
			Msg("enmasse-manga: No chapters found on primary ID, searching for alternate IDs")

		time.Sleep(DelayBetweenAPIRequests)
		searchResults, searchErr := mangaProvider.GetProvider().Search(hibikemanga.SearchOptions{Query: mangaItem.Title})
		if searchErr != nil {
			d.logger.Warn().Err(searchErr).
				Str("title", mangaItem.Title).
				Msg("enmasse-manga: Search fallback failed")
		} else {
			// Pick the first result (already ordered by provider) and retry FindChapters
			for _, res := range searchResults {
				if res == nil || res.ID == "" {
					continue
				}
				altID := res.ID
				d.logger.Info().
					Str("title", mangaItem.Title).
					Str("mangaId", mangaId).
					Str("altId", altID).
					Msg("enmasse-manga: Retrying chapter fetch with alternate ID")

				time.Sleep(DelayBetweenAPIRequests)
				altChapters, altErr := mangaProvider.GetProvider().FindChapters(altID)
				if altErr != nil {
					d.logger.Warn().Err(altErr).
						Str("title", mangaItem.Title).
						Str("altId", altID).
						Msg("enmasse-manga: Alternate ID fetch failed, trying next")
					continue
				}
				if len(altChapters) > 0 {
					chapters = altChapters
					mangaId = altID
					break
				}
			}
		}

		if len(chapters) == 0 {
			return fmt.Errorf("no chapters found on WeebCentral (primary and fallback search)")
		}
	}

	// Quick on-disk check for fully downloaded series.
	// If every provider chapter ID exists in the local series registry, we can skip immediately.
	if len(chapters) > 0 {
		variants := buildTitleVariants(mangaItem.Title)
		bestTitle, diskCount := d.mangaDownloader.CountChaptersByTitles(variants)

		chapterIDs := make([]string, 0, len(chapters))
		for _, chapter := range chapters {
			if chapter == nil || chapter.ID == "" {
				continue
			}
			chapterIDs = append(chapterIDs, chapter.ID)
		}

		if bestTitle != "" && len(chapterIDs) > 0 && d.mangaDownloader.IsSeriesFullyDownloadedByChapterIDs(bestTitle, provider, chapterIDs) {
			d.logger.Info().
				Str("title", mangaItem.Title).
				Str("folder", bestTitle).
				Int("expected", len(chapterIDs)).
				Int("found", diskCount).
				Msg("enmasse-manga: All chapters already on disk by chapter ID; skipping")
			d.addToSkipped(mangaItem.Title)
			return nil
		}
	}

	d.logger.Info().
		Str("title", mangaItem.Title).
		Int("chapterCount", len(chapters)).
		Msg("enmasse-manga: Found chapters on WeebCentral")

	providerTitles := make([]string, 0, len(chapters))
	for _, chapter := range chapters {
		if chapter == nil {
			continue
		}
		providerTitles = append(providerTitles, chapter.Title)
	}
	dynamicPrefix := manga_providers.InferDynamicChapterPrefixForSeries(providerTitles, mangaItem.Title)
	for _, chapter := range chapters {
		if chapter == nil {
			continue
		}
		chapter.Chapter = manga_providers.GetSeasonAwareChapterNumber(chapter.Title, chapter.Chapter)
		normalized := manga_providers.GetNormalizedChapter(chapter.Chapter)
		chapter.Chapter = normalized
		chapter.Title = manga_providers.GetPreferredChapterTitle(dynamicPrefix, chapter.Title, normalized)
	}
	sort.SliceStable(chapters, func(i, j int) bool {
		ci := 0.0
		cj := 0.0
		if chapters[i] != nil {
			if v, err := strconv.ParseFloat(manga_providers.GetDisplayChapterNumber(chapters[i].Chapter), 64); err == nil {
				ci = v
			}
		}
		if chapters[j] != nil {
			if v, err := strconv.ParseFloat(manga_providers.GetDisplayChapterNumber(chapters[j].Chapter), 64); err == nil {
				cj = v
			}
		}
		return ci < cj
	})
	d.updateDetails(func(details *MangaDownloadDetails) {
		details.Step = "resolving AniList / synthetic metadata"
		details.ChapterTotal = len(chapters)
		details.ChapterIndex = 0
		details.QueuedChapters = 0
	})

	// Step 2: Try to find the manga on AniList for proper media ID and folder organization
	// This is optional - if not found, we'll create a synthetic manga entry
	var mediaId int
	var mediaTitle string

	// AniList resolution is decoration: it buys a nicer folder name, a cover, and a planning-list
	// entry. The chapters download either way. So it gets a fixed share of each title's time and no
	// more — without this bound, a walk of ten thousand titles parks on "resolving AniList" for
	// minutes apiece whenever the rate budget is tight, and the queue it exists to fill stays empty.
	searchCtx, cancelSearch := context.WithTimeout(ctx, AniListResolveTimeout)
	searchResult, err := d.searchAniListMangaWithResults(searchCtx, mangaItem.Title)
	cancelSearch()
	if err != nil {
		// Checked against DeadlineExceeded, not just non-nil: cancelSearch above always leaves an
		// error behind, and only the deadline means the lookup actually ran out of time.
		if errors.Is(searchCtx.Err(), context.DeadlineExceeded) {
			d.logger.Warn().
				Str("title", mangaItem.Title).
				Dur("after", AniListResolveTimeout).
				Msg("enmasse-manga: AniList resolution timed out, falling back to synthetic entry")
		}
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
		anilistManga := searchResult.bestMatch
		
		mediaId = anilistManga.ID
		if anilistManga.Title != nil && anilistManga.Title.Romaji != nil {
			mediaTitle = *anilistManga.Title.Romaji
		} else {
			mediaTitle = mangaItem.Title
		}

		// If a synthetic entry already exists for this provider ID, map it to the AniList ID so UI hides the synthetic
		if database := d.mangaRepository.GetDatabase(); database != nil {
			if synthetic, found := database.GetSyntheticMangaByProviderID(DefaultMangaProvider, mangaId); found && synthetic != nil {
				_ = database.SaveMangaIDMapping(synthetic.SyntheticID, mediaId, mangaId)
			}
		}

		d.logger.Info().
			Str("title", mangaItem.Title).
			Int("anilistId", mediaId).
			Str("anilistTitle", mediaTitle).
			Float64("confidence", searchResult.bestScore).
			Msg("enmasse-manga: Found manga on AniList")

		// Add to planning list
		_ = d.addToAniListPlanningList(ctx, anilistManga)
	}

	// Secondary fast-skip after media title resolution.
	// This catches cases where the on-disk folder name differs from the Hakuneko title,
	// but resolves to the AniList/synthetic media title used for downloads.
	if mediaTitle != "" {
		if _, diskCount := d.mangaDownloader.CountChaptersByTitles([]string{mediaTitle}); diskCount > 0 {
			d.logger.Info().
				Str("title", mangaItem.Title).
				Str("mediaTitle", mediaTitle).
				Int("found", diskCount).
				Msg("enmasse-manga: Found local chapters for resolved title; skipping series")
			d.addToSkipped(mangaItem.Title)
			return nil
		}
	}

	// Step 3: Queue all chapters for download using semaphore for rate limiting
	queuedCount := 0
	for chapterIdx, chapter := range chapters {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		d.updateDetails(func(details *MangaDownloadDetails) {
			details.Step = "processing chapter"
			details.CurrentChapterID = chapter.ID
			details.CurrentChapter = chapter.Chapter
			details.ChapterIndex = chapterIdx + 1
			details.ChapterTotal = len(chapters)
			details.PageIndex = 0
			details.PageTotal = 0
		})

		// Skip immediately if chapter already exists on disk.
		// Do this before any provider page fetch to avoid unnecessary API work.
		if d.mangaDownloader.IsChapterAlreadyDownloaded(manga.DownloadChapterDirectOptions{
			Provider:      provider,
			MediaId:       mediaId,
			ChapterId:     chapter.ID,
			ChapterNumber: manga_providers.GetNormalizedChapter(chapter.Chapter),
			MediaTitle:    mediaTitle,
		}) {
			d.logger.Info().
				Str("title", mangaItem.Title).
				Str("chapterId", chapter.ID).
				Msg("enmasse-manga: Chapter already exists on disk, skipping fetch/queue")
			continue
		}

		// Acquire chapter semaphore (context-aware)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case d.chapterSemaphore <- struct{}{}:
		}

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
					select {
					case <-ctx.Done():
						<-d.chapterSemaphore
						return ctx.Err()
					case <-time.After(RateLimitRetryDelay):
					}
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

		d.updateDetails(func(details *MangaDownloadDetails) {
			details.Step = "chapter pages fetched"
			details.PageTotal = len(pages)
		})

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
				ChapterTitle:  chapter.Title,
				MediaTitle:    mediaTitle,
				Pages:         pages,
				StartNow:      false,
				EnMasse:       true,
			})

			if err != nil {
				if d.isQueueFullError(err) {
					d.logger.Info().
						Str("title", mangaItem.Title).
						Str("chapterId", chapter.ID).
						Msg("enmasse-manga: Queue full (50 series limit), waiting for space...")
					d.setStatus(fmt.Sprintf("Queue full - waiting %v for space (processing %s)...", QueueFullRetryDelay, mangaItem.Title))
					select {
					case <-ctx.Done():
						<-d.chapterSemaphore
						return ctx.Err()
					case <-time.After(QueueFullRetryDelay):
					}
					continue
				}
				if d.isRetryableError(err) {
					d.logger.Warn().Err(err).
						Str("title", mangaItem.Title).
						Str("chapterId", chapter.ID).
						Msg("enmasse-manga: Rate limited queuing chapter, waiting to retry...")
					d.setStatus(fmt.Sprintf("Rate limited - waiting %v to retry...", RateLimitRetryDelay))
					select {
					case <-ctx.Done():
						<-d.chapterSemaphore
						return ctx.Err()
					case <-time.After(RateLimitRetryDelay):
					}
					continue
				}
				d.logger.Warn().Err(err).
					Str("title", mangaItem.Title).
					Str("chapterId", chapter.ID).
					Msg("enmasse-manga: Failed to queue chapter download")
			} else {
				queuedCount++
				d.updateDetails(func(details *MangaDownloadDetails) {
					details.Step = "chapter queued"
					details.QueuedChapters = queuedCount
					details.PageIndex = details.PageTotal
				})
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
	d.updateDetails(func(details *MangaDownloadDetails) {
		details.Step = "finished manga queueing"
		details.CurrentChapterID = ""
		details.CurrentChapter = ""
		details.PageIndex = 0
		details.PageTotal = 0
	})

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

type anilistSearchResult struct {
	bestMatch     *anilist.BaseManga
	bestScore     float64
	searchResults []*anilist.BaseManga
}

// minAniListMatchScore is the Sørensen–Dice rating a candidate must reach to be accepted as the
// same series. Deliberately lenient: a wrong AniList match costs a mislabelled folder, while no
// match at all costs nothing but a synthetic entry.
const minAniListMatchScore = 0.4

// findBestAniListMatch picks the candidate whose titles are closest to the search title.
func findBestAniListMatch(title string, candidates []*anilist.BaseManga) (*anilist.BaseManga, float64) {
	var bestMatch *anilist.BaseManga
	bestScore := 0.0

	for _, result := range candidates {
		if result == nil {
			continue
		}
		compRes, found := comparison.FindBestMatchWithSorensenDice(&title, result.GetAllTitles())
		if found && compRes.Value != nil && compRes.Rating > bestScore {
			bestScore = compRes.Rating
			bestMatch = result
		}
	}

	return bestMatch, bestScore
}

// bestMatchScore reports how close the closest candidate is, for deciding whether widening the
// search is worth another request.
func bestMatchScore(title string, candidates []*anilist.BaseManga) float64 {
	_, score := findBestAniListMatch(title, candidates)
	return score
}

func (d *MangaDownloader) searchAniListManga(ctx context.Context, title string) (*anilist.BaseManga, error) {
	result, err := d.searchAniListMangaWithResults(ctx, title)
	if err != nil {
		return nil, err
	}
	return result.bestMatch, nil
}

func (d *MangaDownloader) searchAniListMangaWithResults(ctx context.Context, title string) (*anilistSearchResult, error) {
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

	// Collect all search results from all variants
	allSearchResults := make([]*anilist.BaseManga, 0)
	searchResultsMap := make(map[int]bool) // Track unique manga IDs
	var lastErr error

	// collect runs one search and folds its results in, reporting whether it found anything new.
	// The pacing is acquireAniList's job (12/min) plus the client's own budget; the fixed sleeps
	// that used to sit between these calls only added dead time on top of two limiters that were
	// already spacing the requests further apart than the sleeps did.
	collect := func(searchTitle string, allowFallback bool) (int, error) {
		if err := acquireAniList(ctx, false); err != nil {
			return 0, err
		}

		result, err := anilistClient.SearchBaseManga(ctx, &page, &perPage, nil, &searchTitle, nil)
		// Fallback without the format_not: NOVEL filter, which produces false negatives and 500s
		// for some titles. It costs a second request, so it is only worth spending where the first
		// request actually failed to answer.
		if allowFallback && (err != nil || result == nil || result.Page == nil || len(result.Page.Media) == 0) {
			customRes, cErr := d.searchAniListMangaAllFormats(ctx, searchTitle, page, perPage)
			if cErr == nil {
				result = customRes
				err = nil
			}
		}
		if err != nil {
			return 0, err
		}

		if result == nil || result.Page == nil {
			return 0, nil
		}

		added := 0
		for _, media := range result.Page.Media {
			if media != nil && !searchResultsMap[media.ID] {
				allSearchResults = append(allSearchResults, media)
				searchResultsMap[media.ID] = true
				added++
			}
		}
		return added, nil
	}

	// Try each search variant in turn, most specific first, and stop at the first one that answers.
	// The later variants exist to rescue titles the earlier ones cannot express — running them
	// anyway, after a variant already returned fifteen candidates, buys nothing and costs a request
	// per title across the whole list.
	for _, searchTitle := range searchVariants {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		d.logger.Debug().Str("originalTitle", title).Str("searchTitle", searchTitle).Msg("enmasse-manga: Trying search variant")

		added, err := collect(searchTitle, true)
		if err != nil {
			d.logger.Debug().Err(err).Str("searchTitle", searchTitle).Msg("enmasse-manga: Search variant failed")
			lastErr = err
			continue
		}

		if added > 0 {
			d.logger.Debug().
				Str("searchTitle", searchTitle).
				Int("resultCount", added).
				Msg("enmasse-manga: Search variant returned results")
			break
		}

		d.logger.Debug().Str("searchTitle", searchTitle).Msg("enmasse-manga: Search variant returned no results")
	}

	// Widen with the leading result's English and Romaji titles, but only when nothing already
	// collected is a convincing match. When the first search found the series, these two extra
	// requests only re-find it under another name.
	if len(allSearchResults) > 0 && bestMatchScore(title, allSearchResults) < minAniListMatchScore {
		firstResult := allSearchResults[0]
		additionalSearchTerms := make([]string, 0, 2)

		if firstResult.Title != nil {
			if firstResult.Title.English != nil && *firstResult.Title.English != "" {
				additionalSearchTerms = append(additionalSearchTerms, *firstResult.Title.English)
			}
			if firstResult.Title.Romaji != nil && *firstResult.Title.Romaji != "" {
				additionalSearchTerms = append(additionalSearchTerms, *firstResult.Title.Romaji)
			}
		}

		for _, searchTerm := range additionalSearchTerms {
			if err := ctx.Err(); err != nil {
				return nil, err
			}

			// Skip if we already searched with this term
			alreadySearched := false
			for _, variant := range searchVariants {
				if variant == searchTerm {
					alreadySearched = true
					break
				}
			}
			if alreadySearched {
				continue
			}

			d.logger.Debug().
				Str("originalTitle", title).
				Str("variantTitle", searchTerm).
				Msg("enmasse-manga: Trying English/Romaji variant search")

			added, err := collect(searchTerm, false)
			if err != nil {
				d.logger.Debug().Err(err).Str("searchTitle", searchTerm).Msg("enmasse-manga: Variant search failed")
				continue
			}

			if added > 0 {
				d.logger.Debug().
					Str("searchTitle", searchTerm).
					Int("newResults", added).
					Msg("enmasse-manga: Variant search added results")
			}
		}
	}

	if len(allSearchResults) == 0 {
		if lastErr != nil {
			d.logger.Error().Err(lastErr).Str("title", title).Msg("enmasse-manga: All search variants failed")
			return nil, lastErr
		}
		return nil, fmt.Errorf("no results found for any search variant")
	}

	d.logger.Debug().
		Str("originalTitle", title).
		Int("totalResults", len(allSearchResults)).
		Msg("enmasse-manga: Collected search results from all variants")

	// Find the best match using title comparison across all collected results
	bestMatch, bestScore := findBestAniListMatch(title, allSearchResults)

	if bestScore < minAniListMatchScore || bestMatch == nil {
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

	// Return all search results for match tracking
	return &anilistSearchResult{
		bestMatch:     bestMatch,
		bestScore:     bestScore,
		searchResults: allSearchResults,
	}, nil
}

func (d *MangaDownloader) addToAniListPlanningList(ctx context.Context, mangaMedia *anilist.BaseManga) error {
	if d.database == nil {
		return fmt.Errorf("database not available")
	}
	settings, err := d.database.GetSettings()
	if err != nil {
		return err
	}
	if settings == nil || settings.Library == nil || settings.Library.PlanningSlutToken == "" {
		return fmt.Errorf("planning slut token not configured")
	}

	// En masse downloads should write to the shared Planning Slut AniList account.
	anilistClient := anilist.NewAnilistClient(settings.Library.PlanningSlutToken, d.mangaRepository.GetCacheDir())
	status := anilist.MediaListStatusPlanning
	progress := 0

	_, err = anilistClient.UpdateMediaListEntryProgress(ctx, &mangaMedia.ID, &progress, &status, nil, nil)
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
		// A record created before the series page was being read carries a cover and nothing else.
		// Filling it here means a re-run of the en masse downloader repairs the entries an earlier
		// run left half-described, rather than skipping them forever because they already exist.
		if d.describeSyntheticManga(existing, mangaProvider, providerId) {
			_ = db.UpdateSyntheticManga(existing)
		}
		d.queueMetadataLookup(existing.SyntheticID)
		return existing, nil
	}

	// Generate a synthetic ID (negative to avoid collision with AniList IDs)
	syntheticId := d.generateSyntheticId(providerId)

	// Create synthetic manga entry
	syntheticManga := &models.SyntheticManga{
		SyntheticID: syntheticId,
		Title:       mangaItem.Title,
		Provider:    DefaultMangaProvider,
		ProviderID:  providerId,
		Status:      "RELEASING",
		Chapters:    chapterCount,
	}

	// Described from the provider before it is ever stored, so the card is complete the first time
	// it is drawn rather than blank until a background pass reaches it.
	d.describeSyntheticManga(syntheticManga, mangaProvider, providerId)

	err := db.InsertSyntheticManga(syntheticManga)
	if err != nil {
		return nil, fmt.Errorf("failed to insert synthetic manga: %w", err)
	}

	d.logger.Debug().
		Str("title", mangaItem.Title).
		Int("syntheticId", syntheticId).
		Str("coverImage", syntheticManga.CoverImage).
		Bool("described", syntheticManga.Description != "").
		Msg("enmasse-manga: Created synthetic manga entry")

	// Whether this is really a series of its own is AniList's answer to give, and asking costs a
	// request against a budget this loop is in no position to spend — hundreds of titles, back to
	// back. So it is handed to the background fill, which paces itself and never asks twice.
	d.queueMetadataLookup(syntheticId)

	return syntheticManga, nil
}

// describeSyntheticManga fills in everything the provider knows about a series it is about to file.
//
// The series page is one request and carries the cover, the synopsis, the status, the year, the
// genres and the alternative titles — where the search this used to do carried a cover and nothing
// else, for the same cost. Existing values are never overwritten: a title the user corrected, or a
// cover they chose, is a decision.
// Reports whether anything was filled in, so the caller knows whether a stored record needs saving.
func (d *MangaDownloader) describeSyntheticManga(synthetic *models.SyntheticManga, mangaProvider extension.MangaProviderExtension, providerId string) bool {
	if synthetic == nil || mangaProvider == nil {
		return false
	}
	if strings.TrimSpace(synthetic.CoverImage) != "" && strings.TrimSpace(synthetic.Description) != "" {
		return false
	}

	details, ok := mangaProvider.GetProvider().(manga_providers.MangaDetailsProvider)
	if !ok {
		return false
	}

	time.Sleep(DelayBetweenAPIRequests)
	page, err := details.GetSeriesDetails(providerId)
	if err != nil || page == nil {
		d.logger.Debug().Err(err).Str("providerId", providerId).
			Msg("enmasse-manga: Could not read the provider's page for a series")
		return false
	}

	changed := false
	set := func(field *string, value string) {
		value = strings.TrimSpace(value)
		if value != "" && strings.TrimSpace(*field) == "" {
			*field = value
			changed = true
		}
	}

	set(&synthetic.CoverImage, page.Image)
	set(&synthetic.Description, page.Description)
	set(&synthetic.Genres, strings.Join(page.Tags, ", "))
	set(&synthetic.Synonyms, strings.Join(page.Synonyms, ", "))
	set(&synthetic.Authors, strings.Join(page.Authors, ", "))

	if status := manga.MediaStatusFromProvider(page.Status); status != "" && synthetic.Status != status {
		synthetic.Status = status
		changed = true
	}
	if page.Year > 0 && synthetic.Year == 0 {
		synthetic.Year = page.Year
		changed = true
	}

	return changed
}

// queueMetadataLookup asks the background fill to look this series up on AniList and, if nothing
// there matches it, to finish describing it from the provider.
func (d *MangaDownloader) queueMetadataLookup(syntheticID int) {
	if d.mangaDownloader == nil || d.platformRef == nil || syntheticID == 0 {
		return
	}
	d.mangaDownloader.BackfillMissingMetadata(d.platformRef, []int{syntheticID})
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
