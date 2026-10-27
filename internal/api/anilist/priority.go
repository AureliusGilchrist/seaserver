package anilist

import (
	"context"
	"errors"
	"strings"
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

type writeKey struct{}

// Writes — saving a score, progress, a status, dates, deleting an entry, toggling a favourite —
// are a third lane above user reads.
//
// Marking every inbound request as user-initiated was right, and it left the requests that change
// something competing with the ones that only look: a score change queued behind the page loads,
// detail fetches and prefetches around it for the same handful of reserved slots, waited out
// maxBudgetWait and was refused — which is what "editing an entry is very slow and sometimes times
// out" was. An edit is a person waiting on one specific thing to be saved, and there are very few
// of them, so they get slots nothing else may spend and go to the front of the queue.
//
// Set by customDoFunc from the GraphQL operation itself (a mutation), so every write path is
// covered without each caller having to remember.
func withWrite(ctx context.Context) context.Context {
	return context.WithValue(ctx, writeKey{}, true)
}

func isWrite(ctx context.Context) bool {
	value, ok := ctx.Value(writeKey{}).(bool)
	return ok && value
}

// isMutation reports whether a GraphQL document is a mutation.
func isMutation(query string) bool {
	q := strings.TrimLeft(query, " \t\r\n")
	// Leading comments are allowed before the operation.
	for strings.HasPrefix(q, "#") {
		if i := strings.IndexByte(q, '\n'); i >= 0 {
			q = strings.TrimLeft(q[i+1:], " \t\r\n")
		} else {
			return false
		}
	}
	return strings.HasPrefix(q, "mutation")
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

// writeYieldTimeout bounds how long reads stand aside for writes. Short: a write needs one slot,
// and the reserve below means it almost never waits for one.
const writeYieldTimeout = 5 * time.Second

var (
	// writesInFlight counts writes currently waiting on or talking to AniList.
	writesInFlight atomic.Int64
	writeIdleMu    sync.Mutex
	writeIdle      = closedChan()

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

// beginWrite registers a write and returns the function that ends it.
func beginWrite() func() {
	if writesInFlight.Add(1) == 1 {
		writeIdleMu.Lock()
		writeIdle = make(chan struct{})
		writeIdleMu.Unlock()
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			if writesInFlight.Add(-1) == 0 {
				writeIdleMu.Lock()
				close(writeIdle)
				writeIdleMu.Unlock()
			}
		})
	}
}

// yieldToWrites holds a read (user or background) while a write is outstanding, so the write takes
// the next free slot. Bounded by writeYieldTimeout; never an error.
func yieldToWrites(ctx context.Context) {
	if writesInFlight.Load() == 0 {
		return
	}
	writeIdleMu.Lock()
	idle := writeIdle
	writeIdleMu.Unlock()
	timer := time.NewTimer(writeYieldTimeout)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	case <-idle:
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
func gateRequest(ctx context.Context) (func(), error) {
	if isWrite(ctx) {
		// A write also counts as the user waiting, so background work keeps standing aside.
		endWrite := beginWrite()
		endUser := beginUserRequest()
		release := func() { endUser(); endWrite() }
		if !budget.takeLane(ctx, laneWrite) {
			release()
			return nil, ErrRateBudgetWait
		}
		return release, nil
	}

	if IsUserInitiated(ctx) {
		release := beginUserRequest()
		yieldToWrites(ctx)
		// A user request still takes a slot from the budget; it simply never queues behind
		// background work for one. Spending without counting is how the budget gets exceeded by
		// exactly the requests that matter most.
		if !budget.take(ctx, true) {
			release()
			return nil, ErrRateBudgetWait
		}
		return release, nil
	}

	yieldToWrites(ctx)
	yieldToUserRequests(ctx)
	if !budget.take(ctx, false) {
		return nil, ErrRateBudgetWait
	}
	return func() {}, nil
}

// ErrRateBudgetWait is returned instead of waiting when the queue for a slot is longer than anyone
// could reasonably be kept waiting. See maxBudgetWait.
var ErrRateBudgetWait = errors.New("anilist: too many requests queued, try again shortly")

// maxBudgetWait bounds how long a request will sit waiting for a rate-limit slot.
//
// The pacer used to wait however long it took, and "however long" is not a figure of speech: at 24
// requests a minute, a few hundred queued requests is a queue several minutes deep. Requests were
// observed completing eleven minutes after they were made — long after the client had given up,
// and in one case a manual match sat behind that queue for the same eleven minutes.
//
// Holding a request that long is worse than refusing it, and not only for the person waiting. Each
// one holds a connection open at both ends, and a browser opens six connections to a host and no
// more: six requests stuck in this queue and *nothing else in the app can reach the server at all*
// — which is what "everything times out" turned out to be, and why a badge poll every ten seconds
// left no trace whatsoever in the server log.
//
// So the queue is bounded, and past the bound the answer is "ask again shortly", which the caller
// can act on: show what it has, retry later, fall back to cache.
//
// Ten seconds, not the minute this started at. The minute was picked against the eleven-minute
// waits it replaced and looked restrained next to them — but a request held for a minute is still
// a connection held for a minute, and a browser has six to a host. Six parked here and the app
// cannot reach the server at all: the next thing the user does never leaves the browser, and the
// server log shows no trace of a request that was never sent. Ten seconds outlasts any ordinary
// burst and turns a stuck request into a hiccup rather than a stall.
//
// A variable rather than a constant only so tests can shorten it; nothing else assigns to it.
var maxBudgetWait = 10 * time.Second

// maxWriteBudgetWait is the same bound for writes. Longer, because an edit is worth waiting for and
// is not one of a crowd — and with writeReserve it should never come close.
var maxWriteBudgetWait = 30 * time.Second

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

	// writeReserve is how many of those are kept for writes alone. User reads stop at this line;
	// only an edit may spend it, so saving a score always has somewhere to go.
	writeReserve = 3
)

// budget lanes, highest first.
type budgetLane int

const (
	laneBackground budgetLane = iota
	laneUser
	laneWrite
)

// BackgroundRequestsPerMinute is everything background work may spend in a minute, all of it put
// together: the graph walk, the web client's prefetching, the collection refresher, the
// auto-downloader.
//
// Exported because a background worker that paces itself to a number of its own is not pacing itself
// at all. Sizing against a figure someone remembered — "AniList allows about 90 a minute" — is how a
// worker ends up asking for two or three times what it can have, and what that looks like from the
// outside is this file's own refusal repeated forever: the lane is permanently full, every request in
// it waits maxBudgetWait and is then turned away, and the worker makes no progress while filling the
// log. Pace against this, and leave room in it for the other background work that is also entitled to
// a share.
const BackgroundRequestsPerMinute = requestsPerMinute - userReserve

// rateBudget paces requests over a sliding minute.
type rateBudget struct {
	mu     sync.Mutex
	recent []time.Time
}

var budget = &rateBudget{}

// take waits until sending a request would stay inside the budget, and reports whether it got a
// slot.
//
// Background work is held back once the remaining slots reach the reserve, so a burst of
// prefetching cannot leave the next thing the user does with nothing to spend.
//
// False means the caller should give up rather than send: either its own context ended, or the
// queue was deeper than maxBudgetWait. It is not an error the caller can fix by waiting longer —
// that is precisely what it was doing.
func (b *rateBudget) take(ctx context.Context, userInitiated bool) bool {
	if userInitiated {
		return b.takeLane(ctx, laneUser)
	}
	return b.takeLane(ctx, laneBackground)
}

// takeLane is take for one of the three lanes: writes may spend the whole window, user reads all but
// the write reserve, background all but the user reserve.
func (b *rateBudget) takeLane(ctx context.Context, lane budgetLane) bool {
	limit := requestsPerMinute
	wait := maxBudgetWait
	switch lane {
	case laneBackground:
		limit = requestsPerMinute - userReserve
	case laneUser:
		limit = requestsPerMinute - writeReserve
	case laneWrite:
		wait = maxWriteBudgetWait
	}

	giveUp := time.After(wait)

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
			return true
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
			return false // the caller is giving up anyway
		case <-giveUp:
			timer.Stop()
			return false // the queue is deeper than anyone should be held for
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
