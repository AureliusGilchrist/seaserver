package torrent_client

import (
	"encoding/json"
	"strings"
	"sync"
	"time"

	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/util"
)

// The torrent client's offline queue.
//
// Adding a torrent to the client used to be a request that failed outright when the client was
// unreachable — a timeout, a refused connection — and the download was lost with it: the user
// pressed download, got "try again later", and had to be there to press it again. Now the add is
// written down instead, and the server works through the queue on its own clock. When the client
// comes back, the entries are imported in the order they were queued, as if the client never went
// down.
//
// Three properties about this worker, the same ones the match queue holds itself to:
//
//   - It never holds the app up. Its own goroutine and its own clock; adding happens one torrent at
//     a time and everything else carries on while it waits.
//   - It keeps trying. A failed add goes back in line with the reason attached and is retried for as
//     long as it takes, at an interval that grows to a cap — waiting forever is the point.
//   - It is in the database. A client that is offline and a server that was restarted in the
//     meantime is the normal case, so the queue survives reboots; an add left mid-import is put back
//     to waiting, and whether the torrent really made it is judged from the client, not from a
//     status written down before the stop.

const (
	torrentAddQueuePending = "pending"
	torrentAddQueueAdding  = "adding"
)

const (
	// torrentAddQueueTick is how often the worker looks for work, and the rate at which a queue
	// waiting for an offline client notices it is back.
	torrentAddQueueTick = 5 * time.Second
	// torrentAddQueueRetryBase and torrentAddQueueRetryCap bound the backoff: 30s doubling to a
	// quarter of an hour. A client that is down is picked back up promptly when it returns, and one
	// that is gone for good costs almost nothing to keep trying.
	torrentAddQueueRetryBase = 30 * time.Second
	torrentAddQueueRetryCap  = 15 * time.Minute
)

// offlineErrorSignatures are how an unreachable torrent client says so. Matched on the message
// rather than on a status code: an add that times out, a connection that is refused, a host that
// cannot be found — all of these are "the client is not there", and all of them are waited out.
// Anything else (an auth failure after a re-login, a malformed magnet) is reported as it was.
var offlineErrorSignatures = []string{
	"connection refused",
	"context deadline exceeded",
	"client.timeout",
	"timeout awaiting response",
	"no such host",
	"no route to host",
	"connection reset",
	"broken pipe",
	"connect: connection",
	"i/o timeout",
	"eof",
	"canceled",
}

// offlineAddError reports whether an add failed because the client is not there — the one case
// where the download is queued rather than lost.
func offlineAddError(err error) bool {
	if err == nil {
		return false
	}
	lowered := strings.ToLower(err.Error())
	for _, signature := range offlineErrorSignatures {
		if strings.Contains(lowered, signature) {
			return true
		}
	}
	return false
}

// torrentAddQueue is the worker.
type torrentAddQueue struct {
	repo *Repository

	db             dbAccess
	wsEventManager events.WSEventManagerInterface

	stop chan struct{}
	wake chan struct{}
	once sync.Once
}

// dbAccess is the slice of the database the queue reads and writes. Kept as an interface so the
// queue can be constructed without a full database in tests.
type dbAccess interface {
	GetTorrentAddQueueItems() ([]*models.TorrentAddQueueItem, error)
	GetNextTorrentAddQueueItem() (*models.TorrentAddQueueItem, error)
	InsertTorrentAddQueueItem(item *models.TorrentAddQueueItem) error
	MarkTorrentAddQueueItemStarted(id uint) error
	RescheduleTorrentAddQueueItem(id uint, errorMessage string, attempts int, nextAttemptAt time.Time) error
	DeleteTorrentAddQueueItem(id uint) error
	ClearTorrentAddQueueItems() error
	ResetAddingTorrentAddQueueItems() error
}

func newTorrentAddQueue(repo *Repository, dba dbAccess, wsEventManager events.WSEventManagerInterface) *torrentAddQueue {
	return &torrentAddQueue{
		repo:           repo,
		db:             dba,
		wsEventManager: wsEventManager,
		stop:           make(chan struct{}),
		wake:           make(chan struct{}, 1),
	}
}

// start resets adds left mid-import by the last stop and begins the worker. Called once per
// repository instance; the repository is what owns it.
func (q *torrentAddQueue) start() {
	q.once.Do(func() {
		_ = q.db.ResetAddingTorrentAddQueueItems()
		go q.loop()
	})
}

func (q *torrentAddQueue) shutdown() {
	close(q.stop)
}

