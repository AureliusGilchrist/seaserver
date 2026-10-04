package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/unmatched"
	"seanime/internal/util"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// The match queue: every match the user decides on, carried out by the server in the order they
// decided on it.
//
// Matching from the Unmatched screen used to be a request that did the whole thing — planning,
// moving, renaming, recording — with the screen waiting on it. A season pack is minutes of copying,
// so working through a backlog meant sitting through each match in turn, and anything that went
// wrong (AniList down, a file the move could not take) had to be discovered and redone by hand.
//
// Here the decision is written down the moment it is made and the request returns; the server works
// through the decisions on its own time. The screen is free the instant a match is queued, which is
// the point — the next download can be dealt with while the last one is still being moved.
//
// Three properties matter more than anything else about this worker:
//
//   - It never holds the app up. It runs on its own goroutine and its own clock; the match lock is
//     taken only while a match is actually running, never while waiting or retrying; and every
//     endpoint it backs is a short read or write of one row.
//   - It keeps trying. A match that fails goes back in line with the reason attached and is retried
//     for as long as it takes, at an interval that grows to a cap. Nothing is ever given up on
//     silently, and a restart does not lose the queue — it is in the database.
//   - It does not run a match it cannot finish properly. While AniList is not answering the whole
//     queue waits, because a match carried out then would file episodes with no metadata behind
//     them; and a download with an interrupted match on disk is left alone until that match has
//     been seen through.

const (
	unmatchedQueuePending       = "pending"
	unmatchedQueueMatching      = "matching"
	unmatchedQueueNeedsDecision = "needs_decision"
)

const (
	// unmatchedQueueTick is how often the worker looks for something to do. Cheap: one indexed read
	// when there is nothing, and it is also the rate at which a held queue notices things are fine
	// again.
	unmatchedQueueTick = 2 * time.Second
	// unmatchedQueueProbeInterval is how often a held queue asks AniList whether it is back. One
	// request per interval, only while there is work waiting on it.
	unmatchedQueueProbeInterval = 30 * time.Second
	// unmatchedQueueRetryBase and unmatchedQueueRetryCap bound the backoff a failed match is retried
	// on: 30s doubling to a quarter of an hour, so a download that cannot be matched right now is
	// picked back up promptly when whatever was wrong goes away, and one that cannot be matched at
	// all costs almost nothing to keep trying.
	unmatchedQueueRetryBase = 30 * time.Second
	unmatchedQueueRetryCap  = 15 * time.Minute
	// unmatchedQueueJournalGrace is how long a queued match will wait on an interrupted match being
	// finished before it is handed to the user instead. The boot-time resume takes seconds, so this
	// only fires when one genuinely could not be finished.
	unmatchedQueueJournalGrace = 90 * time.Second
)

