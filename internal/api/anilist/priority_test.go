package anilist

import (
	"context"
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
	release := gateRequest(WithUserInitiated(context.Background()))
	if UserRequestsInFlight() != 1 {
		t.Fatalf("in flight = %d, want 1", UserRequestsInFlight())
	}

	started := make(chan struct{})
	proceeded := make(chan struct{})
	go func() {
		close(started)
		done := gateRequest(context.Background()) // background
		close(proceeded)
		done()
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
	release := gateRequest(WithUserInitiated(context.Background()))
	defer release()

	done := make(chan struct{})
	go func() {
		r := gateRequest(WithUserInitiated(context.Background()))
		r()
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
	release := gateRequest(WithUserInitiated(context.Background()))
	release()
	release()
	if got := UserRequestsInFlight(); got != 0 {
		t.Errorf("in flight = %d, want 0", got)
	}
}

// Background work is not held off forever by a steady stream of user requests.
func TestBackgroundIsNotStarvedIndefinitely(t *testing.T) {
	release := gateRequest(WithUserInitiated(context.Background()))
	defer release()

	// A context that ends sooner than the yield timeout stands in for it: the point is that the
	// wait always ends, and never reports failure for having waited.
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		r := gateRequest(ctx)
		r()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Error("background work never stopped waiting")
	}
}

func TestConcurrentGatesKeepTheCountHonest(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := gateRequest(WithUserInitiated(context.Background()))
			time.Sleep(time.Millisecond)
			r()
		}()
	}
	wg.Wait()
	if got := UserRequestsInFlight(); got != 0 {
		t.Errorf("in flight = %d after everything finished, want 0", got)
	}
}
