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
//	@summary extracts a specific audio track from an MKV file and serves it as AAC in an MP4 (M4A) container.
//	@route /api/v1/directstream/audio [GET]
//	@returns audio/mp4 file
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

	return h.serveExtractedAudio(c, filePath, trackIndex, "directstream")
}

// HandleMediastreamGetAudio extracts and serves an audio track from a mediastream direct-play session.
//
//	@summary extracts a specific audio track from a mediastream file and serves it as AAC in an MP4 (M4A) container.
//	@route /api/v1/mediastream/audio/:clientId [GET]
//	@returns audio/mp4 file
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

	return h.serveExtractedAudio(c, filePath, trackIndex, "mediastream")
}

// serveExtractedAudio extracts one audio track of a file with FFmpeg (once, cached on disk) and
// serves it with range support.
//
// The track is written as AAC in an MP4 container with the index at the front (M4A, faststart).
// It used to be raw ADTS AAC, which has no seek index: the browser guessed where a time lands from
// the bitrate, so every seek of the hidden audio element landed slightly off, differently each time
// and worse the further into the episode — the audio drifted against the picture and the sync loop
// kept seeking it, which sounded like a record being scratched. An indexed file seeks exactly.
func (h *Handler) serveExtractedAudio(c echo.Context, filePath string, trackIndex int, logPrefix string) error {
	ffmpegPath := "ffmpeg"
	if h.App.SecondarySettings.Mediastream != nil && h.App.SecondarySettings.Mediastream.FfmpegPath != "" {
		ffmpegPath = h.App.SecondarySettings.Mediastream.FfmpegPath
	}

	// Cache key: file path + track index. Directstream and mediastream share the cache.
	hash := sha256.Sum256([]byte(filePath))
	cacheKey := fmt.Sprintf("%x_%d", hash[:8], trackIndex)
	cacheDir := filepath.Join(h.App.Config.Cache.Dir, "directstream_audio")
	outputPath := filepath.Join(cacheDir, cacheKey+".m4a")

	serve := func() error {
		c.Response().Header().Set("Cache-Control", "private, max-age=86400")
		c.Response().Header().Set("Content-Type", "audio/mp4")
		http.ServeFile(c.Response(), c.Request(), outputPath)
		return nil
	}

	// Already extracted
	if info, sErr := os.Stat(outputPath); sErr == nil && info.Size() > 0 {
		return serve()
	}

	// An extraction of the same track already running: wait for it.
	audioExtractJobsMu.Lock()
	if ch, ok := audioExtractJobs[cacheKey]; ok {
		audioExtractJobsMu.Unlock()
		select {
		case <-ch:
			if info, sErr := os.Stat(outputPath); sErr == nil && info.Size() > 0 {
				return serve()
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

	// Background context so the browser closing the connection doesn't kill FFmpeg.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	tmpPath := outputPath + ".tmp"
	cmd := util.NewCmdCtx(ctx, ffmpegPath,
		"-i", filePath,
		"-map", fmt.Sprintf("0:a:%d", trackIndex),
		"-vn", "-sn", "-dn",
		"-c:a", "aac",
		"-b:a", "192k",
		"-f", "mp4",
		"-movflags", "+faststart",
		"-y",
		tmpPath,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		h.App.Logger.Error().Err(err).Str("output", string(output)).
			Msg(logPrefix + ": audio extraction failed")
		_ = os.Remove(tmpPath)
		return h.RespondWithError(c, fmt.Errorf("audio extraction failed: %w", err))
	}

	if err := os.Rename(tmpPath, outputPath); err != nil {
		_ = os.Remove(tmpPath)
		return h.RespondWithError(c, fmt.Errorf("could not finalize audio file: %w", err))
	}
	// The old unseekable ADTS copy of this track, if one is still cached.
	_ = os.Remove(filepath.Join(cacheDir, cacheKey+".aac"))

	return serve()
}
