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

	mu              sync.Mutex
	isRunning       bool
	cancelFunc      context.CancelFunc
	completedTorrents []string
	scanInterval    time.Duration
	verifyDelay     time.Duration
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
		scanInterval:      30 * time.Minute, // fallback polling every 30 minutes
		verifyDelay:       5 * time.Second,
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

	for {
		select {
		case <-ctx.Done():
			if watcher != nil {
				watcher.Close()
			}
			return
		case <-ticker.C:
			s.scanForCompletedDownloads()
		case event := <-func() <-chan fsnotify.Event {
			if watcher == nil {
				return make(<-chan fsnotify.Event)
			}
			return watcher.Events
		}():
			// On any file change under base path, trigger a scan
			// If a new directory is created, start watching it too.
			if event.Op&fsnotify.Create == fsnotify.Create {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					if err := watcher.Add(event.Name); err == nil {
						// s.logger.Debug().Str("dir", event.Name).Msg("unmatched scanner: added watcher for new directory")
					}
				}
			}
			// s.logger.Debug().Str("event", event.Name).Msg("unmatched scanner: file event detected, triggering scan")
			s.scanForCompletedDownloads()
		case err := <-func() <-chan error {
			if watcher == nil {
				return make(<-chan error)
			}
			return watcher.Errors
		}():
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

	filepath.WalkDir(UnmatchedBasePath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if path == UnmatchedBasePath {
			return nil
		}
		if !d.IsDir() {
			return nil
		}

		// Check if this torrent has any temp files
		hasTempFiles := s.hasTempFiles(path)
		if hasTempFiles {
			return nil
		}

		// No temp files found - wait and double-check
		// silently verify before processing
		time.Sleep(s.verifyDelay)
		
		// Double-check after delay
		if s.hasTempFiles(path) {
			return nil
		}

		// Triple-check with recursive deep scan
		if s.deepScanForTempFiles(path) {
			return nil
		}

		// Check if torrent has any video files (not just empty or non-video)
		hasVideoFiles := s.hasVideoFiles(path)
		if !hasVideoFiles {
			return nil
		}

		rel, relErr := filepath.Rel(UnmatchedBasePath, path)
		if relErr != nil {
			rel = d.Name()
		}

		// Torrent is complete!
		s.mu.Lock()
		alreadyTracked := false
		for _, t := range s.completedTorrents {
			if t == rel {
				alreadyTracked = true
				break
			}
		}
		if !alreadyTracked {
			s.completedTorrents = append(s.completedTorrents, rel)
			s.logger.Info().Str("torrent", rel).Msg("unmatched scanner: Download completed!")
		}
		s.mu.Unlock()

		return filepath.SkipDir
	})
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
