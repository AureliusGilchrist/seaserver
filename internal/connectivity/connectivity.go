// Package connectivity is the server's one answer to "can we reach the internet right now?".
//
// Everything that talks to the internet asks here first, so losing the connection means instant
// fallbacks rather than each caller separately waiting out its own timeout. A black-holed network is
// the case that matters: requests there don't fail, they hang.
package connectivity

import (
	"context"
	"errors"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// State is what the server can currently reach.
type State string

const (
	Online  State = "online"
	Offline State = "offline"
	// Blocked means the user turned AniList off. The internet may well be fine.
	Blocked State = "blocked"
)

const (
	// failuresBeforeOffline stops one dropped probe from flipping the whole app into offline mode.
	failuresBeforeOffline = 3
	onlineProbeInterval   = 30 * time.Second
	offlineProbeInterval  = 10 * time.Second
	probeTimeout          = 4 * time.Second
	probeAddress          = "graphql.anilist.co:443"
)

var (
	offline  atomic.Bool
	forced   atomic.Bool
	blocked  atomic.Bool
	failures atomic.Int32
	wake     = make(chan struct{}, 1)

	listenersMu sync.RWMutex
	listeners   []func(State)
)

// Current returns the state, with the user's block taking priority.
func Current() State {
	if blocked.Load() {
		return Blocked
	}
	if IsOffline() {
		return Offline
	}
	return Online
}

// IsOffline reports whether the internet can't be reached, whatever the block is set to.
func IsOffline() bool {
	return offline.Load() || forced.Load()
}

// SetForcedOffline acts as though there were no internet, for the sidebar's offline switch.
func SetForcedOffline(on bool) {
	if forced.Swap(on) != on {
		notify()
	}
}

// IsForcedOffline reports whether the user turned offline mode on, as opposed to the internet being down.
func IsForcedOffline() bool {
	return forced.Load()
}

// IsAniListAllowed reports whether a request to AniList should be attempted at all.
func IsAniListAllowed() bool {
	return Current() == Online
}

// SetBlocked turns the "Block all AniList" setting on or off.
func SetBlocked(on bool) {
	if blocked.Swap(on) != on {
		notify()
	}
}

// OnChange registers a function called whenever the state changes.
func OnChange(listener func(State)) {
	listenersMu.Lock()
	defer listenersMu.Unlock()
	listeners = append(listeners, listener)
}

func notify() {
	state := Current()
	listenersMu.RLock()
	defer listenersMu.RUnlock()
	for _, listener := range listeners {
		listener(state)
	}
}

// ReportNetworkFailure asks for a check now, for when a real request just failed on the network.
func ReportNetworkFailure() {
	select {
	case wake <- struct{}{}:
	default:
	}
}

// report records one probe's result.
func report(reachable bool) {
	if reachable {
		failures.Store(0)
		if offline.Swap(false) {
			notify()
		}
		return
	}
	if failures.Add(1) >= failuresBeforeOffline && !offline.Swap(true) {
		notify()
	}
}

func dial(ctx context.Context) bool {
	conn, err := (&net.Dialer{Timeout: probeTimeout}).DialContext(ctx, "tcp", probeAddress)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// Start watches the connection until ctx ends. A TCP connect is enough: it answers "is there a route
// to the internet", and it costs nothing against AniList's request budget.
func Start(ctx context.Context) {
	go run(ctx, dial)
}

func run(ctx context.Context, probe func(context.Context) bool) {
	for {
		report(probe(ctx))

		interval := onlineProbeInterval
		if failures.Load() > 0 {
			interval = offlineProbeInterval
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-wake:
			timer.Stop()
		case <-timer.C:
		}
	}
}

// IsNetworkError reports an error that means the request never got an answer: no route, no DNS,
// a refused or reset connection, a timeout. As opposed to an answer the caller did not like.
func IsNetworkError(err error) bool {
	if err == nil {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	l := strings.ToLower(err.Error())
	for _, s := range []string{
		"dial tcp", "no such host", "dns blocked", "no doh resolver", "i/o timeout", "connection refused",
		"connection reset", "network is unreachable", "no route to host", "tls handshake timeout",
		"client.timeout exceeded", "server misbehaving", "temporary failure in name resolution",
	} {
		if strings.Contains(l, s) {
			return true
		}
	}
	return false
}

// WaitOnline returns once the internet can be reached, waiting as long as it takes; it returns
// ctx's error if ctx ends first. Returns straight away while online.
func WaitOnline(ctx context.Context) error {
	for IsOffline() {
		ReportNetworkFailure()
		t := time.NewTimer(WaitOnlinePoll)
		select {
		case <-ctx.Done():
			t.Stop()
			return ctx.Err()
		case <-t.C:
		}
	}
	return nil
}

// WaitOnlinePoll is how often WaitOnline looks again.
var WaitOnlinePoll = 5 * time.Second

// SettleAfterNetworkError is for a request that just failed on the network: it asks for a check
// and gives the check time to decide (the state flips to offline after a few failed probes). If
// the internet turns out to be down it waits until it is back. It returns true when it waited
// for the connection, false when the internet stayed up (the failure was the site's).
func SettleAfterNetworkError(ctx context.Context) (waited bool, err error) {
	ReportNetworkFailure()
	deadline := time.Now().Add(settleWindow)
	for time.Now().Before(deadline) {
		if IsOffline() {
			return true, WaitOnline(ctx)
		}
		t := time.NewTimer(2 * time.Second)
		select {
		case <-ctx.Done():
			t.Stop()
			return false, ctx.Err()
		case <-t.C:
		}
		ReportNetworkFailure()
	}
	return false, nil
}

// settleWindow is how long SettleAfterNetworkError gives the probes to agree the internet is down.
var settleWindow = 45 * time.Second
