package chapter_downloader

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/util"
)

const (
	QueueStatusNotStarted  QueueStatus = "not_started"
	QueueStatusDownloading QueueStatus = "downloading"
	QueueStatusErrored     QueueStatus = "errored"
)

type (
	// Queue is used to manage the download queue.
	// If feeds the downloader with the next item in the queue.
	Queue struct {
		logger         *zerolog.Logger
		mu             sync.Mutex
		db             *db.Database
		current        *QueueInfo
		runCh          chan *QueueInfo // Channel to tell downloader to run the next item
		active         bool
		wsEventManager events.WSEventManagerInterface
		downloadDir    string // Path to the download directory
	}

	QueueStatus string

	// QueueInfo stores details about the download progress of a chapter.
	QueueInfo struct {
		DownloadID
		Pages          []*hibikemanga.ChapterPage
		DownloadedUrls []string
		Status         QueueStatus
	}
)

func NewQueue(db *db.Database, logger *zerolog.Logger, wsEventManager events.WSEventManagerInterface, runCh chan *QueueInfo, downloadDir string) *Queue {
	return &Queue{
		logger:         logger,
		db:             db,
		runCh:          runCh,
		wsEventManager: wsEventManager,
		downloadDir:    downloadDir,
	}
}

// Add adds a chapter to the download queue.
// It tells the queue to download the next item if possible.
func (q *Queue) Add(id DownloadID, pages []*hibikemanga.ChapterPage, runNext bool) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	marshalled, err := json.Marshal(pages)
	if err != nil {
		q.logger.Error().Err(err).Msgf("Failed to marshal pages for id %v", id)
		return err
	}

	err = q.db.InsertChapterDownloadQueueItem(&models.ChapterDownloadQueueItem{
		BaseModel:     models.BaseModel{},
		Provider:      id.Provider,
		MediaID:       id.MediaId,
		ChapterNumber: id.ChapterNumber,
		ChapterID:     id.ChapterId,
		MediaTitle:    id.MediaTitle,
		PageData:      marshalled,
		Status:        string(QueueStatusNotStarted),
	})
	if err != nil {
		q.logger.Error().Err(err).Msgf("Failed to insert chapter download queue item for id %v", id)
		return err
	}

	q.logger.Info().Msgf("chapter downloader: Added chapter to download queue: %s", id.ChapterId)

	q.wsEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)

	if runNext && q.active {
		// Tells queue to run next if possible
		go q.runNext()
	}

	return nil
}

func (q *Queue) HasCompleted(queueInfo *QueueInfo) {
	q.mu.Lock()

	if queueInfo.Status == QueueStatusErrored {
		q.logger.Warn().Msgf("chapter downloader: Errored %s", queueInfo.DownloadID.ChapterId)
		// Update the status of the current item in the database.
		_ = q.db.UpdateChapterDownloadQueueItemStatus(q.current.DownloadID.Provider, q.current.DownloadID.MediaId, q.current.DownloadID.ChapterId, string(QueueStatusErrored))
	} else {
		q.logger.Debug().Msgf("chapter downloader: Dequeueing %s", queueInfo.DownloadID.ChapterId)
		// Dequeue the item from the database.
		_, err := q.db.DequeueChapterDownloadQueueItem()
		if err != nil {
			q.logger.Error().Err(err).Msgf("Failed to dequeue chapter download queue item for id %v", queueInfo.DownloadID)
			q.mu.Unlock()
			return
		}
	}

	q.wsEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)
	q.wsEventManager.SendEvent(events.RefreshedMangaDownloadData, nil)

	// Reset current item
	q.current = nil
	shouldRunNext := q.active
	q.mu.Unlock()

	if shouldRunNext {
		// Tells queue to run next if possible (in a goroutine to avoid blocking)
		go q.runNext()
	}
}

