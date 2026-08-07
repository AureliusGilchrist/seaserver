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
	// CompletionUnknown — no client reachable, or no torrent of the client's matches this
	// directory (it was removed after finishing, or the files were put there by hand).
	CompletionUnknown CompletionState = "unknown"
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
	s.mu.Unlock()

	return states, ok
}

// completionState asks the torrent client whether the download writing into a staging directory
// has finished.
func (s *Scanner) completionState(dirName string) CompletionState {
	states, ok := s.torrentStates()
	if !ok {
		return CompletionUnknown
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

		// No temp files detected — verify asynchronously to avoid blocking other directories
		go func(torrentRel, torrentPath string) {
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
				s.logger.Debug().Str("torrent", torrentRel).
					Msg("unmatched scanner: Torrent client reports this download is still in progress")
				return
			case CompletionFinished:
				// The client is the authority — no waiting needed.
			default:
				if !s.looksSettled(torrentRel, torrentPath) {
					s.logger.Debug().Str("torrent", torrentRel).
						Msg("unmatched scanner: Torrent client has no record of this download, waiting for it to stop changing")
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