// UnmatchedMatchQueueItem is one queued match, as the screen sees it.
type UnmatchedMatchQueueItem struct {
	ID           uint       `json:"id"`
	TorrentName  string     `json:"torrentName"`
	AnimeID      int        `json:"animeId"`
	AnimeTitle   string     `json:"animeTitle"`
	FileCount    int        `json:"fileCount"`
	Status       string     `json:"status"`
	ErrorMessage string     `json:"errorMessage,omitempty"`
	Attempts     int        `json:"attempts"`
	CreatedAt    time.Time  `json:"createdAt"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	FinishedAt   *time.Time `json:"finishedAt,omitempty"`
	// NextAttemptAt is set on an item that failed and is waiting to be tried again.
	NextAttemptAt *time.Time `json:"nextAttemptAt,omitempty"`
	// Conflict or CountMismatch is set when the match stopped on a question only the user can
	// answer — the same payloads the match itself would have reported.
	Conflict      *unmatched.MatchConflict `json:"conflict,omitempty"`
	CountMismatch *unmatched.CountMismatch `json:"countMismatch,omitempty"`
}

// UnmatchedMatchQueueStatus is what the queue is doing right now.
type UnmatchedMatchQueueStatus struct {
	// Paused is the user having stopped the queue. Holding is the queue waiting on something by
	// itself — AniList not answering, or an interrupted match still being finished.
	Paused     bool   `json:"paused"`
	Holding    bool   `json:"holding"`
	HoldReason string `json:"holdReason,omitempty"`
	// Current is the item being matched right now, if any.
	Current       *UnmatchedMatchQueueItem `json:"current,omitempty"`
	Total         int                      `json:"total"`
	Pending       int                      `json:"pending"`
	Matching      int                      `json:"matching"`
	NeedsDecision int                      `json:"needsDecision"`
	// Matched counts the matches carried out since the server started — the queue's own progress,
	// since completed items leave the queue.
	Matched       int        `json:"matched"`
	LastMatchedAt *time.Time `json:"lastMatchedAt,omitempty"`
}

// UnmatchedMatchQueueState is the whole queue, for the screen that shows it.
type UnmatchedMatchQueueState struct {
	Items  []*UnmatchedMatchQueueItem `json:"items"`
	Status UnmatchedMatchQueueStatus  `json:"status"`
}

// unmatchedMatchQueue is the worker.
type unmatchedMatchQueue struct {
	h *Handler

	mu     sync.Mutex
	paused bool
	// current is the id of the item being matched, 0 when idle. The worker never picks up a second
	// item while one is running.
	current uint
	// holdReason is set while the queue is waiting on something by itself.
	holdReason string
	// holdAniList marks the AniList hold specifically, which is the one that is probed.
	holdAniList bool
	lastProbe   time.Time
	// journalBlocked records when an item was first seen waiting on an interrupted match, so a
	// download that can never be matched automatically is handed to the user rather than skipped in
	// silence for the rest of the session.
	journalBlocked map[uint]time.Time

	matched       int
	lastMatchedAt *time.Time

	wake chan struct{}
	stop chan struct{}
	once sync.Once
}

func newUnmatchedMatchQueue(h *Handler) *unmatchedMatchQueue {
	return &unmatchedMatchQueue{
		h:              h,
		journalBlocked: make(map[uint]time.Time),
		wake:           make(chan struct{}, 1),
		stop:           make(chan struct{}),
	}
}

func (q *unmatchedMatchQueue) start() {
	q.once.Do(func() {
		// "Matching" is a claim only the worker that made it can justify, and nothing survives a
		// restart — so anything left mid-match goes back to waiting. What actually happened to the
		// files is decided from the disk, not from a status written down before the stop.
		_ = q.h.App.Database.ResetMatchingUnmatchedMatchQueueItems()
		go q.loop()
	})
}

func (q *unmatchedMatchQueue) shutdown() {
	close(q.stop)
}

// wakeUp asks the worker to look for work now rather than at the next tick. Non-blocking: a signal
// already waiting is signal enough.
func (q *unmatchedMatchQueue) wakeUp() {
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

func (q *unmatchedMatchQueue) loop() {
	defer util.HandlePanicInModuleThen("handlers/unmatchedMatchQueue/loop", func() {})

	ticker := time.NewTicker(unmatchedQueueTick)
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

// tick looks for the next match to carry out and carries it out. Everything it needs to decide is
// read fresh each time, so there is no state to keep in step with the database.
func (q *unmatchedMatchQueue) tick() {
	defer util.HandlePanicInModuleThen("handlers/unmatchedMatchQueue/tick", func() {})

	q.mu.Lock()
	busy := q.paused || q.current != 0
	q.mu.Unlock()
	if busy {
		return
	}

	item, err := q.h.App.Database.GetNextUnmatchedMatchQueueItem()
	if err != nil || item == nil {
		// Nothing waiting, or the database could not be read this tick. Either way there is nothing
		// to hold for, and the next tick tries again.
		q.setHold(false, "")
		return
	}

	// A match needs AniList: the episodes it files have their metadata hydrated from it, and a match
	// carried out while it is down would put episodes in the library with nothing behind them. So
	// the queue waits — for as long as it takes — and asks periodically whether it is back. Nothing
	// else in the app is affected: this is one request every half minute, made from here.
	if !anilist.GetAvailability().Available {
		q.holdForAniList(item)
		return
	}
	q.setHold(false, "")

	// An interrupted match for this download is still being finished (or could not be). Running
	// this match now would number whatever files are left from one, beside the ones already moved
	// under their proper names — so the item waits for the plan on disk to be settled. The
	// repository reports back once it is, and the item is finished or handed to the user then.
	if q.h.App.UnmatchedRepository.HasPendingMatchJournal(item.TorrentName) {
		q.holdOnJournal(item)
		return
	}
	q.clearJournalBlocked(item.ID)

	q.process(item)
}

// holdForAniList waits out an AniList outage, probing for its return on its own schedule.
func (q *unmatchedMatchQueue) holdForAniList(item *models.UnmatchedMatchQueueItem) {
	q.mu.Lock()
	q.holdReason = "AniList is not answering — matching starts again on its own when it does"
	q.holdAniList = true
	due := time.Since(q.lastProbe) >= unmatchedQueueProbeInterval
	if due {
		q.lastProbe = time.Now()
	}
	q.mu.Unlock()

	if !due {
		return
	}

	// The probe runs on its own goroutine so a slow AniList response cannot stall the queue's clock
	// — or anything else, since this is the only thing waiting on it.
	go func() {
		defer util.HandlePanicInModuleThen("handlers/unmatchedMatchQueue/probe", func() {})

		client := q.h.App.AnilistPlatformRef.Get().GetAnilistClient()
		if client == nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		// Any request will do — what matters is that it reaches AniList and reports back, which is
		// what clears the availability flag. Asking about the download at the head of the queue
		// means the answer is useful if it arrives.
		id := item.AnimeID
		if id <= 0 {
			id = 1
		}
		_, _ = client.AnimeDetailsByID(ctx, &id)

		if anilist.GetAvailability().Available {
			q.setHold(false, "")
			q.wakeUp()
		}
	}()
}

// holdOnJournal waits for an interrupted match to be settled before this item is run.
func (q *unmatchedMatchQueue) holdOnJournal(item *models.UnmatchedMatchQueueItem) {
	q.mu.Lock()
	q.holdReason = "Waiting for an interrupted match on this download to be finished"
	q.holdAniList = false
	first, seen := q.journalBlocked[item.ID]
	if !seen {
		first = time.Now()
		q.journalBlocked[item.ID] = first
	}
	stuck := time.Since(first) >= unmatchedQueueJournalGrace
	q.mu.Unlock()

	// The resume that finishes interrupted matches runs at startup and takes seconds. An item still
	// waiting well past that is one whose match could not be finished automatically, and nothing
	// here can do it either — so it is handed to the user rather than skipped for the session.
	if stuck {
		q.clearJournalBlocked(item.ID)
		_ = q.h.App.Database.SetUnmatchedMatchQueueItemQuestion(item.ID, nil, nil,
			"An earlier match for this download was interrupted and could not be finished automatically. "+
				"Match the rest of it by hand, or restart the server to try finishing it again.")
		q.sendQueueEvent()
	}
}

func (q *unmatchedMatchQueue) clearJournalBlocked(id uint) {
	q.mu.Lock()
	delete(q.journalBlocked, id)
	q.mu.Unlock()
}

// process carries out one queued match.
func (q *unmatchedMatchQueue) process(item *models.UnmatchedMatchQueueItem) {
	q.mu.Lock()
	q.current = item.ID
	q.mu.Unlock()

	// However this returns — through the end, through a failure, or through a panic — the item stops
	// being the current work and the queue is free to pick up the next one.
	defer func() {
		q.mu.Lock()
		q.current = 0
		q.mu.Unlock()
		q.sendQueueEvent()
	}()

	// A panic here is a bug in the match, not in the queue: the item goes back in line to be tried
	// again rather than the worker stalling on it forever with the rest of the queue behind it.
	defer util.HandlePanicInModuleThen("handlers/unmatchedMatchQueue/process", func() {
		q.retry(item, "the match stopped unexpectedly — see the server log")
	})

	var req unmatched.MatchRequest
	if err := json.Unmarshal(item.Request, &req); err != nil {
		// The decision cannot be read back, so it cannot be carried out, and retrying will not
		// change that. It is handed to the user rather than retried forever.
		_ = q.h.App.Database.SetUnmatchedMatchQueueItemQuestion(item.ID, nil, nil,
			"The queued match could not be read back ("+err.Error()+"). Match this download again from the list.")
		q.sendQueueEvent()
		return
	}

	// What is left of the files this match selected. A download can be matched more than once — a
	// pack in parts, or the same pack to different entries — so "the download is still there" says
	// nothing about whether *this* match still has anything to do. An item whose files have all
	// been matched already is done with, quietly: it is what a second decision for the same files
	// looks like, and it is also what the item left behind by an interrupted match looks like once
	// that match has been finished.
	switch q.itemFilesState(item, req.SelectedFiles) {
	case queueFilesGone:
		q.h.App.Logger.Info().Str("torrent", item.TorrentName).
			Msg("unmatched queue: Nothing left of the files this match selected, dropping it")
		_ = q.h.App.Database.DeleteUnmatchedMatchQueueItem(item.ID)
		return
	case queueFilesUnreadable:
		// The download is there but could not be read this time — a disk that is busy, a network
		// share that is asleep. Not a reason to give up on it; it is retried like any other failure.
		q.retry(item, "the download could not be read")
		return
	}

	_ = q.h.App.Database.MarkUnmatchedMatchQueueItemStarted(item.ID)
	q.sendQueueEvent()

	// The same lock the manual match and the sweep take, so a queued match never moves files at the
	// same time as either. Held only for the match itself — never while waiting on anything.
	matchMu.Lock()
	result, err := q.h.App.UnmatchedRepository.MatchAndMoveFiles(&req)
	matchMu.Unlock()

	switch {
	case err != nil:
		q.retry(item, err.Error())

	case result != nil && result.Conflict != nil:
		q.askDecision(item, result, result.ErrorMessage)

	case result != nil && result.CountMismatch != nil:
		q.askDecision(item, result, result.ErrorMessage)

	case result != nil && len(result.FailedFiles) > 0:
		// Some files moved and some did not. What moved is in the library now and has to be
		// recorded as matched, exactly as a partial manual match would be.
		if len(result.MovedFiles) > 0 {
			q.h.FinalizeUnmatchedMatch(req, *result)
		}
		// Deliberately not retried: the files that did not move are the ones a retry would match,
		// and they would be numbered from one beside the ones already there. The plan on disk has
		// the real numbering and is finished on the next start — see ResumePendingMatches.
		_ = q.h.App.Database.SetUnmatchedMatchQueueItemQuestion(item.ID, nil, nil, fmt.Sprintf(
			"%d of %d files could not be moved. The rest will be moved automatically the next time the server starts; "+
				"anything else has to be matched by hand.",
			len(result.FailedFiles), len(result.FailedFiles)+len(result.MovedFiles)))
		q.sendQueueEvent()

	default:
		q.complete(item, req, result)
	}
}

// complete finishes a match that went through: the post-match pipeline, then the item leaves the
// queue because there is nothing left to do with it.
func (q *unmatchedMatchQueue) complete(item *models.UnmatchedMatchQueueItem, req unmatched.MatchRequest, result *unmatched.MatchResult) {
	if result == nil {
		_ = q.h.App.Database.DeleteUnmatchedMatchQueueItem(item.ID)
		return
	}

	// The same pipeline a manual match runs, so a queued match is indistinguishable from one made
	// at the screen: files injected into the library database, the anime marked matched, the
	// planning list updated, the collection refreshed.
	q.h.FinalizeUnmatchedMatch(req, *result)

	_ = q.h.App.Database.DeleteUnmatchedMatchQueueItem(item.ID)

	q.mu.Lock()
	q.matched++
	now := time.Now()
	q.lastMatchedAt = &now
	q.mu.Unlock()

	q.h.App.Logger.Info().
		Str("torrent", item.TorrentName).
		Int("files", len(result.MovedFiles)).
		Msg("unmatched queue: Matched")
}

// askDecision parks the item on a question only the user can answer. Nothing was moved; the
// question is stored so the screen can put it exactly as the match would have, and the torrent
// carries it too so the download itself shows that it is waiting on something.
func (q *unmatchedMatchQueue) askDecision(item *models.UnmatchedMatchQueueItem, result *unmatched.MatchResult, message string) {
	var conflictJSON, mismatchJSON []byte
	if result.Conflict != nil {
		conflictJSON, _ = json.Marshal(result.Conflict)
		q.h.App.UnmatchedRepository.SetPendingConflict(item.TorrentName, result.Conflict)
	}
	if result.CountMismatch != nil {
		mismatchJSON, _ = json.Marshal(result.CountMismatch)
		q.h.App.UnmatchedRepository.SetPendingCountMismatch(item.TorrentName, result.CountMismatch)
	}

	_ = q.h.App.Database.SetUnmatchedMatchQueueItemQuestion(item.ID, conflictJSON, mismatchJSON, message)
	q.h.App.Logger.Info().
		Str("torrent", item.TorrentName).
		Msg("unmatched queue: Waiting for a decision before this match can run")
	q.sendQueueEvent()
}

// retry puts a failed match back in line, with the reason attached and a growing interval before
// the next try. Failures are not final: the queue keeps coming back to them, for as long as it
// takes, without anything else being held up in the meantime.
func (q *unmatchedMatchQueue) retry(item *models.UnmatchedMatchQueueItem, reason string) {
	// A failure that was AniList going away mid-match is not the match's fault and is not counted
	// against it — the whole queue waits instead, and this item goes straight back in line.
	if !anilist.GetAvailability().Available {
		_ = q.h.App.Database.RescheduleUnmatchedMatchQueueItem(item.ID, reason, item.Attempts, time.Now())
		q.holdForAniList(item)
		return
	}

	attempts := item.Attempts + 1
	delay := unmatchedQueueRetryBase << (attempts - 1)
	if delay > unmatchedQueueRetryCap || delay <= 0 {
		delay = unmatchedQueueRetryCap
	}

	_ = q.h.App.Database.RescheduleUnmatchedMatchQueueItem(item.ID, reason, attempts, time.Now().Add(delay))

	q.h.App.Logger.Warn().
		Err(fmt.Errorf("%s", reason)).
		Str("torrent", item.TorrentName).
		Int("attempt", attempts).
		Dur("retryIn", delay).
		Msg("unmatched queue: Match failed, it will be tried again")
	q.sendQueueEvent()
}

// What is left of the files a queued match selected.
type queueFilesState int

const (
	// queueFilesPresent: at least one of the files this match selected is still in the download.
	queueFilesPresent queueFilesState = iota
	// queueFilesGone: the download is gone, or none of the selected files are left — matched
	// already, by this queue or by something else. There is nothing to carry out.
	queueFilesGone
	// queueFilesUnreadable: the download is there but could not be read this time.
	queueFilesUnreadable
)

// itemFilesState reports what is left of the files a queued match selected.
//
// A download is matched more than once as a matter of course — a pack in parts, one season at a
// time, sometimes to different entries of the franchise — so each item is judged on its own files
// rather than on whether the download still exists. An item whose files have all been matched
// already is what a repeated decision looks like, and it is dropped without touching anything.
func (q *unmatchedMatchQueue) itemFilesState(item *models.UnmatchedMatchQueueItem, selected []string) queueFilesState {
	contents, err := q.h.App.UnmatchedRepository.GetTorrentContents(item.TorrentName)
	if err != nil || contents == nil {
		if q.h.App.UnmatchedRepository.StagingDirExists(item.TorrentName) {
			return queueFilesUnreadable
		}
		return queueFilesGone
	}

	present := make(map[string]struct{}, len(contents.Files))
	for _, f := range contents.Files {
		if f != nil {
			present[f.RelativePath] = struct{}{}
		}
	}
	for _, rel := range selected {
		if _, ok := present[rel]; ok {
			return queueFilesPresent
		}
	}
	return queueFilesGone
}

// onPendingMatchFinished settles the queue item held for a download whose interrupted match has
// just been taken on by the startup resume. A finished match leaves nothing for the item to do; one
// that could not be finished is handed to the user, because re-running it from what is left of the
// download would number the remainder from one.
func (q *unmatchedMatchQueue) onPendingMatchFinished(torrentName string, completed bool) {
	if torrentName == "" {
		return
	}

	item, err := q.h.App.Database.GetUnmatchedMatchQueueItemForTorrent(torrentName)
	if err != nil || item == nil {
		return
	}

	q.clearJournalBlocked(item.ID)

	if completed {
		_ = q.h.App.Database.DeleteUnmatchedMatchQueueItem(item.ID)
		q.h.App.Logger.Info().Str("torrent", torrentName).
			Msg("unmatched queue: An interrupted match was finished, its queued match is done")
	} else {
		_ = q.h.App.Database.SetUnmatchedMatchQueueItemQuestion(item.ID, nil, nil,
			"An earlier match for this download was interrupted and could not be finished automatically. "+
				"Match the rest of it by hand, or restart the server to try finishing it again.")
	}

	q.wakeUp()
	q.sendQueueEvent()
}

// setHold records that the queue is waiting on something by itself.
func (q *unmatchedMatchQueue) setHold(holding bool, reason string) {
	q.mu.Lock()
	changed := q.holdReason != reason
	q.holdReason = reason
	if !holding {
		q.holdAniList = false
	}
	q.mu.Unlock()

	if changed {
		q.sendQueueEvent()
	}
}

// sendQueueEvent tells every client the queue has moved. Best-effort: the screen also polls, so a
// missed event costs a tick, not a wrong picture.
func (q *unmatchedMatchQueue) sendQueueEvent() {
	if q.h.App.WSEventManager == nil {
		return
	}
	q.h.App.WSEventManager.SendEvent(events.UnmatchedMatchQueueUpdated, nil)
}

// state builds the queue as the screen sees it.
func (q *unmatchedMatchQueue) state() *UnmatchedMatchQueueState {
	items, err := q.h.App.Database.GetUnmatchedMatchQueueItems()
	if err != nil {
		items = nil
	}

	out := make([]*UnmatchedMatchQueueItem, 0, len(items))
	status := UnmatchedMatchQueueStatus{}

	q.mu.Lock()
	status.Paused = q.paused
	status.Holding = q.holdReason != ""
	status.HoldReason = q.holdReason
	status.Matched = q.matched
	status.LastMatchedAt = q.lastMatchedAt
	current := q.current
	q.mu.Unlock()

	for _, item := range items {
		view := &UnmatchedMatchQueueItem{
			ID:            item.ID,
			TorrentName:   item.TorrentName,
			AnimeID:       item.AnimeID,
			AnimeTitle:    item.AnimeTitle,
			FileCount:     item.FileCount,
			Status:        item.Status,
			ErrorMessage:  item.ErrorMessage,
			Attempts:      item.Attempts,
			CreatedAt:     item.CreatedAt,
			StartedAt:     item.StartedAt,
			FinishedAt:    item.FinishedAt,
			NextAttemptAt: item.NextAttemptAt,
		}
		if len(item.Conflict) > 0 {
			var conflict unmatched.MatchConflict
			if json.Unmarshal(item.Conflict, &conflict) == nil {
				view.Conflict = &conflict
			}
		}
		if len(item.CountMismatch) > 0 {
			var mismatch unmatched.CountMismatch
			if json.Unmarshal(item.CountMismatch, &mismatch) == nil {
				view.CountMismatch = &mismatch
			}
		}

		switch item.Status {
		case unmatchedQueuePending:
			status.Pending++
		case unmatchedQueueMatching:
			status.Matching++
		case unmatchedQueueNeedsDecision:
			status.NeedsDecision++
		}
		if item.ID == current {
			status.Current = view
		}
		out = append(out, view)
	}
	status.Total = len(out)

	return &UnmatchedMatchQueueState{Items: out, Status: status}
}

// +--------------------------------------------------------------------------+
// |  Endpoints                                                               |
// +--------------------------------------------------------------------------+

// HandleGetUnmatchedMatchQueue
//
//	@summary returns the queue of matches waiting to be carried out.
//	@desc This handler returns every queued match with its status, and what the queue is doing.
//	@desc Safe to poll.
//	@route /api/v1/unmatched/queue [GET]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandleGetUnmatchedMatchQueue(c echo.Context) error {
	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}

// HandleEnqueueUnmatchedMatch
//
//	@summary queues a match decided on in the Unmatched screen.
//	@desc This handler writes the match down and returns immediately — the server carries it out in
//	@desc the order the decisions were made, so the screen is free to go straight on to the next
//	@desc download. A second decision for the same download replaces the first.
//	@route /api/v1/unmatched/queue [POST]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandleEnqueueUnmatchedMatch(c echo.Context) error {
	var req unmatched.MatchRequest
	if err := c.Bind(&req); err != nil {
		return h.RespondWithError(c, err)
	}

	if req.TorrentName == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "torrent name is required"))
	}
	if req.AnimeID <= 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "anime id is required"))
	}
	if len(req.SelectedFiles) == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "no files were selected"))
	}
	if req.AnimeTitleClean == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "anime title is required"))
	}

	requestJSON, err := json.Marshal(req)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// A decision made by hand is not an automatic one: the files were chosen, so OVAs and specials
	// among them were chosen too and must not be filtered out the way an automatic match filters
	// them. Automatic and ForceMovie are per-run flags, never carried in from the client.
	item := &models.UnmatchedMatchQueueItem{
		TorrentName: req.TorrentName,
		AnimeID:     req.AnimeID,
		AnimeTitle:  req.AnimeTitleClean,
		FileCount:   len(req.SelectedFiles),
		Status:      unmatchedQueuePending,
		Request:     requestJSON,
	}

	if err := h.App.Database.InsertUnmatchedMatchQueueItem(item); err != nil {
		return h.RespondWithError(c, err)
	}

	h.App.Logger.Info().
		Str("torrent", req.TorrentName).
		Int("animeId", req.AnimeID).
		Int("files", len(req.SelectedFiles)).
		Msg("unmatched queue: Match queued")

	h.UnmatchedMatchQueue.wakeUp()
	h.UnmatchedMatchQueue.sendQueueEvent()

	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}

// HandleRemoveUnmatchedMatchQueueItem
//
//	@summary takes one match out of the queue.
//	@desc This handler removes a queued match without carrying it out. Nothing on disk is touched.
//	@route /api/v1/unmatched/queue/remove [POST]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandleRemoveUnmatchedMatchQueueItem(c echo.Context) error {
	type body struct {
		ID uint `json:"id"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if item, _ := h.App.Database.GetUnmatchedMatchQueueItem(b.ID); item != nil {
		h.App.UnmatchedRepository.ClearPendingConflict(item.TorrentName)
	}

	if err := h.App.Database.DeleteUnmatchedMatchQueueItem(b.ID); err != nil {
		return h.RespondWithError(c, err)
	}

	h.UnmatchedMatchQueue.sendQueueEvent()
	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}

