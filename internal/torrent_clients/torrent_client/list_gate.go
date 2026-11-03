package torrent_client

import (
	"fmt"
	qbittorrent_model "seanime/internal/torrent_clients/qbittorrent/model"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// qbitListGate stands between every caller of the torrent list and qBittorrent's /torrents/info.
//
// The list is asked for from all over the server — the torrent list page every 1.5s, the active
// count every 5s, the stuck-download monitor, and the unmatched scanner from one goroutine per
// staging directory it is verifying. Each asked on its own. While qBittorrent answered quickly that
// went unnoticed. Once it slowed down under a big library, though, the asks stopped finishing
// before the next ones arrived. The server log showed ~80 identical filter=all requests open at
// once, all timing out in the same second, then the whole batch forming again a minute later.
// Each one makes qBittorrent's single-threaded WebUI serialise the full list, so the pile-up is
// what kept it down.
//
// So:
//   - concurrent asks for the same list share one request (singleflight);
//   - a list that just arrived is reused for a moment rather than fetched again;
//   - a list request that failed is not retried by every caller straight away: further asks get
//     the same error until a growing backoff has passed, giving the client room to recover.
//
// Both waits scale with how slow qBittorrent actually is. With a fixed one-second reuse and a
// five-second first backoff, a qBittorrent bogged down by a burst of large adds had a full list
// request from us in front of it almost without pause: each one took up to the 60-second timeout,
// and qBittorrent keeps building a list after we stop waiting for it, so the next one queued
// behind the last. It only recovered once the server was stopped. Now a list that took long to
// build is reused for longer (qbitListTTLFactor times its build time), and the wait after a
// failure is never shorter than the failed request itself — so at least half of qBittorrent's
// time is its own while it is struggling. A fast client sees no difference.
type qbitListGate struct {
	group singleflight.Group

	mu        sync.Mutex
	cache     map[string]qbitListEntry
	failErr   error
	failUntil time.Time
	backoff   time.Duration
}

type qbitListEntry struct {
	torrents []*qbittorrent_model.Torrent
	at       time.Time
	// ttl is how long this list may be reused, from how long it took to fetch.
	ttl time.Duration
}

const (
	// qbitListTTL is how long a fetched list is reused. Shorter than the fastest poller (1.5s), so
	// a page watching progress still sees every fresh answer.
	qbitListTTL = 1 * time.Second
	// The failure backoff starts here and doubles on every consecutive failure, up to the cap.
	qbitListBackoffBase = 5 * time.Second
	qbitListBackoffCap  = 5 * time.Minute
	// qbitListTTLFactor scales the reuse of a list with how long it took to build: a list that took
	// four seconds is reused for twelve. Capped so a one-off stall cannot freeze the list for long.
	qbitListTTLFactor = 3
	qbitListTTLCap    = 60 * time.Second
)

// qbitListTTLFor is how long a list that took took to fetch may be reused.
func qbitListTTLFor(took time.Duration) time.Duration {
	return min(max(qbitListTTL, took*qbitListTTLFactor), qbitListTTLCap)
}

func newQbitListGate() *qbitListGate {
	return &qbitListGate{cache: make(map[string]qbitListEntry)}
}

// get returns the list for key, from the cache, a request already in flight, or a new request.
func (g *qbitListGate) get(key string, fetch func() ([]*qbittorrent_model.Torrent, error)) ([]*qbittorrent_model.Torrent, error) {
	g.mu.Lock()
	if e, ok := g.cache[key]; ok && time.Since(e.at) < e.ttl {
		g.mu.Unlock()
		return e.torrents, nil
	}
	if time.Now().Before(g.failUntil) {
		err := g.failErr
		g.mu.Unlock()
		return nil, &qbitListBackoffError{err: err}
	}
	g.mu.Unlock()

	v, err, _ := g.group.Do(key, func() (interface{}, error) {
		started := time.Now()
		torrents, err := fetch()
		took := time.Since(started)

		g.mu.Lock()
		defer g.mu.Unlock()
		if err != nil {
			if g.backoff == 0 {
				g.backoff = qbitListBackoffBase
			} else {
				g.backoff = min(g.backoff*2, qbitListBackoffCap)
			}
			// Never ask again sooner than the failed request lasted: a timed-out list is still
			// being built on qBittorrent's side for about that long.
			wait := max(g.backoff, took)
			g.failErr = err
			g.failUntil = time.Now().Add(wait)
			return nil, err
		}
		g.backoff = 0
		g.failErr = nil
		g.failUntil = time.Time{}
		g.cache[key] = qbitListEntry{torrents: torrents, at: time.Now(), ttl: qbitListTTLFor(took)}
		return torrents, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]*qbittorrent_model.Torrent), nil
}

// qbitListBackoffError is the answer while the gate is holding requests back. It carries the failure
// that started the backoff. That failure has already been logged once, so callers need not log it
// again on every ask.
type qbitListBackoffError struct{ err error }

func (e *qbitListBackoffError) Error() string {
	return fmt.Sprintf("qBittorrent did not answer recently, not asking again yet: %v", e.err)
}

func (e *qbitListBackoffError) Unwrap() error { return e.err }
