// Package memwatch keeps the server's memory in check while it runs for days.
//
// A garbage collection can only free memory nothing refers to any more, and a leak is, by
// definition, memory something still refers to — so the periodic GC the server already runs
// (server.startGoroutineCleanup) cannot clear one. What can is, in order of cost:
//
//  1. Releasing what the server holds on purpose: the file cache keeps every bucket it has touched
//     decoded in memory. Dropping them (after writing them to disk) gives that memory back; each
//     bucket is read back from its file the next time something asks for it.
//  2. Restarting the process in place, which frees everything, leaked or not. Only when memory is
//     still near the limit after step 1 for a sustained stretch, and only while nobody is watching
//     anything, so a restart never cuts a video off.
package memwatch

import (
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"
)

// Thresholds, as fractions of the Go runtime's soft memory limit (see main.applyMemoryLimit).
const (
	// releaseFraction: above this much in use, drop the caches and return memory to the OS.
	releaseFraction = 0.60
	// restartFraction: still above this much once the caches are gone means memory the server
	// cannot get back while running.
	restartFraction = 0.85
)

var (
	checkInterval   = time.Minute
	releaseCooldown = 10 * time.Minute
	// restartAfter is how long memory has to stay over restartFraction (with the caches already
	// released) before a restart is considered: a long scan or a big import can peak briefly.
	restartAfter = 10 * time.Minute
	// idleFor is how long no playback request may have arrived before a restart is allowed.
	idleFor = 15 * time.Minute
	// minUptime keeps a server that comes back up already large (a leak that is really load) from
	// restarting in a loop.
	minUptime = 30 * time.Minute
)

// Options wires the watchdog to the app. Every field is optional.
type Options struct {
	Logger *zerolog.Logger
	// ReleaseCaches drops in-memory caches (after persisting them).
	ReleaseCaches func()
	// Busy reports work a restart must not interrupt, beyond the playback this package tracks.
	Busy func() bool
	// Restart replaces the process with a fresh copy of itself. Nil disables tier 2.
	Restart func(reason string) error
	// BeforeRestart runs just before Restart (flush caches, tell the clients).
	BeforeRestart func()
}

// lastPlayback is when the last playback-related request arrived (unix nanoseconds).
var lastPlayback atomic.Int64

// playbackPrefixes are the API routes that mean someone is watching or about to.
var playbackPrefixes = []string{
	"/api/v1/mediastream",
	"/api/v1/directstream",
	"/api/v1/torrentstream",
	"/api/v1/onlinestream",
	"/api/v1/playback-manager",
	"/api/v1/nativeplayer",
	"/api/v1/proxy",
	"/api/v1/stream",
	"/api/v1/nakama",
	"/api/v1/watchparty",
}

// NoteRequest records playback activity when path is a playback route. Cheap enough to call for
// every request.
func NoteRequest(path string) {
	if !strings.HasPrefix(path, "/api/v1/") {
		return
	}
	for _, p := range playbackPrefixes {
		if strings.HasPrefix(path, p) {
			lastPlayback.Store(time.Now().UnixNano())
			return
		}
	}
}

func playbackIdle(now time.Time) bool {
	last := lastPlayback.Load()
	return last == 0 || now.Sub(time.Unix(0, last)) >= idleFor
}

// Usage is the memory the process holds from the OS, as the runtime sees it.
type Usage struct {
	// InUse is what the process holds and has not handed back: Sys minus HeapReleased. This is
	// close to the resident size the OS reports for a Go program.
	InUse uint64
	// HeapAlloc is the live heap (plus garbage not yet collected).
	HeapAlloc uint64
	Limit     uint64
}

func readUsage() Usage {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	limit := debug.SetMemoryLimit(-1)
	if limit < 0 {
		limit = 0
	}
	return Usage{InUse: m.Sys - m.HeapReleased, HeapAlloc: m.HeapAlloc, Limit: uint64(limit)}
}

// Watcher is the running watchdog.
type Watcher struct {
	opts    Options
	started time.Time

	mu          sync.Mutex
	lastRelease time.Time
	overSince   time.Time
	restarting  bool

	// read is swapped by tests.
	read func() Usage
}

