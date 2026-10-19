package mediastream

import (
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"seanime/internal/events"
	"seanime/internal/mediastream/videofile"
	"os"
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

	// If the background extraction already failed, fail fast instead of making the
	// client wait for files that will never appear.
	if status, ok := r.playbackManager.GetExtractionStatus(mediaContainer.Hash); ok {
		if extractionErr, failed := status.Failure(); failed {
			return fmt.Errorf("subtitle extraction failed: %w", extractionErr)
		}
	}

	// Wait for extraction to complete (files should appear within a few seconds).
	const maxWait = 10 * time.Second
	start := time.Now()
	for {
		fullPath := filepath.Join(retPath, subFilePath)
		if _, err := os.Stat(fullPath); err == nil {
			break
		}
		if time.Since(start) > maxWait {
			return errors.New("subtitles not ready")
		}
		time.Sleep(200 * time.Millisecond)
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

	// If the background extraction already failed, fail fast instead of making the
	// client wait for files that will never appear.
	if status, ok := r.playbackManager.GetExtractionStatus(mediaContainer.Hash); ok {
		if extractionErr, failed := status.Failure(); failed {
			return fmt.Errorf("attachment extraction failed: %w", extractionErr)
		}
	}

	// Wait for extraction to complete (attachments should appear within a few seconds).
	const maxWait = 10 * time.Second
	start := time.Now()
	for {
		fullPath := filepath.Join(retPath, subFilePath)
		if _, err := os.Stat(fullPath); err == nil {
			break
		}
		if time.Since(start) > maxWait {
			return errors.New("attachments not ready")
		}
		time.Sleep(200 * time.Millisecond)
	}

	subFilePath, _ = url.PathUnescape(subFilePath)

	return c.File(filepath.Join(retPath, subFilePath))
}
