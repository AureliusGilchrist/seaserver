package news

import (
	"seanime/internal/api/anilist"
	"seanime/internal/core"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"sync"
)

// newsCleanupPrefKey marks a profile whose saved news notifications have been re-checked against
// its current filter (the v1 clean-up below). Stored with the profile's other server-side prefs.
const newsCleanupPrefKey = "server:news-notify-cleanup-v1"

var cleanupOnce sync.Once

// cleanupStaleNewsNotifications removes saved news notifications that the profile's current
// "lists" filter would not file, once per profile.
//
// Before 5.2.1-12 a profile relinked to a new AniList account was matched against the old
// account's lists (thousands of manga), and until now headlines matched as bare substrings of the
// headline and description. The drawer kept everything filed that way. Only news notifications
// are touched, only in lists mode, and a profile whose lists can't be read is left alone rather
// than emptied.
func cleanupStaleNewsNotifications(app *core.App) {
	if app.ProfileManager == nil || !app.ProfileManager.HasProfiles() || app.ProfileDatabaseManager == nil {
		return
	}
	profiles, err := app.ProfileManager.GetAllProfiles()
	if err != nil {
		return
	}
	for _, profile := range profiles {
		if profile == nil {
			continue
		}
		database, err := app.ProfileDatabaseManager.GetDatabase(profile.ID)
		if err != nil {
			continue
		}
		if pref, _ := database.GetClientPref(newsCleanupPrefKey); pref != nil {
			continue
		}
		removed, ok := cleanupProfileNews(app, database, profile.ID)
		if !ok {
			continue // lists unreadable right now: try again on a later run
		}
		_, _ = database.UpsertClientPref(newsCleanupPrefKey, "done")
		app.Logger.Info().Uint("profileID", profile.ID).Int("removed", removed).
			Msg("news: Removed saved news notifications your current list filter would not send")
	}
}

func cleanupProfileNews(app *core.App, database *db.Database, profileID uint) (int, bool) {
	ovr, _ := database.GetClientSettingsOverrides()
	if ovr == nil || ovr.NewsNotifyMode == nil || *ovr.NewsNotifyMode != NotifyModeLists {
		return 0, true // not in lists mode: nothing to re-check
	}
	if app.AnilistClientManager == nil {
		return 0, false
	}
	animeCol, err := app.AnilistClientManager.GetAnimeCollection(profileID)
	if err != nil || animeCol == nil {
		return 0, false
	}
	mangaCol, _ := app.AnilistClientManager.GetMangaCollection(profileID)
	filter := NewNotifyFilter(ovr,
		func() *anilist.AnimeCollection { return animeCol },
		func() *anilist.MangaCollection { return mangaCol },
	)

	var rows []models.Notification
	if err := database.Gorm().Where("type = ?", "news").Find(&rows).Error; err != nil {
		return 0, false
	}
	removed := 0
	for _, n := range rows {
		if filter.Matches(Item{Title: n.Title}) {
			continue
		}
		if err := database.DeleteNotification(n.ID); err == nil {
			removed++
		}
	}
	return removed, true
}
