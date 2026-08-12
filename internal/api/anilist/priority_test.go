package anilist

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestUserInitiatedMarkerRoundTrips(t *testing.T) {
	if IsUserInitiated(context.Background()) {
		t.Error("a plain context claimed to be user-initiated")
	}
	if !IsUserInitiated(WithUserInitiated(context.Background())) {
		t.Error("the marker did not survive")
	}
}

// Background work stands aside while the user has a request outstanding — this is the whole point.
func TestBackgroundYieldsWhileAUserRequestIsInFlight(t *testing.T) {
	release := mustGate(t, WithUserInitiated(context.Background()))
	if UserRequestsInFlight() != 1 {
		t.Fatalf("in flight = %d, want 1", UserRequestsInFlight())
	}

	started := make(chan struct{})
	proceeded := make(chan struct{})
	go func() {
		close(started)
		done, err := gateRequest(context.Background()) // background
		close(proceeded)
		if err == nil {
			done()
		}
	}()

	<-started
	select {
	case <-proceeded:
		t.Fatal("background work went ahead while a user request was in flight")
	case <-time.After(150 * time.Millisecond):
	}

	// Once the user is served, background work resumes promptly.
	release()
	select {
	case <-proceeded:
	case <-time.After(2 * time.Second):
		t.Error("background work did not resume after the user request finished")
	}

	if UserRequestsInFlight() != 0 {
		t.Errorf("in flight = %d after release, want 0", UserRequestsInFlight())
	}
}

// A user request never waits, however much background work is about.
func TestUserRequestsNeverWait(t *testing.T) {
	resetRateBudget()
	release := mustGate(t, WithUserInitiated(context.Background()))
	defer release()

	done := make(chan struct{})
	go func() {
		r, err := gateRequest(WithUserInitiated(context.Background()))
		if err == nil {
			r()
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Error("a user request was made to wait")
	}
}

// Releasing twice must not corrupt the count — the release is deferred and could be called again.
func TestReleaseIsIdempotent(t *testing.T) {
	release := mustGate(t, WithUserInitiated(context.Background()))
	release()
	release()
	if got := UserRequestsInFlight(); got != 0 {
		t.Errorf("in flight = %d, want 0", got)
	}
}

// Background work is not held off forever by a steady stream of user requests.
func TestBackgroundIsNotStarvedIndefinitely(t *testing.T) {
	resetRateBudget()
	release := mustGate(t, WithUserInitiated(context.Background()))
	defer release()

	// A context that ends sooner than the yield timeout stands in for it: the point is that the
	// wait always ends, and never reports failure for having waited.
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		r, err := gateRequest(ctx)
		if err == nil {
			r()
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Error("background work never stopped waiting")
	}
}

func TestConcurrentGatesKeepTheCountHonest(t *testing.T) {
	resetRateBudget()
	// More requests than the window holds, so some are refused — which is the interesting case
	// here: the count has to come back to zero whether a gate granted a slot or turned it down.
	// Shortened so the refusals happen at once rather than a minute from now.
	original := maxBudgetWait
	maxBudgetWait = 50 * time.Millisecond
	defer func() { maxBudgetWait = original }()

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, err := gateRequest(WithUserInitiated(context.Background()))
			time.Sleep(time.Millisecond)
			if err == nil {
				r()
			}
		}()
	}
	wg.Wait()
	if got := UserRequestsInFlight(); got != 0 {
		t.Errorf("in flight = %d after everything finished, want 0", got)
	}
}

// mustGate takes a slot and fails the test if the gate refused, for the tests whose subject is the
// ordering rather than the budget.
func mustGate(t *testing.T, ctx context.Context) func() {
	t.Helper()
	release, err := gateRequest(ctx)
	if err != nil {
		t.Fatalf("gate refused: %v", err)
	}
	return release
}

// resetRateBudget empties the sliding window. The budget is package state and a minute wide, so
// without this a test that spends it hands the next one a queue to wait behind.
func resetRateBudget() {
	budget.mu.Lock()
	budget.recent = nil
	budget.mu.Unlock()
}

// A request is refused rather than queued once the wait would be longer than anyone should be held
// for. This is the bound that stopped requests completing eleven minutes after they were made.
func TestGateRefusesRatherThanQueueingForever(t *testing.T) {
	resetRateBudget()
	original := maxBudgetWait
	maxBudgetWait = 50 * time.Millisecond
	defer func() { maxBudgetWait = original }()

	// Spend the whole window, so the next request has to wait for a slot to age out — which takes
	// a minute, far longer than the bound above.
	for i := 0; i < requestsPerMinute; i++ {
		release, err := gateRequest(WithUserInitiated(context.Background()))
		if err != nil {
			t.Fatalf("filling the budget: refused at %d: %v", i, err)
		}
		release()
	}

	start := time.Now()
	release, err := gateRequest(WithUserInitiated(context.Background()))
	if err == nil {
		release()
		t.Fatal("the gate queued a request instead of refusing it")
	}
	if !errors.Is(err, ErrRateBudgetWait) {
		t.Errorf("err = %v, want ErrRateBudgetWait", err)
	}
	if waited := time.Since(start); waited > 5*time.Second {
		t.Errorf("waited %v before giving up, want about %v", waited, maxBudgetWait)
	}
	if got := UserRequestsInFlight(); got != 0 {
		t.Errorf("in flight = %d after a refusal, want 0 — the refused request was not released", got)
	}
}
