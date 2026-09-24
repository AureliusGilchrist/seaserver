package unmatched

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// stuckDownloadCheckInterval is how often the monitor re-checks which "downloading" badges have
// nothing left behind them in the torrent client. Matches Scanner's own scan interval — there is no
// reason for this to run on a different cadence.
const stuckDownloadCheckInterval = 3 * time.Minute

// StuckDownloadMonitor periodically flags "downloading" badges that have nothing behind them in the
// torrent client — the torrent was removed outside Seanime entirely, directly in the client's own
// UI, which is the one way a stuck badge happens that nothing else here ever notices.
//
// Purely advisory: it writes nothing to AnimeDownloadState and only ever answers "which media IDs
// currently look stuck". Clearing a badge — one at a time or in bulk — always goes through the
// existing ClearAnimeDownloadStateIfDownloading, which re-checks the badge at write time regardless
// of what this reports. A wrong or stale verdict here can at worst clear a badge a little early,
// never corrupt state the way live reconciliation once did — see HandleGetDownloadingMediaIds' doc
// comment for the incident this is careful not to repeat.
type StuckDownloadMonitor struct {
	logger     *zerolog.Logger
	repository *Repository

	mu            sync.Mutex
	isRunning     bool
	cancelFunc    context.CancelFunc
	checkInterval time.Duration

	// torrentStateSource reads the torrent client's current list. Set once at startup — see
	// SetTorrentStateSource.
	torrentStateSource func() ([]TorrentState, bool)

	stuck []int
}

// NewStuckDownloadMonitor creates a monitor. Call SetTorrentStateSource and Start before relying on
// StuckMediaIDs — until the first successful pass completes, it reports nothing stuck.
func NewStuckDownloadMonitor(logger *zerolog.Logger, repository *Repository) *StuckDownloadMonitor {
	return &StuckDownloadMonitor{
		logger:        logger,
		repository:    repository,
		checkInterval: stuckDownloadCheckInterval,
	}
}

// SetTorrentStateSource wires in how the monitor reads the torrent client's current list. Shares
// Scanner's exact signature so both can be built from the same closure — see
// (*core.App).buildTorrentStateSource.
func (m *StuckDownloadMonitor) SetTorrentStateSource(fn func() ([]TorrentState, bool)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.torrentStateSource = fn
}

// Start begins the periodic check, plus one immediate pass so a fresh start does not wait a full
// interval before StuckMediaIDs has an answer.
func (m *StuckDownloadMonitor) Start() {
	m.mu.Lock()
	if m.isRunning {
		m.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancelFunc = cancel
	m.isRunning = true
	m.mu.Unlock()

	go m.run(ctx)
}

// Stop ends the periodic check. Safe to call more than once, and safe to call when never started.
func (m *StuckDownloadMonitor) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.isRunning {
		return
	}
	m.isRunning = false
	if m.cancelFunc != nil {
		m.cancelFunc()
		m.cancelFunc = nil
	}
}

func (m *StuckDownloadMonitor) run(ctx context.Context) {
	m.check()

	ticker := time.NewTicker(m.checkInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.check()
		}
	}
}

// check runs one pass. An unreachable torrent client skips the pass entirely and keeps serving the
// previous result — the same conservative rule Scanner's CompletionUnreachable follows, and for the
// same reason: guessing "nothing is downloading" from a client that simply did not answer is exactly
// what once reported 131 anime as downloading when it was briefly unreachable.
func (m *StuckDownloadMonitor) check() {
	m.mu.Lock()
	source := m.torrentStateSource
	m.mu.Unlock()
	if source == nil {
		return
	}

	states, ok := source()
	if !ok {
		return
	}

	liveNames := make(map[string]struct{}, len(states))
	for _, s := range states {
		liveNames[s.Name] = struct{}{}
	}

	stuck := m.repository.ComputeStuckDownloadingMediaIDs(liveNames)

	m.mu.Lock()
	changed := !intSlicesEqual(m.stuck, stuck)
	m.stuck = stuck
	m.mu.Unlock()

	// Logged on change only — a fixed set would otherwise repeat itself in the log every three
	// minutes for as long as a stuck download sits there unnoticed.
	if changed {
		m.logger.Debug().Ints("mediaIds", stuck).Msg("unmatched: Stuck downloading badges recomputed")
	}
}

// StuckMediaIDs returns the last computed set of media IDs whose "downloading" badge has nothing
// live behind it. Empty before the first successful pass.
func (m *StuckDownloadMonitor) StuckMediaIDs() []int {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]int, len(m.stuck))
	copy(out, m.stuck)
	return out
}

func intSlicesEqual(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
