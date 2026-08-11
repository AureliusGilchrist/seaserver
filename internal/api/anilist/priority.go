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

// gateRequest applies the priority rule to one request and returns the function that releases it.
//
// Every AniList request in the server passes through here — see customDoFunc — so this is the one
// place the ordering has to be right.
func gateRequest(ctx context.Context) func() {
	if IsUserInitiated(ctx) {
		return beginUserRequest()
	}
	yieldToUserRequests(ctx)
	return func() {}
}

// UserRequestsInFlight reports how many user requests are outstanding. For diagnostics.
func UserRequestsInFlight() int64 {
	return userInFlight.Load()
}
