package core

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"seanime/internal/api/anilist"

	"github.com/rs/zerolog"
)

// AnilistEditQueue holds list-entry edits that AniList hasn't accepted yet and keeps sending them.
//
// A Save used to wait on AniList for as long as AniList took: behind a full rate-limit window that
// is half a minute for a slot and up to 45 seconds more for the request, with the Save button and
// the list status spinning the whole time — "it's just sitting there not saving, but saying it is".
// The edit is written into the profile's cached collection before AniList is asked (the page shows
// it straight away either way), so the only thing left to wait for is AniList's agreement, and that
// can happen in the background: a Save tries AniList for a few seconds, and if the answer isn't in
// by then the edit is queued here and the Save returns.
//
// The queue is kept on disk, so a restart doesn't lose an edit, and only the newest edit per media
// is kept, so changing a status three times sends one request. Every change is announced over the
// websocket, which is what the "syncing to AniList" indicator under the list status reads.
type AnilistEditQueue struct {
	mu      sync.Mutex
	items   map[string]*QueuedListEdit
	path    string
	wake    chan struct{}
	exec    func(ctx context.Context, edit *QueuedListEdit) error
	notify  func(profileID uint, items []*QueuedListEdit)
	logger  *zerolog.Logger
	started bool
	now     func() time.Time
}

// QueuedListEdit is one edit waiting for AniList.
type QueuedListEdit struct {
	ProfileID   uint                     `json:"profileId"`
	MediaID     int                      `json:"mediaId"`
	Type        string                   `json:"type"`
	Title       string                   `json:"title,omitempty"`
	Status      *anilist.MediaListStatus `json:"status,omitempty"`
	Score       *int                     `json:"score,omitempty"`
	Progress    *int                     `json:"progress,omitempty"`
	StartDate   *anilist.FuzzyDateInput  `json:"startedAt,omitempty"`
	EndDate     *anilist.FuzzyDateInput  `json:"completedAt,omitempty"`
	QueuedAt    time.Time                `json:"queuedAt"`
	Attempts    int                      `json:"attempts"`
	LastError   string                   `json:"lastError,omitempty"`
	NextAttempt time.Time                `json:"nextAttempt"`
}

const AnilistEditQueueUpdatedEvent = "anilist-edit-queue-updated"

// Backoff between attempts: quick at first (a full rate window clears within a minute), then a
// minute at a time for as long as AniList keeps refusing.
var anilistEditQueueBackoff = []time.Duration{5 * time.Second, 15 * time.Second, 30 * time.Second, 60 * time.Second}

func NewAnilistEditQueue(dataDir string, exec func(ctx context.Context, edit *QueuedListEdit) error, notify func(profileID uint, items []*QueuedListEdit), logger *zerolog.Logger) *AnilistEditQueue {
	q := &AnilistEditQueue{
		items:  make(map[string]*QueuedListEdit),
		wake:   make(chan struct{}, 1),
		exec:   exec,
		notify: notify,
		logger: logger,
		now:    time.Now,
	}
	if dataDir != "" {
		q.path = filepath.Join(dataDir, "anilist-edit-queue.json")
		q.load()
	}
	return q
}

func queueKey(profileID uint, mediaID int) string {
	b, _ := json.Marshal([2]int{int(profileID), mediaID})
	return string(b)
}

// Start runs the retry loop. Safe to call more than once.
func (q *AnilistEditQueue) Start() {
	q.mu.Lock()
	if q.started {
		q.mu.Unlock()
		return
	}
	q.started = true
	q.mu.Unlock()
	go q.loop()
	q.poke()
}

// Enqueue adds an edit, replacing any older one for the same media.
func (q *AnilistEditQueue) Enqueue(edit *QueuedListEdit, reason error) {
	q.mu.Lock()
	now := q.now()
	edit.QueuedAt = now
	edit.Attempts = 1
	edit.NextAttempt = now.Add(anilistEditQueueBackoff[0])
	if reason != nil {
		edit.LastError = reason.Error()
	}
	q.items[queueKey(edit.ProfileID, edit.MediaID)] = edit
	q.saveLocked()
	q.mu.Unlock()
	q.announce(edit.ProfileID)
	q.poke()
}

// Forget drops a queued edit for this media: a newer one has just been accepted by AniList, and
// replaying the old one would undo it.
func (q *AnilistEditQueue) Forget(profileID uint, mediaID int) {
	q.mu.Lock()
	key := queueKey(profileID, mediaID)
	_, ok := q.items[key]
	if ok {
		delete(q.items, key)
		q.saveLocked()
	}
	q.mu.Unlock()
	if ok {
		q.announce(profileID)
	}
}

// List returns the profile's queued edits, oldest first.
func (q *AnilistEditQueue) List(profileID uint) []*QueuedListEdit {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.listLocked(profileID)
}

func (q *AnilistEditQueue) listLocked(profileID uint) []*QueuedListEdit {
	out := make([]*QueuedListEdit, 0)
	for _, e := range q.items {
		if e.ProfileID == profileID {
			c := *e
			out = append(out, &c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].QueuedAt.Before(out[j].QueuedAt) })
	return out
}

