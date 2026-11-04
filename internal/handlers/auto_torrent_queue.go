package handlers

import (
	"sync"
	"time"

	"github.com/labstack/echo/v4"

	"seanime/internal/api/anilist"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/util"
)

// The auto torrent popup hands its confirmed picks to this queue and moves straight on to the next
// batch; the server feeds them to the torrent client in the background, one at a time.
//
// Doing the adds from the popup made you wait for every one of them, and doing them quickly is what
// hung qBittorrent: four large season packs in four seconds and its web API stopped answering. So
// the pacing lives here, where it does not cost you anything:
//
//   - one torrent at a time, autoTorrentGap apart;
//   - before each, a look at the client's offline queue — anything waiting there means the client
//     is not answering, and the queue holds off rather than piling more on;
//   - an add that took longer than autoTorrentSlowAdd stretches the next gap to autoTorrentBackoff.
//
// The queue lives in memory. A server restart drops whatever had not been sent yet; those anime are
// still undecided in Enqueue Future, so the next auto torrent run offers them again.

const (
	autoTorrentGap     = 10 * time.Second
	autoTorrentSlowAdd = 20 * time.Second
	autoTorrentBackoff = 60 * time.Second
)

// AutoTorrentJob is one confirmed pick waiting to be sent to the torrent client.
type AutoTorrentJob struct {
	Torrent            hibiketorrent.AnimeTorrent `json:"torrent"`
	Media              *anilist.BaseAnime         `json:"media"`
	AutoMatch          bool                       `json:"autoMatch"`
	MatchSeasonOneOnly bool                       `json:"matchSeasonOneOnly"`
}

// AutoTorrentQueueStatus is what the popup shows about the background adds.
type AutoTorrentQueueStatus struct {
	// Pending is how many are still waiting to be sent, not counting the one being sent.
	Pending int `json:"pending"`
	// Current is the torrent being sent right now, if any.
	Current string `json:"current,omitempty"`
	// Waiting says why the queue is holding off, when it is.
	Waiting string `json:"waiting,omitempty"`
	Added   int    `json:"added"`
	// Skipped counts torrents the client already had.
	Skipped int `json:"skipped"`
	// Settled counts picks dropped because the anime was matched, downloading, downloaded, skipped
	// or ignored by the time its turn came.
	Settled   int    `json:"settled"`
	Failed    int    `json:"failed"`
	LastError string `json:"lastError,omitempty"`
}

type autoTorrentQueue struct {
	mu      sync.Mutex
	jobs    []AutoTorrentJob
	running bool
	status  AutoTorrentQueueStatus
}

var autoTorrentQ = &autoTorrentQueue{}

func (q *autoTorrentQueue) snapshot() AutoTorrentQueueStatus {
	q.mu.Lock()
	defer q.mu.Unlock()
	s := q.status
	s.Pending = len(q.jobs)
	return s
}

// enqueueAutoTorrents adds jobs to the queue and starts the worker if it is not already running.
func (h *Handler) enqueueAutoTorrents(jobs []AutoTorrentJob) AutoTorrentQueueStatus {
	q := autoTorrentQ
	q.mu.Lock()
	// A fresh run starts its tally from zero; adding to one under way keeps counting.
	if !q.running && len(q.jobs) == 0 {
		q.status = AutoTorrentQueueStatus{}
	}
	q.jobs = append(q.jobs, jobs...)
	start := !q.running && len(q.jobs) > 0
	if start {
		q.running = true
	}
	q.mu.Unlock()

	if start {
		go h.runAutoTorrentQueue()
	}
	return q.snapshot()
}

