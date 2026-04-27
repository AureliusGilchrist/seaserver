package db

import (
    "errors"
    "fmt"
    "strings"
    "time"

    "gorm.io/gorm"
)

var sqliteBusySubstrings = []string{
    "database is locked",
    "database table is locked",
    "SQLITE_BUSY",
}

// retryOnBusy retries the provided function when SQLite reports the database is locked.
// Returns a friendly error after exhausting attempts.
func retryOnBusy(fn func() error) error {
    var err error
    backoff := 200 * time.Millisecond
    maxBackoff := 3 * time.Second
    for i := 0; i < 8; i++ {
        err = fn()
        if err == nil {
            return nil
        }
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return err
        }
        msg := err.Error()
        for _, sub := range sqliteBusySubstrings {
            if strings.Contains(msg, sub) {
                time.Sleep(backoff)
                backoff *= 2
                if backoff > maxBackoff {
                    backoff = maxBackoff
                }
                goto retry
            }
        }
        return err
    retry:
    }
    return fmt.Errorf("temporary database contention, please retry")
}
