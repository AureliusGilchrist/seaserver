package enqueuefuture

import (
	"encoding/json"
	"os"
	"path/filepath"
	"seanime/internal/util"
	"time"
)

// A run walks one anime's graph, and only one run happens at a time — the pacing that keeps it
// inside AniList's budget is the whole reason it takes as long as it does, and two runs would simply
// halve each other's rate while doubling the refusals.
//
// That made "enqueue this too" mean "wait for the current one to finish, remember to come back, and
// start it by hand" — for something that already runs for half an hour unattended. So roots queue
// instead: ask for as many as you like, they are walked one after another, and the next one starts
// itself the moment the previous finishes.
//
// Kept on disk beside the run's own progress. A queue of roots that evaporates when the server
// restarts is worse than no queue: the run itself survives a restart, so the list of what to do
// after it has to as well.

const pendingRootsFileName = "enqueue-future-pending-roots.json"

// MaxPendingRoots is how many anime may wait their turn behind the running one.
//
// Each root is a full walk of its own — every franchise it leads to, every family walked to its ends
// — so twenty of them is a very long stretch of unattended work, measured in hours rather than
// minutes. The cap is not about memory or disk; it is about the list still meaning something. A
// waiting list you can no longer remember the far end of is a way to queue things you have forgotten
// wanting, and to be told "already queued" about an anime whose turn is a day away.
const MaxPendingRoots = 20

// pendingRoot is one anime waiting for its turn.
type pendingRoot struct {
	MediaID   int       `json:"mediaId"`
	Title     string    `json:"title"`
	ProfileID uint      `json:"profileId"`
	QueuedAt  time.Time `json:"queuedAt"`
}

func (r *Repository) pendingRootsPath() string {
	return filepath.Join(r.dataDir, pendingRootsFileName)
}

// loadPendingRoots reads the waiting list. An unreadable or corrupt file is an empty list: the roots
// are a convenience, and losing them costs a few clicks rather than any queued anime.
func (r *Repository) loadPendingRoots() []pendingRoot {
	data, err := os.ReadFile(r.pendingRootsPath())
	if err != nil {
		return nil
	}

	var roots []pendingRoot
	if err := json.Unmarshal(data, &roots); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not read the waiting roots, starting the list empty")
		return nil
	}
	return roots
}

func (r *Repository) savePendingRoots(roots []pendingRoot) {
	if len(roots) == 0 {
		_ = os.Remove(r.pendingRootsPath())
		return
	}

	data, err := json.Marshal(roots)
	if err != nil {
		return
	}
	if err := util.WriteFileCrashSafe(r.pendingRootsPath(), data, 0o644); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not save the waiting roots")
	}
}

// queueRoot adds an anime to the waiting list, ignoring one that is already on it.
//
// Reports the length of the list and whether this anime is on it — false means the list is full, so
// the caller can say that rather than silently doing nothing.
func (r *Repository) queueRoot(root pendingRoot) (int, bool) {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	roots := r.loadPendingRoots()
	for _, existing := range roots {
		if existing.MediaID == root.MediaID {
			return len(roots), true
		}
	}

	if len(roots) >= MaxPendingRoots {
		return len(roots), false
	}

	// Onto the front, not the end.
	//
	// Pressing the button on a details page is you saying "this one next" — you are looking at it,
	// you decided about it just now, and the queue behind it is whatever you decided about earlier.
	// Appending meant the anime you most recently chose was the last one walked, sometimes hours
	// later. It still does not interrupt the run in progress: that one keeps going, and this is the
	// one that starts when it ends.
	roots = append([]pendingRoot{root}, roots...)
	r.savePendingRoots(roots)
	return len(roots), true
}

// peekNextRoot returns the anime at the front of the waiting list without removing it.
//
// Deliberately a peek rather than a take: a root is only dropped from the list once its run has
// actually started and written its own progress record. Removing it first opened a window where the
// process dying — a crash, a power cut, a kill — lost that anime entirely: gone from the waiting
// list, never started, with nothing anywhere to say it had been asked for.
func (r *Repository) peekNextRoot() (pendingRoot, bool) {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	roots := r.loadPendingRoots()
	if len(roots) == 0 {
		return pendingRoot{}, false
	}
	return roots[0], true
}

// dropRoot removes one anime from the waiting list, by media ID.
func (r *Repository) dropRoot(mediaID int) {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	roots := r.loadPendingRoots()
	kept := make([]pendingRoot, 0, len(roots))
	for _, root := range roots {
		if root.MediaID != mediaID {
			kept = append(kept, root)
		}
	}
	r.savePendingRoots(kept)
}

// PendingRootInfo is one waiting anime as the screen sees it.
type PendingRootInfo struct {
	MediaID  int       `json:"mediaId"`
	Title    string    `json:"title"`
	QueuedAt time.Time `json:"queuedAt"`
}

// PendingRoots is the waiting list in the order it will be walked.
func (r *Repository) PendingRoots() []PendingRootInfo {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	roots := r.loadPendingRoots()
	out := make([]PendingRootInfo, 0, len(roots))
	for _, root := range roots {
		out = append(out, PendingRootInfo{MediaID: root.MediaID, Title: root.Title, QueuedAt: root.QueuedAt})
	}
	return out
}

// PendingRootCount is how many anime are waiting their turn, for the status readout.
func (r *Repository) PendingRootCount() int {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()
	return len(r.loadPendingRoots())
}

// ClearPendingRoots empties the waiting list without touching the run in progress.
func (r *Repository) ClearPendingRoots() {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()
	r.savePendingRoots(nil)
}

