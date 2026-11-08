package enmasse

import (
	"os"
	"path/filepath"
	"testing"
)

// TestMain keeps the tests' progress and results files in a temporary folder, away from the
// server's real paths.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "enmasse-test")
	if err != nil {
		panic(err)
	}
	AnimeProgressFilePath = filepath.Join(dir, "progress.json")
	AnimeResultsFilePath = filepath.Join(dir, "results.jsonl")
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}
