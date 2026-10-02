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

func TestPacerNeverDriftsWhenItemsTakeAboutTheInterval(t *testing.T) {
	// The regression test for the runaway: the previous arithmetic reserved "this slot's last time
	// plus a whole window" — a figure that compounds, because the stored time already includes the
	// window that produced it. A run whose items take about as long as the interval sat exactly on
	// the boundary where every item added the shortfall to a slot's stored time, and over a queue
	// of thousands the stored times drifted hours into the future. The worker then parked in wait()
	// silently for hours.
	//
	// This replays that pattern at a compressed scale: a 10ms interval with a 40ms window, items
	// taking 8ms — the same 80% boundary — for enough items that the old arithmetic would have
	// drifted several windows into the future. With the sliding window the worst wait stays at one
	// window throughout.
	p := newPacer(6000, 4) // 10ms interval, 40ms window

	worst := time.Duration(0)
	for i := 0; i < 400; i++ {
		start := time.Now()
		if err := p.wait(context.Background()); err != nil {
			t.Fatalf("call %d: %v", i+1, err)
		}
		waited := time.Since(start)
		if waited > worst {
			worst = waited
		}
		// The item itself takes 80% of the interval — the boundary case. The old arithmetic
		// compounded 2ms of drift into the slots per item; 400 items would be 800ms of drift,
		// twenty windows deep.
		time.Sleep(8 * time.Millisecond)
	}

	if worst > 60*time.Millisecond {
		t.Errorf("worst wait was %s; the pacer is drifting (one window is 40ms)", worst)
	}
}
