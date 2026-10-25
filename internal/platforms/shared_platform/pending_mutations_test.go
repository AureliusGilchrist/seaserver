package shared_platform

import (
	"errors"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

func TestIsOutageErrorRecognisesUserInitiatedRateLimit(t *testing.T) {
	// The exact wording the AniList client returns for a 429 it declines to wait out.
	err := errors.New("anilist: rate limited, try again in 65s")
	if !IsOutageError(err) {
		t.Fatalf("rate-limit error must be treated as an outage so the update is queued")
	}
	if IsOutageError(errors.New("anilist: The score raw must be an integer")) {
		t.Fatalf("validation error must not be queued")
	}
}

func TestRetryAfterHint(t *testing.T) {
	if got := RetryAfterHint(errors.New("anilist: rate limited, try again in 65s")); got != 65*time.Second {
		t.Fatalf("got %v, want 65s", got)
	}
	if got := RetryAfterHint(errors.New("dial tcp: timeout")); got != 0 {
		t.Fatalf("got %v, want 0", got)
	}
}

func TestProgressItemsKeepsLatestPerMedia(t *testing.T) {
	logger := zerolog.Nop()
	store := NewPendingMutationStore(t.TempDir(), &logger)
	mid, p1, p2 := 42, 3, 4
	store.Enqueue(&PendingMutation{Kind: PendingKindUpdateEntryProgress, MediaID: &mid, Progress: &p1})
	store.Enqueue(&PendingMutation{Kind: PendingKindUpdateEntryProgress, MediaID: &mid, Progress: &p2})
	items := store.ProgressItems()
	if len(items) != 1 || items[0].MediaID != 42 || items[0].Progress != 4 {
		t.Fatalf("unexpected items: %+v", items)
	}
}
