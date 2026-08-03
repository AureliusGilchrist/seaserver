package unmatched

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"github.com/fsnotify/fsnotify"
)

// Scanner monitors the Unmatched folder for completed downloads
// by checking for qBittorrent temporary files (.!qB extension)
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
}

// SetOnAutoMatched registers a callback fired after a successful automatic match.
func (s *Scanner) SetOnAutoMatched(fn func(torrentName string, result *MatchResult)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onAutoMatched = fn
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

			s.mu.Lock()
			defer s.mu.Unlock()
			for _, t := range s.completedTorrents {
				if t == torrentRel {
					return
				}
			}
			s.completedTorrents = append(s.completedTorrents, torrentRel)
			s.logger.Info().Str("torrent", torrentRel).Msg("unmatched scanner: Download completed!")

			// If the torrent was queued with auto-match enabled, match it now — the same
			// match the user would perform by hand in the Unmatched screen. Runs outside the
			// lock so a slow file move can't stall the scanner.
			go s.autoMatchIfRequested(torrentRel)
		}(rel, path)
	}
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
