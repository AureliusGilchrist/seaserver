package db

import (
	"errors"
	"seanime/internal/database/models"

	"gorm.io/gorm"
)

// ActivityLogTotals is the sum of every ActivityLog row of a profile.
type ActivityLogTotals struct {
	AnimeEpisodes int
	AnimeMinutes  int
	MangaChapters int
	MangaMinutes  int
	ActiveDays    int
}

// SumActivityLogs adds up the whole daily activity log.
func (db *Database) SumActivityLogs() (ActivityLogTotals, error) {
	return sumActivityLogs(db.gormdb)
}

func sumActivityLogs(g *gorm.DB) (ActivityLogTotals, error) {
	var t ActivityLogTotals
	err := g.Model(&models.ActivityLog{}).
		Select("COALESCE(SUM(anime_episodes),0) AS anime_episodes, COALESCE(SUM(anime_minutes),0) AS anime_minutes, " +
			"COALESCE(SUM(manga_chapters),0) AS manga_chapters, COALESCE(SUM(manga_minutes),0) AS manga_minutes, " +
			"COALESCE(SUM(CASE WHEN anime_episodes > 0 OR manga_chapters > 0 THEN 1 ELSE 0 END),0) AS active_days").
		Scan(&t).Error
	return t, err
}

// GetLifetimeStatsBaseline returns the profile's backfill baseline, or nil when none was made yet.
func (db *Database) GetLifetimeStatsBaseline() (*models.LifetimeStatsBaseline, error) {
	var b models.LifetimeStatsBaseline
	err := db.gormdb.Order("id ASC").First(&b).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// CreateLifetimeStatsBaseline stores the baseline (b's Est* values) unless one already exists,
// and returns the stored one. The Log* snapshot is taken in the same transaction, so an episode
// recorded meanwhile lands on one side of it only. The baseline is made once: a second backfill
// finds it and changes nothing.
func (db *Database) CreateLifetimeStatsBaseline(b *models.LifetimeStatsBaseline) (*models.LifetimeStatsBaseline, error) {
	var out *models.LifetimeStatsBaseline
	err := db.gormdb.Transaction(func(tx *gorm.DB) error {
		var existing models.LifetimeStatsBaseline
		err := tx.Order("id ASC").First(&existing).Error
		if err == nil {
			out = &existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		logs, err := sumActivityLogs(tx)
		if err != nil {
			return err
		}
		b.LogAnimeEpisodes = logs.AnimeEpisodes
		b.LogAnimeMinutes = logs.AnimeMinutes
		b.LogMangaChapters = logs.MangaChapters
		b.LogMangaMinutes = logs.MangaMinutes
		if err := tx.Create(b).Error; err != nil {
			return err
		}
		out = b
		return nil
	})
	return out, err
}
