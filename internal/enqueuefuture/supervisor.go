package enqueuefuture

import (
	"time"
)

// The run keeps itself going.
//
// A walk is meant to be unattended: you point it at a few series and come back later. But the only
// things that ever started a run were a button on a page and the startup resume — so a run that
// ended in an error, or one that was cut short by a rate limit that outlasted its backoff, sat dead
// until somebody happened to open the queue and press Resume. From the outside that is exactly what
// it looked like: the feature only worked while you were watching it.
//
// This is the piece that was missing. Every couple of minutes, if nothing is running, it looks for
// work — a walk with a progress record, or a waiting list with something on it — and starts it. The
// page becomes a window onto the queue rather than the thing that drives it.
//
// Deliberately conservative: one check per interval, no work at all while a run is going, and a
// widening gap between attempts after a failure so a queue that cannot start (a token that needs
// re-authenticating, an upstream that is down) is retried a few times an hour rather than every
// couple of minutes forever.

const (
	// How often the supervisor looks, when things are healthy.
	supervisorInterval = 2 * time.Minute

	// The longest it will wait between attempts after repeated failures. A run that cannot start is
	// usually waiting on something outside this process, and the answer is to check occasionally
	// rather than to keep asking.
	supervisorMaxInterval = 30 * time.Minute
)

// StartSupervisor begins the background supervision of the walk. Call once, after the repository is
// wired up (see ResumeIfInterrupted, which it supersedes as the thing that keeps runs alive).
func (r *Repository) StartSupervisor() {
	go r.supervise()
}

func (r *Repository) supervise() {
	failures := 0
	timer := time.NewTimer(supervisorInterval)
	defer timer.Stop()

	for range timer.C {
		started := r.superviseOnce()
		if started {
			failures = 0
			timer.Reset(supervisorInterval)
			continue
		}

		// Nothing to start is not a failure — an idle queue is the normal state — but a start that
		// was attempted and refused is, and the two are told apart by what is waiting to be run.
		if r.hasWorkWaiting() {
			failures++
		} else {
			failures = 0
		}
		timer.Reset(supervisorBackoff(failures))
	}
}

// superviseOnce starts whatever is waiting, if nothing is running. Returns whether a run was started.
func (r *Repository) superviseOnce() bool {
	r.mu.Lock()
	running := r.running
	r.mu.Unlock()
	if running {
		return false
	}

	// A walk with a progress record is work already in flight: the run that was interrupted, or the
	// one that ended badly. It comes first — it is the queue the user is actually working through.
	if r.CanResume() {
		r.logger.Info().Msg("enqueuefuture: Picking up the walk in the background")
		if _, err := r.Resume(); err == nil {
			return true
		} else {
			r.logger.Warn().Err(err).Msg("enqueuefuture: Could not pick the walk back up")
		}
	}

	// Then anything waiting its turn behind a run that has finished.
	if r.PendingRootCount() > 0 || r.RewalkBacklogCount() > 0 {
		r.logger.Info().
			Int("waiting", r.PendingRootCount()).
			Msg("enqueuefuture: Starting the next queued run in the background")
		r.startNextPendingRoot()
		// startNextPendingRoot reports nothing; whether it started one shows up as the run flag.
		r.mu.Lock()
		started := r.running
		r.mu.Unlock()
		return started
	}

	return false
}

// hasWorkWaiting reports whether there is anything the supervisor is trying to start.
func (r *Repository) hasWorkWaiting() bool {
	return r.CanResume() || r.PendingRootCount() > 0 || r.RewalkBacklogCount() > 0
}

// supervisorBackoff widens the gap after repeated failures, up to a ceiling.
func supervisorBackoff(failures int) time.Duration {
	if failures <= 0 {
		return supervisorInterval
	}
	interval := supervisorInterval
	for i := 1; i < failures; i++ {
		interval *= 2
		if interval >= supervisorMaxInterval {
			return supervisorMaxInterval
		}
	}
	return interval
}