// HandleClearUnmatchedMatchQueue
//
//	@summary empties the match queue.
//	@desc This handler removes every queued match. Downloads already matched by the queue stay
//	@desc matched; nothing on disk is touched.
//	@route /api/v1/unmatched/queue/clear [POST]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandleClearUnmatchedMatchQueue(c echo.Context) error {
	items, _ := h.App.Database.GetUnmatchedMatchQueueItems()
	for _, item := range items {
		h.App.UnmatchedRepository.ClearPendingConflict(item.TorrentName)
	}

	if err := h.App.Database.ClearUnmatchedMatchQueueItems(); err != nil {
		return h.RespondWithError(c, err)
	}

	h.UnmatchedMatchQueue.sendQueueEvent()
	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}

// HandlePauseUnmatchedMatchQueue
//
//	@summary stops the queue from carrying out any more matches.
//	@desc This handler pauses the queue after the match it is currently running. Queued matches are
//	@desc kept, and resume where they left off.
//	@route /api/v1/unmatched/queue/pause [POST]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandlePauseUnmatchedMatchQueue(c echo.Context) error {
	h.UnmatchedMatchQueue.mu.Lock()
	h.UnmatchedMatchQueue.paused = true
	h.UnmatchedMatchQueue.mu.Unlock()

	h.UnmatchedMatchQueue.sendQueueEvent()
	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}