// startNextPendingRoot begins the next waiting run, if there is one and nothing else is running.
//
// Called when a run finishes. Failing to start the next one leaves it on the list rather than
// dropping it — the next finish, or a manual start, picks it up.
func (r *Repository) startNextPendingRoot() {
	r.mu.Lock()
	running := r.running
	r.mu.Unlock()
	if running {
		return
	}

	// What you asked for first, always. The re-walk backlog only runs when your own list is empty,
	// so a bulk re-walk fills the gaps between your choices instead of delaying them.
	next, ok := r.peekNextRoot()
	fromBacklog := false
	if !ok {
		next, ok = r.peekBacklogRoot()
		fromBacklog = true
	}
	if !ok {
		return
	}

	r.logger.Info().
		Int("rootMediaId", next.MediaID).
		Str("title", next.Title).
		Msg("enqueuefuture: Starting the next queued run")

	if _, err := r.startRoot(next); err != nil {
		r.logger.Warn().Err(err).Int("rootMediaId", next.MediaID).
			Msg("enqueuefuture: Could not start the next queued run, leaving it on the list")
		return
	}

	// Started, and its progress record is written — the run itself is now what survives a crash, so
	// the waiting list no longer needs to hold it.
	if fromBacklog {
		r.dropBacklogRoot(next.MediaID)
		return
	}
	r.dropRoot(next.MediaID)
}

// queueRootsBulk appends many anime to the waiting list at once, past the manual cap.
//
// MaxPendingRoots exists so the list you build by hand stays something you can remember the far end
// of. A bulk re-walk is not that: it is one deliberate instruction about the whole queue, and
// refusing it at twenty would make the feature useless on a library of any size. Appended rather
// than prepended, so anything you pick by hand afterwards still goes first.
//
// Returns how many were added.
func (r *Repository) queueRootsBulk(roots []pendingRoot) int {
	if len(roots) == 0 {
		return 0
	}

	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	existing := r.loadPendingRoots()
	known := make(map[int]struct{}, len(existing))
	for _, root := range existing {
		known[root.MediaID] = struct{}{}
	}

	added := 0
	for _, root := range roots {
		if _, seen := known[root.MediaID]; seen {
			continue
		}
		known[root.MediaID] = struct{}{}
		existing = append(existing, root)
		added++
	}

	if added > 0 {
		r.savePendingRoots(existing)
	}
	return added
}

// The re-walk backlog is a second, separate waiting list.
//
// Re-walking every franchise queues hundreds of roots at once, and putting those on the list you
// build by hand would bury it: the three anime you actually chose would sit somewhere inside a wall
// of automatic entries, the count would read "347 waiting", and removing one of yours would mean
// finding it first. They are different kinds of instruction and they get different lists.
//
// The hand-built list always wins. The backlog is only drawn from when nothing you asked for is
// waiting, so a re-walk fills the gaps between your own choices rather than delaying them.

const rewalkBacklogFileName = "enqueue-future-rewalk-backlog.json"

func (r *Repository) rewalkBacklogPath() string {
	return filepath.Join(r.dataDir, rewalkBacklogFileName)
}

func (r *Repository) loadRewalkBacklog() []pendingRoot {
	data, err := os.ReadFile(r.rewalkBacklogPath())
	if err != nil {
		return nil
	}
	var roots []pendingRoot
	if err := json.Unmarshal(data, &roots); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not read the re-walk backlog, starting it empty")
		return nil
	}
	return roots
}

func (r *Repository) saveRewalkBacklog(roots []pendingRoot) {
	if len(roots) == 0 {
		_ = os.Remove(r.rewalkBacklogPath())
		return
	}
	data, err := json.Marshal(roots)
	if err != nil {
		return
	}
	if err := util.WriteFileCrashSafe(r.rewalkBacklogPath(), data, 0o644); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not save the re-walk backlog")
	}
}

// queueRewalkBacklog appends franchises to the backlog, skipping ones already on either list.
func (r *Repository) queueRewalkBacklog(roots []pendingRoot) int {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	known := make(map[int]struct{})
	for _, root := range r.loadPendingRoots() {
		known[root.MediaID] = struct{}{}
	}
	backlog := r.loadRewalkBacklog()
	for _, root := range backlog {
		known[root.MediaID] = struct{}{}
	}

	added := 0
	for _, root := range roots {
		if _, seen := known[root.MediaID]; seen {
			continue
		}
		known[root.MediaID] = struct{}{}
		backlog = append(backlog, root)
		added++
	}

	if added > 0 {
		r.saveRewalkBacklog(backlog)
	}
	return added
}

// RewalkBacklogCount is how many franchises are waiting to be walked again.
func (r *Repository) RewalkBacklogCount() int {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()
	return len(r.loadRewalkBacklog())
}

// ClearRewalkBacklog abandons the re-walk without touching anything you queued by hand.
func (r *Repository) ClearRewalkBacklog() {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()
	r.saveRewalkBacklog(nil)
}

// RemovePendingRoot takes one anime off the hand-built waiting list.
func (r *Repository) RemovePendingRoot(mediaID int) {
	r.dropRoot(mediaID)
	r.logger.Info().Int("mediaId", mediaID).Msg("enqueuefuture: Removed an anime from the waiting list")
}

// peekBacklogRoot returns the next franchise waiting to be re-walked, without removing it.
func (r *Repository) peekBacklogRoot() (pendingRoot, bool) {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	backlog := r.loadRewalkBacklog()
	if len(backlog) == 0 {
		return pendingRoot{}, false
	}
	return backlog[0], true
}

// dropBacklogRoot removes one franchise from the backlog.
func (r *Repository) dropBacklogRoot(mediaID int) {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	backlog := r.loadRewalkBacklog()
	kept := make([]pendingRoot, 0, len(backlog))
	for _, root := range backlog {
		if root.MediaID != mediaID {
			kept = append(kept, root)
		}
	}
	r.saveRewalkBacklog(kept)
}
