package core

import (
	"sync"
	"time"
)

// trackFailureWindow is how long a media id that failed to auto-track is left alone
// before the next attempt.
const trackFailureWindow = 30 * time.Minute

// trackFailureMemo remembers media ids that failed to auto-track for offline,
// so a series queued chapter after chapter isn't looked up (and logged) every time.
type trackFailureMemo struct {
	mu       sync.Mutex
	window   time.Duration
	now      func() time.Time
	failedAt map[int]time.Time
}

func newTrackFailureMemo(window time.Duration) *trackFailureMemo {
	return &trackFailureMemo{
		window:   window,
		now:      time.Now,
		failedAt: make(map[int]time.Time),
	}
}

// shouldTry reports whether the id has no failure within the window.
func (m *trackFailureMemo) shouldTry(mediaId int) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	at, ok := m.failedAt[mediaId]
	if !ok {
		return true
	}
	if m.now().Sub(at) >= m.window {
		delete(m.failedAt, mediaId)
		return true
	}
	return false
}

func (m *trackFailureMemo) markFailed(mediaId int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.failedAt[mediaId] = m.now()
}
