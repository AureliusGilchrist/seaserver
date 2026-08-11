package anilist

import (
	"context"
	"sync"
	"testing"
	"time"
)

func freshBudget() *rateBudget { return &rateBudget{} }

// The point of pacing: the request that would have been refused is never sent.
func TestBudgetStopsAtTheCeiling(t *testing.T) {
	b := freshBudget()

	// Spend everything a user is allowed in this window.
	for i := 0; i < requestsPerMinute; i++ {
		b.take(context.Background(), true)
	}

	// The next one must wait rather than go out and collect a 429.
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	start := time.Now()
	b.take(ctx, true)
	if waited := time.Since(start); waited < 50*time.Millisecond {
		t.Errorf("the request over the ceiling was let straight through after %v", waited)
	}
}

// Background work stops early, so the next thing the user does still has something to spend.
func TestBackgroundStopsAtTheReserve(t *testing.T) {
	b := freshBudget()

	backgroundLimit := requestsPerMinute - userReserve
	for i := 0; i < backgroundLimit; i++ {
		b.take(context.Background(), false)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	b.take(ctx, false)
	if waited := time.Since(start); waited < 50*time.Millisecond {
		t.Error("background work spent past the reserve")
	}

	// The user can still spend what was held back — that is what the reserve is for.
	done := make(chan struct{})
	go func() {
		b.take(context.Background(), true)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Error("a user request could not spend the reserve held for it")
	}
}

// AniList's own count wins over this side's tally.
func TestObservedRemainingIsBelieved(t *testing.T) {
	b := freshBudget()

	// We think we have spent nothing; AniList says only two slots are left.
	b.observeRemaining(2)

	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()

	// Two more are fine...
	b.take(ctx, true)
	b.take(ctx, true)

	// ...and the third has to wait, because AniList said so.
	start := time.Now()
	b.take(ctx, true)
	if waited := time.Since(start); waited < 40*time.Millisecond {
		t.Errorf("kept spending past what AniList reported, after %v", waited)
	}
}

// A 429 books the window as fully spent, so nothing else is sent into it.
func TestExhaustedWindowBlocksEverything(t *testing.T) {
	b := freshBudget()
	b.observeRemaining(0)

	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()

	start := time.Now()
	b.take(ctx, true)
	if waited := time.Since(start); waited < 40*time.Millisecond {
		t.Error("a request was sent into a window already known to be spent")
	}
}

// Never negative, never a panic — it is fed straight from a header.
func TestObserveRemainingIgnoresNonsense(t *testing.T) {
	b := freshBudget()
	b.observeRemaining(-5)
	b.observeRemaining(999)
	b.take(context.Background(), true) // must not block
}

func TestBudgetIsSafeConcurrently(t *testing.T) {
	b := freshBudget()
	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			b.take(ctx, n%2 == 0)
		}(i)
	}
	wg.Wait()
}
