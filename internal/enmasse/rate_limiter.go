package enmasse

import (
    "context"
    "sync"
    "time"
)

// RateLimiter enforces a max number of events within a sliding window.
// Simple windowed limiter suitable for low-rate operations.
type RateLimiter struct {
    mu         sync.Mutex
    window     []time.Time
    limit      int
    windowSize time.Duration
}

func NewRateLimiter(limit int, windowSize time.Duration) *RateLimiter {
    return &RateLimiter{
        window:     make([]time.Time, 0, limit),
        limit:      limit,
        windowSize: windowSize,
    }
}

// Acquire waits until a slot is available or context is cancelled.
func (r *RateLimiter) Acquire(ctx context.Context) error {
    for {
        now := time.Now()

        r.mu.Lock()
        cutoff := now.Add(-r.windowSize)
        // Drop timestamps outside the window
        i := 0
        for i < len(r.window) && r.window[i].Before(cutoff) {
            i++
        }
        if i > 0 {
            r.window = r.window[i:]
        }

        if len(r.window) < r.limit {
            r.window = append(r.window, now)
            r.mu.Unlock()
            return nil
        }

        // Need to wait until the earliest timestamp expires
        waitFor := r.window[0].Add(r.windowSize).Sub(now)
        r.mu.Unlock()

        if waitFor <= 0 {
            continue
        }

        timer := time.NewTimer(waitFor)
        select {
        case <-ctx.Done():
            timer.Stop()
            return ctx.Err()
        case <-timer.C:
        }
    }
}

// Shared rate limits (per minute)
const (
    ProviderRateLimitPerMinute    = 12
    AniListAutoRateLimitPerMinute = 6
    AniListUserRateLimitPerMinute = 18
)

var (
    providerMinuteLimiter = NewRateLimiter(ProviderRateLimitPerMinute, time.Minute)
    anilistAutoLimiter    = NewRateLimiter(AniListAutoRateLimitPerMinute, time.Minute)
    anilistUserLimiter    = NewRateLimiter(AniListUserRateLimitPerMinute, time.Minute)
)

type userInitiatedKey struct{}

// WithUserInitiated marks a context as user-initiated (higher AniList allowance).
func WithUserInitiated(ctx context.Context) context.Context {
    return context.WithValue(ctx, userInitiatedKey{}, true)
}

// IsUserInitiated checks if context has user initiation flag.
func IsUserInitiated(ctx context.Context) bool {
    v := ctx.Value(userInitiatedKey{})
    b, ok := v.(bool)
    return ok && b
}

func acquireProvider(ctx context.Context) error {
    return providerMinuteLimiter.Acquire(ctx)
}

func acquireAniList(ctx context.Context, userInitiated bool) error {
    if userInitiated {
        return anilistUserLimiter.Acquire(ctx)
    }
    return anilistAutoLimiter.Acquire(ctx)
}
