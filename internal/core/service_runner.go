package core

import (
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
