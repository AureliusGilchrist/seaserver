package core

import (
	"context"
	"time"
	_ "time/tzdata" // profile time zones on hosts without a zoneinfo database

	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
)

// achievementSources is where the achievement rules read a profile's lists, the shared media
// details, its community activity and its time zone.
func (a *App) achievementSources() achievement.Sources {
	cacheDir := ""
	if a.Config != nil {
		cacheDir = a.Config.Cache.Dir
	}
	extras := achievement.NewExtrasCache(cacheDir, func(ctx context.Context, body []byte) (interface{}, error) {
		// Public media data: no token, and the background lane (no user-initiated mark), so it
		// always yields to anything a person is waiting on.
		return anilist.CustomQueryCtx(ctx, body, a.Logger)
	}, a.Logger)

	return achievement.Sources{
		AnimeCollection: func(profileID uint) *anilist.AnimeCollection {
			if a.AnilistClientManager == nil || profileID == 0 {
				return nil
			}
			col, err := a.AnilistClientManager.GetAnimeCollection(profileID)
			if err != nil {
				return nil
			}
			return col
		},
		MangaCollection: func(profileID uint) *anilist.MangaCollection {
			if a.AnilistClientManager == nil || profileID == 0 {
				return nil
			}
			col, err := a.AnilistClientManager.GetMangaCollection(profileID)
			if err != nil {
				return nil
			}
			return col
		},
		Extras: extras,
		Social: func(profileID uint) (int, int, []time.Time) {
			if a.Database == nil || profileID == 0 {
				return 0, 0, nil
			}
			g := a.Database.Gorm()
			var animeN, mangaN int64
			g.Model(&models.Comment{}).Where("profile_id = ? AND media_type = ?", profileID, "anime").Count(&animeN)
			g.Model(&models.Comment{}).Where("profile_id = ? AND media_type = ?", profileID, "manga").Count(&mangaN)
			var times []time.Time
			var t1, t2, t3 []time.Time
			g.Model(&models.Comment{}).Where("profile_id = ?", profileID).Pluck("created_at", &t1)
			g.Model(&models.ProfilePost{}).Where("author_profile_id = ?", profileID).Pluck("created_at", &t2)
			g.Model(&models.TimelineReply{}).Where("author_profile_id = ?", profileID).Pluck("created_at", &t3)
			times = append(append(append(times, t1...), t2...), t3...)
			return int(animeN), int(mangaN), times
		},
		TimeZone: func(profileID uint) *time.Location {
			if a.ProfileDatabaseManager == nil {
				return nil
			}
			pdb, err := a.ProfileDatabaseManager.GetDatabase(profileID)
			if err != nil {
				return nil
			}
			ovr, _ := pdb.GetClientSettingsOverrides()
			if ovr == nil || ovr.TimeZone == nil || *ovr.TimeZone == "" {
				return nil
			}
			loc, err := time.LoadLocation(*ovr.TimeZone)
			if err != nil {
				return nil
			}
			return loc
		},
	}
}
