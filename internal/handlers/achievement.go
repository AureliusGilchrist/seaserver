package handlers

import (
	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"strconv"

	"github.com/labstack/echo/v4"

)

// HandleGetAchievements
//
//	@summary get all achievements for the current profile.
//	@desc Returns all achievement definitions, categories, current progress/unlock state, and a summary.
//	@returns achievement.ListResponse
//	@route /api/v1/achievements [GET]
func (h *Handler) HandleGetAchievements(c echo.Context) error {
	database := h.GetProfileDatabase(c)
	profileID := h.GetProfileID(c)

	// Lazily init rows via a no-op event (does NOT evaluate/unlock anything)
	h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
		ProfileID: profileID,
		Trigger:   achievement.EvalTrigger("_init"),
	})

	// NOTE: Retroactive collection-based evaluation removed.
	// Achievements now only unlock from real-time events (watching, completing, rating, etc.)
	// to prevent mass-unlocking the entire AniList history on every page load.
	// Use the /api/v1/achievements/import endpoint for an explicit one-time retroactive import.

	dbAchievements, err := database.GetAllAchievements()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	entries := make([]achievement.Entry, 0, len(dbAchievements))
	for _, a := range dbAchievements {
		entry := achievement.Entry{
			Key:        a.Key,
			Tier:       a.Tier,
			IsUnlocked: a.IsUnlocked,
			Progress:   a.Progress,
		}
		if a.UnlockedAt != nil {
			ts := a.UnlockedAt.Format("2006-01-02T15:04:05Z")
			entry.UnlockedAt = &ts
		}
		entries = append(entries, entry)
	}

	total, unlocked, _ := database.GetAchievementSummary()

	return h.RespondWithData(c, achievement.ListResponse{
		Definitions:  achievement.AllDefinitions,
		Categories:   achievement.AllCategories,
		Achievements: entries,
		Summary: achievement.SummaryResponse{
			TotalCount:    total,
			UnlockedCount: unlocked,
		},
	})
}

// HandleGetAchievementSummary
//
//	@summary get achievement summary for the current profile.
//	@desc Returns total and unlocked achievement counts.
//	@returns achievement.SummaryResponse
//	@route /api/v1/achievements/summary [GET]
func (h *Handler) HandleGetAchievementSummary(c echo.Context) error {
	database := h.GetProfileDatabase(c)
	total, unlocked, err := database.GetAchievementSummary()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, achievement.SummaryResponse{
		TotalCount:    total,
		UnlockedCount: unlocked,
	})
}

