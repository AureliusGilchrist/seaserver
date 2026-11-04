package enqueuefuture

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"seanime/internal/api/anilist"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/util"
)

// Auto torrent, as a background task.
//
// The whole session lives here, on the server, and on disk: the list being worked through, how far
// you got, the batch on screen with its picks and every × and auto-match switch you changed, and the
// torrents still waiting to be sent to the client. The popup is only a window onto it. Leaving the
// page, closing the app or restarting the server loses nothing — it picks up where it was.
//
// Two background jobs run against it:
//
//   - the picker searches SeaDex for the batch on screen and, once that is ready, for the batch after
//     it, so confirming a batch usually lands on one that is already picked;
//   - the adder sends confirmed picks to the torrent client one at a time, paced so the client is
//     never flooded (four large season packs in four seconds hung qBittorrent once), and holds off
//     while the client is offline or slow.
//
// Both resume on boot once the handlers have wired in what they need (SetAutoTorrentHooks).

// AutoTorrentFileName is where the session is kept, in the data directory.
const AutoTorrentFileName = "enqueue-future-auto-torrent.json"

// AutoTorrentBatchSize is how many anime are put in front of you at once.
const AutoTorrentBatchSize = AutoPickMaxBatch

const (
	autoTorrentAddGap     = 10 * time.Second
	autoTorrentSlowAdd    = 20 * time.Second
	autoTorrentAddBackoff = 60 * time.Second
)

// AutoTorrentJob is one confirmed pick waiting to be sent to the torrent client.
type AutoTorrentJob struct {
	MediaID            int                        `json:"mediaId"`
	Torrent            hibiketorrent.AnimeTorrent `json:"torrent"`
	Media              *anilist.BaseAnime         `json:"media"`
	AutoMatch          bool                       `json:"autoMatch"`
	MatchSeasonOneOnly bool                       `json:"matchSeasonOneOnly"`
}

// AutoTorrentAddStatus is the progress of the background adds.
type AutoTorrentAddStatus struct {
	// Pending is how many are still waiting to be sent, not counting the one being sent.
	Pending int `json:"pending"`
	// Current is the torrent being sent right now, if any.
	Current string `json:"current,omitempty"`
	// Waiting says why the adder is holding off, when it is.
	Waiting string `json:"waiting,omitempty"`
	Added   int    `json:"added"`
	// Skipped counts torrents the client already had.
	Skipped int `json:"skipped"`
	// Settled counts picks dropped because the anime had been dealt with by the time its turn came.
	Settled   int    `json:"settled"`
	Failed    int    `json:"failed"`
	LastError string `json:"lastError,omitempty"`
}

// AutoTorrentView is the session as the popup sees it.
type AutoTorrentView struct {
	Active bool `json:"active"`
	// Done means every anime in the session has been reviewed.
	Done         bool `json:"done"`
	Total        int  `json:"total"`
	Reviewed     int  `json:"reviewed"`
	BatchNumber  int  `json:"batchNumber"`
	TotalBatches int  `json:"totalBatches"`
	// MoreAfter is how many anime are left after the batch on screen.
	MoreAfter int   `json:"moreAfter"`
	Batch     []int `json:"batch"`
	// Picking is true while the batch on screen is still being searched.
	Picking bool `json:"picking"`
	// Searched is how many of the batch on screen have been searched so far, while Picking.
	Searched  int         `json:"searched"`
	PickError string      `json:"pickError,omitempty"`
	Picks     []*AutoPick `json:"picks"`
	// Removed and AutoMatchOff are your edits to the batch on screen.
	Removed      []int `json:"removed"`
	AutoMatchOff []int `json:"autoMatchOff"`
	// NextReady is true when the batch after this one has already been picked.
	NextReady bool                 `json:"nextReady"`
	Adds      AutoTorrentAddStatus `json:"adds"`
}

