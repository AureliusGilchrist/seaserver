package unmatched

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/rs/zerolog"
)

// Scanner monitors the Unmatched folder for completed downloads.
//
// Deciding that a download has finished is the whole job, and getting it wrong is expensive: a
// torrent queued with auto-match is matched the moment this says "done", which moves its files
// into the library and deletes the staging directory. Do that to a download still in progress and
// the client is left writing into files that have been moved out from under it, the episodes that
// land in the library are fragments, and the torrent vanishes from the Unmatched screen.
//
// Temp-file extensions alone cannot answer the question. qBittorrent's ".!qB" suffix is an option
// that is off by default, Transmission uses ".part" only for the file it is actively writing, and
// the built-in client writes final filenames from the first byte. An in-progress download in the
// default configuration therefore looks exactly like a finished one on disk. So the client is
// asked first, and only when it has nothing to say does this fall back to watching the directory
// stop changing.
type Scanner struct {
	logger     *zerolog.Logger
	repository *Repository

	mu                sync.Mutex
	isRunning         bool
	cancelFunc        context.CancelFunc
	completedTorrents []string
	scanInterval      time.Duration
	verifyDelay       time.Duration

	// debounceCh coalesces rapid file-system events into a single scan
	debounceCh chan struct{}

	// onAutoMatched is invoked after a torrent is matched automatically, so the app can
	// refresh the library and notify the client. Optional.
	onAutoMatched func(torrentName string, result *MatchResult)

	// torrentStateSource reports what the torrent client currently knows. Optional: without it
	// every directory falls back to the settle check below.
	torrentStateSource func() ([]TorrentState, bool)
	// cachedStates holds one scan pass's worth of client state. A pass verifies each directory on
	// its own goroutine, and without this each one would query the client separately.
	cachedStates   []TorrentState
	cachedStatesOK bool
	cachedStatesAt time.Time

	// fingerprints records what each directory looked like the last time it was measured, for the
	// settle check.
	fingerprints map[string]dirFingerprint

	// loggedVerdicts remembers the last thing said about each directory, so a download that is
	// simply taking a while is reported once instead of on every pass. See noteVerdict.
	loggedVerdicts map[string]CompletionState

	// verifying holds the directories a verification goroutine is currently working on, so a second
	// one is never started for the same directory. See beginVerifying.
	verifying map[string]bool

	// startedAt is when this scanner began running, and sawTorrents records whether the client has
	// ever reported holding anything. Together they decide when an empty report from the client may
	// be believed — see clientHasBeenSeenLoaded.
	startedAt   time.Time
	sawTorrents bool
}

// clientStartupGrace is how long after this process starts an empty report from the torrent client
// is treated as "not loaded yet" rather than as "there are no torrents".
//
// Only long enough to cover a client coming up alongside the server after a reboot. Nothing is lost
// by waiting: the only thing it delays is the settle fallback, and that path already requires a
// directory to sit unchanged for settleWindow before it does anything.
const clientStartupGrace = 5 * time.Minute

// clientHasBeenSeenLoaded reports whether an empty answer from the torrent client can be believed.
func (s *Scanner) clientHasBeenSeenLoaded() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.sawTorrents {
		return true
	}
	// A scanner with no recorded start is one built directly rather than through Start; treat it as
	// long-running rather than as freshly started, so this can never silently disable itself.
	if s.startedAt.IsZero() {
		return true
	}
	return time.Since(s.startedAt) > clientStartupGrace
}

// beginVerifying claims a directory for verification, reporting false when another goroutine
// already holds it. Release with finishVerifying.
//
// A scan pass launches one goroutine per staging directory, each of which sleeps and then measures
// the directory. Passes are also triggered by file-system events — and a download in progress is
// nothing but file-system events, hundreds a second, in the very directory being measured. So every
// unfinished download accumulated verification goroutines for as long as it ran: dozens of them
// awake at once, each walking the whole directory tree looking for temp files, each asking the
// torrent client, each writing the same line to the log. That is what turned one slow download into
// pages of identical output and a steady background load of directory walks over a large,
// possibly remote, tree.
//
// One at a time per directory is all that was ever wanted; the answer does not get truer for being
// computed fifty times in parallel.
func (s *Scanner) beginVerifying(torrent string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.verifying == nil {
		s.verifying = make(map[string]bool)
	}
	if s.verifying[torrent] {
		return false
	}
	s.verifying[torrent] = true
	return true
}

