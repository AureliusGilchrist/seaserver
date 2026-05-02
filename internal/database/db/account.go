package db

import (
	"errors"
	"seanime/internal/database/models"

	"gorm.io/gorm/clause"
)

func (db *Database) UpsertAccount(acc *models.Account) (*models.Account, error) {
	err := db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		UpdateAll: true,
	}).Create(acc).Error

	if err != nil {
		db.Logger.Error().Err(err).Msg("Failed to save account in the database")
		return nil, err
	}

	if acc.Username != "" {
		db.accountCache = acc
	} else {
		db.accountCache = nil
	}

	return acc, nil
}

func (db *Database) GetAccount() (*models.Account, error) {

	if db.accountCache != nil {
		return db.accountCache, nil
	}

	var acc models.Account
	err := db.gormdb.Last(&acc).Error
	if err != nil {
		return nil, err
	}
	// Only require a token — Username and Viewer may be absent on first login
	// or if viewer marshaling failed. Blocking on nil Viewer would silently
	// discard a valid token after every backend restart.
	if acc.Token == "" {
		return nil, errors.New("account not found")
	}

	db.accountCache = &acc

	return &acc, err
}

// GetAnilistToken retrieves the AniList token from the account or returns an empty string
func (db *Database) GetAnilistToken() string {
	acc, err := db.GetAccount()
	if err != nil {
		return ""
	}
	return acc.Token
}
