package anilist

import (
	"context"
	"testing"
	"time"
)

// Background work marked WithBudgetWait waits for a slot until its context ends, instead of being
// refused after maxBudgetWait like other background work.
func TestBudgetWaitOutlastsTheRefusalBound(t *testing.T) {
	resetRateBudget()
	defer resetRateBudget()
	original := maxBudgetWait
	maxBudgetWait = 20 * time.Millisecond
	defer func() { maxBudgetWait = original }()

	// Fill the background lane.
	for i := 0; i < requestsPerMinute-userReserve; i++ {
		if !budget.take(context.Background(), false) {
			t.Fatalf("slot %d refused while the window had room", i)
		}
	}

	start := time.Now()
	if budget.take(context.Background(), false) {
		t.Fatal("a full lane gave out a slot")
	}
	if waited := time.Since(start); waited > 500*time.Millisecond {
		t.Fatalf("unmarked request waited %v, want about maxBudgetWait", waited)
	}

	ctx, cancel := context.WithTimeout(WithBudgetWait(context.Background()), 300*time.Millisecond)
	defer cancel()
	start = time.Now()
	if budget.take(ctx, false) {
		t.Fatal("a full lane gave out a slot")
	}
	if waited := time.Since(start); waited < 250*time.Millisecond {
		t.Fatalf("marked request gave up after %v, before its context ended", waited)
	}
}
