package handlers

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"seanime/internal/util"
	"strconv"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// audioExtractJobs tracks in-progress FFmpeg extractions to avoid duplicate work.
var (
	audioExtractJobs   = make(map[string]chan struct{})
	audioExtractJobsMu sync.Mutex
)

// HandleDirectstreamGetAudio extracts and serves an audio track from a direct-play stream.
//
//	@summary extracts a specific audio track from an MKV file and serves it as AAC.
//	@route /api/v1/directstream/audio [GET]
//	@returns audio/aac file
func (h *Handler) HandleDirectstreamGetAudio(c echo.Context) error {
	streamID := c.QueryParam("id")
	trackStr := c.QueryParam("track")
	if streamID == "" || trackStr == "" {
		return h.RespondWithError(c, fmt.Errorf("id and track query params are required"))
	}

	trackIndex, err := strconv.Atoi(trackStr)
	if err != nil || trackIndex < 0 {
		return h.RespondWithError(c, fmt.Errorf("invalid track index"))
	}

	// Resolve the underlying file path from the stream session
	filePath, err := h.App.DirectStreamManager.GetFilePathByStreamID(streamID)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("could not resolve stream: %w", err))
	}

	// Get FFmpeg path
	ffmpegPath := "ffmpeg"
	if h.App.SecondarySettings.Mediastream != nil && h.App.SecondarySettings.Mediastream.FfmpegPath != "" {
		ffmpegPath = h.App.SecondarySettings.Mediastream.FfmpegPath
	}

	// Build a cache key based on file path + track index
	hash := sha256.Sum256([]byte(filePath))
	cacheKey := fmt.Sprintf("%x_%d", hash[:8], trackIndex)
	cacheDir := filepath.Join(h.App.Config.Cache.Dir, "directstream_audio")
	outputPath := filepath.Join(cacheDir, cacheKey+".aac")

	// If already extracted, serve directly
	if info, sErr := os.Stat(outputPath); sErr == nil && info.Size() > 0 {
		c.Response().Header().Set("Cache-Control", "private, max-age=86400")
		http.ServeFile(c.Response(), c.Request(), outputPath)
		return nil
	}

	// Check if extraction is already in progress
	audioExtractJobsMu.Lock()
	if ch, ok := audioExtractJobs[cacheKey]; ok {
		audioExtractJobsMu.Unlock()
		// Wait for the existing job to finish
		select {
			case <-ch:
				// Done — serve the file
				if info, sErr := os.Stat(outputPath); sErr == nil && info.Size() > 0 {
					c.Response().Header().Set("Cache-Control", "private, max-age=86400")
					http.ServeFile(c.Response(), c.Request(), outputPath)
					return nil
				}
				return h.RespondWithError(c, fmt.Errorf("audio extraction failed"))
			case <-c.Request().Context().Done():
				return nil
		}
	}

	// Start a new extraction job
	doneCh := make(chan struct{})
	audioExtractJobs[cacheKey] = doneCh
	audioExtractJobsMu.Unlock()

	defer func() {
		close(doneCh)
		audioExtractJobsMu.Lock()
		delete(audioExtractJobs, cacheKey)
		audioExtractJobsMu.Unlock()
	}()

	// Create cache directory
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return h.RespondWithError(c, fmt.Errorf("could not create audio cache dir: %w", err))
	}

	// Extract audio track via FFmpeg.
	// Use background context so the browser closing the connection doesn't kill FFmpeg.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	tmpPath := outputPath + ".tmp"
	cmd := util.NewCmdCtx(ctx, ffmpegPath,
		"-i", filePath,
		"-map", fmt.Sprintf("0:a:%d", trackIndex),
		"-c:a", "aac",
		"-b:a", "192k",
		"-f", "adts",
		"-y",
		tmpPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		h.App.Logger.Error().Err(err).Str("output", string(output)).
			Msg("directstream: audio extraction failed")
		_ = os.Remove(tmpPath)
		return h.RespondWithError(c, fmt.Errorf("audio extraction failed: %w", err))
	}

	// Rename temp file to final path atomically
	if err := os.Rename(tmpPath, outputPath); err != nil {
		_ = os.Remove(tmpPath)
		return h.RespondWithError(c, fmt.Errorf("could not finalize audio file: %w", err))
	}

	c.Response().Header().Set("Cache-Control", "private, max-age=86400")
	http.ServeFile(c.Response(), c.Request(), outputPath)
	return nil
}