// HandleResumeUnmatchedMatchQueue
//
//	@summary starts the queue going again.
//	@route /api/v1/unmatched/queue/resume [POST]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandleResumeUnmatchedMatchQueue(c echo.Context) error {
	h.UnmatchedMatchQueue.mu.Lock()
	h.UnmatchedMatchQueue.paused = false
	h.UnmatchedMatchQueue.mu.Unlock()

	h.UnmatchedMatchQueue.wakeUp()
	h.UnmatchedMatchQueue.sendQueueEvent()
	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}

// HandleRetryUnmatchedMatchQueueItem
//
//	@summary tries a queued match again now, clearing its backoff.
//	@desc This handler puts an item that failed back at the front of the queue's attention, for when
//	@desc whatever was wrong has been put right.
//	@route /api/v1/unmatched/queue/retry [POST]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandleRetryUnmatchedMatchQueueItem(c echo.Context) error {
	type body struct {
		ID uint `json:"id"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if item, _ := h.App.Database.GetUnmatchedMatchQueueItem(b.ID); item != nil {
		if h.App.UnmatchedRepository.HasPendingMatchJournal(item.TorrentName) {
			return h.RespondWithError(c, echo.NewHTTPError(409,
				"an interrupted match for this download is still being finished — restart the server to finish it"))
		}
	}

	if err := h.App.Database.ResetUnmatchedMatchQueueItem(b.ID); err != nil {
		return h.RespondWithError(c, err)
	}

	h.UnmatchedMatchQueue.wakeUp()
	h.UnmatchedMatchQueue.sendQueueEvent()
	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}

// HandleResolveUnmatchedMatchQueueItem
//
//	@summary answers the question a queued match stopped on.
//	@desc This handler records the user's answer on the stored request and puts the match back in
//	@desc line — replacing what is already in the library, proceeding past an episode count that
//	@desc does not match, or both.
//	@route /api/v1/unmatched/queue/resolve [POST]
//	@returns UnmatchedMatchQueueState
func (h *Handler) HandleResolveUnmatchedMatchQueueItem(c echo.Context) error {
	type body struct {
		ID                   uint `json:"id"`
		OverwriteExisting    bool `json:"overwriteExisting"`
		ConfirmCountMismatch bool `json:"confirmCountMismatch"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	item, err := h.App.Database.GetUnmatchedMatchQueueItem(b.ID)
	if err != nil || item == nil {
		return h.RespondWithError(c, echo.NewHTTPError(404, "no such queued match"))
	}

	var req unmatched.MatchRequest
	if err := json.Unmarshal(item.Request, &req); err != nil {
		return h.RespondWithError(c, err)
	}

	req.OverwriteExisting = req.OverwriteExisting || b.OverwriteExisting
	req.ConfirmCountMismatch = req.ConfirmCountMismatch || b.ConfirmCountMismatch

	requestJSON, err := json.Marshal(req)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if err := h.App.Database.UpdateUnmatchedMatchQueueItemRequest(item.ID, requestJSON, unmatchedQueuePending); err != nil {
		return h.RespondWithError(c, err)
	}
	h.App.UnmatchedRepository.ClearPendingConflict(item.TorrentName)

	h.UnmatchedMatchQueue.wakeUp()
	h.UnmatchedMatchQueue.sendQueueEvent()
	return h.RespondWithData(c, h.UnmatchedMatchQueue.state())
}
