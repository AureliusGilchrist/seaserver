package enqueuefuture

import (
	"context"
	"sync"
	"time"
)

// ItemsPerMinute and RateBurst set the pace of a run, counted in anime rather than in requests.
//
// This is the honest unit. Preparing one anime costs about three upstream calls — the details that
// also yield the next ring of the graph, hydrating the entry, and the torrent search — so pacing
// each call separately meant an anime took three slots and the queue crawled at a third of the
// advertised rate. Pacing the item as a whole is what makes the number mean what it says.
//
// 15 anime/minute works out to roughly 45 upstream calls a minute against AniList's ~90 budget,
// leaving room for whatever you are doing in the app while this runs behind you. The burst is what
// makes short runs feel immediate: one page's recommendations are prepared almost at once, and only
// a long run ever settles to the sustained rate.
const (
	ItemsPerMinute = 15
	RateBurst      = 12
)

// pacer spreads work out over time without letting a cancelled run sit waiting on it.
//
// The shared util/limiter does the same arithmetic but blocks in a bare time.Sleep, so a run told to
// stop kept sleeping until its turn came round regardless — which is most of why stopping one used
// to take so long. Everything here selects on the context instead.
type pacer struct {
	mu       sync.Mutex
	interval time.Duration
	slots    []time.Time
	index    int
}

func newPacer(itemsPerMinute int, burst int) *pacer {
	if itemsPerMinute < 1 {
		itemsPerMinute = 1
	}
	if burst < 1 {
		burst = 1
	}

	interval := time.Minute / time.Duration(itemsPerMinute)
	p := &pacer{
		interval: interval,
		slots:    make([]time.Time, burst),
	}

	// Start every slot far enough in the past that the first `burst` calls go straight through.
	past := time.Now().Add(-interval * time.Duration(burst) * 2)
	for i := range p.slots {
		p.slots[i] = past
	}
	return p
}

// wait blocks until this item's turn, or until the context is cancelled — whichever comes first.
//
// The slot is reserved before sleeping, so a cancelled wait still leaves the schedule intact and a
// resumed run does not get a free burst it has not earned.
func (p *pacer) wait(ctx context.Context) error {
	p.mu.Lock()
	window := p.interval * time.Duration(len(p.slots))
	earliest := p.slots[p.index].Add(window)
	now := time.Now()

	at := now
	if now.Before(earliest) {
		at = earliest
	}
	p.slots[p.index] = at
	p.index = (p.index + 1) % len(p.slots)
	p.mu.Unlock()

	delay := time.Until(at)
	if delay <= 0 {
		return ctx.Err()
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return ctx.Err()
	}
}
