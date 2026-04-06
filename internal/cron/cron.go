package cron

import (
	"seanime/internal/core"
	"sync"
	"time"
)

type JobCtx struct {
	App *core.App
}

func RunJobs(app *core.App) func() {

	// Run the jobs only if the server is online
	ctx := &JobCtx{
		App: app,
	}

	refreshAnilistTicker := time.NewTicker(10 * time.Minute)
	refreshLocalDataTicker := time.NewTicker(30 * time.Minute)
	refetchReleaseTicker := time.NewTicker(1 * time.Hour)
	refetchAnnouncementsTicker := time.NewTicker(10 * time.Minute)
	stopCh := make(chan struct{})
	var stopOnce sync.Once
	var wg sync.WaitGroup

	stop := func() {
		stopOnce.Do(func() {
			close(stopCh)
			refreshAnilistTicker.Stop()
			refreshLocalDataTicker.Stop()
			refetchReleaseTicker.Stop()
			refetchAnnouncementsTicker.Stop()
			wg.Wait()
		})
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stopCh:
				return
			case <-refreshAnilistTicker.C:
				if app.IsOffline() {
					continue
				}
				RefreshAnilistDataJob(ctx)
				app.SyncAnilistToSimulatedCollection()
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stopCh:
				return
			case <-refreshLocalDataTicker.C:
				if app.IsOffline() {
					continue
				}
				SyncLocalDataJob(ctx)
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stopCh:
				return
			case <-refetchReleaseTicker.C:
				if app.IsOffline() {
					continue
				}
				app.Updater.ShouldRefetchReleases()
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stopCh:
				return
			case <-refetchAnnouncementsTicker.C:
				if app.IsOffline() {
					continue
				}
				app.Updater.FetchAnnouncements()
			}
		}
	}()

	return stop

}