// Run activates the queue and invokes runNext
func (q *Queue) Run() {
	q.mu.Lock()
	if !q.active {
		q.logger.Debug().Msg("chapter downloader: Starting queue")
	}
	q.active = true
	q.mu.Unlock()

	// Tells queue to run next if possible (in a goroutine to avoid blocking)
	go q.runNext()

	// Safety net: if the queue stalls (e.g. current is nil and nothing running), nudge it periodically
	go q.ensureProgress()
}

// Stop deactivates the queue
func (q *Queue) Stop() {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.active {
		q.logger.Debug().Msg("chapter downloader: Stopping queue")
	}

	q.active = false
}

// ensureProgress nudges the queue in case it stalls (e.g. current cleared but runNext not triggered)
func (q *Queue) ensureProgress() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		q.mu.Lock()
		active := q.active
		hasCurrent := q.current != nil
		q.mu.Unlock()

		if !active {
			return
		}

		if !hasCurrent {
			// Kick runNext in a goroutine to avoid blocking the ticker
			go q.runNext()
		}
	}
}

// runNext runs the next item in the queue.
//   - Checks if there is a current item, if so, it returns.
//   - If nothing is running, it gets the next item (QueueInfo) from the database, sets it as current and sends it to the downloader.
func (q *Queue) runNext() {
	q.mu.Lock()

	q.logger.Debug().Msg("chapter downloader: Processing next item in queue")

	// Catch panic in runNext, so it doesn't bubble up and stop goroutines.
	defer util.HandlePanicInModuleThen("internal/manga/downloader/runNext", func() {
		q.logger.Error().Msg("chapter downloader: Panic in 'runNext'")
	})

	if !q.active {
		q.logger.Debug().Msg("chapter downloader: Queue is not active")
		q.mu.Unlock()
		return
	}

	if q.current != nil {
		q.logger.Debug().Msg("chapter downloader: Current item is not nil")
		q.mu.Unlock()
		return
	}

	q.logger.Debug().Msg("chapter downloader: Checking next item in queue")

	// Get next item from the database.
	next, _ := q.db.GetNextChapterDownloadQueueItem()
	if next == nil {
		q.logger.Debug().Msg("chapter downloader: No next item in queue")
		q.mu.Unlock()
		return
	}

	// Check if this series should be auto-skipped (already mostly downloaded)
	if q.shouldSkipSeries(next.Provider, next.MediaID) {
		q.logger.Info().
			Int("mediaId", next.MediaID).
			Str("provider", next.Provider).
			Msg("chapter downloader: Series already mostly downloaded, skipping all queued chapters")
		
		// Dequeue all chapters for this series
		q.dequeueAllChaptersForSeries(next.Provider, next.MediaID)
		q.mu.Unlock()
		
		// Try next item
		go q.runNext()
		return
	}

	id := DownloadID{
		Provider:      next.Provider,
		MediaId:       next.MediaID,
		ChapterId:     next.ChapterID,
		ChapterNumber: next.ChapterNumber,
		MediaTitle:    next.MediaTitle,
	}

	q.logger.Debug().Msgf("chapter downloader: Preparing next item in queue: %s", id.ChapterId)

	q.wsEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)
	// Update status
	_ = q.db.UpdateChapterDownloadQueueItemStatus(id.Provider, id.MediaId, id.ChapterId, string(QueueStatusDownloading))

	// Set the current item.
	q.current = &QueueInfo{
		DownloadID:     id,
		DownloadedUrls: make([]string, 0),
		Status:         QueueStatusDownloading,
	}

	// Unmarshal the page data.
	err := json.Unmarshal(next.PageData, &q.current.Pages)
	if err != nil {
		q.logger.Error().Err(err).Msgf("Failed to unmarshal pages for id %v", id)
		_ = q.db.UpdateChapterDownloadQueueItemStatus(id.Provider, id.MediaId, id.ChapterId, string(QueueStatusNotStarted))
		q.current = nil
		q.mu.Unlock()
		return
	}

	currentItem := q.current
	q.mu.Unlock()

	// Delay outside of the lock to prevent blocking other operations
	time.Sleep(5 * time.Second)

	// Check if queue is still active after the delay
	q.mu.Lock()
	if !q.active {
		q.logger.Debug().Msg("chapter downloader: Queue became inactive during delay")
		q.current = nil
		_ = q.db.UpdateChapterDownloadQueueItemStatus(id.Provider, id.MediaId, id.ChapterId, string(QueueStatusNotStarted))
		q.mu.Unlock()
		return
	}
	q.mu.Unlock()

	q.logger.Info().Msgf("chapter downloader: Running next item in queue: %s", id.ChapterId)

	// Tell Downloader to run
	q.runCh <- currentItem
}

