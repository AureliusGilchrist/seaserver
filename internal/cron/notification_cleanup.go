package cron

import "time"

// CleanupOldNotificationsJob removes notifications older than 90 days
// from all currently open per-profile databases.
func CleanupOldNotificationsJob(c *JobCtx) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	if c.App.ProfileDatabaseManager == nil {
		return
	}

	cutoff := time.Now().Add(-90 * 24 * time.Hour)

	// Clean up the global/fallback DB
	fallbackDB := c.App.ProfileDatabaseManager.GetFallbackDatabase()
	if fallbackDB != nil {
		_, _ = fallbackDB.DeleteOldNotifications(cutoff)
	}

	// Clean up all open per-profile DBs
	for _, pdb := range c.App.ProfileDatabaseManager.GetAllOpenDatabases() {
		_, _ = pdb.DeleteOldNotifications(cutoff)
	}
}
