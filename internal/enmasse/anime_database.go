package enmasse

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// The anime list the en masse downloader walks is the anime-offline-database (manami-project).
// It is fetched from its latest release when the file is missing or older than a week, so the
// downloader works on a fresh server without anyone placing the file by hand.

const (
	animeDatabaseURL    = "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json"
	animeDatabaseMaxAge = 7 * 24 * time.Hour
)

// animeDatabaseMinSize rules out an error page or a truncated download (the file is ~60 MB).
// A variable so tests can use a small file.
var animeDatabaseMinSize int64 = 1 << 20

// animeDatabaseHTTP is replaced in tests.
var animeDatabaseHTTP = &http.Client{Timeout: 5 * time.Minute}

// ensureAnimeDatabase makes sure the anime list is on disk, downloading it when it is missing or
// stale. A stale file is kept when the download fails; a missing one is an error.
func (d *Downloader) ensureAnimeDatabase(ctx context.Context) error {
	path := GlobalAnimeOfflineDatabasePath
	st, statErr := os.Stat(path)
	if statErr == nil && time.Since(st.ModTime()) < animeDatabaseMaxAge && st.Size() >= animeDatabaseMinSize {
		return nil
	}

	d.setStatus("Downloading the anime database...")
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "loading"
		details.Step = "downloading the anime database"
	})
	err := downloadAnimeDatabase(ctx, animeDatabaseURL, path)
	if err == nil {
		d.logger.Info().Str("path", path).Msg("enmasse-anime: Downloaded the anime database")
		return nil
	}
	if statErr == nil {
		d.logger.Warn().Err(err).Msg("enmasse-anime: Could not refresh the anime database; using the one on disk")
		return nil
	}
	return fmt.Errorf("the anime database is missing (%s) and could not be downloaded: %w", path, err)
}

func downloadAnimeDatabase(ctx context.Context, url string, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Seanime")
	resp, err := animeDatabaseHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download answered HTTP %d", resp.StatusCode)
	}

	tmp := path + ".download"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	n, copyErr := io.Copy(f, resp.Body)
	closeErr := f.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(tmp)
		return errors.Join(copyErr, closeErr)
	}
	if n < animeDatabaseMinSize {
		_ = os.Remove(tmp)
		return fmt.Errorf("the download was only %d bytes", n)
	}
	// Only a file that parses replaces the one in place.
	if err := checkAnimeDatabase(tmp); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

func checkAnimeDatabase(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	var db AnimeOfflineDatabase
	if err := json.NewDecoder(f).Decode(&db); err != nil {
		return fmt.Errorf("the downloaded anime database is not valid: %w", err)
	}
	if len(db.Data) == 0 {
		return errors.New("the downloaded anime database has no entries")
	}
	return nil
}
