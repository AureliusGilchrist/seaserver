package core

import (
	"context"
	"runtime"
	"runtime/debug"
	"seanime/internal/api/anilist"
	"seanime/internal/events"
	"seanime/internal/util/limiter"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// ServiceRunner is a custom background service manager that periodically
// runs maintenance tasks. It replaces direct cron usage for library-related
// services and can also be triggered manually via API.
type ServiceRunner struct {
	app    *App
	logger *zerolog.Logger
	stopCh chan struct{}
	once   sync.Once
	wg     sync.WaitGroup
}

// NewServiceRunner creates a new ServiceRunner.
func NewServiceRunner(app *App) *ServiceRunner {
	return &ServiceRunner{
		app:    app,
		logger: app.Logger,
		stopCh: make(chan struct{}),
	}
}

// Start begins the background service loops.
func (sr *ServiceRunner) Start() {
	// GoJuuon sort recomputation daily at 3 AM
	sr.wg.Add(1)
	go func() {
		defer sr.wg.Done()
		for {
			now := time.Now()
			next := time.Date(now.Year(), now.Month(), now.Day(), 3, 0, 0, 0, now.Location())
			if !next.After(now) {
				next = next.Add(24 * time.Hour)
			}
			timer := time.NewTimer(time.Until(next))
			select {
			case <-sr.stopCh:
				timer.Stop()
				return
			case <-timer.C:
				if sr.app.IsOffline() {
					continue
				}
				sr.RunFindAnimeLibrarySorting()
				sr.RunFindMangaLibrarySorting()
			}
		}
	}()

	// Auto-pause stale "watching" entries.
	// Runs once 60s after start (gives the platform time to initialize), then every 24h.
	// An entry is considered stale if its AniList listEntry.UpdatedAt is older than 7 days
	// while still in the CURRENT (watching) status.
	sr.wg.Add(1)
	go func() {
		defer sr.wg.Done()
		initial := time.NewTimer(60 * time.Second)
		select {
		case <-sr.stopCh:
			initial.Stop()
			return
		case <-initial.C:
		}
		if !sr.app.IsOffline() {
			if err := sr.RunAutoPauseStaleWatching(); err != nil {
				sr.logger.Warn().Err(err).Msg("services: auto-pause stale watching failed")
			}
		}
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-sr.stopCh:
				return
			case <-ticker.C:
				if sr.app.IsOffline() {
					continue
				}
				if err := sr.RunAutoPauseStaleWatching(); err != nil {
					sr.logger.Warn().Err(err).Msg("services: auto-pause stale watching failed")
				}
			}
		}
	}()

	// Periodic runtime cleanup.
	// Every 3 hours, force a GC pass and return freed memory back to the OS.
	// Helps long-running desktop sessions keep their resident set under control.
	sr.wg.Add(1)
	go func() {
		defer sr.wg.Done()
		ticker := time.NewTicker(3 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-sr.stopCh:
				return
			case <-ticker.C:
				sr.RunRuntimeCleanup()
			}
		}
	}()
}

// Stop gracefully shuts down all background service loops.
func (sr *ServiceRunner) Stop() {
	sr.once.Do(func() {
		close(sr.stopCh)
		sr.wg.Wait()
	})
}

// -----------------------------------------------------------------------
// Manually-triggerable service actions
// -----------------------------------------------------------------------

// RunUpdateAnimeLibrary refreshes the anime collection from AniList.
func (sr *ServiceRunner) RunUpdateAnimeLibrary() error {
	sr.logger.Info().Msg("services: Updating anime library")
	ac, err := sr.app.RefreshAnimeCollection()
	if err != nil {
		sr.logger.Error().Err(err).Msg("services: Failed to update anime library")
		return err
	}
	sr.app.WSEventManager.SendEvent(events.RefreshedAnilistAnimeCollection, ac)
	sr.logger.Info().Msg("services: Anime library updated")
	return nil
}

// RunUpdateMangaLibrary refreshes the manga collection from AniList.
func (sr *ServiceRunner) RunUpdateMangaLibrary() error {
	sr.logger.Info().Msg("services: Updating manga library")
	mc, err := sr.app.RefreshMangaCollection()
	if err != nil {
		sr.logger.Error().Err(err).Msg("services: Failed to update manga library")
		return err
	}
	sr.app.WSEventManager.SendEvent(events.RefreshedAnilistMangaCollection, mc)
	sr.logger.Info().Msg("services: Manga library updated")
	return nil
}

// RunScanAnimeLibrary triggers a local anime library scan.
func (sr *ServiceRunner) RunScanAnimeLibrary() error {
	sr.logger.Info().Msg("services: Scanning anime library")
	// The scan is already exposed via HandleScanLocalFiles in the app
	// We re-use the same approach by getting the library dir and scanning
	if sr.app.LibraryDir == "" {
		sr.logger.Warn().Msg("services: Library directory not set, skipping anime scan")
		return nil
	}
	// Trigger a scan by calling the existing scan workflow
	sr.app.AutoScanner.RunNow()
	sr.logger.Info().Msg("services: Anime library scan triggered")
	return nil
}

// RunScanMangaLibrary syncs local manga/offline data.
func (sr *ServiceRunner) RunScanMangaLibrary() error {
	sr.logger.Info().Msg("services: Scanning manga library")
	if sr.app.LocalManager == nil {
		sr.logger.Warn().Msg("services: LocalManager not available, skipping manga scan")
		return nil
	}
	err := sr.app.LocalManager.SynchronizeLocal()
	if err != nil {
		sr.logger.Error().Err(err).Msg("services: Failed to sync local manga data")
		return err
	}
	sr.logger.Info().Msg("services: Manga library scan completed")
	return nil
}

