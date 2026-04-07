package chapter_downloader

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"seanime/internal/database/db"
	"seanime/internal/events"
	hibikemanga "seanime/internal/extension/hibike/manga"
	manga_providers "seanime/internal/manga/providers"
	"seanime/internal/util"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
	_ "golang.org/x/image/bmp"  // Register BMP format
	_ "golang.org/x/image/tiff" // Register Tiff format
)

// 📁 cache/manga
// └── 📁 {provider}_{mediaId}_{chapterId}_{chapterNumber}      <- Downloader generates
//     ├── 📄 registry.json						                <- Contains Registry
//     ├── 📄 1.jpg
//     ├── 📄 2.jpg
//     └── 📄 ...
//

type (
	// Downloader is used to download chapters from various manga providers.
	Downloader struct {
		logger          *zerolog.Logger
		wsEventManager  events.WSEventManagerInterface
		database        *db.Database
		downloadDir     string
		mu              sync.Mutex
		downloadMu      sync.Mutex
		registryManager *SeriesRegistryManager
		// cancelChannel is used to cancel some or all downloads.
		cancelChannels      map[DownloadID]chan struct{}
		queue               *Queue
		cancelCh            chan struct{}   // Close to cancel the download process
		runCh               chan *QueueInfo // Receives a signal to download the next item
		chapterDownloadedCh chan DownloadID // Sends a signal when a chapter has been downloaded
	}

	//+-------------------------------------------------------------------------------------------------------------------+

	DownloadID struct {
		Provider      string `json:"provider"`
		MediaId       int    `json:"mediaId"`
		ChapterId     string `json:"chapterId"`
		ChapterNumber string `json:"chapterNumber"`
		ChapterTitle  string `json:"chapterTitle"`  // Chapter title for folder naming
		MediaTitle    string `json:"mediaTitle"`     // Romaji title for folder naming
	}

	//+-------------------------------------------------------------------------------------------------------------------+

	// Registry stored in 📄 registry.json for each chapter download.
	// DEPRECATED: Use SeriesRegistry instead. Kept for migration compatibility.
	Registry map[int]PageInfo

	PageInfo struct {
		Index       int    `json:"index"`
		Filename    string `json:"filename"`
		OriginalURL string `json:"original_url"`
		Size        int64  `json:"size"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
	}
)

type (
	NewDownloaderOptions struct {
		Logger         *zerolog.Logger
		WSEventManager events.WSEventManagerInterface
		DownloadDir    string
		Database       *db.Database
	}

	DownloadOptions struct {
		DownloadID
		Pages    []*hibikemanga.ChapterPage
		StartNow bool
	}
)

func NewDownloader(opts *NewDownloaderOptions) *Downloader {
	runCh := make(chan *QueueInfo, 1)

	d := &Downloader{
		logger:              opts.Logger,
		wsEventManager:      opts.WSEventManager,
		downloadDir:         opts.DownloadDir,
		database:            opts.Database,
		registryManager:     NewSeriesRegistryManager(opts.Logger),
		cancelChannels:      make(map[DownloadID]chan struct{}),
		runCh:               runCh,
		queue:               NewQueue(opts.Database, opts.Logger, opts.WSEventManager, runCh, opts.DownloadDir),
		chapterDownloadedCh: make(chan DownloadID, 100),
	}

	return d
}

// Start spins up a goroutine that will listen to queue events.
func (cd *Downloader) Start() {
	go func() {
		for {
			select {
			// Listen for new queue items
			case queueInfo := <-cd.runCh:
				cd.logger.Debug().Msgf("chapter downloader: Received queue item to download: %s", queueInfo.ChapterId)
				cd.run(queueInfo)
			}
		}
	}()
}

func (cd *Downloader) ChapterDownloaded() <-chan DownloadID {
	return cd.chapterDownloadedCh
}

// AddToQueue adds a chapter to the download queue.
// If the chapter is already downloaded (i.e. a folder already exists), it will delete the previous data and re-download it.
func (cd *Downloader) AddToQueue(opts DownloadOptions) error {
	cd.mu.Lock()
	defer cd.mu.Unlock()

	downloadId := opts.DownloadID

	// Get series directory and registry
	seriesDir := cd.getSeriesDir(downloadId)
	registry, err := cd.registryManager.GetRegistry(seriesDir)
	if err != nil {
		cd.logger.Error().Err(err).Msg("chapter downloader: Failed to load series registry")
		return err
	}

	// Check if chapter is already downloaded (in registry)
	if existingEntry, folderName, found := registry.GetChapterByID(downloadId.ChapterId); found {
		cd.logger.Warn().Str("folder", folderName).Msg("chapter downloader: chapter already exists, deleting")
		// Delete the existing chapter folder
		chapterDir := filepath.Join(seriesDir, existingEntry.FolderName)
		_ = os.RemoveAll(chapterDir)
		// Remove from registry
		registry.RemoveChapter(folderName)
		_ = cd.registryManager.SaveRegistry(seriesDir, registry)
	}

	// Start download
	cd.logger.Debug().Msgf("chapter downloader: Adding chapter to download queue: %s", opts.ChapterId)
	// Add to queue
	return cd.queue.Add(downloadId, opts.Pages, opts.StartNow)
}

// DeleteChapter deletes a chapter directory from the download directory.
func (cd *Downloader) DeleteChapter(id DownloadID) error {
	cd.mu.Lock()
	defer cd.mu.Unlock()

	cd.logger.Debug().Msgf("chapter downloader: Deleting chapter %s", id.ChapterId)

	seriesDir := cd.getSeriesDir(id)
	registry, err := cd.registryManager.GetRegistry(seriesDir)
	if err != nil {
		cd.logger.Error().Err(err).Msg("chapter downloader: Failed to load series registry")
		return err
	}

	// Find the chapter in registry
	if entry, folderName, found := registry.GetChapterByID(id.ChapterId); found {
		chapterDir := filepath.Join(seriesDir, entry.FolderName)
		_ = os.RemoveAll(chapterDir)
		registry.RemoveChapter(folderName)
		_ = cd.registryManager.SaveRegistry(seriesDir, registry)
		cd.logger.Debug().Msgf("chapter downloader: Removed chapter %s (folder: %s)", id.ChapterId, folderName)
	} else {
		// Fallback: try old format directory
		_ = os.RemoveAll(cd.getChapterDownloadDirLegacy(id))
		cd.logger.Debug().Msgf("chapter downloader: Removed chapter %s (legacy format)", id.ChapterId)
	}

	return nil
}

// Run starts the downloader if it's not already running.
func (cd *Downloader) Run() {
	cd.mu.Lock()
	defer cd.mu.Unlock()

	cd.logger.Debug().Msg("chapter downloader: Starting queue")

	cd.cancelCh = make(chan struct{})

	cd.queue.Run()
}

// Stop cancels the download process and stops the queue from running.
func (cd *Downloader) Stop() {
	cd.mu.Lock()
	defer cd.mu.Unlock()

	// Close the existing cancelCh to signal running downloads to stop
	if cd.cancelCh != nil {
		select {
		case <-cd.cancelCh:
			// Already closed, do nothing
		default:
			close(cd.cancelCh)
		}
	}

	cd.queue.Stop()
}

// run downloads the chapter based on the QueueInfo provided.
// This is called successively for each current item being processed.
// It invokes downloadChapterImages to download the chapter pages.
func (cd *Downloader) run(queueInfo *QueueInfo) {

	defer util.HandlePanicInModuleThen("internal/manga/downloader/runNext", func() {
		cd.logger.Error().Msg("chapter downloader: Panic in 'run'")
		// Ensure queue moves on even after panic
		queueInfo.Status = QueueStatusErrored
		cd.queue.HasCompleted(queueInfo)
	})

	// Download chapter images
	if err := cd.downloadChapterImages(queueInfo); err != nil {
		// Mark as errored and notify queue to move on
		queueInfo.Status = QueueStatusErrored
		cd.queue.HasCompleted(queueInfo)
		return
	}

	// Success - notify queue and send to channel
	cd.queue.HasCompleted(queueInfo)
	cd.chapterDownloadedCh <- queueInfo.DownloadID
}

// downloadChapterImages creates a directory for the chapter and downloads each image to that directory.
// It updates the series-level registry.json with chapter metadata.
//
//	e.g.,
//	📁 {MediaTitle}/
//	   ├── 📄 registry.json     <- Series-level registry with all chapter metadata
//	   ├── � {ChapterTitle}/   <- e.g., "Torture 523", "Chapter 52", "#23"
//	   │   ├── 📄 01.jpg
//	   │   ├── 📄 02.jpg
//	   │   └── 📄 ...
func (cd *Downloader) downloadChapterImages(queueInfo *QueueInfo) (err error) {
	downloadId := queueInfo.DownloadID

	// Get series directory
	seriesDir := cd.getSeriesDir(downloadId)
	if err = os.MkdirAll(seriesDir, os.ModePerm); err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to create series directory for chapter %s", queueInfo.ChapterId)
		return err
	}

	// Load or create series registry
	seriesRegistry, err := cd.registryManager.GetRegistry(seriesDir)
	if err != nil {
		cd.logger.Error().Err(err).Msg("chapter downloader: Failed to load series registry")
		return err
	}

	// Update series-level metadata
	if seriesRegistry.MediaId == 0 {
		seriesRegistry.MediaId = downloadId.MediaId
	}
	if seriesRegistry.Provider == "" {
		seriesRegistry.Provider = downloadId.Provider
	}

	// Generate folder name from chapter title
	folderName := seriesRegistry.GenerateUniqueFolderName(downloadId.ChapterTitle, downloadId.ChapterNumber)
	destination := filepath.Join(seriesDir, folderName)

	if err = os.MkdirAll(destination, os.ModePerm); err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to create download directory for chapter %s", queueInfo.ChapterId)
		return err
	}

	cd.logger.Debug().Msgf("chapter downloader: Downloading chapter %s images to %s", queueInfo.ChapterId, destination)

	pageRegistry := make(map[int]PageInfo)

	// calculateBatchSize calculates the batch size based on the number of URLs.
	calculateBatchSize := func(numURLs int) int {
		maxBatchSize := 3 // Reduced from 5 to 3 for better rate limiting
		batchSize := numURLs / 10
		if batchSize < 1 {
			return 1
		} else if batchSize > maxBatchSize {
			return maxBatchSize
		}
		return batchSize
	}

	// Download images
	batchSize := calculateBatchSize(len(queueInfo.Pages))

	var wg sync.WaitGroup
	var downloadedCount int32
	semaphore := make(chan struct{}, batchSize) // Semaphore to control concurrency
	for _, page := range queueInfo.Pages {
		// Check cancel before acquiring semaphore to avoid blocking on cancelled downloads
		select {
		case <-cd.cancelCh:
			wg.Wait()
			return fmt.Errorf("chapter downloader: Download cancelled")
		default:
		}
		semaphore <- struct{}{} // Acquire semaphore
		wg.Add(1)
		go func(page *hibikemanga.ChapterPage, registry *map[int]PageInfo) {
			defer func() {
				<-semaphore // Release semaphore
				wg.Done()
			}()
			select {
			case <-cd.cancelCh:
				return
			default:
				// Retry page download up to 3 times
				for attempt := 0; attempt < 3; attempt++ {
					select {
					case <-cd.cancelCh:
						return
					default:
					}
					cd.downloadPageToRegistry(page, destination, registry)
					cd.downloadMu.Lock()
					_, ok := (*registry)[page.Index]
					cd.downloadMu.Unlock()
					if ok {
						break // Success
					}
					if attempt < 2 {
						cd.logger.Warn().Int("attempt", attempt+1).Str("url", page.URL).Msg("chapter downloader: Retrying failed page download")
						time.Sleep(2 * time.Second)
					}
				}
				cd.downloadMu.Lock()
				_, ok := (*registry)[page.Index]
				cd.downloadMu.Unlock()
				if ok {
					// Update progress after each page
					newCount := atomic.AddInt32(&downloadedCount, 1)
					_ = cd.database.UpdateChapterDownloadProgress(queueInfo.Provider, queueInfo.MediaId, queueInfo.ChapterId, int(newCount))
					cd.wsEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)
				}
			}
		}(page, &pageRegistry)
	}
	wg.Wait()

	// Verify all images have been downloaded
	allDownloaded := true
	for _, page := range queueInfo.Pages {
		if _, ok := pageRegistry[page.Index]; !ok {
			allDownloaded = false
			break
		}
	}

	if !allDownloaded {
		cd.logger.Error().Msg("chapter downloader: Not all images have been downloaded, aborting")
		queueInfo.Status = QueueStatusErrored
		// Delete directory
		go os.RemoveAll(destination)
		return fmt.Errorf("chapter downloader: Not all images have been downloaded, operation aborted")
	}

	// Create chapter entry and add to series registry
	chapterEntry := &ChapterEntry{
		ChapterId:     downloadId.ChapterId,
		ChapterNumber: downloadId.ChapterNumber,
		ChapterTitle:  downloadId.ChapterTitle,
		Provider:      downloadId.Provider,
		FolderName:    folderName,
		Pages:         pageRegistry,
	}
	seriesRegistry.AddChapter(folderName, chapterEntry)

	// Save series registry
	if err = cd.registryManager.SaveRegistry(seriesDir, seriesRegistry); err != nil {
		cd.logger.Error().Err(err).Msg("chapter downloader: Failed to save series registry")
		return err
	}

	cd.logger.Info().Msgf("chapter downloader: Finished downloading chapter %s (folder: %s)", queueInfo.ChapterId, folderName)

	return
}

// downloadPage downloads a single page from the URL and saves it to the destination directory.
// It also updates the Registry with the page information.
// DEPRECATED: Use downloadPageToRegistry instead.
func (cd *Downloader) downloadPage(page *hibikemanga.ChapterPage, destination string, registry *Registry) {

	defer util.HandlePanicInModuleThen("manga/downloader/downloadImage", func() {
	})

	// Download image from URL

	imgID := fmt.Sprintf("%02d", page.Index+1)

	buf, err := manga_providers.GetImageByProxy(page.URL, page.Headers)
	if err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to get image from URL %s", page.URL)
		return
	}

	// Get the image format
	config, format, err := image.DecodeConfig(bytes.NewReader(buf))
	if err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to decode image format from URL %s", page.URL)
		return
	}

	filename := imgID + "." + format

	// Create the file
	filePath := filepath.Join(destination, filename)
	file, err := os.Create(filePath)
	if err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to create file for image %s", imgID)
		return
	}
	defer file.Close()

	// Copy the image data to the file
	_, err = io.Copy(file, bytes.NewReader(buf))
	if err != nil {
		cd.logger.Error().Err(err).Msgf("image downloader: Failed to write image data to file for image from %s", page.URL)
		return
	}

	// Update registry
	cd.downloadMu.Lock()
	(*registry)[page.Index] = PageInfo{
		Index:       page.Index,
		Width:       config.Width,
		Height:      config.Height,
		Filename:    filename,
		OriginalURL: page.URL,
		Size:        int64(len(buf)),
	}
	cd.downloadMu.Unlock()

	return
}

// downloadPageToRegistry downloads a single page and updates the page registry map.
func (cd *Downloader) downloadPageToRegistry(page *hibikemanga.ChapterPage, destination string, registry *map[int]PageInfo) {

	defer util.HandlePanicInModuleThen("manga/downloader/downloadPageToRegistry", func() {
	})

	// Download image from URL
	imgID := fmt.Sprintf("%02d", page.Index+1)

	buf, err := manga_providers.GetImageByProxy(page.URL, page.Headers)
	if err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to get image from URL %s", page.URL)
		return
	}

	// Get the image format
	config, format, err := image.DecodeConfig(bytes.NewReader(buf))
	if err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to decode image format from URL %s", page.URL)
		return
	}

	filename := imgID + "." + format

	// Create the file
	filePath := filepath.Join(destination, filename)
	file, err := os.Create(filePath)
	if err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to create file for image %s", imgID)
		return
	}
	defer file.Close()

	// Copy the image data to the file
	_, err = io.Copy(file, bytes.NewReader(buf))
	if err != nil {
		cd.logger.Error().Err(err).Msgf("chapter downloader: Failed to write image data to file for image from %s", page.URL)
		return
	}

	// Update registry
	cd.downloadMu.Lock()
	(*registry)[page.Index] = PageInfo{
		Index:       page.Index,
		Width:       config.Width,
		Height:      config.Height,
		Filename:    filename,
		OriginalURL: page.URL,
		Size:        int64(len(buf)),
	}
	cd.downloadMu.Unlock()
}

////////////////////////

// save saves the Registry content to a file in the chapter directory.
func (r *Registry) save(queueInfo *QueueInfo, destination string, logger *zerolog.Logger) (err error) {

	defer util.HandlePanicInModuleThen("manga/downloader/save", func() {
		err = fmt.Errorf("chapter downloader: Failed to save registry content")
	})

	// Verify all images have been downloaded
	allDownloaded := true
	for _, page := range queueInfo.Pages {
		if _, ok := (*r)[page.Index]; !ok {
			allDownloaded = false
			break
		}
	}

	if !allDownloaded {
		// Clean up downloaded images
		logger.Error().Msg("chapter downloader: Not all images have been downloaded, aborting")
		queueInfo.Status = QueueStatusErrored
		// Delete directory
		go os.RemoveAll(destination)
		return fmt.Errorf("chapter downloader: Not all images have been downloaded, operation aborted")
	}

	// Create registry file
	var data []byte
	data, err = json.Marshal(*r)
	if err != nil {
		return err
	}

	registryFilePath := filepath.Join(destination, "registry.json")
	err = os.WriteFile(registryFilePath, data, 0644)
	if err != nil {
		return err
	}

	return
}

// getSeriesDir returns the series directory path for a download
func (cd *Downloader) getSeriesDir(downloadId DownloadID) string {
	mediaDir := downloadId.MediaTitle
	if mediaDir == "" {
		mediaDir = fmt.Sprintf("%d", downloadId.MediaId)
	}
	return filepath.Join(cd.downloadDir, mediaDir)
}

// getChapterDownloadDir returns the chapter directory path using the series registry
// This looks up the folder name from the registry for existing chapters
func (cd *Downloader) getChapterDownloadDir(downloadId DownloadID) string {
	seriesDir := cd.getSeriesDir(downloadId)
	
	// Try to find the chapter in the registry
	registry, err := cd.registryManager.GetRegistry(seriesDir)
	if err == nil {
		if entry, _, found := registry.GetChapterByID(downloadId.ChapterId); found {
			return filepath.Join(seriesDir, entry.FolderName)
		}
	}
	
	// Fallback: generate a new folder name
	folderName := SanitizeFolderName(downloadId.ChapterTitle)
	if folderName == "" {
		folderName = fmt.Sprintf("Chapter %s", downloadId.ChapterNumber)
	}
	return filepath.Join(seriesDir, folderName)
}

// getChapterDownloadDirLegacy returns the chapter directory path using the old format
// Used for backwards compatibility during deletion
func (cd *Downloader) getChapterDownloadDirLegacy(downloadId DownloadID) string {
	mediaDir := downloadId.MediaTitle
	if mediaDir == "" {
		mediaDir = fmt.Sprintf("%d", downloadId.MediaId)
	}
	
	var chapterDirName string
	if downloadId.ChapterTitle != "" {
		chapterDirName = FormatChapterDirNameWithTitle(downloadId.Provider, downloadId.MediaId, downloadId.ChapterId, downloadId.ChapterTitle, downloadId.ChapterNumber)
	} else {
		chapterDirName = FormatChapterDirName(downloadId.Provider, downloadId.MediaId, downloadId.ChapterId, downloadId.ChapterNumber)
	}
	
	return filepath.Join(cd.downloadDir, mediaDir, chapterDirName)
}

func FormatChapterDirName(provider string, mediaId int, chapterId string, chapterNumber string) string {
	// Legacy format for backward compatibility
	return fmt.Sprintf("%s_%d_%s_%s", provider, mediaId, EscapeChapterID(chapterId), chapterNumber)
}

func FormatChapterDirNameWithTitle(provider string, mediaId int, chapterId string, chapterTitle string, chapterNumber string) string {
	// New format with chapter title
	// Sanitize chapter title for filesystem
	sanitizedTitle := SanitizeChapterTitle(chapterTitle)
	if sanitizedTitle == "" {
		// Fallback to legacy format if title is empty
		return FormatChapterDirName(provider, mediaId, chapterId, chapterNumber)
	}
	return fmt.Sprintf("%s_%d_%s_%s_%s", provider, mediaId, EscapeChapterID(chapterId), sanitizedTitle, chapterNumber)
}

func SanitizeChapterTitle(title string) string {
	// First escape underscores in the original title to prevent parsing conflicts
	title = strings.ReplaceAll(title, "_", "$UNDERSCORE$")
	
	// Replace spaces with underscores
	title = strings.ReplaceAll(title, " ", "_")
	
	// Replace "/" with "-" specifically (as requested)
	title = strings.ReplaceAll(title, "/", "-")
	
	// Remove other invalid filesystem characters (excluding "/" which we already handled)
	invalidChars := []string{"\\"}
	for _, char := range invalidChars {
		title = strings.ReplaceAll(title, char, "")
	}
	
	// Limit length to avoid filesystem issues
	if len(title) > 100 {
		title = title[:100]
	}
	
	return title
}

func FormatChapterDirPrefix(provider string, mediaId int) string {
	return fmt.Sprintf("%s_%d_", provider, mediaId)
}

// ParseChapterDirName parses a chapter directory name and returns the DownloadID.
// Supports both formats:
// - Legacy: provider_mediaId_chapterId_chapterNumber
// - New: provider_mediaId_chapterId_chapterTitle_chapterNumber
// - Old buggy format: provider_mediaId_chapterId_title_parts_chapterNumber (where title had underscores)
func ParseChapterDirName(dirName string) (id DownloadID, ok bool) {
	parts := strings.Split(dirName, "_")
	
	// Need at least 4 parts for any valid format
	if len(parts) < 4 {
		return id, false
	}
	
	// Extract provider and mediaId first (common to all formats)
	id.Provider = parts[0]
	var err error
	id.MediaId, err = strconv.Atoi(parts[1])
	if err != nil {
		return id, false
	}
	
	// Try new format first (5+ parts with proper escaping)
	if len(parts) >= 5 {
		id.ChapterId = UnescapeChapterID(parts[2])
		
		// Chapter title is everything between chapterId and the last part (chapter number)
		// Join all middle parts as the title
		titleParts := parts[3 : len(parts)-1]
		id.ChapterTitle = strings.Join(titleParts, "_")
		
		// Unescape the chapter title
		id.ChapterTitle = strings.ReplaceAll(id.ChapterTitle, "$UNDERSCORE$", "_")
		
		// Last part is the chapter number
		id.ChapterNumber = parts[len(parts)-1]
		
		ok = true
		return
	}
	
	// Legacy format (exactly 4 parts)
	if len(parts) == 4 {
		id.ChapterId = UnescapeChapterID(parts[2])
		id.ChapterNumber = parts[3]
		id.ChapterTitle = "" // No title in legacy format
		
		ok = true
		return
	}
	
	return id, false
}

func EscapeChapterID(id string) string {
	id = strings.ReplaceAll(id, "/", "$SLASH$")
	id = strings.ReplaceAll(id, "\\", "$BSLASH$")
	id = strings.ReplaceAll(id, ":", "$COLON$")
	id = strings.ReplaceAll(id, "*", "$ASTERISK$")
	id = strings.ReplaceAll(id, "?", "$QUESTION$")
	id = strings.ReplaceAll(id, "\"", "$QUOTE$")
	id = strings.ReplaceAll(id, "<", "$LT$")
	id = strings.ReplaceAll(id, ">", "$GT$")
	id = strings.ReplaceAll(id, "|", "$PIPE$")
	id = strings.ReplaceAll(id, ".", "$DOT$")
	id = strings.ReplaceAll(id, " ", "$SPACE$")
	id = strings.ReplaceAll(id, "_", "$UNDERSCORE$")
	return id
}

func UnescapeChapterID(id string) string {
	id = strings.ReplaceAll(id, "$SLASH$", "/")
	id = strings.ReplaceAll(id, "$BSLASH$", "\\")
	id = strings.ReplaceAll(id, "$COLON$", ":")
	id = strings.ReplaceAll(id, "$ASTERISK$", "*")
	id = strings.ReplaceAll(id, "$QUESTION$", "?")
	id = strings.ReplaceAll(id, "$QUOTE$", "\"")
	id = strings.ReplaceAll(id, "$LT$", "<")
	id = strings.ReplaceAll(id, "$GT$", ">")
	id = strings.ReplaceAll(id, "$PIPE$", "|")
	id = strings.ReplaceAll(id, "$DOT$", ".")
	id = strings.ReplaceAll(id, "$SPACE$", " ")
	id = strings.ReplaceAll(id, "$UNDERSCORE$", "_")
	return id
}

// NOTE: Directory names are now taken raw from MediaTitle (no sanitization) per user request.

// getChapterRegistryPath returns the series registry path (not per-chapter)
func (cd *Downloader) getChapterRegistryPath(downloadId DownloadID) string {
	return filepath.Join(cd.getSeriesDir(downloadId), "registry.json")
}

// GetRegistryManager returns the series registry manager
func (cd *Downloader) GetRegistryManager() *SeriesRegistryManager {
	return cd.registryManager
}
