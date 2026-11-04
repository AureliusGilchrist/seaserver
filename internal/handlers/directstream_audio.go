package handlers

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"seanime/internal/util"
	"strconv"
	"strings"
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
// The cached track is AAC in an MP4 container with the index at the front (M4A, faststart).
// It used to be raw ADTS AAC, which has no seek index: the browser guessed where a time lands from
// the bitrate, so every seek of the hidden audio element landed slightly off, differently each time
// and worse the further into the episode — the audio drifted against the picture and the sync loop
// kept seeking it, which sounded like a record being scratched. An indexed file seeks exactly.
//
// A track that is already AAC is copied, which takes seconds. Any other track has to be encoded;
// the first request then gets the encode as it happens, as fragmented MP4 (timestamped, so it also
// seeks exactly), instead of waiting for the whole episode. The faststart copy is made from it
// afterwards and is what later requests get.
func (h *Handler) serveExtractedAudio(c echo.Context, filePath string, trackIndex int, logPrefix string) error {
	ffmpegPath := "ffmpeg"
	ffprobePath := "ffprobe"
	if ms := h.App.SecondarySettings.Mediastream; ms != nil {
		if ms.FfmpegPath != "" {
			ffmpegPath = ms.FfmpegPath
		}
		if ms.FfprobePath != "" {
			ffprobePath = ms.FfprobePath
		}
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

	// finishJob lets the requests waiting on this track go. A streamed encode calls it from the
	// background, once the faststart copy is in place.
	var finishOnce sync.Once
	finishJob := func() {
		finishOnce.Do(func() {
			close(doneCh)
			audioExtractJobsMu.Lock()
			delete(audioExtractJobs, cacheKey)
			audioExtractJobsMu.Unlock()
		})
	}

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		finishJob()
		return h.RespondWithError(c, fmt.Errorf("could not create audio cache dir: %w", err))
	}
	// The old unseekable ADTS copy of this track, if one is still cached.
	_ = os.Remove(filepath.Join(cacheDir, cacheKey+".aac"))

	// Background context so the browser closing the connection doesn't kill FFmpeg.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)

	if probeAudioCodec(ctx, ffprobePath, filePath, trackIndex) == "aac" {
		err := copyAudioTrack(ctx, ffmpegPath, filePath, trackIndex, outputPath)
		if err == nil {
			cancel()
			finishJob()
			return serve()
		}
		// Copy failed (an AAC variant the mp4 muxer won't take): encode it like any other track.
		h.App.Logger.Warn().Err(err).Msg(logPrefix + ": audio copy failed, encoding instead")
	}

	sent, err := streamAudioEncode(ctx, c.Response(), c.Request().Context().Done(), ffmpegPath, filePath, trackIndex, outputPath,
		func(err error) {
			h.App.Logger.Warn().Err(err).Msg(logPrefix + ": could not remux audio to faststart, keeping the fragmented copy")
		},
		func() {
			cancel()
			finishJob()
		})
	if err != nil {
		h.App.Logger.Error().Err(err).Msg(logPrefix + ": audio extraction failed")
		if !sent {
			return h.RespondWithError(c, fmt.Errorf("audio extraction failed: %w", err))
		}
		// The client already has part of the track; cutting the response short tells it.
		panic(http.ErrAbortHandler)
	}
	return nil
}

// audioExtractArgs are the ffmpeg arguments picking one audio track out of filePath.
func audioExtractArgs(filePath string, trackIndex int, codecArgs []string, output ...string) []string {
	args := []string{
		"-hide_banner", "-nostats", "-loglevel", "error",
		"-threads", "0",
		"-i", filePath,
		"-map", fmt.Sprintf("0:a:%d", trackIndex),
		"-vn", "-sn", "-dn",
	}
	args = append(args, codecArgs...)
	return append(args, output...)
}

// probeAudioCodec returns the codec of the trackIndex-th audio stream, or "" if ffprobe can't tell.
func probeAudioCodec(ctx context.Context, ffprobePath, filePath string, trackIndex int) string {
	probeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	out, err := util.NewCmdCtx(probeCtx, ffprobePath, "-v", "error",
		"-select_streams", fmt.Sprintf("a:%d", trackIndex),
		"-show_entries", "stream=codec_name",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filePath).Output()
	if err != nil {
		return ""
	}
	codec, _, _ := strings.Cut(strings.TrimSpace(string(out)), "\n")
	return strings.TrimSpace(codec)
}