func (q *AnilistEditQueue) announce(profileID uint) {
	if q.notify == nil {
		return
	}
	q.notify(profileID, q.List(profileID))
}

func (q *AnilistEditQueue) poke() {
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

func (q *AnilistEditQueue) loop() {
	for {
		wait := q.RunDue(context.Background())
		timer := time.NewTimer(wait)
		select {
		case <-q.wake:
		case <-timer.C:
		}
		timer.Stop()
	}
}

// RunDue sends every edit whose time has come and returns how long until the next one is due.
func (q *AnilistEditQueue) RunDue(ctx context.Context) time.Duration {
	q.mu.Lock()
	now := q.now()
	due := make([]*QueuedListEdit, 0)
	for _, e := range q.items {
		if !e.NextAttempt.After(now) {
			c := *e
			due = append(due, &c)
		}
	}
	q.mu.Unlock()

	changed := map[uint]bool{}
	for _, edit := range due {
		callCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		err := q.exec(callCtx, edit)
		cancel()

		q.mu.Lock()
		key := queueKey(edit.ProfileID, edit.MediaID)
		current, ok := q.items[key]
		// Replaced by a newer edit while this one was in flight: leave the newer one alone.
		if !ok || !current.QueuedAt.Equal(edit.QueuedAt) {
			q.mu.Unlock()
			continue
		}
		if err == nil {
			delete(q.items, key)
			if q.logger != nil {
				q.logger.Info().Int("mediaId", edit.MediaID).Int("attempts", edit.Attempts).Msg("anilist: Queued list edit synced")
			}
		} else {
			current.Attempts++
			current.LastError = err.Error()
			step := current.Attempts - 1
			if step >= len(anilistEditQueueBackoff) {
				step = len(anilistEditQueueBackoff) - 1
			}
			current.NextAttempt = q.now().Add(anilistEditQueueBackoff[step])
			if q.logger != nil {
				q.logger.Warn().Err(err).Int("mediaId", edit.MediaID).Int("attempts", current.Attempts).Msg("anilist: Queued list edit not accepted yet")
			}
		}
		q.saveLocked()
		q.mu.Unlock()
		changed[edit.ProfileID] = true
	}
	for profileID := range changed {
		q.announce(profileID)
	}

	q.mu.Lock()
	defer q.mu.Unlock()
	next := time.Minute
	now = q.now()
	for _, e := range q.items {
		if d := e.NextAttempt.Sub(now); d < next {
			next = d
		}
	}
	if next < 250*time.Millisecond {
		next = 250 * time.Millisecond
	}
	return next
}

func (q *AnilistEditQueue) load() {
	data, err := os.ReadFile(q.path)
	if err != nil {
		return
	}
	var items []*QueuedListEdit
	if json.Unmarshal(data, &items) != nil {
		return
	}
	now := q.now()
	for _, e := range items {
		if e == nil || e.MediaID == 0 {
			continue
		}
		// Retried soon after start rather than at whatever backoff it had reached.
		e.NextAttempt = now.Add(3 * time.Second)
		q.items[queueKey(e.ProfileID, e.MediaID)] = e
	}
}

func (q *AnilistEditQueue) saveLocked() {
	if q.path == "" {
		return
	}
	items := make([]*QueuedListEdit, 0, len(q.items))
	for _, e := range q.items {
		items = append(items, e)
	}
	if len(items) == 0 {
		_ = os.Remove(q.path)
		return
	}
	data, err := json.Marshal(items)
	if err != nil {
		return
	}
	tmp := q.path + ".tmp"
	if os.WriteFile(tmp, data, 0o644) == nil {
		_ = os.Remove(q.path)
		_ = os.Rename(tmp, q.path)
	}
}

// sendQueuedListEdit sends one queued edit with the profile's own client (the app's for the
// owner), the same way a Save would have.
func (a *App) sendQueuedListEdit(ctx context.Context, edit *QueuedListEdit) error {
	mediaID := edit.MediaID
	if edit.ProfileID > 0 && a.AnilistClientManager != nil {
		client := a.AnilistClientManager.GetClient(edit.ProfileID)
		_, err := client.UpdateMediaListEntry(ctx, &mediaID, edit.Status, edit.Score, edit.Progress, edit.StartDate, edit.EndDate)
		return err
	}
	return a.AnilistPlatformRef.Get().UpdateEntry(ctx, mediaID, edit.Status, edit.Score, edit.Progress, edit.StartDate, edit.EndDate)
}

// SendListEdit sends a list edit to AniList now.
func (a *App) SendListEdit(ctx context.Context, edit *QueuedListEdit) error {
	return a.sendQueuedListEdit(ctx, edit)
}

// SetTitle names a queued edit for display.
func (q *AnilistEditQueue) SetTitle(profileID uint, mediaID int, title string) {
	if title == "" {
		return
	}
	q.mu.Lock()
	e, ok := q.items[queueKey(profileID, mediaID)]
	if ok {
		e.Title = title
		q.saveLocked()
	}
	q.mu.Unlock()
	if ok {
		q.announce(profileID)
	}
}
