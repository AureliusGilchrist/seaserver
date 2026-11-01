// Package connectivity is the server's one answer to "can we reach the internet right now?".
//
// Everything that talks to the internet asks here first, so losing the connection means instant
// fallbacks rather than each caller separately waiting out its own timeout. A black-holed network is
// the case that matters: requests there don't fail, they hang.
package connectivity

import (
	"context"
	"net"
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