var startOnce sync.Once

// Start runs the watchdog for the life of the process. Calling it again does nothing.
func Start(opts Options) {
	startOnce.Do(func() {
		w := newWatcher(opts)
		current.Store(w)
		go w.loop()
	})
}

func newWatcher(opts Options) *Watcher {
	if opts.Logger == nil {
		l := zerolog.Nop()
		opts.Logger = &l
	}
	return &Watcher{opts: opts, started: time.Now(), read: readUsage}
}

func (w *Watcher) loop() {
	t := time.NewTicker(checkInterval)
	defer t.Stop()
	for now := range t.C {
		w.check(now)
	}
}

// ReleaseNow runs tier 1 immediately (for the manual "free memory" action) and reports usage
// before and after.
func (w *Watcher) ReleaseNow() (before, after Usage) {
	before = w.read()
	w.release()
	after = w.read()
	return before, after
}

func (w *Watcher) release() {
	if w.opts.ReleaseCaches != nil {
		func() {
			defer func() { _ = recover() }()
			w.opts.ReleaseCaches()
		}()
	}
	runtime.GC()
	debug.FreeOSMemory()
}

// check is one tick. Separate from loop so tests can drive it with their own clock.
func (w *Watcher) check(now time.Time) {
	u := w.read()
	if u.Limit == 0 || u.Limit >= 1<<62 {
		return // no limit set: nothing to measure against
	}
	limit := float64(u.Limit)

	w.mu.Lock()
	if w.restarting {
		w.mu.Unlock()
		return
	}
	shouldRelease := float64(u.InUse) > limit*releaseFraction && now.Sub(w.lastRelease) >= releaseCooldown
	if shouldRelease {
		w.lastRelease = now
	}
	w.mu.Unlock()

	if shouldRelease {
		w.release()
		after := w.read()
		w.opts.Logger.Info().
			Uint64("inUseBeforeMB", u.InUse>>20).
			Uint64("inUseAfterMB", after.InUse>>20).
			Uint64("heapAfterMB", after.HeapAlloc>>20).
			Uint64("limitMB", u.Limit>>20).
			Msg("memwatch: Memory high — released caches and returned free memory to the OS")
		u = after
	}

	// Tier 2 looks at the live heap, not InUse: freed pages the OS has not taken back yet are not
	// a reason to restart.
	over := float64(u.HeapAlloc) > limit*restartFraction
	w.mu.Lock()
	if !over {
		w.overSince = time.Time{}
		w.mu.Unlock()
		return
	}
	if w.overSince.IsZero() {
		w.overSince = now
		w.mu.Unlock()
		w.opts.Logger.Warn().
			Uint64("heapMB", u.HeapAlloc>>20).
			Uint64("limitMB", u.Limit>>20).
			Msg("memwatch: Memory still near the limit after releasing caches — will restart when idle if it stays there")
		return
	}
	sustained := now.Sub(w.overSince) >= restartAfter
	w.mu.Unlock()

	if !sustained || w.opts.Restart == nil || now.Sub(w.started) < minUptime {
		return
	}
	if !playbackIdle(now) || (w.opts.Busy != nil && w.opts.Busy()) {
		return // try again next tick
	}

	w.mu.Lock()
	w.restarting = true
	w.mu.Unlock()
	w.opts.Logger.Warn().
		Uint64("heapMB", u.HeapAlloc>>20).
		Uint64("limitMB", u.Limit>>20).
		Msg("memwatch: Memory has stayed near the limit — restarting the server to free it")
	if w.opts.BeforeRestart != nil {
		func() {
			defer func() { _ = recover() }()
			w.opts.BeforeRestart()
		}()
	}
	if err := w.opts.Restart("memory stayed near the limit"); err != nil {
		w.opts.Logger.Error().Err(err).Msg("memwatch: Restart failed")
		w.mu.Lock()
		w.restarting = false
		w.overSince = time.Time{}
		w.mu.Unlock()
	}
}

var current atomic.Pointer[Watcher]

// Current returns the running watcher, or nil before Start.
func Current() *Watcher { return current.Load() }
