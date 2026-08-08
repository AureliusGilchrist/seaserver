package enqueuefuture

import (
	"errors"
	"testing"
	"time"
)

func TestBackoffLadderWalksEachRungThreeTimes(t *testing.T) {
	bo := &backoff{}

	expected := []time.Duration{
		5 * time.Second, 5 * time.Second, 5 * time.Second,
		10 * time.Second, 10 * time.Second, 10 * time.Second,
		15 * time.Second, 15 * time.Second, 15 * time.Second,
		30 * time.Second, 30 * time.Second, 30 * time.Second,
		1 * time.Minute, 1 * time.Minute, 1 * time.Minute,
		3 * time.Minute, 3 * time.Minute, 3 * time.Minute,
		5 * time.Minute, 5 * time.Minute, 5 * time.Minute,
	}

	if len(expected) != MaxBackoffAttempts {
		t.Fatalf("expected %d attempts in the ladder, MaxBackoffAttempts is %d", len(expected), MaxBackoffAttempts)
	}

	for i, want := range expected {
		got, rung, attemptInRung, ok := bo.next()
		if !ok {
			t.Fatalf("attempt %d: ladder reported exhausted early", i+1)
		}
		if got != want {
			t.Errorf("attempt %d: got %s, want %s", i+1, got, want)
		}
		if wantRung := i/attemptsPerRung + 1; rung != wantRung {
			t.Errorf("attempt %d: got rung %d, want %d", i+1, rung, wantRung)
		}
		if wantInRung := i%attemptsPerRung + 1; attemptInRung != wantInRung {
			t.Errorf("attempt %d: got attempt-in-rung %d, want %d", i+1, attemptInRung, wantInRung)
		}
	}

	if _, _, _, ok := bo.next(); ok {
		t.Error("the ladder handed out more than MaxBackoffAttempts attempts")
	}
	if !bo.exhausted() {
		t.Error("the ladder does not report itself exhausted after the last rung")
	}
}

func TestBackoffResetReturnsToTheBottom(t *testing.T) {
	bo := &backoff{}

	// Walk past the first rung so a reset that only rewinds one step would be caught.
	for i := 0; i < 5; i++ {
		bo.next()
	}
	bo.reset()

	got, rung, attemptInRung, ok := bo.next()
	if !ok || got != 5*time.Second || rung != 1 || attemptInRung != 1 {
		t.Errorf("after reset got (%s, rung %d, attempt %d, ok %v), want (5s, rung 1, attempt 1, true)",
			got, rung, attemptInRung, ok)
	}
}

func TestIsRateLimitErr(t *testing.T) {
	rateLimited := []string{
		"429 Too Many Requests",
		"anilist: rate limit exceeded",
		"upstream returned Retry-After: 60",
		"RATE-LIMIT hit",
	}
	for _, msg := range rateLimited {
		if !isRateLimitErr(errors.New(msg)) {
			t.Errorf("%q should be treated as a rate limit", msg)
		}
	}

	notRateLimited := []string{
		"no torrent provider is configured",
		"404 not found",
		"connection reset by peer",
	}
	for _, msg := range notRateLimited {
		if isRateLimitErr(errors.New(msg)) {
			t.Errorf("%q should not be treated as a rate limit", msg)
		}
	}

	if isRateLimitErr(nil) {
		t.Error("a nil error should not be treated as a rate limit")
	}
}
