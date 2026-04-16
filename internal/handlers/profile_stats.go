package handlers

import (
	"seanime/internal/api/anilist"
	"seanime/internal/profilestats"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleGetProfileStats
//
//	@summary get enhanced profile statistics for the current profile.
//	@desc Returns activity heatmap, streak data, anime personality, and watch patterns.
//	@desc Optional query param "year" selects a calendar year; defaults to last 365 days.
//	@returns profilestats.ProfileStats
//	@route /api/v1/profile/stats [GET]
func (h *Handler) HandleGetProfileStats(c echo.Context) error {
	profileDB := h.GetProfileDatabase(c)

	// Determine date range
	yearStr := c.QueryParam("year")
	var startDate, endDate string
	if yearStr != "" {
		yr, err := strconv.Atoi(yearStr)
		if err == nil && yr >= 2000 && yr <= 2100 {
			startDate = time.Date(yr, 1, 1, 0, 0, 0, 0, time.Local).Format("2006-01-02")
			endDate = time.Date(yr, 12, 31, 0, 0, 0, 0, time.Local).Format("2006-01-02")
		}
	}
	if startDate == "" {
		endDate = time.Now().Format("2006-01-02")
		startDate = time.Now().AddDate(-1, 0, 0).Format("2006-01-02")
	}

	// Fetch activity logs for heatmap
	heatmapLogs, err := profileDB.GetActivityLogs(startDate, endDate)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Fetch all logs for streak computation
	allLogs, err := profileDB.GetAllActivityLogs()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Build heatmap
	heatmap := profilestats.BuildHeatmap(heatmapLogs, startDate, endDate)

	// Compute streaks (anime and manga separately)
	animeStreak := profilestats.ComputeStreaks(allLogs, true)
	mangaStreak := profilestats.ComputeStreaks(allLogs, false)

	// Compute watch patterns from heatmap range
	watchPatterns := profilestats.ComputeWatchPatterns(heatmapLogs)

	// Count active days (all time)
	totalActive, animeDays, mangaDays := profilestats.CountActiveDays(allLogs)

	// Compute personality from anime collection genre distribution
	// Compute reading time and rewatch time from AniList collections.
	// Fetch profile-correct collections once so we don't make extra AniList calls.
	var animeCol *anilist.AnimeCollection
	var mangaCol *anilist.MangaCollection
	profileID := h.GetProfileID(c)
	if profileID > 0 {
		animeCol, _ = h.App.AnilistClientManager.GetAnimeCollection(profileID)
		mangaCol, _ = h.App.AnilistClientManager.GetMangaCollection(profileID)
	} else {
		animeCol, _ = h.App.GetAnimeCollection(false)
		mangaCol, _ = h.App.GetMangaCollection(false)
	}

	personality := h.computePersonality(animeCol)

	// Compute reading time and rewatch time from AniList collections
	totalWatchMinWithRewatches := h.computeWatchMinutesWithRewatches(animeCol)
	estimatedReadingMin := h.computeEstimatedReadingMinutes(mangaCol)

	result := &profilestats.ProfileStats{
		ActivityHeatmap:                heatmap,
		AnimeStreak:                    animeStreak,
		MangaStreak:                    mangaStreak,
		TotalActiveDays:                totalActive,
		TotalAnimeDays:                 animeDays,
		TotalMangaDays:                 mangaDays,
		Personality:                    personality,
		WatchPatterns:                  watchPatterns,
		TotalWatchMinutesWithRewatches: totalWatchMinWithRewatches,
		EstimatedReadingMinutes:        estimatedReadingMin,
	}

	return h.RespondWithData(c, result)
}

// HandleGetUserProfileStats
//
//	@summary get profile statistics for another user by profile ID.
//	@desc Returns activity heatmap, streak data, and watch patterns. Personality/AniList data not available for other users.
//	@desc Optional query param "year" selects a calendar year; defaults to last 365 days.
//	@returns profilestats.ProfileStats
//	@route /api/v1/profile/user/{id}/stats [GET]
func (h *Handler) HandleGetUserProfileStats(c echo.Context) error {
	idStr := c.Param("id")
	if idStr == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Missing profile ID"))
	}
	pid, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || pid == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Invalid profile ID"))
	}

	if h.App.ProfileDatabaseManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	profileDB, err := h.App.ProfileDatabaseManager.GetDatabase(uint(pid))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	yearStr := c.QueryParam("year")
	var startDate, endDate string
	if yearStr != "" {
		yr, err := strconv.Atoi(yearStr)
		if err == nil && yr >= 2000 && yr <= 2100 {
			startDate = time.Date(yr, 1, 1, 0, 0, 0, 0, time.Local).Format("2006-01-02")
			endDate = time.Date(yr, 12, 31, 0, 0, 0, 0, time.Local).Format("2006-01-02")
		}
	}
	if startDate == "" {
		endDate = time.Now().Format("2006-01-02")
		startDate = time.Now().AddDate(-1, 0, 0).Format("2006-01-02")
	}

	heatmapLogs, err := profileDB.GetActivityLogs(startDate, endDate)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	allLogs, err := profileDB.GetAllActivityLogs()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	heatmap := profilestats.BuildHeatmap(heatmapLogs, startDate, endDate)
	animeStreak := profilestats.ComputeStreaks(allLogs, true)
	mangaStreak := profilestats.ComputeStreaks(allLogs, false)
	watchPatterns := profilestats.ComputeWatchPatterns(heatmapLogs)
	totalActive, animeDays, mangaDays := profilestats.CountActiveDays(allLogs)

	result := &profilestats.ProfileStats{
		ActivityHeatmap: heatmap,
		AnimeStreak:     animeStreak,
		MangaStreak:     mangaStreak,
		TotalActiveDays: totalActive,
		TotalAnimeDays:  animeDays,
		TotalMangaDays:  mangaDays,
		WatchPatterns:   watchPatterns,
	}

	return h.RespondWithData(c, result)
}