// RunFindAnimeLibrarySorting computes GoJuuon sort order for anime.
func (sr *ServiceRunner) RunFindAnimeLibrarySorting() (map[int]interface{}, error) {
	sr.logger.Info().Msg("services: Computing anime GoJuuon sort order")
	if sr.app.GojuuonService == nil {
		return nil, nil
	}

	ac, err := sr.app.GetAnimeCollection(false)
	if err != nil {
		sr.logger.Error().Err(err).Msg("services: Failed to get anime collection for GoJuuon")
		return nil, err
	}

	if sr.app.AnilistClientRef == nil || !sr.app.AnilistClientRef.IsPresent() {
		sr.logger.Warn().Msg("services: AniList client not available for GoJuuon computation")
		return nil, nil
	}

	rl := limiter.NewLimiter(time.Second, 20)

	sortMap, err := sr.app.GojuuonService.ComputeAnimeSortOrder(ac, sr.app.AnilistClientRef.Get(), rl)
	if err != nil {
		sr.logger.Error().Err(err).Msg("services: Failed to compute anime GoJuuon sort order")
		return nil, err
	}

	// Convert to generic map for JSON response
	result := make(map[int]interface{}, len(sortMap))
	for k, v := range sortMap {
		result[k] = v
	}
	sr.logger.Info().Int("entries", len(result)).Msg("services: Anime GoJuuon sort order computed")
	return result, nil
}

// RunFindMangaLibrarySorting computes GoJuuon sort order for manga.
func (sr *ServiceRunner) RunFindMangaLibrarySorting() (map[int]interface{}, error) {
	sr.logger.Info().Msg("services: Computing manga GoJuuon sort order")
	if sr.app.GojuuonService == nil {
		return nil, nil
	}

	mc, err := sr.app.GetMangaCollection(false)
	if err != nil {
		sr.logger.Error().Err(err).Msg("services: Failed to get manga collection for GoJuuon")
		return nil, err
	}

	sortMap, err := sr.app.GojuuonService.ComputeMangaSortOrder(mc)
	if err != nil {
		sr.logger.Error().Err(err).Msg("services: Failed to compute manga GoJuuon sort order")
		return nil, err
	}

	result := make(map[int]interface{}, len(sortMap))
	for k, v := range sortMap {
		result[k] = v
	}
	sr.logger.Info().Int("entries", len(result)).Msg("services: Manga GoJuuon sort order computed")
	return result, nil
}

// RunAutoPauseStaleWatching scans the user's CURRENT (watching) AniList entries and
// transitions any entry whose AniList list-entry `updatedAt` is older than 7 days to PAUSED.
// This runs without external scheduler dependencies.
func (sr *ServiceRunner) RunAutoPauseStaleWatching() error {
	sr.logger.Info().Msg("services: auto-pause stale watching: starting")
	if sr.app.AnilistPlatformRef == nil || !sr.app.AnilistPlatformRef.IsPresent() {
		sr.logger.Debug().Msg("services: auto-pause stale watching: anilist platform not available, skipping")
		return nil
	}

	ac, err := sr.app.GetAnimeCollection(false)
	if err != nil {
		return err
	}
	if ac == nil || ac.MediaListCollection == nil {
		return nil
	}

	threshold := time.Now().Unix() - 7*24*3600
	paused := anilist.MediaListStatusPaused
	pausedCount := 0
	ctx := context.Background()

	for _, list := range ac.MediaListCollection.Lists {
		if list == nil || len(list.Entries) == 0 {
			continue
		}
		for _, e := range list.Entries {
			if e == nil || e.Media == nil || e.Status == nil {
				continue
			}
			if *e.Status != anilist.MediaListStatusCurrent {
				continue
			}
			if e.UpdatedAt == nil {
				continue
			}
			if int64(*e.UpdatedAt) > threshold {
				continue
			}
			if err := sr.app.AnilistPlatformRef.Get().UpdateEntry(ctx, e.Media.ID, &paused, nil, nil, nil, nil); err != nil {
				sr.logger.Warn().Err(err).Int("mediaId", e.Media.ID).Msg("services: failed to auto-pause stale entry")
				continue
			}
			pausedCount++
			sr.logger.Info().Int("mediaId", e.Media.ID).Msg("services: auto-paused stale watching entry")
		}
	}

	if pausedCount > 0 {
		// Refresh the cached anime collection asynchronously so the UI reflects the new statuses.
		go func() {
			_, _ = sr.app.GetAnimeCollection(true)
		}()
	}

	sr.logger.Info().Int("count", pausedCount).Msg("services: auto-pause stale watching: done")
	return nil
}

// RunRuntimeCleanup performs a forced GC pass and asks the runtime to release
// freed memory back to the OS. Invoked periodically by the background scheduler
// (every 3 hours) and can also be triggered manually.
func (sr *ServiceRunner) RunRuntimeCleanup() {
	var before runtime.MemStats
	runtime.ReadMemStats(&before)
	runtime.GC()
	debug.FreeOSMemory()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	sr.logger.Info().
		Uint64("heapAllocBeforeMB", before.HeapAlloc/1024/1024).
		Uint64("heapAllocAfterMB", after.HeapAlloc/1024/1024).
		Uint64("sysMB", after.Sys/1024/1024).
		Uint32("numGoroutines", uint32(runtime.NumGoroutine())).
		Msg("services: runtime cleanup completed")
}
