package videofile

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"seanime/internal/util"
	"seanime/internal/util/crashlog"

	"github.com/rs/zerolog"
)

func GetFileSubsCacheDir(outDir string, hash string) string {
	return filepath.Join(outDir, "videofiles", hash, "/subs")
}

func GetFileAttCacheDir(outDir string, hash string) string {
	return filepath.Join(outDir, "videofiles", hash, "/att")
}

// runFfmpeg runs an ffmpeg command and returns (capturedOutput, err).
// The combined output is captured so callers can surface ffmpeg's own error
// message in the main log — "exit status 234" alone is undiagnosable.
var lastFfmpegOutput struct {
	mu     sync.Mutex
	output string
}

func runFfmpeg(ffmpegPath string, dir string, args []string) (string, error) {
	// Instantiate a new crash logger
	crashLogger := crashlog.GlobalCrashLogger.InitArea("ffmpeg")
	defer crashLogger.Close()

	crashLogger.LogInfof("%s %s", ffmpegPath, strings.Join(args, " "))

	cmd := util.NewCmdCtx(context.Background(), ffmpegPath, args...)
	cmd.Dir = dir

	var output bytes.Buffer
	cmd.Stdout = crashLogger.Stdout()
	cmd.Stderr = &output

	err := cmd.Run()
	if err != nil {
		crashlog.GlobalCrashLogger.WriteAreaLogToFile(crashLogger)
		// Remember the output so ExtractAttachment can surface ffmpeg's own error
		// message in the main log — an exit code alone ("exit status 234") is
		// undiagnosable.
		lastFfmpegOutput.mu.Lock()
		lastFfmpegOutput.output = output.String()
		lastFfmpegOutput.mu.Unlock()
		return output.String(), err
	}

	return output.String(), nil
}

// logFfmpegVersion logs the first line of `ffmpeg -version` once per process so that
// extraction issues can be matched against the binary actually in use (distro builds
// vary wildly in supported options and codecs).
var ffmpegVersionOnce sync.Once

// LogFfmpegVersion logs the ffmpeg version once per process. Safe to call from
// multiple places; only the first call runs the command.
func LogFfmpegVersion(ffmpegPath string, logger *zerolog.Logger) {
	logFfmpegVersion(ffmpegPath, logger)
}

func logFfmpegVersion(ffmpegPath string, logger *zerolog.Logger) {
	ffmpegVersionOnce.Do(func() {
		cmd := util.NewCmdCtx(context.Background(), ffmpegPath, "-version")
		out, err := cmd.Output()
		if err != nil {
			logger.Warn().Err(err).Msg("videofile: Could not determine ffmpeg version")
			return
		}
		firstLine, _, _ := strings.Cut(strings.TrimSpace(string(out)), "\n")
		logger.Info().Str("version", firstLine).Msg("videofile: Using ffmpeg")
	})
}

// extractSubtitles stream-copies the subtitle tracks of the file to <subsPath>/<index>.<ext>.
func extractSubtitles(ffmpegPath, path, subsPath string, mediaInfo *MediaInfo) error {
	args := []string{
		"-nostdin",
		"-y",
		"-i", path,
	}
	for _, sub := range mediaInfo.Subtitles {
		if ext := sub.Extension; ext != nil && *ext != "" {
			args = append(args,
				"-map", fmt.Sprintf("0:s:%d", sub.Index),
				"-c:s", "copy",
				fmt.Sprintf("%s/%d.%s", subsPath, sub.Index, *ext),
			)
		}
	}

	_, err := runFfmpeg(ffmpegPath, subsPath, args)
	return err
}

// extractAttachments dumps embedded font/attachment files to <attachmentPath> using the
// attachment's own filename tag.
func extractAttachments(ffmpegPath, path, attachmentPath string) error {
	args := []string{
		"-nostdin",
		// dump every attachment to its embedded filename, relative to the working directory
		"-dump_attachment:t", "",
		// override old attachments
		"-y",
		"-i", path,
	}
	// ffmpeg requires at least one output file; send the (copied) streams to null
	args = append(args, "-map", "0", "-c", "copy", "-f", "null", os.DevNull)

	_, err := runFfmpeg(ffmpegPath, attachmentPath, args)
	return err
}

func ExtractAttachment(ffmpegPath string, path string, hash string, mediaInfo *MediaInfo, cacheDir string, logger *zerolog.Logger) (err error) {
	logger.Debug().Str("hash", hash).Msgf("videofile: Starting media attachment extraction")

	logFfmpegVersion(ffmpegPath, logger)

	attachmentPath := GetFileAttCacheDir(cacheDir, hash)
	subsPath := GetFileSubsCacheDir(cacheDir, hash)
	_ = os.MkdirAll(attachmentPath, 0755)
	_ = os.MkdirAll(subsPath, 0755)

	// Skip extraction if the expected subtitle files are already present.
	if len(mediaInfo.Subtitles) > 0 {
		subsDir, err := os.ReadDir(subsPath)
		if err == nil {
			expected := make(map[string]bool)
			for _, sub := range mediaInfo.Subtitles {
				if sub.Extension != nil && *sub.Extension != "" {
					expected[fmt.Sprintf("%d.%s", sub.Index, *sub.Extension)] = true
				}
			}
			found := 0
			for _, entry := range subsDir {
				if expected[entry.Name()] {
					found++
				}
			}
			if found == len(expected) {
				logger.Debug().Str("hash", hash).Msgf("videofile: Attachments already extracted")
				return nil
			}
		}
	}

	// Extract subtitles and attachments separately: a failure (or unsupported option) in
	// one no longer prevents the other from working, and each failure is reported with
	// ffmpeg's own output.
	var subErr, attErr error
	if len(mediaInfo.Subtitles) > 0 {
		subErr = extractSubtitles(ffmpegPath, path, subsPath, mediaInfo)
		if subErr != nil {
			logger.Error().Err(subErr).Msgf("videofile: Failed to extract subtitles")
		}
	}
	attErr = extractAttachments(ffmpegPath, path, attachmentPath)
	if attErr != nil {
		logger.Error().Err(attErr).Msgf("videofile: Failed to extract attachments")
	}

	if subErr != nil || attErr != nil {
		// Surface ffmpeg's own error output in the main log; exit codes alone
		// ("exit status 234") are not diagnosable.
		lastFfmpegOutput.mu.Lock()
		lastOut := lastFfmpegOutput.output
		lastFfmpegOutput.mu.Unlock()
		if lastOut != "" {
			logger.Error().Msgf("videofile: ffmpeg output: %s", lastOut)
		}
		return fmt.Errorf("extraction failed (subs: %v, attachments: %v)", subErr, attErr)
	}

	return nil
}
