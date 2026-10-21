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
	notificationCleanupTicker := time.NewTicker(24 * time.Hour)
	// The account's AniList profile — the banner and avatar the app shows — re-fetched hourly. A
	// banner changed on AniList used to do nothing until the next sign-in, which for a server that
	// stays signed in is never.
	refreshViewerTicker := time.NewTicker(1 * time.Hour)
	// New RSS entries → notifications. The feed cache is shared with the /news handler, so this
	// costs nothing when the handler fetched moments ago; the first run only marks the feed's
	// current entries as seen, so the ticker cadence is what a new headline waits at most.
	newsTicker := time.NewTicker(15 * time.Minute)
	// One early check so an item published just after boot is not held for a full interval.
	newsStartupCheck := time.NewTimer(3 * time.Minute)
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
			notificationCleanupTicker.Stop()
			refreshViewerTicker.Stop()
			newsTicker.Stop()
			newsStartupCheck.Stop()
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

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stopCh:
				return
			case <-notificationCleanupTicker.C:
				CleanupOldNotificationsJob(ctx)
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
			case <-refreshViewerTicker.C:
				if app.IsOffline() {
					continue
				}
				RefreshViewerJob(ctx)
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
			case <-newsStartupCheck.C:
				if app.IsOffline() {
					// Boot raced the network; retry on the ticker instead of busy-looping here.
					continue
				}
				CheckNewsNotificationsJob(ctx)
			case <-newsTicker.C:
				if app.IsOffline() {
					continue
				}
				CheckNewsNotificationsJob(ctx)
			}
		}
	}()

	return stop

}
