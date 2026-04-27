package limiter

import (
	"sync"
	"time"
)

// https://stackoverflow.com/a/72452542

func NewAnilistLimiter() *Limiter {
	// 26 requests per minute — stays safely under AniList's 90/min hard cap even
	// when several profiles are active simultaneously.
	return NewLimiter(time.Minute, 26)
}

//----------------------------------------------------------------------------------------------------------------------

type Limiter struct {
	tick    time.Duration
	count   uint
	entries []time.Time
	index   uint
	mu      sync.Mutex
}

func NewLimiter(tick time.Duration, count uint) *Limiter {
	l := Limiter{
		tick:  tick,
		count: count,
		index: 0,
	}
	l.entries = make([]time.Time, count)
	before := time.Now().Add(-2 * tick)
	for i := range l.entries {
		l.entries[i] = before
	}
	return &l
}

func (l *Limiter) Wait() {
	l.mu.Lock()
	idx := l.index
	last := l.entries[idx]
	next := last.Add(l.tick)
	now := time.Now()

	reservedAt := now
	if now.Before(next) {
		reservedAt = next
	}

	l.entries[idx] = reservedAt
	l.index = l.index + 1
	if l.index == l.count {
		l.index = 0
	}
	l.mu.Unlock()

	if now.Before(next) {
		time.Sleep(next.Sub(now))
	}
}
