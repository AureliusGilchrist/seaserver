package handlers

import (
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/profilestats"
)

const (
	// Used for the backfill estimate when AniList does not know an episode's length.
	defaultEpisodeMinutes = 24
	// Rough time to read one chapter, for the backfill estimate.
	estimatedMinutesPerChapter = 5
)

// lifetimeEstimate is what a profile's AniList lists say it has watched and read so far.
type lifetimeEstimate struct {
	animeMinutes, animeEpisodes    int
	mangaMinutes, mangaChapters    int
	animeCompleted, mangaCompleted int
}

// estimateLifetimeFromCollections estimates watched and read totals from the lists: progress plus
// rewatches (repeat × episode count), each episode at the series' length (24 min when unknown), and
// each chapter at about 5 minutes. Completed counts are entries on the Completed list.
func estimateLifetimeFromCollections(animeCol *anilist.AnimeCollection, mangaCol *anilist.MangaCollection) lifetimeEstimate {
	var e lifetimeEstimate
	if animeCol != nil && animeCol.GetMediaListCollection() != nil {
		for _, list := range animeCol.GetMediaListCollection().GetLists() {
			if list == nil {
				continue
			}
			for _, entry := range list.GetEntries() {
				if entry == nil {
					continue
				}
				media := entry.GetMedia()
				progress := 0
				if entry.Progress != nil && *entry.Progress > 0 {
					progress = *entry.Progress
				}
				eps := progress
				if entry.Repeat != nil && *entry.Repeat > 0 {
					per := progress
					if media != nil && media.Episodes != nil && *media.Episodes > 0 {
						per = *media.Episodes
					}
					eps += *entry.Repeat * per
				}
				dur := defaultEpisodeMinutes
				if media != nil && media.Duration != nil && *media.Duration > 0 {
					dur = *media.Duration
				}
				e.animeEpisodes += eps
				e.animeMinutes += eps * dur
				if entry.Status != nil && *entry.Status == anilist.MediaListStatusCompleted {
					e.animeCompleted++
				}
			}
		}
	}
	if mangaCol != nil && mangaCol.GetMediaListCollection() != nil {
		for _, list := range mangaCol.GetMediaListCollection().GetLists() {
			if list == nil {
				continue
			}
			for _, entry := range list.GetEntries() {
				if entry == nil {
					continue
				}
				progress := 0
				if entry.Progress != nil && *entry.Progress > 0 {
					progress = *entry.Progress
				}
				ch := progress
				if entry.Repeat != nil && *entry.Repeat > 0 {
					per := progress
					if media := entry.GetMedia(); media != nil && media.Chapters != nil && *media.Chapters > 0 {
						per = *media.Chapters
					}
					ch += *entry.Repeat * per
				}
				e.mangaChapters += ch
				e.mangaMinutes += ch * estimatedMinutesPerChapter
				if entry.Status != nil && *entry.Status == anilist.MediaListStatusCompleted {
					e.mangaCompleted++
				}
			}
		}
	}
	return e
}

// lifetimeStatsForProfile returns a profile's all-time totals, making its backfill baseline first
// when there is none. The baseline is made once per profile (see models.LifetimeStatsBaseline), so
// calling this any number of times never counts anything twice.
//
// animeCol / mangaCol are the profile's lists when the caller already has them; nil fetches them
// (from the in-memory or on-disk cache in the usual case).
func (h *Handler) lifetimeStatsForProfile(profileID uint, pdb *db.Database, animeCol *anilist.AnimeCollection, mangaCol *anilist.MangaCollection) *profilestats.LifetimeStats {
	if pdb == nil {
		return nil
	}

	if animeCol == nil && mangaCol == nil {
		if h.App.AnilistClientManager != nil && profileID > 0 {
			animeCol, _ = h.App.AnilistClientManager.GetAnimeCollection(profileID)
			mangaCol, _ = h.App.AnilistClientManager.GetMangaCollection(profileID)
		} else if profileID == 0 {
			animeCol, _ = h.App.GetAnimeCollection(false)
			mangaCol, _ = h.App.GetMangaCollection(false)
		}
	}
	est := estimateLifetimeFromCollections(animeCol, mangaCol)

	baseline, _ := pdb.GetLifetimeStatsBaseline()
	if baseline == nil && h.canBackfillLifetime(profileID, animeCol, mangaCol) {
		baseline, _ = pdb.CreateLifetimeStatsBaseline(&models.LifetimeStatsBaseline{
			EstAnimeMinutes:  est.animeMinutes,
			EstAnimeEpisodes: est.animeEpisodes,
			EstMangaMinutes:  est.mangaMinutes,
			EstMangaChapters: est.mangaChapters,
			EstimatedAt:      time.Now(),
		})
	}

	logs, err := pdb.SumActivityLogs()
	if err != nil {
		return nil
	}
	return combineLifetime(baseline, logs, est)
}

// combineLifetime adds what the activity log tracked after the baseline to the baseline's estimate.
// The estimate covers everything up to the snapshot, including what the log already had by then,
// so only the log's growth since the snapshot is added. Taking the larger of the estimate and the
// snapshot keeps tracked history for profiles whose AniList lists know less than the log did.
func combineLifetime(baseline *models.LifetimeStatsBaseline, logs db.ActivityLogTotals, est lifetimeEstimate) *profilestats.LifetimeStats {
	out := &profilestats.LifetimeStats{
		AnimeMinutes:   logs.AnimeMinutes,
		AnimeEpisodes:  logs.AnimeEpisodes,
		MangaMinutes:   logs.MangaMinutes,
		MangaChapters:  logs.MangaChapters,
		AnimeCompleted: est.animeCompleted,
		MangaCompleted: est.mangaCompleted,
		ActiveDays:     logs.ActiveDays,
	}
	if baseline == nil {
		return out
	}
	since := func(estimated, snapshot, now int) int {
		return max(estimated, snapshot) + max(0, now-snapshot)
	}
	out.AnimeMinutes = since(baseline.EstAnimeMinutes, baseline.LogAnimeMinutes, logs.AnimeMinutes)
	out.AnimeEpisodes = since(baseline.EstAnimeEpisodes, baseline.LogAnimeEpisodes, logs.AnimeEpisodes)
	out.MangaMinutes = since(baseline.EstMangaMinutes, baseline.LogMangaMinutes, logs.MangaMinutes)
	out.MangaChapters = since(baseline.EstMangaChapters, baseline.LogMangaChapters, logs.MangaChapters)
	out.IncludesEstimate = baseline.EstAnimeEpisodes > baseline.LogAnimeEpisodes || baseline.EstMangaChapters > baseline.LogMangaChapters
	out.EstimatedAt = baseline.EstimatedAt.Format(time.RFC3339)
	return out
}

// canBackfillLifetime says whether the estimate can be made now. A profile linked to AniList waits
// until its lists have loaded at least once — estimating from nothing would lock in zero. A profile
// with no AniList account has no lists to estimate from, so its (empty) baseline is made straight away.
func (h *Handler) canBackfillLifetime(profileID uint, animeCol *anilist.AnimeCollection, mangaCol *anilist.MangaCollection) bool {
	if animeCol != nil || mangaCol != nil {
		return true
	}
	if profileID == 0 || h.App.ProfileManager == nil {
		return false
	}
	prof, err := h.App.ProfileManager.GetProfile(profileID)
	if err != nil || prof == nil {
		return false
	}
	return prof.AniListUsername == ""
}
