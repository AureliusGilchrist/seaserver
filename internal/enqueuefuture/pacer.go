package enqueuefuture

import (
	"context"
	"sync"
	"time"

	"seanime/internal/api/anilist"
)

// callsPerItem is roughly what preparing one anime costs upstream: the details that also yield the
// next ring of the graph, hydrating the entry, and the torrent search.
//
// Pacing the item rather than the call is what makes the rate below mean what it says — pacing each
// call separately meant an anime took three slots and the queue crawled at a third of the advertised
// rate.
const callsPerItem = 3

// walkShareOfBackground is how much of the background budget a run may take.
//
// Not all of it. The graph walk is not the only thing running behind the app: the web client
// prefetches the library, the collection refreshes, the auto-downloader looks around. Taking the
// whole lane starves them, and they respond by queueing — which fills the lane right back up.
const walkShareOfBackground = 2.0 / 3.0

// ItemsPerMinute and RateBurst set the pace of a run, counted in anime rather than in requests.
//
// Derived from the client's own background budget rather than picked. This used to be a flat 15 —
// about 45 upstream calls a minute, sized against a remembered figure of "AniList allows about 90 a
// minute". The client does not spend 90: it paces itself to 24 and keeps 6 of those for requests
// somebody is waiting on, leaving 18 a minute for everything background put together. So a run was
// asking for two and a half times the entire background lane, all by itself.
//
// What that looks like while using the app is not a slow queue — it is the log filling with "rate
// budget queue is full" and the app feeling stuck. Every request over the line waits ten seconds for
// a slot that was never coming and is then refused, the walk retries, and the refusals crowd out the
// prefetching and the refreshes that were entitled to that lane too. Pacing to what is actually
// available makes the run slower on paper and considerably faster in practice, because the requests
// it does make are ones that get sent.
var (
	ItemsPerMinute = itemsPerMinuteFromBudget()

	// RateBurst lets a short run feel immediate — one page's recommendations are prepared almost at
	// once, and only a long run ever settles to the sustained rate. Kept to a single minute's worth
	// of items so the burst cannot overdraw the lane it is borrowing from.
	RateBurst = ItemsPerMinute
)

func itemsPerMinuteFromBudget() int {
	items := int(float64(anilist.BackgroundRequestsPerMinute) * walkShareOfBackground / callsPerItem)
	if items < 1 {
		return 1
	}
	return items
}

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
