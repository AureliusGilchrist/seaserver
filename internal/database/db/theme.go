package db

import (
	"errors"
	"seanime/internal/database/models"

	"github.com/goccy/go-json"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GetTheme returns the theme stored in this database, creating the default one when absent.
// The main database holds the install-wide theme; a profile database holds that profile's.
func (db *Database) GetTheme() (*models.Theme, error) {
	db.themeMu.Lock()
	defer db.themeMu.Unlock()

	if db.themeCache != nil {
		return db.themeCache, nil
	}

	var theme models.Theme
	err := db.gormdb.Where("id = ?", 1).First(&theme).Error

	if err != nil {
		// If theme doesn't exist, create a default one
		if errors.Is(err, gorm.ErrRecordNotFound) {
			theme = models.Theme{
				BaseModel: models.BaseModel{ID: 1},
			}
			err = db.gormdb.Create(&theme).Error
			if err != nil {
				db.Logger.Error().Err(err).Msg("db: Failed to create default theme")
				return nil, err
			}
			db.Logger.Debug().Msg("db: Created default theme")
		} else {
			return nil, err
		}
	}

	db.themeCache = &theme

	return &theme, nil
}

// HasTheme reports whether a theme row exists in this database (without creating one).
func (db *Database) HasTheme() bool {
	db.themeMu.Lock()
	cached := db.themeCache != nil
	db.themeMu.Unlock()
	if cached {
		return true
	}
	var count int64
	if err := db.gormdb.Model(&models.Theme{}).Where("id = ?", 1).Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

// GetThemeCopy returns a copy of the theme settings.
func (db *Database) GetThemeCopy() (*models.Theme, error) {
	db.themeMu.Lock()
	cached := db.themeCopyCache
	db.themeMu.Unlock()
	if cached != nil {
		return cached, nil
	}

	theme, err := db.GetTheme()
	if err != nil {
		return nil, err
	}

	marshaledTheme, err := json.Marshal(theme)
	if err != nil {
		return nil, err
	}

	var themeCopy models.Theme
	err = json.Unmarshal(marshaledTheme, &themeCopy)
	if err != nil {
		return nil, err
	}

	db.themeMu.Lock()
	db.themeCopyCache = &themeCopy
	db.themeMu.Unlock()

	return &themeCopy, nil
}

// UpsertTheme updates the theme settings.
func (db *Database) UpsertTheme(settings *models.Theme) (*models.Theme, error) {

	err := db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}).Create(settings).Error

	if err != nil {
		db.Logger.Error().Err(err).Msg("db: Failed to save theme in the database")
		return nil, err
	}

	db.Logger.Debug().Msg("db: Theme saved")

	db.themeMu.Lock()
	db.themeCache = settings
	db.themeCopyCache = nil
	db.themeMu.Unlock()

	return settings, nil

}
