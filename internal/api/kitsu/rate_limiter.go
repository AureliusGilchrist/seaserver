package kitsu

import (
	"context"
	"sync"
	"time"
)

// RateLimiter is a small token-bucket limiter used by callers that fan out many requests in
// parallel and want to stay under Kitsu's documented budget.
//
// Authenticated reads at Kitsu allow around 300/minute — far above what a UI render needs — but
// unauthenticated reads are throttled to 60/minute and the abuse-detection trips if a single
// session ever sends more than ~20 in 5 seconds. This limiter hands out at most one token every
// delay, regardless of how bursty the caller is.
type RateLimiter struct {
	delay time.Duration
	mu    sync.Mutex
	last  time.Time
}

// NewRateLimiter constructs a limiter that fires at the configured max-per-second. A typical
// authenticated use calls NewRateLimiter(250*time.Millisecond) (4 req/sec). Calls with
// 0 get a no-op limiter (no wait), which is what tests use to keep CI snappy.
func NewRateLimiter(minInterval time.Duration) *RateLimiter {
	return &RateLimiter{delay: minInterval}
}

// Wait blocks until one token is available. ctx cancels early if the caller bails.
func (rl *RateLimiter) Wait(ctx context.Context) error {
	if rl.delay <= 0 {
		return nil
	}
	rl.mu.Lock()
	now := time.Now()
	next := rl.last.Add(rl.delay)
	wait := next.Sub(now)
	rl.last = now
	rl.mu.Unlock()

	if wait <= 0 {
		return nil
	}

	// Use a timer rather than a sleep so a cancelled context actually unblocks.
	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// DefaultReadLimiter returns the rate limiter used by service-layer callers for read calls. The
// 250ms gap is Kitsu's write-call cadence; reads are technically allowed for more, but the
// conservative gap keeps fan-out loops friendly and still well below the auth-budget.
func DefaultReadLimiter() *RateLimiter {
	return NewRateLimiter(250 * time.Millisecond)
}
