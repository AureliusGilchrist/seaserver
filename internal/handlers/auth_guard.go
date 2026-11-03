package handlers

import (
	"context"
	"crypto/subtle"
	"sync"
	"time"
)

// secureEqual compares two secrets in constant time, so the response time doesn't reveal how
// many leading characters of a guess were right. An empty expected value never matches: an
// unset password must not be satisfied by an empty header.
func secureEqual(given, expected string) bool {
	if expected == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(given), []byte(expected)) == 1
}

// authGuard slows down password guessing against the server and Rooms host passwords.
//
// It never refuses a correct password and never changes the response a client gets, so a
// legitimate client is unaffected: a device still holding an old password just gets its
// "UNAUTHENTICATED" answers more slowly. Once an address has made more than
// guardFreeFailures wrong attempts within guardWindow, each further wrong attempt is held for
// guardPenalty, and at most guardConcurrency of them run at once. That caps a guesser at a few
// attempts per second per address instead of thousands.
type authGuard struct {
	mu    sync.Mutex
	peers map[string]*guardPeer
	last  time.Time
}

type guardPeer struct {
	failures []time.Time
	slots    chan struct{}
	seen     time.Time
}

const (
	guardWindow       = time.Minute
	guardFreeFailures = 10
	guardPenalty      = time.Second
	guardConcurrency  = 2
	guardMaxWait      = 10 * time.Second
)

var serverAuthGuard = &authGuard{peers: map[string]*guardPeer{}}

// failed records a wrong password from ip and, past the free allowance, holds the caller.
func (g *authGuard) failed(ctx context.Context, ip string) {
	now := time.Now()

	g.mu.Lock()
	g.sweep(now)
	p, ok := g.peers[ip]
	if !ok {
		p = &guardPeer{slots: make(chan struct{}, guardConcurrency)}
		g.peers[ip] = p
	}
	p.seen = now
	kept := p.failures[:0]
	for _, t := range p.failures {
		if now.Sub(t) < guardWindow {
			kept = append(kept, t)
		}
	}
	p.failures = append(kept, now)
	over := len(p.failures) > guardFreeFailures
	slots := p.slots
	g.mu.Unlock()

	if !over {
		return
	}

	wait, cancel := context.WithTimeout(ctx, guardMaxWait)
	defer cancel()
	select {
	case slots <- struct{}{}:
	case <-wait.Done():
		return
	}
	defer func() { <-slots }()

	timer := time.NewTimer(guardPenalty)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
	}
}

// sweep drops addresses that have been quiet for a while. Called with g.mu held.
func (g *authGuard) sweep(now time.Time) {
	if now.Sub(g.last) < guardWindow {
		return
	}
	g.last = now
	for ip, p := range g.peers {
		if now.Sub(p.seen) > 2*guardWindow && len(p.slots) == 0 {
			delete(g.peers, ip)
		}
	}
}