func (s *Scanner) finishVerifying(torrent string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.verifying, torrent)
}

// noteVerdict reports whether this verdict is worth writing to the log: it is, only when it differs
// from the last one recorded for this directory.
//
// The scan runs every few seconds and re-verifies every staging directory it has not yet accepted,
// so without this a single long download writes the same line hundreds of times and buries
// everything else in the log. What is worth knowing is that the state changed, not that it has
// persisted for another few seconds.
func (s *Scanner) noteVerdict(torrent string, verdict CompletionState) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.loggedVerdicts == nil {
		s.loggedVerdicts = make(map[string]CompletionState)
	}
	if previous, ok := s.loggedVerdicts[torrent]; ok && previous == verdict {
		return false
	}
	s.loggedVerdicts[torrent] = verdict
	return true
}

// TorrentState is the part of a torrent client's report that says whether a download is done and
// where it is being written. Deliberately minimal: the scanner must not depend on the torrent
// client package, which would make the dependency circular.
type TorrentState struct {
	Name     string
	SavePath string
	Finished bool
}

// CompletionState is what the torrent client says about a staging directory.
type CompletionState string

const (
	// CompletionUnknown — the client answered, and none of its torrents match this directory: it
	// was removed after finishing, or the files were put here by hand. This is the only verdict
	// that may fall through to the settle check.
	CompletionUnknown CompletionState = "unknown"
	// CompletionUnreachable — the client could not be asked at all. It is not "no record": the
	// download may well be running, and nothing may be concluded from silence.
	//
	// Collapsing this into CompletionUnknown is what moved partial downloads into the library. The
	// settle check treats a directory that has not changed for a while as finished, which is a
	// reasonable thing to say about a download the client has forgotten and a completely wrong
	// thing to say about one it is still running — and a download stalls for ninety seconds all the
	// time, on a slow peer, on a piece being verified, on being queued behind another. So whenever
	// the client was unreachable, any paused or briefly stalled download was declared finished, its
	// half-written files were moved into the library, and its staging directory was deleted.
	//
	// The client is unreachable in exactly the situations where downloads are most likely to be in
	// flight: while it is restarting, while the network is down, and — the case that made this
	// routine — for the whole window after the backend restarts, before anything has told the
	// scanner how to reach it.
	CompletionUnreachable CompletionState = "unreachable"
	// CompletionDownloading — the client is still writing this one.
	CompletionDownloading CompletionState = "downloading"
	// CompletionFinished — the client reports the download as complete.
	CompletionFinished CompletionState = "finished"
)

// dirFingerprint is a cheap measure of a directory's contents, used to notice it has stopped
// growing. Size and file count together catch both a file being written and files being added.
type dirFingerprint struct {
	files int
	size  int64
	// since is when this fingerprint was first seen, not when it was last confirmed — that is what
	// makes "unchanged for long enough" measurable.
	since time.Time
}

// settleWindow is how long a directory the torrent client knows nothing about must stay byte-for-
// byte unchanged before it counts as finished. Long enough that a download stalling briefly (a
// slow peer, a piece being verified) is not mistaken for a finished one, short enough that a
// torrent removed from the client the moment it completed is still picked up promptly.
const settleWindow = 90 * time.Second

// torrentStateTTL is how long one query of the torrent client is reused within a scan pass.
const torrentStateTTL = 5 * time.Second

// SetOnAutoMatched registers a callback fired after a successful automatic match.
func (s *Scanner) SetOnAutoMatched(fn func(torrentName string, result *MatchResult)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onAutoMatched = fn
}

// SetTorrentStateSource registers the way to ask the torrent client what it is doing. The bool
// reports whether the client could be reached at all — an unreachable client is not the same as a
// client with nothing to report, and only the latter may fall through to the settle check.
func (s *Scanner) SetTorrentStateSource(fn func() ([]TorrentState, bool)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.torrentStateSource = fn
}

