package handlers

import (
	"seanime/internal/events"
	"seanime/internal/manga"
	"seanime/internal/util"
	"sync"
	"time"
)

// Chapters picked in the UI are added to the download queue by a single background worker,
// one chapter every five seconds.
//
// Queueing a chapter is not free: it fetches the chapter's page list from the provider, one
// network request each. Doing that inline kept the HTTP request open for minutes on a large
// selection and tied the work to the page staying open, and doing it without pacing hammers
// the provider. The worker outlives the request, so queueing carries on whether or not the
// user stays on (or even opens) the manga page.
const chapterQueueingInterval = 5 * time.Second

type chapterQueueingJob struct {
	ProfileID  uint
	Provider   string
	MediaID    int
	MediaTitle string
	ChapterID  string
	StartNow   bool
}

var chapterQueueing = struct {
	mu      sync.Mutex
	pending []chapterQueueingJob
	running bool
}{}

// ChapterQueueingPendingCount returns how many chapters are still waiting to be added to the
// download queue.
func ChapterQueueingPendingCount() int {
	chapterQueueing.mu.Lock()
	defer chapterQueueing.mu.Unlock()
	return len(chapterQueueing.pending)
}

// queueChaptersInBackground schedules the chapters and starts the worker if it isn't running.
// Returns the number of chapters actually scheduled (duplicates are dropped).
func (h *Handler) queueChaptersInBackground(jobs []chapterQueueingJob) int {
	if len(jobs) == 0 {
		return 0
	}

	chapterQueueing.mu.Lock()

	added := 0
	for _, job := range jobs {
		if job.ChapterID == "" || job.Provider == "" || job.MediaID == 0 {
			continue
		}
		// A double click on "download selected" must not queue everything twice.
		duplicate := false
		for _, pending := range chapterQueueing.pending {
			if pending.Provider == job.Provider && pending.MediaID == job.MediaID && pending.ChapterID == job.ChapterID {
				duplicate = true
				break
			}
		}
		if duplicate {
			continue
		}
		chapterQueueing.pending = append(chapterQueueing.pending, job)
		added++
	}

	startWorker := added > 0 && !chapterQueueing.running
	if startWorker {
		chapterQueueing.running = true
	}

	chapterQueueing.mu.Unlock()

	if startWorker {
		go h.runChapterQueueingWorker()
	}

	return added
}

func (h *Handler) runChapterQueueingWorker() {
	defer util.HandlePanicInModuleThen("handlers/runChapterQueueingWorker", func() {
		chapterQueueing.mu.Lock()
		chapterQueueing.running = false
		chapterQueueing.mu.Unlock()
	})

	for {
		chapterQueueing.mu.Lock()
		if len(chapterQueueing.pending) == 0 {
			chapterQueueing.running = false
			chapterQueueing.mu.Unlock()
			return
		}
		job := chapterQueueing.pending[0]
		chapterQueueing.pending = chapterQueueing.pending[1:]
		remaining := len(chapterQueueing.pending)
		chapterQueueing.mu.Unlock()

		err := h.App.MangaDownloader.DownloadChapter(manga.DownloadChapterOptions{
			ProfileID:  job.ProfileID,
			Provider:   job.Provider,
			MediaId:    job.MediaID,
			ChapterId:  job.ChapterID,
			StartNow:   job.StartNow,
			MediaTitle: job.MediaTitle,
		})
		if err != nil {
			h.App.Logger.Warn().Err(err).
				Str("provider", job.Provider).
				Int("mediaId", job.MediaID).
				Str("chapterId", job.ChapterID).
				Msg("manga: Failed to queue chapter in the background")
		} else {
			h.App.Logger.Debug().
				Str("chapterId", job.ChapterID).
				Int("remaining", remaining).
				Msg("manga: Queued chapter in the background")
			// Tells the client to refetch the queue, so rows flip to "queued" as they land.
			h.App.WSEventManager.SendEvent(events.ChapterDownloadQueueUpdated, nil)
		}

		if remaining == 0 {
			chapterQueueing.mu.Lock()
			// Something may have been appended while the chapter was being fetched.
			if len(chapterQueueing.pending) == 0 {
				chapterQueueing.running = false
				chapterQueueing.mu.Unlock()
				return
			}
			chapterQueueing.mu.Unlock()
		}

		time.Sleep(chapterQueueingInterval)
	}
}
