package milestone

import (
	"fmt"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// MilestoneUnlockPayload is sent over WebSocket when a milestone is achieved.
type MilestoneUnlockPayload struct {
	Key              string `json:"key"`
	Name             string `json:"name"`
	Category         string `json:"category"`
	Threshold        int    `json:"threshold"`
	IconSVG          string `json:"iconSVG"`
	IsFirstToAchieve bool   `json:"isFirstToAchieve"`
	ProfileName      string `json:"profileName"`
}

// EngineOptions configures the milestone engine.
type EngineOptions struct {
	Logger         *zerolog.Logger
	WSEventManager events.WSEventManagerInterface
	MainDB         *db.Database
	GetProfileDB   func(profileID uint) (*db.Database, error)
	GetProfileName func(profileID uint) string
}

// Engine evaluates milestone progress and records achievements.
type Engine struct {
	logger         *zerolog.Logger
	wsEventManager events.WSEventManagerInterface
	mainDB         *db.Database
	getProfileDB   func(profileID uint) (*db.Database, error)
	getProfileName func(profileID uint) string
	mu             sync.Mutex
}

// NewEngine creates a new milestone evaluation engine.
func NewEngine(opts *EngineOptions) *Engine {
	return &Engine{
		logger:         opts.Logger,
		wsEventManager: opts.WSEventManager,
		mainDB:         opts.MainDB,
		getProfileDB:   opts.GetProfileDB,
		getProfileName: opts.GetProfileName,
	}
}

// ProfileStats holds aggregated stats for a single profile used for milestone evaluation.
type ProfileStats struct {
	TotalAnimeMinutes    int
	TotalAnimeEpisodes   int
	TotalMangaChapters   int
	TotalSeriesCompleted int
	TotalLibraryFiles    int
	TotalGenresExplored  int
	TotalDaysActive      int
	TotalAchievements    int
}

// EvaluateProfile checks all milestones for a given profile and awards any newly crossed thresholds.
func (e *Engine) EvaluateProfile(profileID uint) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.mainDB == nil {
		return
	}

	stats, err := e.gatherStats(profileID)
	if err != nil {
		e.logger.Error().Err(err).Uint("profileID", profileID).Msg("milestone: failed to gather stats")
		return
	}

	profileName := e.getProfileName(profileID)
	now := time.Now()

	// Evaluate individual milestones
	for _, def := range AllDefinitions {
		val := e.statValueForCategory(stats, def.Category)
		if val < def.Threshold {
			continue
		}

		has, err := e.mainDB.HasGlobalMilestone(def.Key, profileID)
		if err != nil || has {
			continue
		}

		m := &models.GlobalMilestone{
			Key:              def.Key,
			Category:         string(def.Category),
			Tier:             def.Threshold,
			IsFirstToAchieve: false,
			ProfileID:        profileID,
			ProfileName:      profileName,
			AchievedAt:       &now,
		}
		if err := e.mainDB.CreateGlobalMilestone(m); err != nil {
			e.logger.Error().Err(err).Str("key", def.Key).Msg("milestone: failed to create milestone")
			continue
		}

		e.logger.Info().Str("key", def.Key).Uint("profileID", profileID).Msg("milestone: unlocked")
		e.sendEvent(profileID, def.Key, def.Name, string(def.Category), def.Threshold, def.IconSVG, false, profileName)
	}

	// Evaluate first-to-achieve milestones
	for _, def := range AllFirstToAchieve {
		val := e.statValueForCategory(stats, def.Category)
		if val < def.Threshold {
			continue
		}

		claimed, err := e.mainDB.HasFirstToAchieveMilestone(def.Key)
		if err != nil || claimed {
			continue
		}

		m := &models.GlobalMilestone{
			Key:              def.Key,
			Category:         string(def.Category),
			Tier:             def.Threshold,
			IsFirstToAchieve: true,
			ProfileID:        profileID,
			ProfileName:      profileName,
			AchievedAt:       &now,
		}
		if err := e.mainDB.CreateGlobalMilestone(m); err != nil {
			e.logger.Error().Err(err).Str("key", def.Key).Msg("milestone: failed to create first-to-achieve milestone")
			continue
		}

		e.logger.Info().Str("key", def.Key).Uint("profileID", profileID).Msg("milestone: first-to-achieve unlocked")
		e.sendEvent(profileID, def.Key, def.Name, string(def.Category), def.Threshold, def.IconSVG, true, profileName)
	}
}

