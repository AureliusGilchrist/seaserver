package core

import (
	"testing"
	"time"
)

func TestTrackFailureMemo(t *testing.T) {
	now := time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)
	memo := newTrackFailureMemo(trackFailureWindow)
	memo.now = func() time.Time { return now }

	attempts := 0
	try := func(id int, fail bool) {
		if !memo.shouldTry(id) {
			return
		}
		attempts++
		if fail {
			memo.markFailed(id)
		}
	}

	// A failing id is tried once within the window
	for i := 0; i < 100; i++ {
		try(80817, true)
		now = now.Add(10 * time.Second)
	}
	if attempts != 1 {
		t.Fatalf("expected 1 attempt within the window, got %d", attempts)
	}

	// Other ids are not affected
	try(1, false)
	if attempts != 2 {
		t.Fatalf("expected an unrelated id to be tried, got %d attempts", attempts)
	}

	// Once the window has passed, the id is tried again
	now = now.Add(trackFailureWindow)
	try(80817, true)
	if attempts != 3 {
		t.Fatalf("expected a retry after the window, got %d attempts", attempts)
	}
	try(80817, true)
	if attempts != 3 {
		t.Fatalf("expected no retry right after a new failure, got %d attempts", attempts)
	}
}