func (q *torrentAddQueue) wakeUp() {
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

func (q *torrentAddQueue) loop() {
	defer util.HandlePanicInModuleThen("torrent_client/torrentAddQueue/loop", func() {})

	ticker := time.NewTicker(torrentAddQueueTick)
	defer ticker.Stop()

	for {
		select {
		case <-q.stop:
			return
		case <-q.wake:
		case <-ticker.C:
		}
		q.tick()
	}
}

// tick imports the next queued torrent, one at a time. Whether the client is answering is decided
// by trying, not by asking first: the add itself is the probe, and a client that is still down
// costs one attempt's backoff rather than a failure.
func (q *torrentAddQueue) tick() {
	defer util.HandlePanicInModuleThen("torrent_client/torrentAddQueue/tick", func() {})

	item, err := q.db.GetNextTorrentAddQueueItem()
	if err != nil || item == nil {
		return
	}

	var magnets []string
	if err := json.Unmarshal(item.Magnets, &magnets); err != nil {
		// The magnet cannot be read back, so it cannot be added, and retrying will not change that.
		q.repo.logger.Warn().Err(err).Msg("torrent client queue: A queued torrent could not be read back, dropping it")
		_ = q.db.DeleteTorrentAddQueueItem(item.ID)
		q.sendQueueEvent()
		return
	}

	_ = q.db.MarkTorrentAddQueueItemStarted(item.ID)
	q.sendQueueEvent()

	// However this returns, the item stops being the current work and the queue is free to pick up
	// the next one.
	defer func() {
		q.sendQueueEvent()
	}()

	defer util.HandlePanicInModuleThen("torrent_client/torrentAddQueue/add", func() {
		q.retry(item, magnets, "the add stopped unexpectedly — see the server log")
	})

	err = q.repo.addToClient(magnets, item.Destination)

	if err == nil {
		// The client took it. The download exists now, exactly as if it had been added the moment
		// the user pressed download.
		_ = q.db.DeleteTorrentAddQueueItem(item.ID)
		q.repo.logger.Info().Strs("magnets", magnets).Str("destination", item.Destination).
			Msg("torrent client queue: Imported a torrent that was waiting for the client")
		q.sendQueueEvent()
		return
	}

	if offlineAddError(err) {
		// Still not there. Not a failure of the torrent's — it goes straight back in line, and the
		// queue keeps waiting for as long as it takes.
		attempts := item.Attempts + 1
		_ = q.db.RescheduleTorrentAddQueueItem(item.ID, "the torrent client is offline — waiting for it to come back", attempts, time.Now())
		q.repo.logger.Info().Strs("magnets", magnets).Int("attempt", attempts).
			Msg("torrent client queue: The client is still offline, keeping the torrent queued")
		q.sendQueueEvent()
		return
	}

	q.retry(item, magnets, err.Error())
}

// retry puts a failed add back in line, with the reason attached and a growing interval before the
// next try. Failures are not final: the queue keeps coming back to them, for as long as it takes,
// without anything else being held up in the meantime.
func (q *torrentAddQueue) retry(item *models.TorrentAddQueueItem, magnets []string, reason string) {
	attempts := item.Attempts + 1
	delay := torrentAddQueueRetryBase << (attempts - 1)
	if delay > torrentAddQueueRetryCap || delay <= 0 {
		delay = torrentAddQueueRetryCap
	}

	_ = q.db.RescheduleTorrentAddQueueItem(item.ID, reason, attempts, time.Now().Add(delay))

	q.repo.logger.Warn().
		Strs("magnets", magnets).
		Int("attempt", attempts).
		Dur("retryIn", delay).
		Str("reason", reason).
		Msg("torrent client queue: Add failed, it will be tried again")
	q.sendQueueEvent()
}

// sendQueueEvent tells every client the queue has moved. Best-effort.
func (q *torrentAddQueue) sendQueueEvent() {
	if q.wsEventManager == nil {
		return
	}
	q.wsEventManager.SendEvent(events.TorrentAddQueueUpdated, nil)
}

// +--------------------------------------------------------------------------+
// |  Wiring into the repository                                              |
// +--------------------------------------------------------------------------+

// TorrentAddQueueView is the queue as the screen sees it: what is waiting for the client, and
// whether anything is being imported right now.
type TorrentAddQueueView struct {
	// Waiting counts the entries queued for a client that is not there.
	Waiting int `json:"waiting"`
	// Adding counts the entries being imported right now.
	Adding int `json:"adding"`
	// Total is both together.
	Total int `json:"total"`
	// Oldest is the destination of the entry that has waited longest, for the screen's one line
	// about what is being waited on.
	Oldest string `json:"oldest,omitempty"`
	// LastError is the most recent reason an add did not get through, so a queue that keeps
	// waiting says why rather than looking stuck.
	LastError string `json:"lastError,omitempty"`
}

// GetAddQueueView builds the queue as the screen sees it. Cheap: one indexed read.
func (r *Repository) GetAddQueueView() *TorrentAddQueueView {
	view := &TorrentAddQueueView{}

	if r.offlineQueue == nil {
		return view
	}
	items, err := r.offlineQueue.db.GetTorrentAddQueueItems()
	if err != nil {
		return view
	}

	for _, item := range items {
		switch item.Status {
		case torrentAddQueuePending:
			view.Waiting++
			if view.Oldest == "" {
				view.Oldest = item.Destination
			}
		case torrentAddQueueAdding:
			view.Adding++
		}
		if item.ErrorMessage != "" {
			view.LastError = item.ErrorMessage
		}
	}
	view.Total = view.Waiting + view.Adding

	return view
}

// enqueueForLater writes a torrent the client could not take into the queue, to be imported the
// moment the client answers again. Persisted, so a restart in the meantime loses nothing.
func (r *Repository) enqueueForLater(magnets []string, dest string) {
	if r.offlineQueue == nil {
		return
	}

	magnetsJSON, err := json.Marshal(magnets)
	if err != nil {
		r.logger.Error().Err(err).Msg("torrent client queue: Could not record the queued torrent")
		return
	}

	item := &models.TorrentAddQueueItem{
		Magnets:     magnetsJSON,
		Destination: dest,
		Status:      torrentAddQueuePending,
	}
	if err := r.offlineQueue.db.InsertTorrentAddQueueItem(item); err != nil {
		r.logger.Error().Err(err).Msg("torrent client queue: Could not queue the torrent for later")
		return
	}

	r.logger.Info().Strs("magnets", magnets).Str("destination", dest).
		Msg("torrent client queue: The client is offline, the torrent is queued until it is back")

	if r.offlineQueue.wsEventManager != nil {
		r.offlineQueue.wsEventManager.SendEvent(events.InfoToast,
			"The torrent client is offline — the download is queued and will be added when it's back")
	}

	r.offlineQueue.wakeUp()
}