// torrentStates returns the client's current report, reusing one query across a scan pass.
func (s *Scanner) torrentStates() ([]TorrentState, bool) {
	s.mu.Lock()
	source := s.torrentStateSource
	if source == nil {
		s.mu.Unlock()
		return nil, false
	}
	if time.Since(s.cachedStatesAt) < torrentStateTTL {
		states, ok := s.cachedStates, s.cachedStatesOK
		s.mu.Unlock()
		return states, ok
	}
	s.mu.Unlock()

	// Queried outside the lock: reaching a torrent client is a network call, and holding the
	// scanner's lock across it would stall every other directory being verified.
	states, ok := source()

	s.mu.Lock()
	s.cachedStates, s.cachedStatesOK, s.cachedStatesAt = states, ok, time.Now()
	// Once the client has been seen holding something, it has clearly finished loading, and an
	// empty report from it later means what it says.
	if ok && len(states) > 0 {
		s.sawTorrents = true
	}
	s.mu.Unlock()

	return states, ok
}

// completionState asks the torrent client whether the download writing into a staging directory
// has finished.
func (s *Scanner) completionState(dirName string) CompletionState {
	states, ok := s.torrentStates()
	if !ok {
		return CompletionUnreachable
	}

	// A client that answers with nothing at all, early in this process's life, is almost certainly
	// still starting up rather than genuinely empty — a torrent client and this server on the same
	// machine come back together after a reboot, and the client serves an empty list for a while
	// before it has finished loading its session. Taken at face value that reads as "no record" for
	// every download in progress, which is the settle check's licence to move them.
	//
	// So an empty report only counts once this process has been up long enough for the client to
	// have loaded, or once the client has been seen holding at least one torrent. After that an
	// empty client is taken at its word, which is what a library of hand-copied files needs.
	if len(states) == 0 && !s.clientHasBeenSeenLoaded() {
		return CompletionUnreachable
	}

	for _, state := range states {
		dir, matched := StagingDirForTorrent(state.Name, state.SavePath)
		if !matched || dir != dirName {
			continue
		}
		if state.Finished {
			return CompletionFinished
		}
		return CompletionDownloading
	}

	return CompletionUnknown
}

// looksSettled reports whether a directory has stopped changing for settleWindow.
//
// This is the fallback for downloads the torrent client cannot account for. It is deliberately
// conservative: the first sighting of a directory never counts as settled, so a torrent is given
// at least one full window before anything is done with it.
func (s *Scanner) looksSettled(dirName, path string) bool {
	files, size := fingerprintDir(path)

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.fingerprints == nil {
		s.fingerprints = make(map[string]dirFingerprint)
	}

	prev, seen := s.fingerprints[dirName]
	if !seen || prev.files != files || prev.size != size {
		s.fingerprints[dirName] = dirFingerprint{files: files, size: size, since: time.Now()}
		return false
	}

	return time.Since(prev.since) >= settleWindow
}

// fingerprintDir totals the files in a directory tree and their bytes.
func fingerprintDir(path string) (files int, size int64) {
	_ = filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		files++
		size += info.Size()
		return nil
	})
	return files, size
}

// addRecursiveWatch registers the base directory and all existing subdirectories with the watcher.
// It is best-effort: if any directory cannot be watched, it logs and continues.
func (s *Scanner) addRecursiveWatch(w *fsnotify.Watcher, root string) error {
	if err := w.Add(root); err != nil {
		return err
	}
	return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if path == root {
			return nil
		}
		if err := w.Add(path); err != nil {
			s.logger.Debug().Err(err).Str("dir", path).Msg("unmatched scanner: failed to watch subdirectory")
		}
		return nil
	})
}

type ScannerStatus struct {
	IsRunning         bool     `json:"isRunning"`
	CompletedTorrents []string `json:"completedTorrents"`
}

func NewScanner(logger *zerolog.Logger, repository *Repository) *Scanner {
	return &Scanner{
		logger:            logger,
		repository:        repository,
		completedTorrents: make([]string, 0),
		scanInterval:      3 * time.Minute,
		verifyDelay:       5 * time.Second,
		debounceCh:        make(chan struct{}, 1),
	}
}

// TriggerScan starts a scan asynchronously. Best-effort and safe to call anytime.
func (s *Scanner) TriggerScan() {
	go s.scanForCompletedDownloads()
}

func (s *Scanner) Start() {
	s.mu.Lock()
	if s.isRunning {
		s.mu.Unlock()
		return
	}
	s.isRunning = true
	// Restarting the backend restarts this clock, which is the point: a client that comes back up
	// alongside us gets the same grace it would after a reboot. See clientStartupGrace.
	s.startedAt = time.Now()
	s.sawTorrents = false
	s.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	s.cancelFunc = cancel

	go s.run(ctx)
	s.logger.Info().Msg("unmatched scanner: Started")
}

