package enqueuefuture

import (
	"context"
	"testing"
	"time"
)

func TestPacerLetsTheBurstThroughImmediately(t *testing.T) {
	p := newPacer(60, 5)

	start := time.Now()
	for i := 0; i < 5; i++ {
		if err := p.wait(context.Background()); err != nil {
			t.Fatalf("call %d: %v", i+1, err)
		}
	}

	// The burst is what makes enqueueing one page's recommendations feel immediate.
	if elapsed := time.Since(start); elapsed > 200*time.Millisecond {
		t.Errorf("the burst took %s, expected it to go straight through", elapsed)
	}
}

func TestPacerSpacesOutOnceTheBurstIsSpent(t *testing.T) {
	// 600/minute is a 100ms interval, which keeps the test quick while still exercising the wait.
	p := newPacer(600, 2)

	for i := 0; i < 2; i++ {
		if err := p.wait(context.Background()); err != nil {
			t.Fatalf("burst call %d: %v", i+1, err)
		}
	}

	start := time.Now()
	if err := p.wait(context.Background()); err != nil {
		t.Fatalf("paced call: %v", err)
	}
	elapsed := time.Since(start)

	// Two slots at a 100ms interval means the third call waits out a 200ms window.
	if elapsed < 100*time.Millisecond {
		t.Errorf("the third call waited %s, expected it to be paced", elapsed)
	}
}

func TestPacerStopsWaitingWhenCancelled(t *testing.T) {
	// One item per minute with a single slot: the second call would otherwise wait a full minute.
	p := newPacer(1, 1)

	if err := p.wait(context.Background()); err != nil {
		t.Fatalf("first call: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(30 * time.Millisecond)
		cancel()
	}()

	// This is what made stopping a run take so long: the pacing used to be a bare sleep, so a
	// cancelled run kept waiting for a turn it was never going to use.
	start := time.Now()
	err := p.wait(ctx)
	elapsed := time.Since(start)

	if err == nil {
		t.Error("a cancelled wait should report the cancellation")
	}
	if elapsed > time.Second {
		t.Errorf("cancellation took %s to take effect", elapsed)
	}
}

func TestPacerReportsAlreadyCancelledContext(t *testing.T) {
	p := newPacer(60, 5)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// Even a slot that is free must not hand work back to a run that has been told to stop.
	if err := p.wait(ctx); err == nil {
		t.Error("expected an already-cancelled context to be reported")
	}
}

func TestNewPacerRejectsNonsense(t *testing.T) {
	// Guards a divide-by-zero on the interval, which would take the whole run down with it.
	p := newPacer(0, 0)
	if p.interval <= 0 {
		t.Errorf("got interval %s, want a positive one", p.interval)
	}
	if len(p.slots) < 1 {
		t.Error("a pacer needs at least one slot")
	}
	if err := p.wait(context.Background()); err != nil {
		t.Errorf("first call: %v", err)
	}
}