// HandleMediastreamGetAudio extracts and serves an audio track from a mediastream direct-play session.
//
//	@summary extracts a specific audio track from a mediastream file and serves it as AAC.
//	@route /api/v1/mediastream/audio/:clientId [GET]
//	@returns audio/aac file
func (h *Handler) HandleMediastreamGetAudio(c echo.Context) error {
	clientId := c.Param("clientId")
	trackStr := c.QueryParam("track")
	if clientId == "" || trackStr == "" {
		return h.RespondWithError(c, fmt.Errorf("clientId param and track query param are required"))
	}

	trackIndex, err := strconv.Atoi(trackStr)
	if err != nil || trackIndex < 0 {
		return h.RespondWithError(c, fmt.Errorf("invalid track index"))
	}

	// Resolve the underlying file path from the mediastream session
	filePath, err := h.App.MediastreamRepository.GetFilePathByClientId(clientId)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("could not resolve mediastream: %w", err))
	}

	// Get FFmpeg path
	ffmpegPath := "ffmpeg"
	if h.App.SecondarySettings.Mediastream != nil && h.App.SecondarySettings.Mediastream.FfmpegPath != "" {
		ffmpegPath = h.App.SecondarySettings.Mediastream.FfmpegPath
	}

	// Reuse the same cache directory and deduplication as directstream audio
	hash := sha256.Sum256([]byte(filePath))
	cacheKey := fmt.Sprintf("%x_%d", hash[:8], trackIndex)
	cacheDir := filepath.Join(h.App.Config.Cache.Dir, "directstream_audio")
	outputPath := filepath.Join(cacheDir, cacheKey+".aac")

	// If already extracted, serve directly
	if info, sErr := os.Stat(outputPath); sErr == nil && info.Size() > 0 {
		c.Response().Header().Set("Cache-Control", "private, max-age=86400")
		http.ServeFile(c.Response(), c.Request(), outputPath)
		return nil
	}

	// Check if extraction is already in progress
	audioExtractJobsMu.Lock()
	if ch, ok := audioExtractJobs[cacheKey]; ok {
		audioExtractJobsMu.Unlock()
		select {
			case <-ch:
				if info, sErr := os.Stat(outputPath); sErr == nil && info.Size() > 0 {
					c.Response().Header().Set("Cache-Control", "private, max-age=86400")
					http.ServeFile(c.Response(), c.Request(), outputPath)
					return nil
				}
				return h.RespondWithError(c, fmt.Errorf("audio extraction failed"))
			case <-c.Request().Context().Done():
				return nil
		}
	}

	doneCh := make(chan struct{})
	audioExtractJobs[cacheKey] = doneCh
	audioExtractJobsMu.Unlock()

	defer func() {
		close(doneCh)
		audioExtractJobsMu.Lock()
		delete(audioExtractJobs, cacheKey)
		audioExtractJobsMu.Unlock()
	}()

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return h.RespondWithError(c, fmt.Errorf("could not create audio cache dir: %w", err))
	}

ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	tmpPath := outputPath + ".tmp"
	cmd := util.NewCmdCtx(ctx, ffmpegPath,
		"-i", filePath,
		"-map", fmt.Sprintf("0:a:%d", trackIndex),
		"-c:a", "aac",
		"-b:a", "192k",
		"-f", "adts",
		"-y",
		tmpPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		h.App.Logger.Error().Err(err).Str("output", string(output)).
			Msg("mediastream: audio extraction failed")
		_ = os.Remove(tmpPath)
		return h.RespondWithError(c, fmt.Errorf("audio extraction failed: %w", err))
	}

	if err := os.Rename(tmpPath, outputPath); err != nil {
		_ = os.Remove(tmpPath)
		return h.RespondWithError(c, fmt.Errorf("could not finalize audio file: %w", err))
	}

	c.Response().Header().Set("Cache-Control", "private, max-age=86400")
	http.ServeFile(c.Response(), c.Request(), outputPath)
	return nil
}
