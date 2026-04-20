package db

import (
	"seanime/internal/database/models"
)

// GetAllGlobalMilestones returns every achieved milestone.
func (db *Database) GetAllGlobalMilestones() ([]*models.GlobalMilestone, error) {
	var milestones []*models.GlobalMilestone
	err := db.gormdb.Order("achieved_at DESC").Find(&milestones).Error
	return milestones, err
}

// GetGlobalMilestonesByProfile returns all milestones achieved by a specific profile.
func (db *Database) GetGlobalMilestonesByProfile(profileID uint) ([]*models.GlobalMilestone, error) {
	var milestones []*models.GlobalMilestone
	err := db.gormdb.Where("profile_id = ?", profileID).Order("achieved_at DESC").Find(&milestones).Error
	return milestones, err
}

// GetGlobalMilestoneByKey returns a specific milestone by its key and profile.
func (db *Database) GetGlobalMilestoneByKey(key string, profileID uint) (*models.GlobalMilestone, error) {
	var m models.GlobalMilestone
	err := db.gormdb.Where("key = ? AND profile_id = ?", key, profileID).First(&m).Error
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// GetFirstToAchieveMilestone returns the first-to-achieve milestone for a given key (any profile).
func (db *Database) GetFirstToAchieveMilestone(key string) (*models.GlobalMilestone, error) {
	var m models.GlobalMilestone
	err := db.gormdb.Where("key = ? AND is_first_to_achieve = ?", key, true).First(&m).Error
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// CreateGlobalMilestone inserts a new milestone record.
func (db *Database) CreateGlobalMilestone(m *models.GlobalMilestone) error {
	return db.gormdb.Create(m).Error
}

// HasGlobalMilestone checks if a profile already achieved a specific milestone.
func (db *Database) HasGlobalMilestone(key string, profileID uint) (bool, error) {
	var count int64
	err := db.gormdb.Model(&models.GlobalMilestone{}).
		Where("key = ? AND profile_id = ?", key, profileID).
		Count(&count).Error
	return count > 0, err
}

// HasFirstToAchieveMilestone checks if any profile already claimed a first-to-achieve milestone.
func (db *Database) HasFirstToAchieveMilestone(key string) (bool, error) {
	var count int64
	err := db.gormdb.Model(&models.GlobalMilestone{}).
		Where("key = ? AND is_first_to_achieve = ?", key, true).
		Count(&count).Error
	return count > 0, err
}
