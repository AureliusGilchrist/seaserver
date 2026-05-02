package handlers

import (
	"strconv"
	"time"

	"seanime/internal/achievement"
	"seanime/internal/core"
	"seanime/internal/database/db"
	"seanime/internal/profilestats"

	"github.com/labstack/echo/v4"
)

// ProfilePageResponse is the aggregated response for the profile page.
type ProfilePageResponse struct {
	Profile            *core.ProfileSummary        `json:"profile"`
	Level              *LevelResponse              `json:"level"`
	Showcase           []ShowcaseEntry             `json:"showcase"`
	AchievementSummary achievement.SummaryResponse  `json:"achievementSummary"`
	ActivityHeatmap    []*profilestats.ActivityDay  `json:"activityHeatmap"`
	AnimeStreak        *profilestats.StreakInfo     `json:"animeStreak"`
	MangaStreak        *profilestats.StreakInfo     `json:"mangaStreak"`
	RecentAchievements []RecentAchievementEntry     `json:"recentAchievements"`
	CurrentExpBar      *achievement.ExpBarProgressionEntry `json:"currentExpBar"`
}

// LevelResponse returns the current level/XP state.
type LevelResponse struct {
	CurrentLevel    int     `json:"currentLevel"`
	TotalXP         int     `json:"totalXP"`
	XPToNext        int     `json:"xpToNext"`
	XPInCurrentLvl  int     `json:"xpInCurrentLevel"`
	XPNeededForLvl  int     `json:"xpNeededForLevel"`
	Multiplier      float64 `json:"multiplier"`
}

// ShowcaseEntry is a showcase slot with its definition resolved.
type ShowcaseEntry struct {
	Slot       int                  `json:"slot"`
	Key        string               `json:"key"`
	Tier       int                  `json:"tier"`
	Definition *achievement.Definition `json:"definition,omitempty"`
}

// RecentAchievementEntry represents a recently unlocked achievement.
type RecentAchievementEntry struct {
	Key        string                     `json:"key"`
	Tier       int                        `json:"tier"`
	UnlockedAt *time.Time                 `json:"unlockedAt"`
	Definition *achievement.Definition    `json:"definition,omitempty"`
}

// HandleGetMyProfile
//
//	@summary get the current user's profile page data.
//	@desc Returns profile summary, level, showcase, and achievement summary for the current user.
//	@returns ProfilePageResponse
//	@route /api/v1/profile/me [GET]
func (h *Handler) HandleGetMyProfile(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}

	return h.buildProfileResponse(c, profileID)
}

// HandleGetUserProfile
//
//	@summary get another user's profile page data by profile ID.
//	@desc Returns profile summary, level, showcase, and achievement summary for the specified user.
//	@returns ProfilePageResponse
//	@route /api/v1/profile/user/{id} [GET]
func (h *Handler) HandleGetUserProfile(c echo.Context) error {
	idStr := c.Param("id")
	if idStr == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Missing profile ID"))
	}

	pid, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || pid == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Invalid profile ID"))
	}
	profileID := uint(pid)

	return h.buildProfileResponse(c, profileID)
}