func (s *Scanner) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.cancelFunc != nil {
		s.cancelFunc()
	}
	s.isRunning = false
	s.logger.Info().Msg("unmatched scanner: Stopped")
}

func (s *Scanner) GetStatus() *ScannerStatus {
	s.mu.Lock()
	defer s.mu.Unlock()

	return &ScannerStatus{
		IsRunning:         s.isRunning,
		CompletedTorrents: s.completedTorrents,
	}
}

func (s *Scanner) run(ctx context.Context) {
	defer func() {
		s.mu.Lock()
		s.isRunning = false
		s.mu.Unlock()
	}()

	// Initial scan
	s.scanForCompletedDownloads()

	// Watcher for file events
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		s.logger.Warn().Err(err).Msg("unmatched scanner: could not start file watcher; falling back to polling only")
		watcher = nil
	}
	if watcher != nil {
		// Watch base path and subdirectories; if missing, skip
		if err := s.addRecursiveWatch(watcher, UnmatchedBasePath); err != nil {
			s.logger.Warn().Err(err).Msg("unmatched scanner: could not watch base path; falling back to polling only")
			watcher.Close()
			watcher = nil
		}
	}

	ticker := time.NewTicker(s.scanInterval)
	defer ticker.Stop()

	// Debounce goroutine: coalesces rapid file events into one scan per 3-second window.
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case _, ok := <-s.debounceCh:
				if !ok {
					return
				}
				timer := time.NewTimer(3 * time.Second)
			drain:
				for {
					select {
					case <-s.debounceCh:
					case <-timer.C:
						break drain
					case <-ctx.Done():
						timer.Stop()
						return
					}
				}
				timer.Stop()
				go s.scanForCompletedDownloads()
			}
		}
	}()

	noEvents := make(<-chan fsnotify.Event)
	noErrors := make(<-chan error)

	for {
		var watchEvents <-chan fsnotify.Event
		var watchErrors <-chan error
		if watcher != nil {
			watchEvents = watcher.Events
			watchErrors = watcher.Errors
		} else {
			watchEvents = noEvents
			watchErrors = noErrors
		}

		select {
		case <-ctx.Done():
			if watcher != nil {
				watcher.Close()
			}
			return
		case <-ticker.C:
			go s.scanForCompletedDownloads()
		case event := <-watchEvents:
			if event.Op&fsnotify.Create == fsnotify.Create {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					_ = watcher.Add(event.Name)
				}
			}
			// Signal the debouncer (non-blocking)
			select {
			case s.debounceCh <- struct{}{}:
			default:
			}
		case err := <-watchErrors:
			if err != nil {
				s.logger.Warn().Err(err).Msg("unmatched scanner: watcher error")
			}
		}
	}
}

