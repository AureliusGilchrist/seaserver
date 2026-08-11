package anilist

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

// AniList's budget is small and shared by everything this server does, and most of what it does is
// not the user: collection refreshes, metadata prefetches, en-masse walks, the auto-downloader,
// episode hydration for entries nobody has opened. When the budget runs out, it runs out for
// whoever asks next — and the request that suffers is whichever one happens to be the user's,
// because the background work asks constantly and the user asks occasionally.
//
// What that looks like from the outside is a details page that spins for a minute: the log fills
// with "rate limited (429), waiting 62s", the request behind the page you are looking at is one of
// the ones waiting, and it gets its turn after everything else that was already queued.
//
// So background work yields to the user. While any user-initiated request is waiting or in flight,
// background requests hold at the gate below rather than spending the budget the user is about to
// need. It is a courtesy queue, not a reservation: nothing is held back from the user, and nothing
// is refused to the background — it simply goes second.

type userInitiatedKey struct{}

// WithUserInitiated marks a context as a request the user is waiting on.
//
// Mark anything a person is watching happen: opening an entry, searching, refreshing on purpose.
// Do not mark work that merely happens to be triggered near a user action — a prefetch started
// because a page was opened is still background work, and marking it puts it in front of the
// request that page is actually waiting for.
func WithUserInitiated(ctx context.Context) context.Context {
	return context.WithValue(ctx, userInitiatedKey{}, true)
}

// IsUserInitiated reports whether this context is a request the user is waiting on.
func IsUserInitiated(ctx context.Context) bool {
	value, ok := ctx.Value(userInitiatedKey{}).(bool)
	return ok && value
}

// backgroundYieldTimeout bounds how long background work will stand aside.
//
// Without a bound, a steady stream of user requests would hold background work off indefinitely,
// and the things that keep the library correct — collection refreshes, airing schedules — would
// quietly stop happening for as long as somebody was browsing. Past this, background work proceeds
// anyway and takes its chances with the budget alongside everyone else.
const backgroundYieldTimeout = 10 * time.Second

// backgroundYieldPoll is how often a waiting background request re-checks. Short enough that it
// resumes promptly once the user is served, long enough not to spin.
const backgroundYieldPoll = 50 * time.Millisecond

var (
	// userInFlight counts user requests currently waiting on or talking to AniList.
	userInFlight atomic.Int64

	// userIdle is closed whenever the count returns to zero, so waiters wake immediately rather
	// than on their next poll. Replaced each time the count leaves zero.
	userIdleMu sync.Mutex
	userIdle   = closedChan()
)

func closedChan() chan struct{} {
	ch := make(chan struct{})
	close(ch)
	return ch
}

// beginUserRequest registers a user request and returns the function that ends it.
func beginUserRequest() func() {
	if userInFlight.Add(1) == 1 {
		// First one out of idle: waiters from here on must wait for a fresh signal.
		userIdleMu.Lock()
		userIdle = make(chan struct{})
		userIdleMu.Unlock()
	}

	var once sync.Once
	return func() {
		once.Do(func() {
			if userInFlight.Add(-1) == 0 {
				userIdleMu.Lock()
				close(userIdle)
				userIdleMu.Unlock()
			}
		})
	}
}

// yieldToUserRequests holds a background request while the user has one outstanding.
//
// Returns when the user is served, when the deadline above is reached, or when the caller's own
// context ends — whichever comes first. Never returns an error for having waited: standing aside is
// not a failure, and a background request that waited must still be allowed to proceed.
func yieldToUserRequests(ctx context.Context) {
	if userInFlight.Load() == 0 {
		return
	}

	deadline := time.After(backgroundYieldTimeout)
	ticker := time.NewTicker(backgroundYieldPoll)
	defer ticker.Stop()

	for {
		userIdleMu.Lock()
		idle := userIdle
		userIdleMu.Unlock()

		select {
		case <-ctx.Done():
			return
		case <-deadline:
			return
		case <-idle:
			return
		case <-ticker.C:
			if userInFlight.Load() == 0 {
				return
			}
		}
	}
}