func (h *Handler) runAutoTorrentQueue() {
	q := autoTorrentQ
	defer util.HandlePanicInModuleThen("handlers/runAutoTorrentQueue", func() {
		q.mu.Lock()
		q.running = false
		q.status.Current = ""
		q.mu.Unlock()
	})

	for {
		q.mu.Lock()
		if len(q.jobs) == 0 {
			q.running = false
			q.status.Current = ""
			q.status.Waiting = ""
			q.mu.Unlock()
			return
		}
		job := q.jobs[0]
		q.mu.Unlock()

		repo := h.App.TorrentClientRepositoryRef.Get()
		if repo == nil {
			h.autoTorrentWait("No torrent client is set up")
			continue
		}
		// Torrents waiting in the offline queue mean the client is not answering. Adding more only
		// lengthens what it has to catch up on.
		if view := repo.GetAddQueueView(); view != nil && view.Total > 0 {
			h.autoTorrentWait("The torrent client is offline or busy, waiting for it")
			continue
		}

		// Dealt with since you confirmed it — downloaded by hand, matched, skipped. Dropped without
		// touching the client, and without the gap: nothing was sent.
		if job.Media != nil && h.App.EnqueueFutureRepository != nil {
			if reason := h.App.EnqueueFutureRepository.SettledReason(job.Media.ID); reason != "" {
				h.App.Logger.Debug().Str("torrent", job.Torrent.Name).Str("reason", reason).Msg("auto torrent: Skipping, anime already dealt with")
				q.mu.Lock()
				q.jobs = q.jobs[1:]
				q.status.Settled++
				q.mu.Unlock()
				continue
			}
		}

		q.mu.Lock()
		q.jobs = q.jobs[1:]
		q.status.Current = job.Torrent.Name
		q.status.Waiting = ""
		q.mu.Unlock()

		started := time.Now()
		metadata := h.queuedTorrentMetadata(job.Media)
		added, err := h.addTorrentToClient(repo, job.Torrent, job.Media, metadata, job.AutoMatch, job.MatchSeasonOneOnly)
		took := time.Since(started)

		q.mu.Lock()
		q.status.Current = ""
		switch {
		case err != nil:
			q.status.Failed++
			q.status.LastError = err.Error()
		case added:
			q.status.Added++
		default:
			q.status.Skipped++
		}
		more := len(q.jobs) > 0
		q.mu.Unlock()

		if err != nil {
			h.App.Logger.Warn().Err(err).Str("torrent", job.Torrent.Name).Msg("auto torrent: Could not add torrent")
		} else if added && job.Media != nil {
			h.addManualDownloadToPlanning(job.Media.ID)
		}

		// The gap only sits between two adds, so the last one of a run does not hold the worker.
		if !more {
			continue
		}
		gap := autoTorrentGap
		if took > autoTorrentSlowAdd {
			gap = autoTorrentBackoff
			q.mu.Lock()
			q.status.Waiting = "The torrent client was slow to accept the last torrent, giving it a minute"
			q.mu.Unlock()
		}
		time.Sleep(gap)
	}
}

// autoTorrentWait records why the queue is holding off and waits before looking again.
func (h *Handler) autoTorrentWait(reason string) {
	q := autoTorrentQ
	q.mu.Lock()
	q.status.Waiting = reason
	q.mu.Unlock()
	time.Sleep(autoTorrentBackoff)
}

// HandleAutoTorrentAdd
//
//	@summary hands confirmed auto torrent picks to the server to add in the background.
//	@desc Returns immediately. The server adds the torrents one at a time, 10 seconds apart, and
//	@desc holds off while the torrent client is offline or slow, so a batch never floods it.
//	@route /api/v1/enqueue-future/auto-pick/add [POST]
//	@returns handlers.AutoTorrentQueueStatus
func (h *Handler) HandleAutoTorrentAdd(c echo.Context) error {
	type body struct {
		Items []AutoTorrentJob `json:"items"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	jobs := make([]AutoTorrentJob, 0, len(b.Items))
	for _, it := range b.Items {
		if it.Torrent.Name == "" || it.Torrent.Provider == "" {
			continue
		}
		jobs = append(jobs, it)
	}
	if len(jobs) == 0 {
		return h.RespondWithData(c, autoTorrentQ.snapshot())
	}

	return h.RespondWithData(c, h.enqueueAutoTorrents(jobs))
}

// HandleGetAutoTorrentAddStatus
//
//	@summary returns the progress of the background auto torrent adds.
//	@route /api/v1/enqueue-future/auto-pick/add [GET]
//	@returns handlers.AutoTorrentQueueStatus
func (h *Handler) HandleGetAutoTorrentAddStatus(c echo.Context) error {
	return h.RespondWithData(c, autoTorrentQ.snapshot())
}