func (e *Engine) gatherStats(profileID uint) (*ProfileStats, error) {
	pdb, err := e.getProfileDB(profileID)
	if err != nil {
		return nil, fmt.Errorf("get profile db: %w", err)
	}

	stats := &ProfileStats{}

	// Sum activity logs for episodes, chapters, minutes, days active
	logs, err := pdb.GetAllActivityLogs()
	if err == nil {
		for _, log := range logs {
			stats.TotalAnimeMinutes += log.AnimeMinutes
			stats.TotalAnimeEpisodes += log.AnimeEpisodes
			stats.TotalMangaChapters += log.MangaChapters
		}
		stats.TotalDaysActive = len(logs)
	}

	// Count achievements unlocked
	_, unlocked, err := pdb.GetAchievementSummary()
	if err == nil {
		stats.TotalAchievements = int(unlocked)
	}

	// Series completed: count activity events of type series_complete or manga_complete
	// We approximate from the achievement system — count distinct media IDs in episode_watched events
	// where metadata indicates completion. Simpler: count distinct completed series from AniList.
	// For now, use the sum of series_complete events.
	var completedCount int64
	pdb.Gorm().Model(&models.ActivityEvent{}).
		Where("event_type IN (?, ?)", "series_complete", "manga_complete").
		Count(&completedCount)
	stats.TotalSeriesCompleted = int(completedCount)

	// Library files: count from main db local files
	// We parse the local files blob — but it's simpler to count file_matched events
	var fileCount int64
	pdb.Gorm().Model(&models.ActivityEvent{}).
		Where("event_type = ?", models.ActivityEventFileMatched).
		Count(&fileCount)
	stats.TotalLibraryFiles = int(fileCount)

	// Genres explored: count distinct genres from activity events metadata
	// This is complex — approximate by counting distinct media IDs across all events
	var distinctMedia int64
	pdb.Gorm().Model(&models.ActivityEvent{}).
		Where("event_type IN (?, ?)", models.ActivityEventEpisodeWatched, models.ActivityEventMangaChapterRead).
		Distinct("media_id").
		Count(&distinctMedia)
	stats.TotalGenresExplored = int(distinctMedia)

	return stats, nil
}

func (e *Engine) statValueForCategory(stats *ProfileStats, cat Category) int {
	switch cat {
	case CategoryHoursWatched:
		return stats.TotalAnimeMinutes / 60
	case CategoryEpisodesWatched:
		return stats.TotalAnimeEpisodes
	case CategoryChaptersRead:
		return stats.TotalMangaChapters
	case CategorySeriesCompleted:
		return stats.TotalSeriesCompleted
	case CategoryDaysActive:
		return stats.TotalDaysActive
	case CategoryLibraryFiles:
		return stats.TotalLibraryFiles
	case CategoryGenresExplored:
		return stats.TotalGenresExplored
	case CategoryAchievementsUnlocked:
		return stats.TotalAchievements
	default:
		return 0
	}
}

func (e *Engine) sendEvent(profileID uint, key, name, category string, threshold int, iconSVG string, isFirst bool, profileName string) {
	if e.wsEventManager == nil {
		return
	}
	e.wsEventManager.SendEventToProfile(profileID, events.MilestoneAchieved, MilestoneUnlockPayload{
		Key:              key,
		Name:             name,
		Category:         category,
		Threshold:        threshold,
		IconSVG:          iconSVG,
		IsFirstToAchieve: isFirst,
		ProfileName:      profileName,
	})
}
