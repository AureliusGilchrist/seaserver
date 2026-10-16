package enmasse

import (
	"os"
	"path/filepath"
)

func resolveProgressFilePath(appDataDir, legacyPath string) string {
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		return legacyPath
	}
	if appDataDir == "" {
		return legacyPath
	}
	return filepath.Join(appDataDir, filepath.Base(legacyPath))
}