// computePersonality extracts genre counts and collection stats from the AniList collection
// to classify the user's anime personality.
func (h *Handler) computePersonality(animeCol *anilist.AnimeCollection) *profilestats.PersonalityResult {
	if animeCol == nil {
		return profilestats.ClassifyPersonality(nil, 0, 0, 0)
	}

	genreCounts := make(map[string]int)
	var totalEntries, completedEntries, droppedEntries int

	if animeCol.GetMediaListCollection() != nil {
		for _, list := range animeCol.GetMediaListCollection().GetLists() {
			if list == nil {
				continue
			}
			for _, entry := range list.GetEntries() {
				if entry == nil {
					continue
				}
				totalEntries++

				if entry.Status != nil {
					switch *entry.Status {
					case anilist.MediaListStatusCompleted:
						completedEntries++
					case anilist.MediaListStatusDropped:
						droppedEntries++
					}
				}

				media := entry.GetMedia()
				if media != nil {
					for _, g := range media.Genres {
						if g != nil {
							genreCounts[*g]++
						}
					}
				}
			}
		}
	}

	return profilestats.ClassifyPersonality(genreCounts, totalEntries, completedEntries, droppedEntries)
}

// computeWatchMinutesWithRewatches computes total anime watch minutes including rewatches.
// Formula: sum of (progress × duration) + (repeat × episodes × duration) for each entry.
func (h *Handler) computeWatchMinutesWithRewatches(animeCol *anilist.AnimeCollection) int {
	if animeCol == nil {
		return 0
	}

	var totalMin int
	if animeCol.GetMediaListCollection() != nil {
		for _, list := range animeCol.GetMediaListCollection().GetLists() {
			if list == nil {
				continue
			}
			for _, entry := range list.GetEntries() {
				if entry == nil {
					continue
				}
				media := entry.GetMedia()
				if media == nil || media.Duration == nil {
					continue
				}
				dur := *media.Duration

				// First watch: progress × duration
				if entry.Progress != nil {
					totalMin += *entry.Progress * dur
				}

				// Rewatches: repeat × (episodes ?? progress) × duration
				if entry.Repeat != nil && *entry.Repeat > 0 {
					eps := 0
					if media.Episodes != nil && *media.Episodes > 0 {
						eps = *media.Episodes
					} else if entry.Progress != nil {
						eps = *entry.Progress
					}
					totalMin += *entry.Repeat * eps * dur
				}
			}
		}
	}
	return totalMin
}

// computeEstimatedReadingMinutes computes estimated manga reading time.
// Formula: sum of (progress + repeat × (chapters ?? progress)) × 7 min per chapter.
func (h *Handler) computeEstimatedReadingMinutes(mangaCol *anilist.MangaCollection) int {
	if mangaCol == nil {
		return 0
	}

	const minPerChapter = 7
	var totalMin int

	if mangaCol.GetMediaListCollection() != nil {
		for _, list := range mangaCol.GetMediaListCollection().GetLists() {
			if list == nil {
				continue
			}
			for _, entry := range list.GetEntries() {
				if entry == nil {
					continue
				}

				progress := 0
				if entry.Progress != nil {
					progress = *entry.Progress
				}

				// First read: progress chapters
				chaptersRead := progress

				// Rereads: repeat × (totalChapters ?? progress)
				if entry.Repeat != nil && *entry.Repeat > 0 {
					media := entry.GetMedia()
					totalCh := progress
					if media != nil && media.Chapters != nil && *media.Chapters > 0 {
						totalCh = *media.Chapters
					}
					chaptersRead += *entry.Repeat * totalCh
				}

				totalMin += chaptersRead * minPerChapter
			}
		}
	}
	return totalMin
}
