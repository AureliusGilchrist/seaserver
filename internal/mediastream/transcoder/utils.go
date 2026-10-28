package transcoder

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/goccy/go-json"
	"github.com/rs/zerolog"
)

func ParseSegment(segment string) (int32, error) {
	var ret int32
	_, err := fmt.Sscanf(segment, "segment-%d.ts", &ret)
	if err != nil {
		return 0, errors.New("could not parse segment")
	}
	return ret, nil
}

func getSavedInfo[T any](savePath string, mi *T) error {
	savedFile, err := os.Open(savePath)
	if err != nil {
		return err
	}
	saved, err := io.ReadAll(savedFile)
	if err != nil {
		return err
	}
	err = json.Unmarshal(saved, mi)
	if err != nil {
		return err
	}
	return nil
}

func saveInfo[T any](savePath string, mi *T) error {
	content, err := json.Marshal(*mi)
	if err != nil {
		return err
	}
	// create directory if it doesn't exist
	_ = os.MkdirAll(filepath.Dir(savePath), 0755)
	return os.WriteFile(savePath, content, 0666)
}

func printExecTime(logger *zerolog.Logger, message string, args ...any) func() {
	msg := fmt.Sprintf(message, args...)
	start := time.Now()
	logger.Trace().Msgf("transcoder: Running %s", msg)

	return func() {
		logger.Trace().Msgf("transcoder: %s finished in %s", msg, time.Since(start))
	}
}

// removeDirInBackground deletes dir without making the caller wait. The directory is first renamed
// out of the way (fast, and the path is free again at once for a new stream of the same file), then
// deleted; if the rename fails (files still open on Windows) it is deleted in place.
func removeDirInBackground(dir string) {
	if _, err := os.Stat(dir); err != nil {
		return
	}
	trash := fmt.Sprintf("%s.trash-%d", dir, time.Now().UnixNano())
	if err := os.Rename(dir, trash); err != nil {
		trash = dir
	}
	go func() {
		_ = os.RemoveAll(trash)
	}()
}
