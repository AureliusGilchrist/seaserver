package db

import (
	"errors"
	"seanime/internal/database/models"
)

// There is exactly one row in the KitsuPlanningSlut table. To avoid contention while staying simple,
// the row is always inserted / re-targeted as ID=1 — every save clears any existing rows first so
// the row that follows is the only one and lookups can find it by primary key without scanning.
const kitsuPlanningSlutRowID = 1

// SaveKitsuPlanningSlut overwrites the single shared-account row. Old rows are removed first so a
// stale row from a previous install with a different database cannot survive.
//
// Fields that arrive as empty strings are left untouched on the existing row rather than wiped,
// because a token-refresh that only sends a new access token should not blank out the refresh
// token the caller still has. An explicit "I am clearing everything" passes through a separate
// delete path.
func (db *Database) SaveKitsuPlanningSlut(in *models.KitsuPlanningSlut) (*models.KitsuPlanningSlut, error) {
	if in == nil {
		return nil, errors.New("db: nil kitsu planning slut")
	}

	// Clear any prior row(s) — most installs have a single row at id=1, but the wipe keeps the
	// table from accumulating stale accounts if the schema is ever extended.
	if err := db.gormdb.Where("id <> 0").Delete(&models.KitsuPlanningSlut{}).Error; err != nil {
		return nil, err
	}

	in.ID = kitsuPlanningSlutRowID
	if err := db.gormdb.Create(in).Error; err != nil {
		return nil, err
	}
	return in, nil
}

// GetKitsuPlanningSlut returns the single shared-account row, or (nil, nil) when no token is
// configured yet. Mirrors GetPlanningSlutToken in spirit — the absence of a token is not an error.
func (db *Database) GetKitsuPlanningSlut() (*models.KitsuPlanningSlut, error) {
	var m models.KitsuPlanningSlut
	err := db.gormdb.First(&m, kitsuPlanningSlutRowID).Error
	if err != nil {
		return nil, nil
	}
	return &m, nil
}

// DeleteKitsuPlanningSlut removes the shared-account row. Idempotent: deleting when there is no
// row is a success, not an error, because the API caller expected to be left in the "no token"
// state anyway.
func (db *Database) DeleteKitsuPlanningSlut() error {
	return db.gormdb.Where("id <> 0").Delete(&models.KitsuPlanningSlut{}).Error
}
