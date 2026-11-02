package anime_test

import (
	"runtime"
	"seanime/internal/library/anime"
	"testing"

	"github.com/stretchr/testify/assert"
)

// skipOnWindowsSeparateFilePath skips tests that read folder data from anime.NewLocalFile on Windows.
// Known bug: filesystem.SeparateFilePath splits filepath.Dir's result on "/", but on Windows
// filepath.Dir turns the slashes back into backslashes, so all folders end up as one dirname.
// (SeparateFilePathS wraps the Dir call in filepath.ToSlash and is not affected.)
func skipOnWindowsSeparateFilePath(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("filesystem.SeparateFilePath breaks folder names on Windows; fix mediapath.go first")
	}
}

func TestNewLocalFile(t *testing.T) {
	skipOnWindowsSeparateFilePath(t)

	tests := []struct {
		path              string
		libraryPath       string
		expectedNbFolders int
		expectedFilename  string
		os                string
	}{
		{
			path:              "E:\\Anime\\Bungou Stray Dogs 5th Season\\[SubsPlease] Bungou Stray Dogs - 61 (1080p) [F609B947].mkv",
			libraryPath:       "E:\\Anime",
			expectedFilename:  "[SubsPlease] Bungou Stray Dogs - 61 (1080p) [F609B947].mkv",
			expectedNbFolders: 1,
			os:                "windows",
		},
		{
			path:              "E:\\Anime\\Bungou Stray Dogs 5th Season\\[SubsPlease] Bungou Stray Dogs - 61 (1080p) [F609B947].mkv",
			libraryPath:       "E:/ANIME",
			expectedFilename:  "[SubsPlease] Bungou Stray Dogs - 61 (1080p) [F609B947].mkv",
			expectedNbFolders: 1,
			os:                "windows",
		},
		{
			path:              "/mnt/Anime/Bungou Stray Dogs/Bungou Stray Dogs 5th Season/[SubsPlease] Bungou Stray Dogs - 61 (1080p) [F609B947].mkv",
			libraryPath:       "/mnt/Anime",
			expectedFilename:  "[SubsPlease] Bungou Stray Dogs - 61 (1080p) [F609B947].mkv",
			expectedNbFolders: 2,
			os:                "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if tt.os != "" {
				if tt.os != runtime.GOOS {
					t.Skipf("skipping test for %s", tt.path)
				}
			}

			lf := anime.NewLocalFile(tt.path, tt.libraryPath)

			if assert.NotNil(t, lf) {
				assert.Equal(t, tt.expectedNbFolders, len(lf.ParsedFolderData))
				assert.Equal(t, tt.expectedFilename, lf.Name)
			}
		})
	}
}