// scanForCompletedDownloads scans the Unmatched folder for torrents
// that have finished downloading (no .!qB temp files)
func (s *Scanner) scanForCompletedDownloads() {
	if _, err := os.Stat(UnmatchedBasePath); os.IsNotExist(err) {
		return
	}

	// Clear out directories left behind by earlier matches before looking for new downloads.
	if s.repository != nil {
		s.repository.SweepEmptyTorrentDirectories()
	}

	entries, err := os.ReadDir(UnmatchedBasePath)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		rel := entry.Name()

		// The journal of interrupted matches lives here too, and it is not a download.
		if rel == pendingMatchDirName {
			continue
		}

		// Skip torrents already confirmed complete — fast O(n) check avoids the 5-second verify-delay re-running.
		s.mu.Lock()
		alreadyTracked := false
		for _, t := range s.completedTorrents {
			if t == rel {
				alreadyTracked = true
				break
			}
		}
		s.mu.Unlock()
		if alreadyTracked {
			continue
		}

		path := filepath.Join(UnmatchedBasePath, rel)

		// Quick skip: no video files means it's empty or already moved
		if !s.hasVideoFiles(path) {
			continue
		}

		// Still downloading if temp files present
		if s.hasTempFiles(path) {
			continue
		}

		// One verification at a time per directory. Passes come far faster than a verification
		// takes — a download in progress triggers them itself, through the watcher — so without
		// this the goroutines stack up on the same directory for the whole download.
		if !s.beginVerifying(rel) {
			continue
		}

		// No temp files detected — verify asynchronously to avoid blocking other directories
		go func(torrentRel, torrentPath string) {
			defer s.finishVerifying(torrentRel)

			time.Sleep(s.verifyDelay)
			if s.hasTempFiles(torrentPath) {
				return
			}
			if s.deepScanForTempFiles(torrentPath) {
				return
			}

			// Absence of temp files proves nothing on its own — see the type comment. Ask the
			// client, and only fall back to watching the directory settle when the client has
			// nothing to say about this torrent.
			verdict := s.completionState(torrentRel)
			switch verdict {
			case CompletionDownloading:
				// Said once per state change, not once per pass — a download that takes an hour
				// should cost one line, not one line every few seconds for an hour.
				if s.noteVerdict(torrentRel, verdict) {
					s.logger.Debug().Str("torrent", torrentRel).
						Msg("unmatched scanner: Torrent client reports this download is still in progress")
				}
				return
			case CompletionUnreachable:
				// Nothing may be concluded while the client cannot be asked. Waiting costs a
				// delayed match; guessing costs half an episode moved into the library and the rest
				// of the download deleted out from under the client.
				if s.noteVerdict(torrentRel, verdict) {
					s.logger.Debug().Str("torrent", torrentRel).
						Msg("unmatched scanner: Torrent client cannot be reached, leaving this download alone")
				}
				return
			case CompletionFinished:
				// The client is the authority — no waiting needed.
			default:
				if !s.looksSettled(torrentRel, torrentPath) {
					if s.noteVerdict(torrentRel, verdict) {
						s.logger.Debug().Str("torrent", torrentRel).
							Msg("unmatched scanner: Torrent client has no record of this download, waiting for it to stop changing")
					}
					return
				}
			}

			s.mu.Lock()
			defer s.mu.Unlock()
			for _, t := range s.completedTorrents {
				if t == torrentRel {
					return
				}
			}
			s.completedTorrents = append(s.completedTorrents, torrentRel)
			// Forgotten now it is done, so that if this name ever comes back — a re-download, or
			// the same release fetched again — its progress is reported afresh rather than being
			// silenced by what was said about the previous one.
			delete(s.loggedVerdicts, torrentRel)
			s.logger.Info().Str("torrent", torrentRel).Str("verdict", string(verdict)).Msg("unmatched scanner: Download completed!")

			// If the torrent was queued with auto-match enabled, match it now — the same
			// match the user would perform by hand in the Unmatched screen. Runs outside the
			// lock so a slow file move can't stall the scanner.
			go s.autoMatchIfRequested(torrentRel)
		}(rel, path)
	}
}

// CompletionStateFor reports what the torrent client says about a staging directory. Exported for
// the diagnostics endpoint, which exists to answer "why has this download not been picked up".
func (s *Scanner) CompletionStateFor(dirName string) CompletionState {
	return s.completionState(dirName)
}

// IsMarkedCompleted reports whether the scanner has already accepted this directory as finished.
func (s *Scanner) IsMarkedCompleted(dirName string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range s.completedTorrents {
		if t == dirName {
			return true
		}
	}
	return false
}