// HandleSetAchievementShowcase
//
//	@summary set the achievement showcase for the current profile.
//	@desc Sets which achievements to display in the profile badge showcase (up to 6 slots).
//	@returns bool
//	@route /api/v1/achievements/showcase [POST]
func (h *Handler) HandleSetAchievementShowcase(c echo.Context) error {
	type body struct {
		Slots []struct {
			Slot            int    `json:"slot"`
			AchievementKey  string `json:"achievementKey"`
			AchievementTier int    `json:"achievementTier"`
		} `json:"slots"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	database := h.GetProfileDatabase(c)

	showcaseItems := make([]models.AchievementShowcase, 0, len(b.Slots))
	for _, s := range b.Slots {
		showcaseItems = append(showcaseItems, models.AchievementShowcase{
			Slot:            s.Slot,
			AchievementKey:  s.AchievementKey,
			AchievementTier: s.AchievementTier,
		})
	}

	if err := database.SetAchievementShowcase(showcaseItems); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleGetAchievementShowcase
//
//	@summary get the achievement showcase for the current profile.
//	@desc Returns the current showcase configuration.
//	@returns []models.AchievementShowcase
//	@route /api/v1/achievements/showcase [GET]
func (h *Handler) HandleGetAchievementShowcase(c echo.Context) error {
	database := h.GetProfileDatabase(c)
	showcase, err := database.GetAchievementShowcase()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, showcase)
}

// HandleGetUserAchievements
//
//	@summary get all achievements for another user by profile ID.
//	@desc Returns achievement definitions, categories, progress/unlock state, and summary for the specified user.
//	@returns achievement.ListResponse
//	@route /api/v1/achievements/user/{id} [GET]
func (h *Handler) HandleGetUserAchievements(c echo.Context) error {
	idStr := c.Param("id")
	if idStr == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Missing profile ID"))
	}
	pid, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || pid == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Invalid profile ID"))
	}
	profileID := uint(pid)

	if h.App.ProfileDatabaseManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	database, err := h.App.ProfileDatabaseManager.GetDatabase(profileID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	dbAchievements, err := database.GetAllAchievements()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	entries := make([]achievement.Entry, 0, len(dbAchievements))
	for _, a := range dbAchievements {
		entry := achievement.Entry{
			Key:        a.Key,
			Tier:       a.Tier,
			IsUnlocked: a.IsUnlocked,
			Progress:   a.Progress,
		}
		if a.UnlockedAt != nil {
			ts := a.UnlockedAt.Format("2006-01-02T15:04:05Z")
			entry.UnlockedAt = &ts
		}
		entries = append(entries, entry)
	}

	total, unlocked, _ := database.GetAchievementSummary()

	return h.RespondWithData(c, achievement.ListResponse{
		Definitions:  achievement.AllDefinitions,
		Categories:   achievement.AllCategories,
		Achievements: entries,
		Summary: achievement.SummaryResponse{
			TotalCount:    total,
			UnlockedCount: unlocked,
		},
	})
}

// HandleImportAchievements
//
//	@summary retroactively evaluate all stat-based achievements and return newly unlocked ones.
//	@desc Fetches current anime/manga collections and evaluates all collection-based achievements.
//	@desc Returns a list of achievements that were newly unlocked by this import.
//	@returns []achievement.UnlockPayload
//	@route /api/v1/achievements/import [POST]
func (h *Handler) HandleImportAchievements(c echo.Context) error {
	profileID := h.GetProfileID(c)
	database := h.GetProfileDatabase(c)

	// Lazily init rows
	h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
		ProfileID: profileID,
		Trigger:   achievement.EvalTrigger("_init"),
	})

	// Snapshot current unlocked achievements
	beforeUnlocked, err := database.GetUnlockedAchievements()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	beforeSet := make(map[string]bool, len(beforeUnlocked))
	for _, a := range beforeUnlocked {
		beforeSet[a.Key+":"+strconv.Itoa(a.Tier)] = true
	}

	// Get collections using the per-profile AniList client
	// so achievements reflect the profile's own stats, not the shared/global account.
	var animeCollection *anilist.AnimeCollection
	var mangaCollection *anilist.MangaCollection
	profileClient := h.GetProfileAnilistClient(c)
	if profileClient.IsAuthenticated() {
		var profileUsername *string
		if h.App.ProfileManager != nil {
			if prof, err := h.App.ProfileManager.GetProfile(profileID); err == nil && prof.AniListUsername != "" {
				profileUsername = &prof.AniListUsername
			}
		}
		animeCollection, _ = profileClient.AnimeCollection(c.Request().Context(), profileUsername)
		mangaCollection, _ = profileClient.MangaCollection(c.Request().Context(), profileUsername)
	}
	if animeCollection == nil {
		animeCollection, _ = h.App.GetAnimeCollection(false)
	}
	if mangaCollection == nil {
		mangaCollection, _ = h.App.GetMangaCollection(false)
	}
	stats := buildCollectionStats(animeCollection, mangaCollection)

	// Evaluate all stat-based achievements
	h.App.AchievementEngine.EvaluateCollectionStats(profileID, stats)

	// Find newly unlocked
	afterUnlocked, err := database.GetUnlockedAchievements()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	defMap := achievement.DefinitionMap()
	var newlyUnlocked []achievement.UnlockPayload
	for _, a := range afterUnlocked {
		key := a.Key + ":" + strconv.Itoa(a.Tier)
		if beforeSet[key] {
			continue
		}
		def, ok := defMap[a.Key]
		if !ok {
			continue
		}
		tierName := ""
		if a.Tier > 0 && a.Tier <= len(def.TierNames) {
			tierName = def.TierNames[a.Tier-1]
		}
		desc := achievement.FormatThreshold(def.Description, def.TierThresholds, a.Tier)
		catInfo := achievement.CategoryMap()[def.Category]
		newlyUnlocked = append(newlyUnlocked, achievement.UnlockPayload{
			Key:         a.Key,
			Name:        def.Name,
			Description: desc,
			Tier:        a.Tier,
			TierName:    tierName,
			Category:    string(def.Category),
			IconSVG:     catInfo.IconSVG,
		})
	}

	if newlyUnlocked == nil {
		newlyUnlocked = []achievement.UnlockPayload{}
	}

	return h.RespondWithData(c, newlyUnlocked)
}
