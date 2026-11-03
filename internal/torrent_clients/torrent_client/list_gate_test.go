package torrent_client

import (
	"errors"
	qbittorrent_model "seanime/internal/torrent_clients/qbittorrent/model"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// The pile-up from the server log: ~80 callers asking for the same list while qBittorrent is slow.
// They must cost one request, not 80.
func TestQbitListGateCoalescesConcurrentCalls(t *testing.T) {
	g := newQbitListGate()
	var calls atomic.Int32
	release := make(chan struct{})
	fetch := func() ([]*qbittorrent_model.Torrent, error) {
		calls.Add(1)
		<-release
		return []*qbittorrent_model.Torrent{{Name: "a"}}, nil
	}

	var wg sync.WaitGroup
	for i := 0; i < 80; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if res, err := g.get("k", fetch); err != nil || len(res) != 1 {
				t.Errorf("got %v, %v", res, err)
			}
		}()
	}
	time.Sleep(100 * time.Millisecond)
	close(release)
	wg.Wait()

	if n := calls.Load(); n != 1 {
		t.Fatalf("expected 1 request to qBittorrent, got %d", n)
	}

	// Inside the TTL the cached list answers.
	if _, err := g.get("k", fetch); err != nil || calls.Load() != 1 {
		t.Fatalf("expected the cached list, err=%v calls=%d", err, calls.Load())
	}
}

func TestQbitListGateBacksOffAfterFailure(t *testing.T) {
	g := newQbitListGate()
	var calls atomic.Int32
	boom := errors.New("timeout")
	fetch := func() ([]*qbittorrent_model.Torrent, error) {
		calls.Add(1)
		return nil, boom
	}

	if _, err := g.get("k", fetch); !errors.Is(err, boom) {
		t.Fatalf("first call should report the failure, got %v", err)
	}
	for i := 0; i < 10; i++ {
		_, err := g.get("k", fetch)
		var held *qbitListBackoffError
		if !errors.As(err, &held) || !errors.Is(err, boom) {
			t.Fatalf("expected a backoff error wrapping the failure, got %v", err)
		}
	}
	if n := calls.Load(); n != 1 {
		t.Fatalf("expected no requests during backoff, got %d", n)
	}

	// Once the backoff has passed, the client is asked again, and success clears it.
	g.mu.Lock()
	g.failUntil = time.Now().Add(-time.Millisecond)
	g.mu.Unlock()
	if _, err := g.get("k", func() ([]*qbittorrent_model.Torrent, error) { return nil, nil }); err != nil {
		t.Fatalf("expected success after backoff, got %v", err)
	}
	if g.backoff != 0 {
		t.Fatalf("success should reset the backoff, got %v", g.backoff)
	}
}

func TestQbitListTTLScalesWithFetchTime(t *testing.T) {
	cases := []struct {
		took, want time.Duration
	}{
		{100 * time.Millisecond, qbitListTTL},
		{4 * time.Second, 12 * time.Second},
		{50 * time.Second, qbitListTTLCap},
	}
	for _, c := range cases {
		if got := qbitListTTLFor(c.took); got != c.want {
			t.Errorf("took %v: got %v want %v", c.took, got, c.want)
		}
	}
}

// A slow list is reused rather than fetched again straight away.
func TestQbitListGateReusesSlowListLonger(t *testing.T) {
	g := newQbitListGate()
	var calls atomic.Int32
	fetch := func() ([]*qbittorrent_model.Torrent, error) {
		calls.Add(1)
		time.Sleep(500 * time.Millisecond)
		return []*qbittorrent_model.Torrent{{Name: "a"}}, nil
	}
	_, _ = g.get("k", fetch)
	time.Sleep(1100 * time.Millisecond) // past the plain one-second TTL
	_, _ = g.get("k", fetch)
	if n := calls.Load(); n != 1 {
		t.Fatalf("expected the slow list to be reused, got %d fetches", n)
	}
}
