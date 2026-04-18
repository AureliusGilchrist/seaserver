package db

import (
	"seanime/internal/database/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GetAllAchievements returns all achievements for the current profile, ordered by key and tier.
func (db *Database) GetAllAchievements() ([]models.Achievement, error) {
	var achievements []models.Achievement
	if err := db.gormdb.Order("key asc, tier asc").Find(&achievements).Error; err != nil {
		return nil, err
	}
	return achievements, nil
}

// GetAchievement returns a single achievement by key and tier.
func (db *Database) GetAchievement(key string, tier int) (*models.Achievement, error) {
	var a models.Achievement
	if err := db.gormdb.Where("key = ? AND tier = ?", key, tier).First(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

// UpsertAchievement creates or updates an achievement record.
// Uses ON CONFLICT to handle the unique (key, tier) constraint.
func (db *Database) UpsertAchievement(a *models.Achievement) error {
	return db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}, {Name: "tier"}},
		DoUpdates: clause.AssignmentColumns([]string{"is_unlocked", "unlocked_at", "progress", "progress_data"}),
	}).Create(a).Error
}

// BulkUpsertAchievements creates or updates multiple achievement records.
func (db *Database) BulkUpsertAchievements(achievements []models.Achievement) error {
	if len(achievements) == 0 {
		return nil
	}
	// Use DO NOTHING on conflict to avoid overwriting existing progress/unlock state.
	// This is called from ensureInitialized to seed missing achievement rows;
	// existing rows (including unlocked ones) must be preserved.
	return db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}, {Name: "tier"}},
		DoNothing: true,
	}).CreateInBatches(achievements, 100).Error
}

// UnlockAchievement marks an achievement as unlocked with the current timestamp.
func (db *Database) UnlockAchievement(key string, tier int) error {
	now := time.Now()
	return db.gormdb.Model(&models.Achievement{}).
		Where("key = ? AND tier = ?", key, tier).
		Updates(map[string]interface{}{
			"is_unlocked": true,
			"unlocked_at": &now,
			"progress":    1.0,
		}).Error
}

// UpdateAchievementProgress updates the progress and progress data for an achievement.
func (db *Database) UpdateAchievementProgress(key string, tier int, progress float64, progressData string) error {
	return db.gormdb.Model(&models.Achievement{}).
		Where("key = ? AND tier = ?", key, tier).
		Updates(map[string]interface{}{
			"progress":      progress,
			"progress_data": progressData,
		}).Error
}

// GetAchievementSummary returns total and unlocked counts.
func (db *Database) GetAchievementSummary() (total int64, unlocked int64, err error) {
	if err = db.gormdb.Model(&models.Achievement{}).Count(&total).Error; err != nil {
		return
	}
	if err = db.gormdb.Model(&models.Achievement{}).Where("is_unlocked = ?", true).Count(&unlocked).Error; err != nil {
		return
	}
	return
}

// GetUnlockedAchievements returns only unlocked achievements.
func (db *Database) GetUnlockedAchievements() ([]models.Achievement, error) {
	var achievements []models.Achievement
	if err := db.gormdb.Where("is_unlocked = ?", true).Order("unlocked_at desc").Find(&achievements).Error; err != nil {
		return nil, err
	}
	return achievements, nil
}

// AchievementRowCount returns the number of achievement rows (to check if initialization is needed).
func (db *Database) AchievementRowCount() (int64, error) {
	var count int64
	if err := db.gormdb.Model(&models.Achievement{}).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// GetAchievementShowcase returns the user's selected showcase achievements.
func (db *Database) GetAchievementShowcase() ([]models.AchievementShowcase, error) {
	var showcase []models.AchievementShowcase
	if err := db.gormdb.Order("slot asc").Find(&showcase).Error; err != nil {
		return nil, err
	}
	return showcase, nil
}

// SetAchievementShowcase replaces all showcase slots with the given items.
func (db *Database) SetAchievementShowcase(items []models.AchievementShowcase) error {
	return db.gormdb.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&models.AchievementShowcase{}).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		return tx.Create(&items).Error
	})
}