// shouldSkipSeries checks if a series is already mostly downloaded (within 10% threshold)
// by comparing the number of downloaded chapters on disk vs queued chapters
func (q *Queue) shouldSkipSeries(provider string, mediaID int) bool {
	// Get count of queued chapters for this series
	queuedCount, err := q.db.GetChapterDownloadQueueCountForSeries(provider, mediaID)
	if err != nil || queuedCount == 0 {
		return false
	}

	// Get count of downloaded chapters on disk for this series
	downloadedCount := q.getDownloadedChapterCount(provider, mediaID)
	if downloadedCount == 0 {
		return false
	}

	// Calculate the threshold (10% tolerance)
	// If downloaded chapters are within 10% of queued chapters, skip the series
	threshold := float64(queuedCount) * 0.9
	
	q.logger.Debug().
		Int("mediaId", mediaID).
		Str("provider", provider).
		Int("downloaded", downloadedCount).
		Int("queued", queuedCount).
		Float64("threshold", threshold).
		Msgf("chapter downloader: Checking if series should be skipped")

	// Skip if downloaded count is >= 90% of queued count
	return float64(downloadedCount) >= threshold
}

// getDownloadedChapterCount counts the number of downloaded chapters on disk for a series
func (q *Queue) getDownloadedChapterCount(provider string, mediaID int) int {
	if q.downloadDir == "" {
		return 0
	}

	// Read the download directory
	// The structure is: downloadDir/{mediaId}/{provider}_{mediaId}_{chapterId}_{chapterNumber}/
	mediaDir := filepath.Join(q.downloadDir, fmt.Sprintf("%d", mediaID))
	
	entries, err := os.ReadDir(mediaDir)
	if err != nil {
		// Directory doesn't exist or can't be read - no chapters downloaded
		return 0
	}

	count := 0
	prefix := FormatChapterDirPrefix(provider, mediaID)
	
	for _, entry := range entries {
		if entry.IsDir() && len(entry.Name()) > len(prefix) && entry.Name()[:len(prefix)] == prefix {
			// Verify this is a valid chapter directory by checking for registry.json
			registryPath := filepath.Join(mediaDir, entry.Name(), "registry.json")
			if _, err := os.Stat(registryPath); err == nil {
				count++
			}
		}
	}

	return count
}

// dequeueAllChaptersForSeries removes all queued chapters for a specific series
func (q *Queue) dequeueAllChaptersForSeries(provider string, mediaID int) {
	err := q.db.DeleteChapterDownloadQueueItemsForSeries(provider, mediaID)
	if err != nil {
		q.logger.Error().Err(err).
			Int("mediaId", mediaID).
			Str("provider", provider).
			Msg("chapter downloader: Failed to dequeue all chapters for series")
	} else {
		q.logger.Info().
			Int("mediaId", mediaID).
			Str("provider", provider).
			Msg("chapter downloader: Dequeued all chapters for series")
		
		q.wsEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

func (q *Queue) GetCurrent() (qi *QueueInfo, ok bool) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.current == nil {
		return nil, false
	}

	return q.current, true
}