// HandleUpdateBio
//
//	@summary update the bio of the current profile.
//	@desc Updates the bio text for the authenticated user's profile.
//	@returns core.ProfileSummary
//	@route /api/v1/profile/bio [PATCH]
func (h *Handler) HandleUpdateBio(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}

	type body struct {
		Bio string `json:"bio"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Limit bio length
	if len(b.Bio) > 500 {
		b.Bio = b.Bio[:500]
	}

	if h.App.ProfileManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	profile, err := h.App.ProfileManager.UpdateProfile(profileID, map[string]interface{}{
		"bio": b.Bio,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, profile.ToSummary())
}

// HandleSetDisplayTitle
//
//	@summary set the user's global display title.
//	@desc Stores the plain-text title and its color globally so all users see the same title on this profile.
//	@returns core.ProfileSummary
//	@route /api/v1/profile/display-title [PATCH]
func (h *Handler) HandleSetDisplayTitle(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}
	if h.App.ProfileManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	type body struct {
		Title string `json:"title"`
		Color string `json:"color"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Sanitize: max 60 chars
	if len(b.Title) > 60 {
		b.Title = b.Title[:60]
	}

	profile, err := h.App.ProfileManager.UpdateProfile(profileID, map[string]interface{}{
		"display_title":       b.Title,
		"display_title_color": b.Color,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, profile.ToSummary())
}

// HandleSetDisplayCosmetics
//
//	@summary save all global profile cosmetics at once.
//	@desc Stores the resolved XP bar fill CSS, animation class, and name color so all users see them.
//	@returns core.ProfileSummary
//	@route /api/v1/profile/display-cosmetics [PATCH]
func (h *Handler) HandleSetDisplayCosmetics(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}
	if h.App.ProfileManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	type body struct {
		XPBarFillCss    string `json:"xpBarFillCss"`
		XPBarAnimClass  string `json:"xpBarAnimClass"`
		NameColorCss    string `json:"nameColorCss"`
		NameGradientCss string `json:"nameGradientCss"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	updates := map[string]interface{}{
		"xpbar_fill_css":   b.XPBarFillCss,
		"xpbar_anim_class": b.XPBarAnimClass,
		"name_color_css":   b.NameColorCss,
		"name_gradient_css": b.NameGradientCss,
	}

	profile, err := h.App.ProfileManager.UpdateProfile(profileID, updates)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, profile.ToSummary())
}

// HandleGetLevel
//
//	@summary get level/XP data for the current profile.
//	@returns LevelResponse
//	@route /api/v1/profile/level [GET]
func (h *Handler) HandleGetLevel(c echo.Context) error {
	database := h.GetProfileDatabase(c)

	progress, err := database.GetLevelProgress()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	level := db.ComputeLevel(progress.TotalXP)
	xpInLevel := progress.TotalXP - db.XPForLevel(level)
	xpToNext := db.XPToNextLevel(progress.TotalXP, level)
	xpNeeded := db.XPForLevel(level + 1)
	mult, _ := database.ComputeActivityBuff()

	return h.RespondWithData(c, &LevelResponse{
		CurrentLevel:   level,
		TotalXP:        progress.TotalXP,
		XPToNext:       xpToNext,
		XPInCurrentLvl: xpInLevel,
		XPNeededForLvl: xpNeeded,
		Multiplier:     mult,
	})
}

// buildProfileResponse builds the profile page data for a given profile ID.
func (h *Handler) buildProfileResponse(c echo.Context, profileID uint) error {
	if h.App.ProfileManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	profile, err := h.App.ProfileManager.GetProfile(profileID)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(404, "Profile not found"))
	}

	database, err := h.App.ProfileDatabaseManager.GetDatabase(profileID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Level
	progress, _ := database.GetLevelProgress()
	level := db.ComputeLevel(progress.TotalXP)
	xpInLevel := progress.TotalXP - db.XPForLevel(level)
	xpToNext := db.XPToNextLevel(progress.TotalXP, level)
	xpNeeded := db.XPForLevel(level + 1)
	mult, _ := database.ComputeActivityBuff()

	levelResp := &LevelResponse{
		CurrentLevel:   level,
		TotalXP:        progress.TotalXP,
		XPToNext:       xpToNext,
		XPInCurrentLvl: xpInLevel,
		XPNeededForLvl: xpNeeded,
		Multiplier:     mult,
	}

	// Achievement showcase
	dbShowcase, _ := database.GetAchievementShowcase()
	defMap := achievement.DefinitionMap()
	showcase := make([]ShowcaseEntry, 0, len(dbShowcase))
	for _, s := range dbShowcase {
		entry := ShowcaseEntry{
			Slot: s.Slot,
			Key:  s.AchievementKey,
			Tier: s.AchievementTier,
		}
		if d, ok := defMap[s.AchievementKey]; ok {
			entry.Definition = d
		}
		showcase = append(showcase, entry)
	}

	// Achievement summary
	total, unlocked, _ := database.GetAchievementSummary()

	// Activity heatmap (last 90 days)
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -90).Format("2006-01-02")
	activityLogs, _ := database.GetActivityLogs(startDate, endDate)
	heatmap := profilestats.BuildHeatmap(activityLogs, startDate, endDate)

	// Streaks
	allLogs, _ := database.GetAllActivityLogs()
	animeStreak := profilestats.ComputeStreaks(allLogs, true)
	mangaStreak := profilestats.ComputeStreaks(allLogs, false)

	// Recent achievements (last 5 unlocked)
	unlockedAchievements, _ := database.GetUnlockedAchievements()
	recentLimit := 5
	if len(unlockedAchievements) < recentLimit {
		recentLimit = len(unlockedAchievements)
	}
	recentAchievements := make([]RecentAchievementEntry, 0, recentLimit)
	for i := 0; i < recentLimit; i++ {
		ach := unlockedAchievements[i]
		entry := RecentAchievementEntry{
			Key:        ach.Key,
			Tier:       ach.Tier,
			UnlockedAt: ach.UnlockedAt,
		}
		if d, ok := defMap[ach.Key]; ok {
			entry.Definition = d
		}
		recentAchievements = append(recentAchievements, entry)
	}

	// Current exp bar styling based on level
	currentExpBar := achievement.GetExpBarForLevel(level)

	return h.RespondWithData(c, &ProfilePageResponse{
		Profile:  profile.ToSummary(),
		Level:    levelResp,
		Showcase: showcase,
		AchievementSummary: achievement.SummaryResponse{
			TotalCount:    total,
			UnlockedCount: unlocked,
		},
		ActivityHeatmap:    heatmap,
		AnimeStreak:        animeStreak,
		MangaStreak:        mangaStreak,
		RecentAchievements: recentAchievements,
		CurrentExpBar:      currentExpBar,
	})
}

// HandleGetExpBarProgression
//
//	@summary get all exp bar progression entries for the shop/selector.
//	@desc Returns all 400 exp bar progression entries with their styling data.
//	@returns []achievement.ExpBarProgressionEntry
//	@route /api/v1/profile/exp-bar/all [GET]
func (h *Handler) HandleGetExpBarProgression(c echo.Context) error {
	entries := achievement.GetAllExpBarEntries()
	return h.RespondWithData(c, entries)
}

// HandleGetExpBarForLevel
//
//	@summary get the exp bar styling for a specific level.
//	@desc Returns the exp bar progression entry for the given level.
//	@returns achievement.ExpBarProgressionEntry
//	@route /api/v1/profile/exp-bar/level/{level} [GET]
func (h *Handler) HandleGetExpBarForLevel(c echo.Context) error {
	levelStr := c.Param("level")
	if levelStr == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Missing level parameter"))
	}

	level, err := strconv.Atoi(levelStr)
	if err != nil || level < 1 || level > 1000 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Invalid level (must be 1-1000)"))
	}

	entry := achievement.GetExpBarForLevel(level)
	return h.RespondWithData(c, entry)
}
