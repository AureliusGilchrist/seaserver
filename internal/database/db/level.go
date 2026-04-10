package db

import (
	"math"
	"seanime/internal/database/models"
	"time"
)

// GetLevelProgress returns the user's current level progress, creating it if it doesn't exist.
func (db *Database) GetLevelProgress() (*models.LevelProgress, error) {
	var lp models.LevelProgress
	result := db.gormdb.First(&lp)
	if result.Error != nil {
		// Create default
		lp = models.LevelProgress{
			TotalXP:      0,
			CurrentLevel: 1,
		}
		if err := db.gormdb.Create(&lp).Error; err != nil {
			return nil, err
		}
	}
	return &lp, nil
}

// AddXP adds XP to the user's level progress and returns (newLevel, leveled up, error).
func (db *Database) AddXP(xp int) (int, bool, error) {
	lp, err := db.GetLevelProgress()
	if err != nil {
		return 0, false, err
	}

	oldLevel := lp.CurrentLevel
	lp.TotalXP += xp
	lp.CurrentLevel = ComputeLevel(lp.TotalXP)

	if err := db.gormdb.Save(lp).Error; err != nil {
		return oldLevel, false, err
	}

	return lp.CurrentLevel, lp.CurrentLevel > oldLevel, nil
}

// ComputeLevel returns the level for a given total XP amount. Max level 50.
func ComputeLevel(totalXP int) int {
	for lvl := 50; lvl >= 1; lvl-- {
		if totalXP >= XPForLevel(lvl) {
			return lvl
		}
	}
	return 1
}

// XPForLevel returns the cumulative XP required to reach a given level.
// Level 1 = 0 XP, Level 2 = 100 XP, scaling with N^1.5
func XPForLevel(level int) int {
	if level <= 1 {
		return 0
	}
	return int(100 * math.Pow(float64(level-1), 1.5))
}

// XPToNextLevel returns the XP needed from current total to reach the next level.
func XPToNextLevel(totalXP int, currentLevel int) int {
	if currentLevel >= 50 {
		return 0
	}
	return XPForLevel(currentLevel+1) - totalXP
}

// ComputeActivityMultiplier calculates the XP multiplier based on rolling 30-day activity hours.
// Every 50 hours in the last 30 days = +0.1x, capped at 2.0x.
func (db *Database) ComputeActivityMultiplier() (float64, error) {
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -30).Format("2006-01-02")

	logs, err := db.GetActivityLogs(startDate, endDate)
	if err != nil {
		return 1.0, err
	}

	totalMinutes := 0
	for _, log := range logs {
		totalMinutes += log.AnimeMinutes
		totalMinutes += log.MangaChapters * 7 // 7 min per chapter average
	}

	totalHours := float64(totalMinutes) / 60.0
	bonus := math.Floor(totalHours/50.0) * 0.1
	multiplier := 1.0 + bonus

	if multiplier > 2.0 {
		multiplier = 2.0
	}

	return multiplier, nil
}
