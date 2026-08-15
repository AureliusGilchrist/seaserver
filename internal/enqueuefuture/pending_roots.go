package enqueuefuture

import (
	"encoding/json"
	"os"
	"path/filepath"
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
	if err := os.WriteFile(r.pendingRootsPath(), data, 0o644); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not save the waiting roots")
	}
}

// queueRoot adds an anime to the waiting list, ignoring one that is already on it.
func (r *Repository) queueRoot(root pendingRoot) int {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	roots := r.loadPendingRoots()
	for _, existing := range roots {
		if existing.MediaID == root.MediaID {
			return len(roots)
		}
	}

	roots = append(roots, root)
	r.savePendingRoots(roots)
	return len(roots)
}

// takeNextRoot removes and returns the anime at the front of the waiting list.
func (r *Repository) takeNextRoot() (pendingRoot, bool) {
	r.pendingRootsMu.Lock()
	defer r.pendingRootsMu.Unlock()

	roots := r.loadPendingRoots()
	if len(roots) == 0 {
		return pendingRoot{}, false
	}

	next := roots[0]
	r.savePendingRoots(roots[1:])
	return next, true
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

	next, ok := r.takeNextRoot()
	if !ok {
		return
	}

	r.logger.Info().
		Int("rootMediaId", next.MediaID).
		Str("title", next.Title).
		Msg("enqueuefuture: Starting the next queued run")

	if _, err := r.Enqueue(next.MediaID, next.Title, next.ProfileID); err != nil {
		r.logger.Warn().Err(err).Int("rootMediaId", next.MediaID).
			Msg("enqueuefuture: Could not start the next queued run, putting it back on the list")
		r.pendingRootsMu.Lock()
		r.savePendingRoots(append([]pendingRoot{next}, r.loadPendingRoots()...))
		r.pendingRootsMu.Unlock()
	}
}
