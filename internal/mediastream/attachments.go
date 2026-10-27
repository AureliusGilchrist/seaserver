package mediastream

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"seanime/internal/events"
	"seanime/internal/mediastream/videofile"
	"time"

	"github.com/labstack/echo/v4"
)

func (r *Repository) ServeEchoExtractedSubtitles(c echo.Context, clientId string) error {

	if !r.IsInitialized() {
		r.wsEventManager.SendEvent(events.MediastreamShutdownStream, "Module not initialized")
		return errors.New("module not initialized")
	}

	if !r.TranscoderIsInitialized() {
		r.wsEventManager.SendEvent(events.MediastreamShutdownStream, "Transcoder not initialized")
		return errors.New("transcoder not initialized")
	}

	// Get the parameter group
	subFilePath := c.Param("*")

	// Get current media for this client
	mediaContainer, found := r.playbackManager.GetActiveStream(clientId)
	if !found {
		return errors.New("no file has been loaded for this client")
	}

	retPath := videofile.GetFileSubsCacheDir(r.cacheDir, mediaContainer.Hash)

	if retPath == "" {
		return errors.New("could not find subtitles")
	}

	// Wait for the background extraction to finish. A file on disk proves nothing while it runs:
	// ffmpeg creates each subtitle file as it starts and fills it as it reads through the whole
	// video, so serving it early handed the player the first part of the track only. And the
	// extraction can take far longer than the 10 seconds this used to allow (a large file on a
	// NAS), after which the request failed and the track stayed empty.
	if status, ok := r.playbackManager.GetExtractionStatus(mediaContainer.Hash); ok {
		if !status.Wait(c.Request().Context(), extractionMaxWait) {
			return errors.New("subtitles not ready")
		}
		// An attachment (font) failure is deliberately not consulted here — the two are
		// extracted independently, and a missing font degrades styling rather than removing
		// the subtitles.
		if extractionErr, failed := status.SubsFailure(); failed {
			return fmt.Errorf("subtitle extraction failed: %w", extractionErr)
		}
	}
	if !waitForFile(filepath.Join(retPath, subFilePath), 2*time.Second) {
		return errors.New("subtitles not ready")
	}

	r.logger.Trace().Msgf("mediastream: Serving subtitles from %s", retPath)

	return c.File(filepath.Join(retPath, subFilePath))
}

func (r *Repository) ServeEchoExtractedAttachments(c echo.Context, clientId string) error {
	if !r.IsInitialized() {
		r.wsEventManager.SendEvent(events.MediastreamShutdownStream, "Module not initialized")
		return errors.New("module not initialized")
	}

	if !r.TranscoderIsInitialized() {
		r.wsEventManager.SendEvent(events.MediastreamShutdownStream, "Transcoder not initialized")
		return errors.New("transcoder not initialized")
	}

	// Get the parameter group
	subFilePath := c.Param("*")

	// Get current media for this client
	mediaContainer, found := r.playbackManager.GetActiveStream(clientId)
	if !found {
		return errors.New("no file has been loaded for this client")
	}

	retPath := videofile.GetFileAttCacheDir(r.cacheDir, mediaContainer.Hash)

	if retPath == "" {
		return errors.New("could not find attachments")
	}

	// Same as the subtitles: wait for the extraction, then fail fast if it failed.
	if status, ok := r.playbackManager.GetExtractionStatus(mediaContainer.Hash); ok {
		if !status.Wait(c.Request().Context(), extractionMaxWait) {
			return errors.New("attachments not ready")
		}
		if extractionErr, failed := status.Failure(); failed {
			return fmt.Errorf("attachment extraction failed: %w", extractionErr)
		}
	}
	if !waitForFile(filepath.Join(retPath, subFilePath), 2*time.Second) {
		return errors.New("attachments not ready")
	}

	subFilePath, _ = url.PathUnescape(subFilePath)

	return c.File(filepath.Join(retPath, subFilePath))
}

// extractionMaxWait bounds how long a /subs/ or /att/ request waits for a running extraction.
// Reading a whole large file over a NAS can take minutes; the player cancels its own request if
// the stream is closed first.
const extractionMaxWait = 3 * time.Minute

// waitForFile reports whether the file exists, checking for up to maxWait.
func waitForFile(path string, maxWait time.Duration) bool {
	deadline := time.Now().Add(maxWait)
	for {
		if _, err := os.Stat(path); err == nil {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(100 * time.Millisecond)
	}
}
