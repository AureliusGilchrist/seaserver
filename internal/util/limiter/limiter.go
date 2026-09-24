package limiter

import (
	"context"
	"sync"
	"time"
)

// https://stackoverflow.com/a/72452542

func NewAnilistLimiter() *Limiter {
	// 30 requests per 6 seconds (user-requested rate)
	return NewLimiter(6*time.Second, 30)
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
	next, now := l.reserve()
	if now.Before(next) {
		time.Sleep(next.Sub(now))
	}
}

// WaitContext behaves like Wait, but returns ctx.Err() as soon as ctx is cancelled or its
// deadline elapses instead of sleeping until the reserved slot arrives. The slot is still
// reserved up front (as in Wait), so giving up early does not let anyone else's request jump
// the queue — it only stops this caller from waiting for its own turn.
//
// Use this instead of Wait wherever the caller has a deadline of its own (e.g. a request that
// must fall back to cached data rather than hang): a plain Wait ignores ctx entirely, so a
// contended limiter can block a request far longer than any timeout the caller thought it had.
func (l *Limiter) WaitContext(ctx context.Context) error {
	next, now := l.reserve()
	if !now.Before(next) {
		return nil
	}

	timer := time.NewTimer(next.Sub(now))
	defer timer.Stop()

	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// reserve claims the next available slot and reports the time it becomes usable, alongside the
// time it was claimed at.
func (l *Limiter) reserve() (next time.Time, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()

	idx := l.index
	last := l.entries[idx]
	next = last.Add(l.tick)
	now = time.Now()

	reservedAt := now
	if now.Before(next) {
		reservedAt = next
	}

	l.entries[idx] = reservedAt
	l.index = l.index + 1
	if l.index == l.count {
		l.index = 0
	}
	return next, now
}