// autoMatchIfRequested matches a just-completed torrent if it was queued with auto-match.
// Does nothing for torrents the user intends to match manually.
func (s *Scanner) autoMatchIfRequested(torrentName string) {
	defer func() {
		if rec := recover(); rec != nil {
			s.logger.Error().Interface("panic", rec).Str("torrent", torrentName).Msg("unmatched scanner: Auto-match panicked")
		}
	}()

	if s.repository == nil {
		return
	}

	// The freshly-written files may not be reflected in the cached listing yet.
	s.repository.InvalidateCache()

	result, err := s.repository.AutoMatchTorrent(torrentName)
	if err != nil {
		s.logger.Error().Err(err).Str("torrent", torrentName).Msg("unmatched scanner: Auto-match failed, torrent left for manual matching")
		return
	}
	if result == nil {
		return // auto-match not requested for this torrent
	}

	if !result.Success || len(result.FailedFiles) > 0 {
		s.logger.Warn().
			Str("torrent", torrentName).
			Int("moved", len(result.MovedFiles)).
			Int("failed", len(result.FailedFiles)).
			Str("error", result.ErrorMessage).
			Msg("unmatched scanner: Auto-match completed with errors")

		// A conflict is a question, and there was nobody here to answer it — this ran because a
		// download finished, not because anyone pressed anything. Kept against the torrent so the
		// Unmatched screen can put it to the user, instead of the download sitting there looking
		// untouched with the reason it stopped only in the log.
		if result.CountMismatch != nil {
			s.repository.SetPendingCountMismatch(torrentName, result.CountMismatch)
			s.logger.Info().
				Str("torrent", torrentName).
				Int("expected", result.CountMismatch.Expected).
				Int("found", result.CountMismatch.Found).
				Msg("unmatched scanner: Waiting for a decision on an episode count that does not match")
		}

		if result.Conflict != nil {
			s.repository.SetPendingConflict(torrentName, result.Conflict)
			s.logger.Info().
				Str("torrent", torrentName).
				Int("conflicts", len(result.Conflict.Files)).
				Msg("unmatched scanner: Waiting for a decision on files already in the library")
		}

		// Whatever did move is in the library now and still has to reach the library database,
		// or those episodes are invisible until the next full rescan. The staging directory is
		// deliberately left alone below: the files that failed are still in it.
		if len(result.MovedFiles) > 0 {
			s.mu.Lock()
			cb := s.onAutoMatched
			s.mu.Unlock()
			if cb != nil {
				cb(torrentName, result)
			}
		}
		return
	}

	s.logger.Info().
		Str("torrent", torrentName).
		Int("moved", len(result.MovedFiles)).
		Str("destination", result.Destination).
		Msg("unmatched scanner: Auto-matched completed download")

	// Belt and braces: the match already cleans up, but make sure nothing is left staged.
	s.repository.CleanupTorrentDirectory(torrentName)

	// The torrent directory is gone (or emptied) now, so drop it from the completed list.
	s.ClearCompletedTorrent(torrentName)
	s.repository.InvalidateCache()

	s.mu.Lock()
	cb := s.onAutoMatched
	s.mu.Unlock()
	if cb != nil {
		cb(torrentName, result)
	}
}

// hasTempFiles checks if a directory contains any qBittorrent temp files
func (s *Scanner) hasTempFiles(path string) bool {
	entries, err := os.ReadDir(path)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		name := entry.Name()

		// Check for qBittorrent temp file extensions
		if strings.HasSuffix(name, ".!qB") || strings.HasSuffix(name, ".qBt") {
			return true
		}

		// Check for other common temp file patterns
		if strings.HasSuffix(name, ".part") || strings.HasSuffix(name, ".temp") {
			return true
		}

		// Recursively check subdirectories
		if entry.IsDir() {
			subPath := filepath.Join(path, name)
			if s.hasTempFiles(subPath) {
				return true
			}
		}
	}

	return false
}

// deepScanForTempFiles does a thorough recursive scan for any temp files
func (s *Scanner) deepScanForTempFiles(rootPath string) bool {
	found := false

	filepath.Walk(rootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			return nil
		}

		name := info.Name()

		// Check all known temp file patterns
		tempPatterns := []string{".!qB", ".qBt", ".part", ".temp", ".downloading", ".incomplete"}
		for _, pattern := range tempPatterns {
			if strings.HasSuffix(name, pattern) {
				found = true
				return filepath.SkipAll
			}
		}

		return nil
	})

	return found
}

// hasVideoFiles checks if a directory contains any video files
func (s *Scanner) hasVideoFiles(path string) bool {
	hasVideo := false

	filepath.Walk(path, func(filePath string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			return nil
		}

		if isVideoFile(info.Name()) {
			hasVideo = true
			return filepath.SkipAll
		}

		return nil
	})

	return hasVideo
}

// ClearCompletedTorrent removes a torrent from the completed list
func (s *Scanner) ClearCompletedTorrent(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Its measured size is meaningless once it is no longer tracked — a re-download, or a match
	// that was undone, must be measured from scratch rather than against what it used to be.
	delete(s.fingerprints, name)

	newList := make([]string, 0, len(s.completedTorrents))
	for _, t := range s.completedTorrents {
		if t != name {
			newList = append(newList, t)
		}
	}
	s.completedTorrents = newList
}

// ClearAllCompleted clears the completed torrents list
func (s *Scanner) ClearAllCompleted() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.completedTorrents = make([]string, 0)
}
