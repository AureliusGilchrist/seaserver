package core

import (
	"context"
	"errors"
	"runtime"
	"runtime/debug"
	"seanime/internal/api/anilist"
	"seanime/internal/events"
	"seanime/internal/util/limiter"
	"sync"
	"sync/atomic"
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

	// startOnce guards against Start() being called more than once for the same runner:
	// each call would otherwise spawn a duplicate set of loops, so every job would fire
	// several times per interval.
	startOnce sync.Once
	// autoPauseRunning prevents overlapping auto-pause passes.
	autoPauseRunning atomic.Bool
}

// NewServiceRunner creates a new ServiceRunner.
func NewServiceRunner(app *App) *ServiceRunner {
	return &ServiceRunner{
		app:    app,
		logger: app.Logger,
		stopCh: make(chan struct{}),
	}
}

// Start begins the background service loops. Safe to call more than once — only the
// first call starts them.
func (sr *ServiceRunner) Start() {
	sr.startOnce.Do(sr.start)
}

func (sr *ServiceRunner) start() {
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

	// Daily full metadata refresh.
	// Runs once 15 minutes after start, then every 24h. Drops every cached anime/episode
	// metadata entry and re-pulls each account's AniList collections, so long-running
	// installs never accumulate stale metadata.
	//
	// The initial delay is deliberately well clear of startup and of the auto-pause pass at
	// +60s: this forcibly re-fetches a collection per profile, and stacking that burst on top
	// of the app's own bootstrap requests risks tripping AniList's rate limit, which would
	// leave collections failing to load right when the user opens the app.
	sr.wg.Add(1)
	go func() {
		defer sr.wg.Done()
		initial := time.NewTimer(15 * time.Minute)
		select {
		case <-sr.stopCh:
			initial.Stop()
			return
		case <-initial.C:
		}
		if !sr.app.IsOffline() {
			sr.RunRefreshAllMetadata()
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
				sr.RunRefreshAllMetadata()
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
//
// Each profile is processed with its OWN AniList client and its OWN collection. The
// admin/global collection is merged with the shared "planning slut" account, so running
// this against the global platform would read someone else's list and write with the
// wrong (often unauthenticated) token — which is what produced the recurring
// "not logged in to AniList" failures.
func (sr *ServiceRunner) RunAutoPauseStaleWatching() error {
	// Never let two passes overlap — a slow pass plus a manual trigger would otherwise
	// double up and hammer AniList with the same mutations.
	if !sr.autoPauseRunning.CompareAndSwap(false, true) {
		sr.logger.Debug().Msg("services: auto-pause stale watching: already running, skipping")
		return nil
	}
	defer sr.autoPauseRunning.Store(false)

	sr.logger.Info().Msg("services: auto-pause stale watching: starting")

	if sr.app.AnilistClientManager == nil {
		return nil
	}

	threshold := time.Now().Unix() - 7*24*3600
	totalPaused := 0
	handled := 0

	// Per-profile pass: use the profile's own authenticated AniList client.
	if sr.app.ProfileManager != nil && sr.app.AnilistClientManager != nil {
		profiles, err := sr.app.ProfileManager.GetAllProfiles()
		if err != nil {
			sr.logger.Warn().Err(err).Msg("services: auto-pause stale watching: failed to list profiles")
		}
		for _, p := range profiles {
			if p == nil {
				continue
			}
			client := sr.app.AnilistClientManager.GetClient(p.ID)
			if client == nil || !client.IsAuthenticated() {
				sr.logger.Debug().Uint("profileID", p.ID).Msg("services: auto-pause stale watching: profile not linked to AniList, skipping")
				continue
			}
			ac, err := sr.app.AnilistClientManager.GetAnimeCollection(p.ID)
			if err != nil || ac == nil {
				sr.logger.Warn().Err(err).Uint("profileID", p.ID).Msg("services: auto-pause stale watching: failed to get profile collection")
				continue
			}
			handled++
			paused := sr.autoPauseCollection(ac, threshold, func(e *anilist.AnimeListEntry) error {
				return pauseEntry(context.Background(), client, e)
			})
			if paused > 0 {
				sr.app.AnilistClientManager.InvalidateAnimeCollection(p.ID)
			}
			totalPaused += paused
			sr.logger.Info().Uint("profileID", p.ID).Int("count", paused).Msg("services: auto-paused stale entries for profile")
		}
	}

	// Fall back to the global account only when there are no profile accounts to act on
	// (single-user install, or the AniList token lives on the account row rather than in
	// a profile database).
	if handled == 0 {
		client, _ := sr.app.AnilistClientManager.ResolveClientForWrites(0)
		if client == nil || !client.IsAuthenticated() {
			// Nothing is linked — there is nothing this job can legitimately do. Staying
			// quiet here matters: this used to log an AniList auth failure on every run.
			sr.logger.Debug().Msg("services: auto-pause stale watching: no linked AniList account, skipping")
			return nil
		}
		ac, err := sr.app.GetAnimeCollection(false)
		if err != nil {
			return err
		}
		if ac == nil {
			return nil
		}
		paused := sr.autoPauseCollection(ac, threshold, func(e *anilist.AnimeListEntry) error {
			return pauseEntry(context.Background(), client, e)
		})
		totalPaused += paused
		if paused > 0 {
			go func() {
				_, _ = sr.app.GetAnimeCollection(true)
			}()
		}
	}

	sr.logger.Info().Int("count", totalPaused).Msg("services: auto-pause stale watching: done")
	return nil
}

// pauseEntry sets a single list entry to PAUSED, leaving score, progress and dates alone.
//
// This uses the status-only mutation deliberately. The general UpdateMediaListEntry always
// sends every variable, so nil scoreRaw/progress arrive as explicit nulls and AniList refuses
// the whole mutation ("The score raw must be an integer", "The progress must be an integer").
// Filling in placeholder values instead is not an option either: scoreRaw is a raw 0-100
// value while the entry's Score is in the user's display format, so echoing it back would
// silently rewrite everyone's scores.
func pauseEntry(ctx context.Context, client anilist.AnilistClient, e *anilist.AnimeListEntry) error {
	if e == nil || e.Media == nil {
		return errors.New("nil list entry")
	}
	mediaID := e.Media.ID
	status := anilist.MediaListStatusPaused
	_, err := client.UpdateMediaListEntryStatus(ctx, &mediaID, &status)
	return err
}

// autoPauseCollection pauses every CURRENT entry in ac whose updatedAt is older than
// threshold, using the supplied update function. Returns how many entries were paused.
func (sr *ServiceRunner) autoPauseCollection(ac *anilist.AnimeCollection, threshold int64, update func(e *anilist.AnimeListEntry) error) int {
	if ac == nil || ac.MediaListCollection == nil {
		return 0
	}
	pausedCount := 0
	failedCount := 0
	var firstErr error
	for _, list := range ac.MediaListCollection.Lists {
		if list == nil || len(list.Entries) == 0 {
			continue
		}
		for _, e := range list.Entries {
			if e == nil || e.Media == nil || e.Status == nil || e.UpdatedAt == nil {
				continue
			}
			if *e.Status != anilist.MediaListStatusCurrent {
				continue
			}
			if int64(*e.UpdatedAt) > threshold {
				continue
			}
			if err := update(e); err != nil {
				// One log line per run, not per entry: a shared collection can contain
				// hundreds of entries that don't belong to the writing account, and
				// warning on each one buried the logs.
				failedCount++
				if firstErr == nil {
					firstErr = err
				}
				sr.logger.Debug().Err(err).Int("mediaId", e.Media.ID).Msg("services: failed to auto-pause stale entry")
				continue
			}
			pausedCount++
			sr.logger.Info().Int("mediaId", e.Media.ID).Msg("services: auto-paused stale watching entry")
		}
	}
	if failedCount > 0 {
		sr.logger.Warn().Err(firstErr).Int("failed", failedCount).Msg("services: some stale entries could not be auto-paused")
	}
	return pausedCount
}

// RunRefreshAllMetadata drops every cached anime/episode metadata entry and re-fetches
// each account's AniList anime collection. Runs daily (and can be triggered manually) so
// that episode counts, airing status and artwork never go stale for long-running installs.
//
// Anime only: manga collections are deliberately left untouched by this job.
func (sr *ServiceRunner) RunRefreshAllMetadata() {
	sr.logger.Info().Msg("services: daily metadata refresh: starting")

	// Drop the in-memory anime metadata cache (episode lists, images, mappings).
	if sr.app.MetadataProviderRef != nil && sr.app.MetadataProviderRef.IsPresent() {
		sr.app.MetadataProviderRef.Get().ClearCache()
	}

	// Drop cached AniList media objects (episode counts, status, nextAiringEpisode).
	if sr.app.AnilistPlatformRef != nil && sr.app.AnilistPlatformRef.IsPresent() {
		sr.app.AnilistPlatformRef.Get().ClearCache()
	}

	// Refresh the admin/global collections.
	if _, err := sr.app.RefreshAnimeCollection(); err != nil {
		sr.logger.Warn().Err(err).Msg("services: daily metadata refresh: failed to refresh anime collection")
	}

	// Refresh every profile's own AniList collections so each account sees fresh data.
	refreshed := 0
	if sr.app.ProfileManager != nil && sr.app.AnilistClientManager != nil {
		profiles, err := sr.app.ProfileManager.GetAllProfiles()
		if err != nil {
			sr.logger.Warn().Err(err).Msg("services: daily metadata refresh: failed to list profiles")
		}
		for _, p := range profiles {
			if p == nil {
				continue
			}
			if !sr.app.AnilistClientManager.IsAuthenticated(p.ID) {
				continue
			}
			sr.app.AnilistClientManager.InvalidateAnimeCollection(p.ID)
			if _, err := sr.app.AnilistClientManager.GetAnimeCollection(p.ID); err != nil {
				sr.logger.Warn().Err(err).Uint("profileID", p.ID).Msg("services: daily metadata refresh: failed to refresh profile anime collection")
			}
			refreshed++
		}
	}

	sr.app.WSEventManager.SendEvent(events.RefreshedAnilistAnimeCollection, nil)
	sr.logger.Info().Int("profiles", refreshed).Msg("services: daily metadata refresh: done")
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