// AutoTorrentHooks is what the session needs from outside this package.
type AutoTorrentHooks struct {
	// Add sends one torrent to the client. False with no error means the client already had it.
	Add func(job AutoTorrentJob) (bool, error)
	// ClientUnavailable reports whether the client should not be sent anything right now, and why.
	ClientUnavailable func() (bool, string)
	// ContentsClient fetches .torrent files to count what is in them.
	ContentsClient func() *http.Client
}

// autoTorrentState is what is saved to disk.
type autoTorrentState struct {
	Active     bool  `json:"active"`
	Candidates []int `json:"candidates"`
	Handled    []int `json:"handled"`
	Batch      []int `json:"batch"`
	// Picks is nil until the batch has been searched.
	Picks        []*AutoPick `json:"picks"`
	PickError    string      `json:"pickError,omitempty"`
	Removed      []int       `json:"removed"`
	AutoMatchOff []int       `json:"autoMatchOff"`
	NextBatch    []int       `json:"nextBatch"`
	NextPicks    []*AutoPick `json:"nextPicks"`

	Adds      []AutoTorrentJob     `json:"adds"`
	AddStatus AutoTorrentAddStatus `json:"addStatus"`

	StartedAt time.Time `json:"startedAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type autoTorrent struct {
	r *Repository

	mu    sync.Mutex
	state autoTorrentState
	hooks *AutoTorrentHooks
	// generation changes whenever the session is started or ended, so a search finishing for a
	// session that no longer exists is thrown away.
	generation int
	picking    bool
	// pickingNext is true while the background search is for the batch after the one on screen.
	pickingNext bool
	pickCancel  context.CancelFunc
	// progressIDs and progress are how far the search for one batch has got. Matched to a batch by
	// its ids, so the count follows a search that started as the next batch and became this one.
	progressIDs []int
	progress    int
	// pickerRun identifies the picker goroutine that owns the picking flag. A cancelled one finds
	// it changed, or the flag down, and stops without touching anything.
	pickerRun int
	adding    bool

	// pick searches a batch. AutoPickTorrents, replaced in tests.
	pick func(ctx context.Context, ids []int, client *http.Client, onPicked ...func(int)) []*AutoPick
}

func newAutoTorrent(r *Repository) *autoTorrent {
	a := &autoTorrent{r: r, pick: r.AutoPickTorrents}
	a.load()
	return a
}

func (a *autoTorrent) path() string {
	if a.r.dataDir == "" {
		return ""
	}
	return filepath.Join(a.r.dataDir, AutoTorrentFileName)
}

func (a *autoTorrent) load() {
	path := a.path()
	if path == "" {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var st autoTorrentState
	if err := json.Unmarshal(data, &st); err != nil {
		a.r.logger.Warn().Err(err).Msg("enqueuefuture: Could not read the saved auto torrent session, starting fresh")
		return
	}
	// Nothing is being sent at the moment the server starts.
	st.AddStatus.Current = ""
	st.AddStatus.Waiting = ""
	a.state = st
}

// saveLocked writes the session to disk. Called with mu held. Best effort: a failed write is worth a
// log line, not stopping the session.
func (a *autoTorrent) saveLocked() {
	path := a.path()
	if path == "" {
		return
	}
	a.state.UpdatedAt = time.Now()
	data, err := json.Marshal(a.state)
	if err != nil {
		return
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		a.r.logger.Warn().Err(err).Msg("enqueuefuture: Could not save the auto torrent session")
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		a.r.logger.Warn().Err(err).Msg("enqueuefuture: Could not save the auto torrent session")
	}
}

// SetAutoTorrentHooks wires in the client side of auto torrent and resumes whatever the session was
// doing when the server last stopped.
func (r *Repository) SetAutoTorrentHooks(hooks AutoTorrentHooks) {
	a := r.autoTorrent
	a.mu.Lock()
	a.hooks = &hooks
	a.mu.Unlock()
	a.kickPicker()
	a.kickAdder()
}

// +---------------------+
// |       Session       |
// +---------------------+

// AutoTorrentStatus returns the session as the popup sees it.
func (r *Repository) AutoTorrentStatus() AutoTorrentView {
	a := r.autoTorrent
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.viewLocked()
}

func (a *autoTorrent) viewLocked() AutoTorrentView {
	st := &a.state
	v := AutoTorrentView{
		Active:       st.Active,
		Total:        len(st.Candidates),
		Reviewed:     len(st.Handled),
		Batch:        nonNil(st.Batch),
		Picks:        st.Picks,
		PickError:    st.PickError,
		Removed:      nonNil(st.Removed),
		AutoMatchOff: nonNil(st.AutoMatchOff),
		Adds:         st.AddStatus,
	}
	v.Adds.Pending = len(st.Adds)
	if v.Picks == nil {
		v.Picks = []*AutoPick{}
	}
	if !st.Active {
		return v
	}
	v.Done = len(st.Batch) == 0
	v.Picking = len(st.Batch) > 0 && st.Picks == nil && st.PickError == ""
	if v.Picking && slices.Equal(a.progressIDs, st.Batch) {
		v.Searched = a.progress
	}
	v.TotalBatches = max(1, (len(st.Candidates)+AutoTorrentBatchSize-1)/AutoTorrentBatchSize)
	v.BatchNumber = min(v.TotalBatches, len(st.Handled)/AutoTorrentBatchSize+1)
	v.MoreAfter = max(0, len(st.Candidates)-len(st.Handled)-len(st.Batch))
	v.NextReady = len(st.NextBatch) > 0 && st.NextPicks != nil
	return v
}

// ErrAutoTorrentActive is returned when a session is started while another is still open.
var ErrAutoTorrentActive = errors.New("an auto torrent session is already open — end it first")

// StartAutoTorrent opens a session over the given anime, in the order given.
func (r *Repository) StartAutoTorrent(mediaIDs []int) (AutoTorrentView, error) {
	a := r.autoTorrent
	a.mu.Lock()
	if a.state.Active {
		v := a.viewLocked()
		a.mu.Unlock()
		return v, ErrAutoTorrentActive
	}

	seen := make(map[int]struct{}, len(mediaIDs))
	candidates := make([]int, 0, len(mediaIDs))
	for _, id := range mediaIDs {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		candidates = append(candidates, id)
	}

	a.cancelPickLocked()
	a.generation++
	adds, addStatus := a.state.Adds, a.state.AddStatus
	if len(adds) == 0 && !a.adding {
		addStatus = AutoTorrentAddStatus{}
	}
	a.state = autoTorrentState{
		Active:     true,
		Candidates: candidates,
		Handled:    []int{},
		Adds:       adds,
		AddStatus:  addStatus,
		StartedAt:  time.Now(),
	}
	a.nextBatchLocked()
	a.saveLocked()
	v := a.viewLocked()
	a.mu.Unlock()

	a.kickPicker()
	return v, nil
}

// EditAutoTorrent records your edits to the batch on screen: what you struck out, and which picks
// should not be matched automatically.
func (r *Repository) EditAutoTorrent(removed []int, autoMatchOff []int) AutoTorrentView {
	a := r.autoTorrent
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.state.Active {
		a.state.Removed = onlyIn(removed, a.state.Batch)
		a.state.AutoMatchOff = onlyIn(autoMatchOff, a.state.Batch)
		a.saveLocked()
	}
	return a.viewLocked()
}

// ConfirmAutoTorrent hands the batch on screen to the adder, minus what you struck out, and moves on
// to the next batch — straight onto it when it has already been picked.
func (r *Repository) ConfirmAutoTorrent(matchSeasonOneOnly bool) (AutoTorrentView, error) {
	a := r.autoTorrent
	a.mu.Lock()
	st := &a.state
	if !st.Active || len(st.Batch) == 0 {
		v := a.viewLocked()
		a.mu.Unlock()
		return v, errors.New("there is no batch to confirm")
	}
	if st.Picks == nil {
		v := a.viewLocked()
		a.mu.Unlock()
		return v, errors.New("this batch is still being searched")
	}

	queued := 0
	for _, p := range st.Picks {
		if p == nil || p.Torrent == nil || slices.Contains(st.Removed, p.MediaID) {
			continue
		}
		autoMatch := !slices.Contains(st.AutoMatchOff, p.MediaID)
		st.Adds = append(st.Adds, AutoTorrentJob{
			MediaID:            p.MediaID,
			Torrent:            *p.Torrent,
			Media:              p.Media,
			AutoMatch:          autoMatch,
			MatchSeasonOneOnly: autoMatch && matchSeasonOneOnly,
		})
		queued++
	}
	st.Handled = append(st.Handled, st.Batch...)

	// Straight onto the next batch when it is already picked and still lines up with what is left.
	if len(st.NextBatch) > 0 && st.NextPicks != nil && slices.Equal(st.NextBatch, a.upcomingLocked(nil)) {
		st.Batch, st.Picks, st.PickError = st.NextBatch, st.NextPicks, ""
		st.Removed, st.AutoMatchOff = []int{}, flaggedIDs(st.NextPicks)
		st.NextBatch, st.NextPicks = nil, nil
	} else if a.pickingNext && len(st.NextBatch) > 0 && slices.Equal(st.NextBatch, a.upcomingLocked(nil)) {
		// The next batch is still being searched: it becomes this one, and the search carries on.
		// Cancelling it to start the same search over again is what stalled batch 11 — and threw
		// away every lookup it had already done.
		st.Batch, st.Picks, st.PickError = st.NextBatch, nil, ""
		st.Removed, st.AutoMatchOff = []int{}, []int{}
		st.NextBatch, st.NextPicks = nil, nil
		a.pickingNext = false
	} else {
		if a.picking {
			a.cancelPickLocked()
		}
		a.nextBatchLocked()
	}
	a.saveLocked()
	v := a.viewLocked()
	a.mu.Unlock()

	a.r.logger.Info().Int("queued", queued).Msg("enqueuefuture: Auto torrent batch confirmed")
	a.kickPicker()
	a.kickAdder()
	return v, nil
}

// RetryAutoTorrent searches the batch on screen again after a failure.
func (r *Repository) RetryAutoTorrent() AutoTorrentView {
	a := r.autoTorrent
	a.mu.Lock()
	if a.state.Active && len(a.state.Batch) > 0 {
		a.state.Picks = nil
		a.state.PickError = ""
		a.saveLocked()
	}
	v := a.viewLocked()
	a.mu.Unlock()
	a.kickPicker()
	return v
}

// EndAutoTorrent closes the session. Confirmed picks still waiting to be sent keep going.
func (r *Repository) EndAutoTorrent() AutoTorrentView {
	a := r.autoTorrent
	a.mu.Lock()
	defer a.mu.Unlock()
	a.cancelPickLocked()
	a.generation++
	a.state.Active = false
	a.state.Candidates, a.state.Handled = nil, nil
	a.state.Batch, a.state.Picks, a.state.PickError = nil, nil, ""
	a.state.Removed, a.state.AutoMatchOff = nil, nil
	a.state.NextBatch, a.state.NextPicks = nil, nil
	a.saveLocked()
	return a.viewLocked()
}

// upcomingLocked is the next batch's worth of anime not yet handled, skipping those in exclude.
func (a *autoTorrent) upcomingLocked(exclude []int) []int {
	handled := make(map[int]struct{}, len(a.state.Handled))
	for _, id := range a.state.Handled {
		handled[id] = struct{}{}
	}
	out := make([]int, 0, AutoTorrentBatchSize)
	for _, id := range a.state.Candidates {
		if len(out) == AutoTorrentBatchSize {
			break
		}
		if _, ok := handled[id]; ok || slices.Contains(exclude, id) {
			continue
		}
		out = append(out, id)
	}
	return out
}

// nextBatchLocked puts the next unreviewed anime on screen, to be searched.
func (a *autoTorrent) nextBatchLocked() {
	a.state.Batch = a.upcomingLocked(nil)
	a.state.Picks = nil
	a.state.PickError = ""
	a.state.Removed = []int{}
	a.state.AutoMatchOff = []int{}
	a.state.NextBatch, a.state.NextPicks = nil, nil
}

func (a *autoTorrent) cancelPickLocked() {
	if a.pickCancel != nil {
		a.pickCancel()
		a.pickCancel = nil
	}
	a.picking = false
	a.pickingNext = false
}

// +---------------------+
// |       Picker        |
// +---------------------+

// kickPicker starts the picker if there is something to search and it is not already running.
func (a *autoTorrent) kickPicker() {
	a.mu.Lock()
	if a.picking || a.hooks == nil {
		a.mu.Unlock()
		return
	}
	a.picking = true
	a.pickerRun++
	run := a.pickerRun
	a.mu.Unlock()
	go a.runPicker(run)
}

func (a *autoTorrent) runPicker(run int) {
	defer util.HandlePanicInModuleThen("enqueuefuture/autoTorrent.runPicker", func() {
		a.mu.Lock()
		if a.pickerRun == run {
			a.picking = false
		}
		a.mu.Unlock()
	})

	for {
		a.mu.Lock()
		if !a.picking || a.pickerRun != run {
			a.mu.Unlock()
			return
		}
		st := &a.state
		var ids []int
		next := false
		switch {
		case !st.Active:
		case len(st.Batch) > 0 && st.Picks == nil && st.PickError == "":
			ids = slices.Clone(st.Batch)
		case len(st.Batch) > 0 && st.Picks != nil && st.NextBatch == nil:
			// The batch on screen is ready: get the one after it ready too.
			if upcoming := a.upcomingLocked(st.Batch); len(upcoming) > 0 {
				st.NextBatch = upcoming
				ids = slices.Clone(upcoming)
				next = true
			}
		}
		if len(ids) == 0 {
			a.picking = false
			a.pickingNext = false
			a.pickCancel = nil
			a.mu.Unlock()
			return
		}
		ctx, cancel := context.WithCancel(context.Background())
		a.pickCancel = cancel
		a.pickingNext = next
		gen := a.generation
		var client *http.Client
		if a.hooks.ContentsClient != nil {
			client = a.hooks.ContentsClient()
		}
		a.mu.Unlock()

		a.progressIDs, a.progress = ids, 0
		picks := a.pick(ctx, ids, client, func(done int) {
			a.mu.Lock()
			if slices.Equal(a.progressIDs, ids) {
				a.progress = done
			}
			a.mu.Unlock()
		})
		failed := ctx.Err() != nil
		cancel()

		a.mu.Lock()
		// Thrown away if this run was cancelled or the session moved on while it was searching.
		if !a.picking || a.pickerRun != run {
			a.mu.Unlock()
			return
		}
		if gen != a.generation || failed {
			a.mu.Unlock()
			continue
		}
		st = &a.state
		// Stored by which batch it turned out to be for, not which it was started for: a search for
		// the next batch becomes this batch's when you confirm before it finishes.
		switch {
		case slices.Equal(st.Batch, ids) && st.Picks == nil:
			st.Picks = picks
			// A flagged pick is most likely the whole series for a special; filing that into the
			// special's entry automatically would be wrong, so those start with auto-match off.
			st.AutoMatchOff = flaggedIDs(picks)
		case slices.Equal(st.NextBatch, ids):
			st.NextPicks = picks
		}
		a.saveLocked()
		a.mu.Unlock()
	}
}

// +---------------------+
// |        Adder        |
// +---------------------+

func (a *autoTorrent) kickAdder() {
	a.mu.Lock()
	if a.adding || a.hooks == nil || len(a.state.Adds) == 0 {
		a.mu.Unlock()
		return
	}
	a.adding = true
	a.mu.Unlock()
	go a.runAdder()
}

func (a *autoTorrent) runAdder() {
	defer util.HandlePanicInModuleThen("enqueuefuture/autoTorrent.runAdder", func() {
		a.mu.Lock()
		a.adding = false
		a.state.AddStatus.Current = ""
		a.mu.Unlock()
	})

	for {
		a.mu.Lock()
		if len(a.state.Adds) == 0 {
			a.adding = false
			a.state.AddStatus.Current = ""
			a.state.AddStatus.Waiting = ""
			a.saveLocked()
			a.mu.Unlock()
			return
		}
		job := a.state.Adds[0]
		hooks := a.hooks
		a.mu.Unlock()

		if hooks.ClientUnavailable != nil {
			if unavailable, why := hooks.ClientUnavailable(); unavailable {
				a.setAddWaiting(why)
				time.Sleep(autoTorrentAddBackoff)
				continue
			}
		}
		if hooks.Add == nil {
			a.setAddWaiting("The torrent client is not wired in yet")
			time.Sleep(autoTorrentAddBackoff)
			continue
		}
		// Dealt with since you confirmed it — downloaded by hand, matched, skipped. Dropped without
		// touching the client, and without the gap: nothing was sent.
		if reason := a.r.SettledReason(job.MediaID); reason != "" {
			a.r.logger.Debug().Str("torrent", job.Torrent.Name).Str("reason", reason).Msg("enqueuefuture: Auto torrent skipping, anime already dealt with")
			a.mu.Lock()
			a.popAddLocked(job)
			a.state.AddStatus.Settled++
			a.saveLocked()
			a.mu.Unlock()
			continue
		}

		a.mu.Lock()
		a.state.AddStatus.Current = job.Torrent.Name
		a.state.AddStatus.Waiting = ""
		a.mu.Unlock()

		started := time.Now()
		added, err := hooks.Add(job)
		took := time.Since(started)

		a.mu.Lock()
		// Removed from the list only now it has been tried, so a restart mid-add tries it again —
		// the client refuses a torrent it already has, so that cannot add it twice.
		a.popAddLocked(job)
		a.state.AddStatus.Current = ""
		switch {
		case err != nil:
			a.state.AddStatus.Failed++
			a.state.AddStatus.LastError = err.Error()
		case added:
			a.state.AddStatus.Added++
		default:
			a.state.AddStatus.Skipped++
		}
		more := len(a.state.Adds) > 0
		a.saveLocked()
		a.mu.Unlock()

		if err != nil {
			a.r.logger.Warn().Err(err).Str("torrent", job.Torrent.Name).Msg("enqueuefuture: Auto torrent could not add torrent")
		}

		// The gap only sits between two adds, so the last one does not hold the worker.
		if !more {
			continue
		}
		gap := autoTorrentAddGap
		if took > autoTorrentSlowAdd {
			gap = autoTorrentAddBackoff
			a.setAddWaiting("The torrent client was slow to accept the last torrent, giving it a minute")
		}
		time.Sleep(gap)
	}
}

// popAddLocked removes job from the front of the list, if it is still there.
func (a *autoTorrent) popAddLocked(job AutoTorrentJob) {
	if len(a.state.Adds) > 0 && a.state.Adds[0].MediaID == job.MediaID && a.state.Adds[0].Torrent.Name == job.Torrent.Name {
		a.state.Adds = a.state.Adds[1:]
	}
}

func (a *autoTorrent) setAddWaiting(why string) {
	a.mu.Lock()
	a.state.AddStatus.Waiting = why
	a.mu.Unlock()
}

// +---------------------+
// |       Helpers       |
// +---------------------+

func flaggedIDs(picks []*AutoPick) []int {
	out := []int{}
	for _, p := range picks {
		if p != nil && p.Torrent != nil && p.Flag != "" {
			out = append(out, p.MediaID)
		}
	}
	return out
}

// onlyIn keeps the ids that are in batch, once each.
func onlyIn(ids []int, batch []int) []int {
	out := []int{}
	for _, id := range ids {
		if slices.Contains(batch, id) && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}

func nonNil(ids []int) []int {
	if ids == nil {
		return []int{}
	}
	return ids
}
