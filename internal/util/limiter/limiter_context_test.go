package limiter

import (
	"context"
	"errors"
	"testing"
	"time"
)

// A batch that outlives its deadline must not book slots it will never use: the requests after it
// would wait behind every one of them.
func TestWaitContextExpiredClaimsNoSlot(t *testing.T) {
	l := NewLimiter(time.Hour, 1)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for i := 0; i < 100; i++ {
		if err := l.WaitContext(ctx); !errors.Is(err, context.Canceled) {
			t.Fatalf("expired context returned %v", err)
		}
	}

	bounded, cancelBounded := context.WithTimeout(context.Background(), time.Second)
	defer cancelBounded()
	if err := l.WaitContext(bounded); err != nil {
		t.Fatalf("the slot was taken by a caller that had already given up: %v", err)
	}
}