// gateRequest applies the priority rule and the rate budget to one request, and returns the
// function that releases it.
//
// Every AniList request in the server passes through here — see customDoFunc — so this is the one
// place both the ordering and the pacing can be got right.
func gateRequest(ctx context.Context) func() {
	if IsUserInitiated(ctx) {
		release := beginUserRequest()
		// A user request still takes a slot from the budget; it simply never queues behind
		// background work for one. Spending without counting is how the budget gets exceeded by
		// exactly the requests that matter most.
		budget.take(ctx, true)
		return release
	}

	yieldToUserRequests(ctx)
	budget.take(ctx, false)
	return func() {}
}

// AniList allows a fixed number of requests a minute and answers 429 for the rest — and a 429 is
// not free: it costs a slot, a minute of waiting, and, if enough of them land at once, a stretch
// where nothing works at all.
//
// The client used to discover the limit by hitting it. Retrying with backoff makes that survivable
// but not painless: the log fills with "rate limited (429), waiting 62s", requests time out at 45
// seconds, and the cache layer eventually gives up and goes cache-only. All of it is avoidable by
// simply not sending the request that would have been refused.
//
// So requests are paced to stay inside the budget, and the budget is read from AniList's own
// answers rather than assumed: every response carries how many slots are left in the current
// window, and when that runs low the pacer slows down to match. The reserve below is what keeps a
// user's request answerable when background work has spent nearly everything.
const (
	// requestsPerMinute is the ceiling this client paces itself to. Deliberately under AniList's
	// own limit, which is 30 a minute when degraded: the gap absorbs requests already in flight
	// and anything else using the same token.
	requestsPerMinute = 24

	// userReserve is how many slots a minute are kept for requests somebody is waiting on.
	// Background work stops at this line; user requests may spend it.
	userReserve = 6
)

// rateBudget paces requests over a sliding minute.
type rateBudget struct {
	mu     sync.Mutex
	recent []time.Time
}

var budget = &rateBudget{}

// take waits until sending a request would stay inside the budget.
//
// Background work is held back once the remaining slots reach the reserve, so a burst of
// prefetching cannot leave the next thing the user does with nothing to spend. Neither caller ever
// waits longer than the window itself: this paces requests, it does not cancel them.
func (b *rateBudget) take(ctx context.Context, userInitiated bool) {
	limit := requestsPerMinute
	if !userInitiated {
		limit = requestsPerMinute - userReserve
	}

	for {
		b.mu.Lock()
		cutoff := time.Now().Add(-time.Minute)
		kept := b.recent[:0]
		for _, at := range b.recent {
			if at.After(cutoff) {
				kept = append(kept, at)
			}
		}
		b.recent = kept

		if len(b.recent) < limit {
			b.recent = append(b.recent, time.Now())
			b.mu.Unlock()
			return
		}

		// Wait for the oldest request in the window to age out.
		waitFor := time.Until(b.recent[0].Add(time.Minute))
		b.mu.Unlock()

		if waitFor <= 0 {
			continue
		}

		timer := time.NewTimer(waitFor)
		select {
		case <-ctx.Done():
			timer.Stop()
			return // the caller is giving up anyway; the request below will fail on its own context
		case <-timer.C:
		}
	}
}

// observeRemaining lets the client tell the pacer what AniList actually reports, so the budget
// tracks the real window rather than this side's idea of it.
//
// When the reported remaining count is lower than what has been counted here — another client on
// the same token, a window that reset differently — the shortfall is booked as spent. Believing
// our own count over AniList's is how the ceiling is silently exceeded.
func (b *rateBudget) observeRemaining(remaining int) {
	if remaining < 0 {
		return
	}
	spent := requestsPerMinute - remaining
	if spent <= 0 {
		return
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	for len(b.recent) < spent {
		b.recent = append(b.recent, time.Now())
	}
}

// ObserveRateLimitRemaining reports AniList's own count of the slots left in this window.
func ObserveRateLimitRemaining(remaining int) {
	budget.observeRemaining(remaining)
}

// UserRequestsInFlight reports how many user requests are outstanding. For diagnostics.
func UserRequestsInFlight() int64 {
	return userInFlight.Load()
}
