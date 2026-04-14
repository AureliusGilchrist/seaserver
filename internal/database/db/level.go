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

// ComputeLevel returns the level for a given total XP amount. No upper cap.
func ComputeLevel(totalXP int) int {
	if totalXP <= 0 {
		return 1
	}
	// Binary search for the highest level whose XP threshold ≤ totalXP.
	// XPForLevel grows as 100*(level-1)^1.5, so we find an upper bound first.
	lo, hi := 1, 2
	for XPForLevel(hi) <= totalXP {
		hi *= 2
	}
	for lo < hi {
		mid := (lo + hi + 1) / 2
		if XPForLevel(mid) <= totalXP {
			lo = mid
		} else {
			hi = mid - 1
		}
	}
	return lo
}

// XPForLevel returns the cumulative XP required to reach a given level.
// Level 1 = 0 XP, scaling with N^1.7 so ~2000 total achievement unlocks reaches level 150.
func XPForLevel(level int) int {
	if level <= 1 {
		return 0
	}
	return int(100 * math.Pow(float64(level-1), 1.7))
}

// XPToNextLevel returns the XP needed from current total to reach the next level.
func XPToNextLevel(totalXP int, currentLevel int) int {
	return XPForLevel(currentLevel+1) - totalXP
}

// SetXP directly sets the total XP and recomputes the current level.
func (db *Database) SetXP(totalXP int) error {
	lp, err := db.GetLevelProgress()
	if err != nil {
		return err
	}
	lp.TotalXP = totalXP
	lp.CurrentLevel = ComputeLevel(totalXP)
	return db.gormdb.Save(lp).Error
}

// GetXPVersion returns the current XP migration version from LevelProgress.
func (db *Database) GetXPVersion() (int, error) {
	lp, err := db.GetLevelProgress()
	if err != nil {
		return 0, err
	}
	return lp.XPVersion, nil
}

// SetXPVersion updates the XP migration version on the LevelProgress record.
func (db *Database) SetXPVersion(version int) error {
	lp, err := db.GetLevelProgress()
	if err != nil {
		return err
	}
	lp.XPVersion = version
	return db.gormdb.Save(lp).Error
}

// ComputeActivityBuff calculates the Activity Buff XP multiplier based on rolling 30-day active days.
//
// Rules:
//   - Base  1.0 → 2.0: scaled by active days (days with ≥1 episode or chapter) out of 30.
//   - Bonus 0.0 → 1.0: scaled by average daily intensity (1 entry/day = 0 bonus, ≥3 entries/day = full bonus).
//   - Total capped at 3.0x. Bare minimum (1 entry/day × 30 days) = 2.0x. Fully active = 3.0x.
func (db *Database) ComputeActivityBuff() (float64, error) {
	endDate := time.Now().Format("2006-01-02")
	startDate := time.Now().AddDate(0, 0, -30).Format("2006-01-02")

	logs, err := db.GetActivityLogs(startDate, endDate)
	if err != nil {
		return 1.0, err
	}

	activeDays := 0
	totalEntries := 0
	for _, log := range logs {
		dayEntries := log.AnimeEpisodes + log.MangaChapters
		if dayEntries >= 1 {
			activeDays++
			totalEntries += dayEntries
		}
	}

	if activeDays == 0 {
		return 1.0, nil
	}

	// Base scales from 1.0 (0 active days) to 2.0 (30 active days)
	base := 1.0 + float64(activeDays)/30.0

	// Intensity: 1 entry/day = 0, 3+ entries/day = 1.0
	avgPerDay := float64(totalEntries) / float64(activeDays)
	intensity := math.Min(1.0, math.Max(0, (avgPerDay-1.0)/2.0))

	// Bonus scales from 0 to 1.0; full bonus requires both full activity AND high intensity
	bonus := (float64(activeDays) / 30.0) * intensity

	result := base + bonus
	if result > 3.0 {
		result = 3.0
	}

	return result, nil
}
