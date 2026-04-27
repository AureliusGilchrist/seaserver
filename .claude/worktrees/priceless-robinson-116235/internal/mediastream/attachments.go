package mediastream

import (
	"errors"
	"net/url"
	"path/filepath"
	"seanime/internal/events"
	"seanime/internal/mediastream/videofile"

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
		return errors.New("could not find subtitles")
	}

	subFilePath, _ = url.PathUnescape(subFilePath)

	return c.File(filepath.Join(retPath, subFilePath))
}
