package handlers

import (
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/util"
	"seanime/internal/util/filecache"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

const (
	backfillCooldownKey = "activity_backfill_last_run"
	backfillCooldown    = 24 * time.Hour
)

// HandleBackfillActivity
//
//	@summary backfills activity logs from AniList into the per-profile heatmap database.
//	@desc Fetches the authenticated user's AniList list activity and populates ActivityLog rows
//	@desc for dates that don't yet have entries. Uses a 24-hour cooldown file-cache key.
//	@route /api/v1/activity/backfill [POST]
//	@returns map[string]interface{}
func (h *Handler) HandleBackfillActivity(c echo.Context) error {
	profileID := h.GetProfileID(c)

	pdb, err := h.App.ProfileDatabaseManager.GetDatabase(profileID)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("cannot access profile database: %w", err))
	}

	// Cooldown check
	var lastRun time.Time
	if h.App.FileCacher != nil {
		bucket := backfillCooldownBucket(profileID)
		if found, _ := h.App.FileCacher.Get(bucket, backfillCooldownKey, &lastRun); found {
			if !lastRun.IsZero() && time.Since(lastRun) < backfillCooldown {
				return h.RespondWithData(c, map[string]interface{}{
					"skipped":   true,
					"reason":    "cooldown",
					"nextRunAt": lastRun.Add(backfillCooldown).Format(time.RFC3339),
				})
			}
		}
	}

	// Get the token for raw GraphQL queries
	anilistToken := pdb.GetAnilistToken()
	if anilistToken == "" {
		return h.RespondWithError(c, fmt.Errorf("no AniList token for profile %d", profileID))
	}

	// Get viewer ID via raw query (generated client omits the id field)
	viewerData, vErr := anilist.CustomQuery(map[string]interface{}{
		"query": `{ Viewer { id } }`,
	}, h.App.Logger, anilistToken)
	if vErr != nil {
		return h.RespondWithError(c, fmt.Errorf("failed to get AniList viewer: %w", vErr))
	}
	viewerMap, _ := viewerData.(map[string]interface{})
	viewerObj, _ := viewerMap["Viewer"].(map[string]interface{})
	viewerIDFloat, ok := viewerObj["id"].(float64)
	if !ok || viewerIDFloat == 0 {
		return h.RespondWithError(c, fmt.Errorf("failed to parse AniList viewer ID"))
	}
	userID := int(viewerIDFloat)

	// Fetch all list activities (anime + manga) across pages
	type activityMedia struct {
		ID   int    `json:"id"`
		Type string `json:"type"`
	}
	type listActivity struct {
		ID        int            `json:"id"`
		Status    string         `json:"status"`
		Progress  string         `json:"progress"`
		CreatedAt int            `json:"createdAt"`
		Media     *activityMedia `json:"media"`
	}

	var allActivities []listActivity

	for _, actType := range []string{"ANIME_LIST", "MANGA_LIST"} {
		page := 1
		for page <= 20 { // safety limit: max 20 pages = 1000 activities
			query := map[string]interface{}{
				"query": `query ($userId: Int, $page: Int, $perPage: Int, $type: ActivityType) {
					Page(page: $page, perPage: $perPage) {
						pageInfo { hasNextPage }
						activities(userId: $userId, type: $type, sort: [ID_DESC]) {
							... on ListActivity {
								id
								status
								progress
								createdAt
								media { id type }
							}
						}
					}
				}`,
				"variables": map[string]interface{}{
					"userId":  userID,
					"page":    page,
					"perPage": 50,
					"type":    actType,
				},
			}

			data, qErr := anilist.CustomQuery(query, h.App.Logger, anilistToken)

			if qErr != nil {
				h.App.Logger.Warn().Err(qErr).Str("type", actType).Int("page", page).
					Msg("backfill: failed to fetch activities page")
				break
			}

			// Parse response
			dataMap, ok := data.(map[string]interface{})
			if !ok {
				break
			}
			pageData, ok := dataMap["Page"].(map[string]interface{})
			if !ok {
				break
			}

			activitiesRaw, ok := pageData["activities"].([]interface{})
			if !ok {
				break
			}

			for _, raw := range activitiesRaw {
				rawMap, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}
				act := listActivity{}
				if v, ok := rawMap["id"].(float64); ok {
					act.ID = int(v)
				}
				if v, ok := rawMap["status"].(string); ok {
					act.Status = v
				}
				if v, ok := rawMap["progress"].(string); ok {
					act.Progress = v
				}
				if v, ok := rawMap["createdAt"].(float64); ok {
					act.CreatedAt = int(v)
				}
				if media, ok := rawMap["media"].(map[string]interface{}); ok {
					act.Media = &activityMedia{}
					if v, ok := media["id"].(float64); ok {
						act.Media.ID = int(v)
					}
					if v, ok := media["type"].(string); ok {
						act.Media.Type = v
					}
				}
				if act.CreatedAt > 0 {
					allActivities = append(allActivities, act)
				}
			}

			pageInfo, _ := pageData["pageInfo"].(map[string]interface{})
			hasNext, _ := pageInfo["hasNextPage"].(bool)
			if !hasNext {
				break
			}
			page++
		}
	}

	if len(allActivities) == 0 {
		// Record cooldown even if nothing found
		if h.App.FileCacher != nil {
			bucket := backfillCooldownBucket(profileID)
			_ = h.App.FileCacher.Set(bucket, backfillCooldownKey, time.Now())
		}
		return h.RespondWithData(c, map[string]interface{}{
			"backfilled": 0,
			"skipped":    false,
		})
	}

	// Aggregate by date
	type dailyAgg struct {
		animeEpisodes int
		mangaChapters int
	}
	byDate := make(map[string]*dailyAgg)

	for _, act := range allActivities {
		date := time.Unix(int64(act.CreatedAt), 0).Format("2006-01-02")
		agg, ok := byDate[date]
		if !ok {
			agg = &dailyAgg{}
			byDate[date] = agg
		}

		episodeCount := parseProgressCount(act.Progress)
		if episodeCount == 0 {
			episodeCount = 1
		}

		if act.Media != nil && act.Media.Type == "MANGA" {
			agg.mangaChapters += episodeCount
		} else {
			agg.animeEpisodes += episodeCount
		}
	}

	// Upsert into ActivityLog — only add, never subtract
	backfilledCount := 0
	for date, agg := range byDate {
		var existing models.ActivityLog
		result := pdb.Gorm().Where("date = ?", date).First(&existing)
		if result.Error != nil {
			// Create new
			log := models.ActivityLog{
				Date:          date,
				AnimeEpisodes: agg.animeEpisodes,
				MangaChapters: agg.mangaChapters,
				AnimeMinutes:  agg.animeEpisodes * 24, // rough estimate: 24 min per episode
			}
			if createErr := pdb.Gorm().Create(&log).Error; createErr == nil {
				backfilledCount++
			}
		} else {
			// Only update if AniList has more than what's already recorded
			updates := map[string]interface{}{}
			if agg.animeEpisodes > existing.AnimeEpisodes {
				updates["anime_episodes"] = agg.animeEpisodes
				updates["anime_minutes"] = agg.animeEpisodes * 24
			}
			if agg.mangaChapters > existing.MangaChapters {
				updates["manga_chapters"] = agg.mangaChapters
			}
			if len(updates) > 0 {
				pdb.Gorm().Model(&existing).Updates(updates)
				backfilledCount++
			}
		}
	}

	// Record cooldown
	if h.App.FileCacher != nil {
		bucket := backfillCooldownBucket(profileID)
		_ = h.App.FileCacher.Set(bucket, backfillCooldownKey, time.Now())
	}

	h.App.Logger.Info().
		Int("backfilled", backfilledCount).
		Int("totalActivities", len(allActivities)).
		Uint("profileID", profileID).
		Msg("backfill: completed activity backfill from AniList")

	return h.RespondWithData(c, map[string]interface{}{
		"backfilled": backfilledCount,
		"skipped":    false,
	})
}

// parseProgressCount parses AniList progress string like "1 - 3" or "5" into a count.
func parseProgressCount(progress string) int {
	defer util.HandlePanicInModuleThen("parseProgressCount", func() {})

	if progress == "" {
		return 1
	}

	progress = strings.TrimSpace(progress)

	// "1 - 3" means episodes 1 through 3 = 3 episodes
	if parts := strings.SplitN(progress, "-", 2); len(parts) == 2 {
		start, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
		end, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
		if err1 == nil && err2 == nil && end >= start {
			return end - start + 1
		}
	}

	// Single number
	if n, err := strconv.Atoi(progress); err == nil && n > 0 {
		return 1
	}

	return 1
}

func backfillCooldownBucket(profileID uint) filecache.Bucket {
	return filecache.NewBucket(fmt.Sprintf("activity_backfill_%d", profileID), 30*24*time.Hour)
}
