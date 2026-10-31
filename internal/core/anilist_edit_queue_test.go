package core

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestAnilistEditQueue(t *testing.T) {
	dir := t.TempDir()
	clock := time.Unix(1_700_000_000, 0)
	var mu sync.Mutex
	fail := true
	var sent []int
	exec := func(_ context.Context, e *QueuedListEdit) error {
		mu.Lock()
		defer mu.Unlock()
		if fail {
			return errors.New("429 too many requests")
		}
		p := 0
		if e.Progress != nil {
			p = *e.Progress
		}
		sent = append(sent, p)
		return nil
	}
	var announced int
	q := NewAnilistEditQueue(dir, exec, func(uint, []*QueuedListEdit) { announced++ }, nil)
	q.now = func() time.Time { return clock }

	one, two := 1, 2
	q.Enqueue(&QueuedListEdit{ProfileID: 3, MediaID: 10, Progress: &one}, errors.New("timeout"))
	// A newer edit for the same media replaces the older one.
	q.Enqueue(&QueuedListEdit{ProfileID: 3, MediaID: 10, Progress: &two}, nil)
	if got := q.List(3); len(got) != 1 || *got[0].Progress != 2 {
		t.Fatalf("expected one coalesced edit with progress 2, got %+v", got)
	}
	if len(q.List(4)) != 0 {
		t.Fatal("another profile's queue should be empty")
	}

	// Not due yet: nothing is sent.
	q.RunDue(context.Background())
	if len(sent) != 0 {
		t.Fatal("sent before its time")
	}

	// Due, but AniList still refuses: it stays queued with a longer backoff.
	clock = clock.Add(6 * time.Second)
	q.RunDue(context.Background())
	got := q.List(3)
	if len(got) != 1 || got[0].Attempts != 2 || !got[0].NextAttempt.Equal(clock.Add(15*time.Second)) {
		t.Fatalf("expected a retry scheduled 15s out, got %+v", got[0])
	}

	// A restart keeps it.
	q2 := NewAnilistEditQueue(dir, exec, nil, nil)
	if len(q2.List(3)) != 1 {
		t.Fatal("queued edit not persisted")
	}

	// AniList accepts: it is sent once, with the newest values, and removed.
	mu.Lock()
	fail = false
	mu.Unlock()
	clock = clock.Add(16 * time.Second)
	q.RunDue(context.Background())
	if len(sent) != 1 || sent[0] != 2 {
		t.Fatalf("expected one send with progress 2, got %v", sent)
	}
	if len(q.List(3)) != 0 {
		t.Fatal("synced edit still queued")
	}
	if announced == 0 {
		t.Fatal("changes were never announced")
	}

	// Forget drops a stale queued edit.
	q.Enqueue(&QueuedListEdit{ProfileID: 3, MediaID: 11, Progress: &one}, nil)
	q.Forget(3, 11)
	if len(q.List(3)) != 0 {
		t.Fatal("forget did not drop the edit")
	}
}

func TestCompleteListEdit(t *testing.T) {
	score, progress := 85.0, 7

	got := completeListEdit(&QueuedListEdit{MediaID: 1}, &score, &progress)
	if *got.Score != 85 || *got.Progress != 7 {
		t.Fatalf("a status change must repeat the entry's values, got %d and %d", *got.Score, *got.Progress)
	}

	zero := 0
	got = completeListEdit(&QueuedListEdit{MediaID: 1, Progress: &zero}, &score, &progress)
	if *got.Score != 85 || *got.Progress != 0 {
		t.Fatalf("values on the edit win, got %d and %d", *got.Score, *got.Progress)
	}

	got = completeListEdit(&QueuedListEdit{MediaID: 1}, nil, nil)
	if got.Score == nil || got.Progress == nil {
		t.Fatal("an entry not on the list still has to send integers")
	}
}

func TestAnilistEditQueueDropsRejectedEdits(t *testing.T) {
	exec := func(context.Context, *QueuedListEdit) error {
		return errors.New(`{"errors":[{"message":"validation","status":400}]}`)
	}
	q := NewAnilistEditQueue("", exec, nil, nil)
	q.Enqueue(&QueuedListEdit{ProfileID: 1, MediaID: 5}, nil)
	q.mu.Lock()
	for _, e := range q.items {
		e.NextAttempt = time.Time{}
	}
	q.mu.Unlock()

	q.RunDue(context.Background())
	if got := q.List(1); len(got) != 0 {
		t.Fatalf("a rejected edit would be retried forever, got %+v", got)
	}
}
