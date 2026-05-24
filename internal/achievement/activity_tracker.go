package achievement

import (
	"sync"
	"time"
)

// ActivityKind tags an active-engagement session by media type.
// This separation prevents cross-contamination (e.g. watching anime
// incrementing manga reading achievements).
type ActivityKind string

const (
	ActivityKindAnime ActivityKind = "anime"
	ActivityKindManga ActivityKind = "manga"
)

const (
	// InactivityTimeout is the gap after which a session is considered
	// ended and a new one starts. Per user spec: 1 hour.
	InactivityTimeout = time.Hour

	// MaxHeartbeatDelta caps how much time a single heartbeat can credit.
	// Prevents runaway accumulation if a client sends a stale or forged
	// timestamp / sleep-resume scenarios. Frontend sends every ~30s, so
	// 90s gives a small grace window for jitter.
	MaxHeartbeatDelta = 90 * time.Second
)

type sessionState struct {
	LastHeartbeat time.Time
	SessionStart  time.Time
	// ActiveSeconds is the accumulated, server-authoritative time the user
	// has been actively engaged in the current continuous session.
	ActiveSeconds float64
}

// ActivityTracker holds per-profile, per-kind active-engagement sessions.
// All time accounting is server-authoritative — the client only declares
// "I am actively doing X right now" via a heartbeat; the server measures
// the elapsed wall-clock between heartbeats (clamped) and resets after
// InactivityTimeout.
type ActivityTracker struct {
	mu       sync.Mutex
	sessions map[uint]map[ActivityKind]*sessionState
}

// NewActivityTracker constructs an empty tracker.
func NewActivityTracker() *ActivityTracker {
	return &ActivityTracker{
		sessions: make(map[uint]map[ActivityKind]*sessionState),
	}
}

// Heartbeat records that the given profile is actively engaged in `kind`
// at time `now`. It returns the current continuous-session duration in
// hours, the wall-clock delta (in seconds) that was just credited toward
// the session (after clamping), and whether this heartbeat began a new
// session (because none existed or the previous one timed out).
//
// Time accounting rules:
//   - delta = now - lastHeartbeat
//   - if delta > InactivityTimeout: start a new session (return 0h, 0s, true)
//   - if delta < 0: ignore (clock skew)
//   - if delta > MaxHeartbeatDelta: clamp to MaxHeartbeatDelta
//   - else: accumulate delta into ActiveSeconds
func (t *ActivityTracker) Heartbeat(profileID uint, kind ActivityKind, now time.Time) (sessionHours float64, deltaSeconds float64, isNewSession bool) {
	if profileID == 0 {
		return 0, 0, false
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	pm, ok := t.sessions[profileID]
	if !ok {
		pm = make(map[ActivityKind]*sessionState)
		t.sessions[profileID] = pm
	}

	s := pm[kind]
	if s == nil || now.Sub(s.LastHeartbeat) > InactivityTimeout {
		pm[kind] = &sessionState{
			LastHeartbeat: now,
			SessionStart:  now,
			ActiveSeconds: 0,
		}
		return 0, 0, true
	}

	delta := now.Sub(s.LastHeartbeat)
	if delta < 0 {
		delta = 0
	} else if delta > MaxHeartbeatDelta {
		delta = MaxHeartbeatDelta
	}
	s.ActiveSeconds += delta.Seconds()
	s.LastHeartbeat = now
	return s.ActiveSeconds / 3600.0, delta.Seconds(), false
}

// SessionHours returns the current continuous-session length in hours
// without mutating state. Returns 0 if there is no active session or
// the last heartbeat is older than InactivityTimeout.
func (t *ActivityTracker) SessionHours(profileID uint, kind ActivityKind, now time.Time) float64 {
	t.mu.Lock()
	defer t.mu.Unlock()
	pm := t.sessions[profileID]
	if pm == nil {
		return 0
	}
	s := pm[kind]
	if s == nil || now.Sub(s.LastHeartbeat) > InactivityTimeout {
		return 0
	}
	return s.ActiveSeconds / 3600.0
}

// Reset clears the session for a profile/kind (e.g. when the player is
// closed). The next heartbeat will start a fresh session.
func (t *ActivityTracker) Reset(profileID uint, kind ActivityKind) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if pm, ok := t.sessions[profileID]; ok {
		delete(pm, kind)
	}
}
