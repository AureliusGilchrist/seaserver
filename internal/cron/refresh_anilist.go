package cron

import (
	"seanime/internal/events"
)

func RefreshAnilistDataJob(c *JobCtx) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	if c.App.Settings == nil || c.App.Settings.Library == nil {
		return
	}

	// Snapshot the cached collection before refreshing so we can detect changes.
	// If there is no cached data yet the error is silently ignored and oldAnimeCollection will be nil.
	oldAnimeCollection, _ := c.App.GetAnimeCollection(false)

	// Refresh the Anilist Collection
	animeCollection, _ := c.App.RefreshAnimeCollection()
	c.App.WSEventManager.SendEvent(events.RefreshedAnilistAnimeCollection, animeCollection)

	// Check for new-episode and airing-started notifications.
	checkAnilistCollectionNotifications(c, oldAnimeCollection, animeCollection)

	mangaCollection, _ := c.App.RefreshMangaCollection()
	c.App.WSEventManager.SendEvent(events.RefreshedAnilistMangaCollection, mangaCollection)
}

func SyncLocalDataJob(c *JobCtx) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	if c.App.Settings == nil || c.App.Settings.Library == nil {
		return
	}

	// Only synchronize local data if the user is not simulated
	if c.App.Settings.Library.AutoSyncOfflineLocalData && !c.App.GetUser().IsSimulated {
		c.App.LocalManager.SynchronizeLocal()
	}

	// Only synchronize local data if the user is not simulated
	if c.App.Settings.Library.AutoSaveCurrentMediaOffline && !c.App.GetUser().IsSimulated {
		added, _ := c.App.LocalManager.AutoTrackCurrentMedia()
		if added && c.App.Settings.Library.AutoSyncOfflineLocalData {
			go c.App.LocalManager.SynchronizeLocal()
		}
	}
}
