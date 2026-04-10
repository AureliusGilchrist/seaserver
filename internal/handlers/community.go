package handlers

import (
	"sort"
	"time"

	"seanime/internal/achievement"
	"seanime/internal/database/db"

	"github.com/labstack/echo/v4"
)

// CommunityProfile is a single entry in the community profiles list.
type CommunityProfile struct {
	ID               uint   `json:"id"`
	Name             string `json:"name"`
	AniListUsername  string `json:"anilistUsername"`
	AniListAvatar    string `json:"anilistAvatar"`
	AvatarPath       string `json:"avatarPath"`
	Bio              string `json:"bio"`
	BannerImage      string `json:"bannerImage"`
	IsAdmin          bool   `json:"isAdmin"`
	CurrentLevel     int    `json:"currentLevel"`
	TotalXP          int    `json:"totalXP"`
	AchievementCount int64  `json:"achievementCount"`
}

// CommunityResponse wraps the profiles list with aggregate statistics.
type CommunityResponse struct {
	Profiles       []*CommunityProfile `json:"profiles"`
	AggregateStats *AggregateStats     `json:"aggregateStats"`
}

// AggregateStats holds community-wide statistics.
type AggregateStats struct {
	TotalProfiles     int   `json:"totalProfiles"`
	TotalXP           int   `json:"totalXP"`
	TotalAchievements int64 `json:"totalAchievements"`
	HighestLevel      int   `json:"highestLevel"`
}

// ActivityFeedEntry represents a single event in the community activity feed.
type ActivityFeedEntry struct {
	ProfileID       uint       `json:"profileId"`
	ProfileName     string     `json:"profileName"`
	ProfileAvatar   string     `json:"profileAvatar"`
	AchievementKey  string     `json:"achievementKey"`
	AchievementTier int        `json:"achievementTier"`
	AchievementName string     `json:"achievementName"`
	IconSVG         string     `json:"iconSvg"`
	UnlockedAt      *time.Time `json:"unlockedAt"`
}

// HandleGetCommunityProfiles
//
//	@summary list community profiles with level and achievement data (max 100).
//	@returns CommunityResponse
//	@route /api/v1/community/profiles [GET]
func (h *Handler) HandleGetCommunityProfiles(c echo.Context) error {
	if h.App.ProfileManager == nil {
		return h.RespondWithData(c, &CommunityResponse{
			Profiles:       []*CommunityProfile{},
			AggregateStats: &AggregateStats{},
		})
	}

	profiles, err := h.App.ProfileManager.GetAllProfiles()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Cap at 100
	if len(profiles) > 100 {
		profiles = profiles[:100]
	}

	var totalXP int
	var totalAchievements int64
	highestLevel := 1

	result := make([]*CommunityProfile, 0, len(profiles))
	for _, p := range profiles {
		cp := &CommunityProfile{
			ID:              p.ID,
			Name:            p.Name,
			AniListUsername: p.AniListUsername,
			AniListAvatar:   p.AniListAvatar,
			AvatarPath:      p.AvatarPath,
			Bio:             p.Bio,
			BannerImage:     p.BannerImage,
			IsAdmin:         p.IsAdmin,
			CurrentLevel:    1,
		}

		if database, dbErr := h.App.ProfileDatabaseManager.GetDatabase(p.ID); dbErr == nil {
			if progress, lpErr := database.GetLevelProgress(); lpErr == nil {
				cp.CurrentLevel = db.ComputeLevel(progress.TotalXP)
				cp.TotalXP = progress.TotalXP
				totalXP += progress.TotalXP
				if cp.CurrentLevel > highestLevel {
					highestLevel = cp.CurrentLevel
				}
			}
			_, unlocked, _ := database.GetAchievementSummary()
			cp.AchievementCount = unlocked
			totalAchievements += unlocked
		}

		result = append(result, cp)
	}

	return h.RespondWithData(c, &CommunityResponse{
		Profiles: result,
		AggregateStats: &AggregateStats{
			TotalProfiles:     len(result),
			TotalXP:           totalXP,
			TotalAchievements: totalAchievements,
			HighestLevel:      highestLevel,
		},
	})
}

// HandleGetActivityFeed
//
//	@summary get the community activity feed (recent achievement unlocks across all profiles).
//	@returns []*ActivityFeedEntry
//	@route /api/v1/community/feed [GET]
func (h *Handler) HandleGetActivityFeed(c echo.Context) error {
	if h.App.ProfileManager == nil {
		return h.RespondWithData(c, []*ActivityFeedEntry{})
	}

	profiles, err := h.App.ProfileManager.GetAllProfiles()
	if err != nil {
		return h.RespondWithData(c, []*ActivityFeedEntry{})
	}

	defMap := achievement.DefinitionMap()
	var feed []*ActivityFeedEntry

	for _, p := range profiles {
		database, dbErr := h.App.ProfileDatabaseManager.GetDatabase(p.ID)
		if dbErr != nil {
			continue
		}

		unlocked, _ := database.GetUnlockedAchievements()
		limit := 5
		if len(unlocked) < limit {
			limit = len(unlocked)
		}

		avatar := p.AniListAvatar
		if p.AvatarPath != "" {
			avatar = p.AvatarPath
		}

		for i := 0; i < limit; i++ {
			ach := unlocked[i]
			name := ach.Key
			iconSVG := ""
			if d, ok := defMap[ach.Key]; ok {
				name = d.Name
				iconSVG = d.IconSVG
			}
			feed = append(feed, &ActivityFeedEntry{
				ProfileID:       p.ID,
				ProfileName:     p.Name,
				ProfileAvatar:   avatar,
				AchievementKey:  ach.Key,
				AchievementTier: ach.Tier,
				AchievementName: name,
				IconSVG:         iconSVG,
				UnlockedAt:      ach.UnlockedAt,
			})
		}
	}

	// Sort by unlock time descending
	sort.Slice(feed, func(i, j int) bool {
		if feed[i].UnlockedAt == nil {
			return false
		}
		if feed[j].UnlockedAt == nil {
			return true
		}
		return feed[i].UnlockedAt.After(*feed[j].UnlockedAt)
	})

	// Cap at 50 entries
	if len(feed) > 50 {
		feed = feed[:50]
	}

	return h.RespondWithData(c, feed)
}