// copyAudioTrack copies an AAC track as it is into the faststart M4A at outputPath.
func copyAudioTrack(ctx context.Context, ffmpegPath, filePath string, trackIndex int, outputPath string) error {
	tmpPath := outputPath + ".tmp"
	output, err := util.NewCmdCtx(ctx, ffmpegPath, audioExtractArgs(filePath, trackIndex, []string{"-c:a", "copy"},
		"-f", "mp4", "-movflags", "+faststart", "-y", tmpPath)...).CombinedOutput()
	if err == nil {
		err = os.Rename(tmpPath, outputPath)
	} else {
		err = fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
	}
	if err != nil {
		_ = os.Remove(tmpPath)
	}
	return err
}

// streamAudioEncode encodes the track to AAC and sends it to w while it is being encoded, as
// fragmented MP4, writing the same bytes to disk: the client can start playing after the first
// fragment instead of after the whole episode. A client that goes away (clientGone) does not stop
// the encode. When the encode succeeds, the fragments are remuxed (no re-encode) in the background
// into the faststart M4A at outputPath that later requests are served; done runs after that, or
// right away when the encode fails. sent reports whether any of the response was written.
func streamAudioEncode(
	ctx context.Context,
	w *echo.Response,
	clientGone <-chan struct{},
	ffmpegPath, filePath string,
	trackIndex int,
	outputPath string,
	onRemuxFailed func(error),
	done func(),
) (sent bool, err error) {
	fragPath := outputPath + ".frag.tmp"
	tmpPath := outputPath + ".tmp"
	finished := false
	defer func() {
		if !finished {
			_ = os.Remove(fragPath)
			_ = os.Remove(tmpPath)
			done()
		}
	}()

	frag, err := os.Create(fragPath)
	if err != nil {
		return false, fmt.Errorf("could not create audio file: %w", err)
	}

	cmd := util.NewCmdCtx(ctx, ffmpegPath, audioExtractArgs(filePath, trackIndex,
		[]string{"-c:a", "aac", "-b:a", "192k"},
		"-f", "mp4",
		// empty_moov makes it playable from the first fragment, and a fragment every second gets
		// the first audio to the client right away.
		"-movflags", "+frag_keyframe+empty_moov+default_base_moof",
		"-frag_duration", "1000000",
		"pipe:1")...)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err == nil {
		err = cmd.Start()
	}
	if err != nil {
		_ = frag.Close()
		return false, fmt.Errorf("could not start ffmpeg: %w", err)
	}

	clientOK := true
	buf := make([]byte, 64*1024)
	var copyErr error
	for {
		n, rErr := stdout.Read(buf)
		if n > 0 {
			if _, wErr := frag.Write(buf[:n]); wErr != nil {
				copyErr = wErr
				break
			}
			if clientOK {
				select {
				case <-clientGone:
					clientOK = false
				default:
				}
			}
			if clientOK {
				if !sent {
					w.Header().Set("Content-Type", "audio/mp4")
					// This response is the fragmented stream; the cached faststart copy replaces it.
					w.Header().Set("Cache-Control", "no-store")
					w.WriteHeader(http.StatusOK)
					sent = true
				}
				if _, wErr := w.Write(buf[:n]); wErr != nil {
					clientOK = false
				} else {
					w.Flush()
				}
			}
		}
		if rErr != nil {
			if !errors.Is(rErr, io.EOF) {
				copyErr = rErr
			}
			break
		}
	}
	if copyErr != nil {
		_ = cmd.Process.Kill()
		_, _ = io.Copy(io.Discard, stdout)
	}
	waitErr := cmd.Wait()
	_ = frag.Close()
	if copyErr == nil && waitErr != nil {
		copyErr = fmt.Errorf("%w: %s", waitErr, strings.TrimSpace(stderr.String()))
	}
	if copyErr != nil {
		return sent, copyErr
	}
	if !sent && clientOK {
		return false, errors.New("ffmpeg produced no audio")
	}

	// The response is complete; make the indexed copy without holding it open.
	finished = true
	go func() {
		defer done()
		output, err := util.NewCmdCtx(ctx, ffmpegPath,
			"-hide_banner", "-nostats", "-loglevel", "error",
			"-i", fragPath, "-c", "copy", "-f", "mp4", "-movflags", "+faststart", "-y", tmpPath).CombinedOutput()
		if err == nil {
			err = os.Rename(tmpPath, outputPath)
		} else {
			err = fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
		}
		if err != nil {
			// The fragments are timestamped and seek exactly too; keep them rather than encode again.
			onRemuxFailed(err)
			_ = os.Remove(tmpPath)
			if err := os.Rename(fragPath, outputPath); err != nil {
				_ = os.Remove(fragPath)
			}
			return
		}
		_ = os.Remove(fragPath)
	}()
	return sent, nil
}
