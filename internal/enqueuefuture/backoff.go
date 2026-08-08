package enqueuefuture

import (
	"strings"
	"time"
)

// backoffLadder is how long the run waits after being rate limited, rung by rung.
//
// Each rung is tried attemptsPerRung times before moving to the next, so the full sequence is
// 5s 5s 5s 10s 10s 10s 15s 15s 15s 30s 30s 30s 1m 1m 1m 3m 3m 3m 5m 5m 5m — 21 attempts spread over
// roughly half an hour. Repeating a rung matters: most rate limits clear on their own within a
// window or two, and jumping straight from 5s to 5m would idle for minutes over a hiccup that
// resolved almost immediately.
var backoffLadder = []time.Duration{
	5 * time.Second,
	10 * time.Second,
	15 * time.Second,
	30 * time.Second,
	1 * time.Minute,
	3 * time.Minute,
	5 * time.Minute,
}

// attemptsPerRung is how many times each rung of the ladder is used before stepping down to the
// next, longer one.
const attemptsPerRung = 3

// MaxBackoffAttempts is how many rate-limited attempts a run makes before giving up entirely.
var MaxBackoffAttempts = len(backoffLadder) * attemptsPerRung

// MaxItemAttempts is how many times a single anime is retried after a failure that is its own —
// a provider timing out, a malformed response, a dropped connection.
//
// Separate from the ladder above, and deliberately small: rate limits pause the whole run and cost
// an item nothing, while a failure that follows one particular anime around three times over is not
// going to stop following it on the fourth.
const MaxItemAttempts = 3

// backoff tracks position on the ladder for the current run.
//
// It is per-run rather than per-item on purpose. A rate limit is a statement about the upstream
// budget, not about the anime being prepared, so backing off has to pause everything — retrying a
// different entry immediately would just spend the attempt on the same wall.
type backoff struct {
	attempt int
}

// next returns how long to wait before the next attempt, along with the 1-based ladder rung and the
// 1-based attempt within that rung (both for logging and for the progress readout). ok is false once
// the ladder is exhausted.
func (b *backoff) next() (delay time.Duration, rung int, attemptInRung int, ok bool) {
	if b.attempt >= MaxBackoffAttempts {
		return 0, len(backoffLadder), attemptsPerRung, false
	}

	rungIndex := b.attempt / attemptsPerRung
	attemptInRung = b.attempt%attemptsPerRung + 1
	delay = backoffLadder[rungIndex]
	b.attempt++

	return delay, rungIndex + 1, attemptInRung, true
}

// reset puts the ladder back to the bottom. Called after any successful preparation: whatever the
// limit was, it has cleared, and the next one deserves to start at 5s rather than inheriting a 5m
// wait from a problem that is over.
func (b *backoff) reset() {
	b.attempt = 0
}

// exhausted reports whether the ladder has been walked to the end.
func (b *backoff) exhausted() bool {
	return b.attempt >= MaxBackoffAttempts
}

// rateLimitMarkers are the ways upstream says "slow down" by the time the error reaches us.
//
// The AniList client already retries 429s internally with Retry-After (internal/api/anilist/client.go),
// so an error that gets this far means it retried and still could not get through — which is exactly
// when the run should stop pushing rather than ask again a moment later.
var rateLimitMarkers = []string{
	"429",
	"too many requests",
	"rate limit",
	"rate-limit",
	"ratelimited",
	"retry-after",
}

// isRateLimitErr reports whether an error is upstream refusing on volume rather than a genuine
// problem with the entry. Only these pause the run; anything else fails the single item and moves on.
func isRateLimitErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	for _, marker := range rateLimitMarkers {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return false
}
