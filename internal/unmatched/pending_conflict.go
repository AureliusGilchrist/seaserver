package unmatched

import "sync"

// A conflict found by an automatic match has nobody to answer it.
//
// The manual path is fine: the user pressed Match, the conflict comes back in the response, and the
// screen puts the question to them there and then. An automatic match happens because a download
// finished, with nobody looking — and the conflict was returned to a caller that had nothing to do
// with it. The scanner logged a warning and stopped.
//
// From the outside that is a download that finished, moved nothing, and said nothing: it sits in the
// Unmatched screen looking exactly like one that has not been dealt with yet, with no sign that it
// is waiting on a decision and no way to give one except to press Match and rediscover the conflict
// by hand. So the conflict is kept here until it is answered, and shipped with the torrent listing
// the screen already polls.
//
// Held in memory rather than stored. A conflict is a statement about what is on disk right now, and
// the files behind it can be moved, replaced or deleted by anything at any time; one written down
// and reloaded a week later would be describing a library that has since changed. Losing them on
// restart is correct — the next automatic match works the question out again from what is actually
// there.

type pendingConflicts struct {
	mu sync.RWMutex
	by map[string]*MatchConflict
}

func newPendingConflicts() *pendingConflicts {
	return &pendingConflicts{by: make(map[string]*MatchConflict)}
}

// SetPendingConflict records that an automatic match stopped on a conflict and is waiting for the
// user to say which copy they want.
func (r *Repository) SetPendingConflict(torrentName string, conflict *MatchConflict) {
	if torrentName == "" || conflict == nil {
		return
	}
	r.pending.mu.Lock()
	defer r.pending.mu.Unlock()
	r.pending.by[torrentName] = conflict
}

// PendingConflict returns the unanswered conflict for a torrent, or nil.
func (r *Repository) PendingConflict(torrentName string) *MatchConflict {
	r.pending.mu.RLock()
	defer r.pending.mu.RUnlock()
	return r.pending.by[torrentName]
}

// ClearPendingConflict forgets a conflict once it has been answered — or once the question has
// stopped making sense, because the torrent was matched, deleted or removed from the screen.
func (r *Repository) ClearPendingConflict(torrentName string) {
	r.pending.mu.Lock()
	defer r.pending.mu.Unlock()
	delete(r.pending.by, torrentName)
}

// PendingConflictCount reports how many downloads are waiting on a decision.
func (r *Repository) PendingConflictCount() int {
	r.pending.mu.RLock()
	defer r.pending.mu.RUnlock()
	return len(r.pending.by)
}
