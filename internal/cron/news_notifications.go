package cron

import (
	"seanime/internal/news"
)

// CheckNewsNotificationsJob fetches the configured RSS feeds through the shared cache and
// files a notification for each entry that appeared since the last check. The first check of
// a server process marks the feed's current entries as seen without announcing them — see
// internal/news for the why.
func CheckNewsNotificationsJob(c *JobCtx) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	news.CheckNewItemsNotifications(c.App)
}
