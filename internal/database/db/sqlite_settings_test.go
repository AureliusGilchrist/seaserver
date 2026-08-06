package db

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// closeWhenDone releases the connection pool at the end of the test. Windows refuses to remove
// the temporary directory while the database file is still open.
func closeWhenDone(t *testing.T, db *gorm.DB) {
	t.Helper()
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
}

// The DSN spelling is driver-specific and fails silently when it is wrong: github.com/glebarez/sqlite
// discards every parameter it does not recognise, so a mis-spelled pragma leaves the database on
// SQLite's defaults and the only symptom is intermittent "database is locked" errors under load.
// This asserts the settings actually reach the connection.
func TestSQLitePragmasAreApplied(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	db, err := gorm.Open(sqlite.Open(sqliteDSN(path)), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	closeWhenDone(t, db)

	t.Run("journal_mode is WAL", func(t *testing.T) {
		var journalMode string
		if err := db.Raw("PRAGMA journal_mode").Scan(&journalMode).Error; err != nil {
			t.Fatalf("read journal_mode: %v", err)
		}
		// Without WAL a writer locks out every reader, which is what produced the lock failures.
		if !strings.EqualFold(journalMode, "wal") {
			t.Errorf("journal_mode = %q, want wal", journalMode)
		}
	})

	t.Run("busy_timeout is honoured", func(t *testing.T) {
		var busyTimeout int
		if err := db.Raw("PRAGMA busy_timeout").Scan(&busyTimeout).Error; err != nil {
			t.Fatalf("read busy_timeout: %v", err)
		}
		// 5000 is the driver's hardcoded default — seeing it means the DSN was ignored.
		if busyTimeout != 30000 {
			t.Errorf("busy_timeout = %d, want 30000 (5000 means the DSN was discarded)", busyTimeout)
		}
	})

	t.Run("synchronous is NORMAL", func(t *testing.T) {
		var synchronous int
		if err := db.Raw("PRAGMA synchronous").Scan(&synchronous).Error; err != nil {
			t.Fatalf("read synchronous: %v", err)
		}
		if synchronous != 1 { // 0=OFF, 1=NORMAL, 2=FULL
			t.Errorf("synchronous = %d, want 1 (NORMAL)", synchronous)
		}
	})

	t.Run("foreign_keys are on", func(t *testing.T) {
		var foreignKeys int
		if err := db.Raw("PRAGMA foreign_keys").Scan(&foreignKeys).Error; err != nil {
			t.Fatalf("read foreign_keys: %v", err)
		}
		if foreignKeys != 1 {
			t.Errorf("foreign_keys = %d, want 1", foreignKeys)
		}
	})
}

// Every connection in the pool runs the pragmas independently, so a second connection must be
// configured the same way as the first.
func TestSQLitePragmasApplyToEveryConnection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	db, err := gorm.Open(sqlite.Open(sqliteDSN(path)), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	closeWhenDone(t, db)

	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("get sql.DB: %v", err)
	}
	sqlDB.SetMaxOpenConns(2)

	// Hold one connection open so the second query is forced onto a different one.
	held, err := sqlDB.Conn(t.Context())
	if err != nil {
		t.Fatalf("acquire connection: %v", err)
	}
	defer held.Close()

	var busyTimeout int
	if err := sqlDB.QueryRow("PRAGMA busy_timeout").Scan(&busyTimeout); err != nil {
		t.Fatalf("read busy_timeout: %v", err)
	}
	if busyTimeout != 30000 {
		t.Errorf("busy_timeout on second connection = %d, want 30000", busyTimeout)
	}
}
