package db

import (
	"errors"
	"seanime/internal/database/models"
)

// SaveKitsuAccount upserts the per-profile Kitsu account. ProfileID is the unique key (each user
// has at most one Kitsu row at a time), so an `OnConflict` clause writes a new row when the user
// has none and rewrites the existing one when they do.
//
// Empty incoming fields overwrite, all the same, unlike the planning-slut save above — a profile
// account is fully replaced on token refresh because the user is logging in again from scratch.
func (db *Database) SaveKitsuAccount(in *models.KitsuAccount) (*models.KitsuAccount, error) {
	if in == nil {
		return nil, errors.New("db: nil kitsu account")
	}
	if in.ProfileID == 0 {
		return nil, errors.New("db: profile id required")
	}

	var existing models.KitsuAccount
	err := db.gormdb.Where("profile_id = ?", in.ProfileID).First(&existing).Error
	if err != nil {
		// No row — create one. The DB may not have generated an ID before insert so do not rely on
		// the caller passing one in.
		in.ID = 0
		err = db.gormdb.Create(in).Error
		if err != nil {
			return nil, err
		}
		return in, nil
	}

	in.ID = existing.ID
	err = db.gormdb.Save(in).Error
	if err != nil {
		return nil, err
	}
	return in, nil
}

// GetKitsuAccountByProfileID returns the per-profile Kitsu row, or (nil, nil) when no account is
// associated. Same pattern as GetPlanningSlutToken — absence is not an error.
func (db *Database) GetKitsuAccountByProfileID(profileID uint) (*models.KitsuAccount, error) {
	if profileID == 0 {
		return nil, nil
	}
	var m models.KitsuAccount
	err := db.gormdb.Where("profile_id = ?", profileID).First(&m).Error
	if err != nil {
		return nil, nil
	}
	return &m, nil
}

// DeleteKitsuAccount removes the per-profile Kitsu row. Idempotent — deleting a profile with no
// row already returns nil so the call site does not need to check first.
func (db *Database) DeleteKitsuAccount(profileID uint) error {
	return db.gormdb.Where("profile_id = ?", profileID).Delete(&models.KitsuAccount{}).Error
}

// ListKitsuAccounts returns every Kitsu account row. Used by the platform layer to refresh all
// users at startup, on a shared-account write, and on a cron tick.
func (db *Database) ListKitsuAccounts() ([]*models.KitsuAccount, error) {
	var out []*models.KitsuAccount
	err := db.gormdb.Find(&out).Error
	if err != nil {
		return nil, err
	}
	return out, nil
}
