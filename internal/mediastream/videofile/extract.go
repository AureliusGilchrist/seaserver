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
//
// ffmpeg writes into a temporary folder and the files move into place only once it has
// succeeded: it creates each output at the start and fills it while reading the whole video, so
// writing straight into <subsPath> left half-written tracks there for anything that looked early,
// and for good when the run was interrupted (a server restart mid-extraction).
func extractSubtitles(ffmpegPath, path, subsPath string, mediaInfo *MediaInfo) error {
	partial := subsPath + ".partial"
	_ = os.RemoveAll(partial)
	if err := os.MkdirAll(partial, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(partial)

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
				fmt.Sprintf("%s/%d.%s", partial, sub.Index, *ext),
			)
		}
	}

	if _, err := runFfmpeg(ffmpegPath, partial, args); err != nil {
		return err
	}

	entries, err := os.ReadDir(partial)
	if err != nil {
		return err
	}
	for _, e := range entries {
		dst := filepath.Join(subsPath, e.Name())
		_ = os.Remove(dst) // Windows won't rename over an existing file
		if err := os.Rename(filepath.Join(partial, e.Name()), dst); err != nil {
			return fmt.Errorf("could not move extracted subtitle %q into place: %w", e.Name(), err)
		}
	}
	return nil
}

// extractionMarker is written once a file's subtitles and attachments have all been extracted.
// Its presence, not the files', is what says a previous run finished.
const extractionMarker = ".complete"

// isFfmpegSafeFilename mirrors ffmpeg's safe_filename() (fftools/ffmpeg_demux.c):
// only [A-Za-z0-9_.-] are allowed. Anything else makes ffmpeg refuse to dump an
// attachment with its embedded name.
func isFfmpegSafeFilename(name string) bool {
	if name == "" || strings.Trim(name, ".") == "" || strings.HasPrefix(name, "-") {
		return false
	}
	for _, r := range name {
		if r != '.' && r != '-' && r != '_' &&
			(r < '0' || r > '9') && (r < 'A' || r > 'Z') && (r < 'a' || r > 'z') {
			return false
		}
	}
	return true
}

// extractAttachments dumps embedded font/attachment files to <attachmentPath>.
//
// Each attachment gets an explicit, ffmpeg-safe dump name via
// -dump_attachment:t:<index> instead of letting ffmpeg use the embedded filename:
// a single unsafe embedded name (e.g. "FOTComet+PL.ttf" — '+' is not in
// safe_filename's allowed set) makes ffmpeg abort the entire input open (exit 234),
// dumping nothing at all. Explicit names bypass the embedded-name check, and files
// dumped under a fallback name are renamed back to their embedded names afterwards
// so the /att/ endpoint keeps serving the original names.
func extractAttachments(ffmpegPath, path, attachmentPath string, mediaInfo *MediaInfo) error {
	// -dump_attachment is an *input* option, so it has to come before the "-i" it applies to.
	// It used to be placed after it: ffmpeg rejected the whole command ("cannot be applied to
	// output url ... you are trying to apply an input option to an output file", exit 234), so
	// fonts were never extracted, and the extraction was retried, reading the file, every time an
	// episode was opened.
	args := []string{
		"-nostdin",
		// override old attachments
		"-y",
	}

	type rename struct{ from, to string }
	var renames []rename

	if len(mediaInfo.Fonts) > 0 {
		for i, name := range mediaInfo.Fonts {
			// Final on-disk name: the embedded filename with path separators removed.
			final := strings.Map(func(r rune) rune {
				if r == '/' || r == '\\' || r == 0 {
					return '_'
				}
				return r
			}, name)
			if final == "" || final == "." || final == ".." {
				final = fmt.Sprintf("attachment_%d.bin", i)
			}
			// Name handed to ffmpeg; must satisfy safe_filename().
			dump := final
			if !isFfmpegSafeFilename(dump) {
				ext := strings.Map(func(r rune) rune {
					if r != '.' && r != '-' && r != '_' &&
						(r < '0' || r > '9') && (r < 'A' || r > 'Z') && (r < 'a' || r > 'z') {
						return -1
					}
					return r
				}, filepath.Ext(final))
				dump = fmt.Sprintf("attachment_%d%s", i, ext)
				if !isFfmpegSafeFilename(dump) {
					dump = fmt.Sprintf("attachment_%d.bin", i)
				}
			}
			args = append(args, fmt.Sprintf("-dump_attachment:t:%d", i), dump)
			if dump != final {
				renames = append(renames, rename{from: dump, to: final})
			}
		}
	} else {
		// ffprobe reported no attachment streams; keep the blanket dump so anything
		// it missed is still extracted to its embedded filename.
		args = append(args, "-dump_attachment:t", "")
	}

	args = append(args, "-i", path)

	// ffmpeg requires an output file. The attachments are written when the input is opened, so
	// the output stops at zero seconds instead of copying every stream of the file through.
	args = append(args, "-t", "0", "-f", "null", os.DevNull)

	_, err := runFfmpeg(ffmpegPath, attachmentPath, args)
	if err != nil {
		return err
	}

	for _, r := range renames {
		if err := os.Rename(filepath.Join(attachmentPath, r.from), filepath.Join(attachmentPath, r.to)); err != nil {
			// The font is on disk under the fallback name; serving it under the
			// embedded name is what matters, so a failed rename is a real error.
			return fmt.Errorf("could not restore attachment filename %q: %w", r.to, err)
		}
	}
	return nil
}

func ExtractAttachment(ffmpegPath string, path string, hash string, mediaInfo *MediaInfo, cacheDir string, logger *zerolog.Logger) (subsErr error, attErr error) {
	logger.Debug().Str("hash", hash).Msgf("videofile: Starting media attachment extraction")

	logFfmpegVersion(ffmpegPath, logger)

	attachmentPath := GetFileAttCacheDir(cacheDir, hash)
	subsPath := GetFileSubsCacheDir(cacheDir, hash)
	_ = os.MkdirAll(attachmentPath, 0755)
	_ = os.MkdirAll(subsPath, 0755)

	// Skip extraction if a previous run finished. The files alone don't say so: an interrupted run
	// leaves them behind, half-written.
	markerPath := filepath.Join(filepath.Dir(subsPath), extractionMarker)
	if _, err := os.Stat(markerPath); err == nil {
		logger.Debug().Str("hash", hash).Msgf("videofile: Attachments already extracted")
		return nil, nil
	}

	// Extract subtitles and attachments separately: a failure (or unsupported option) in
	// one no longer prevents the other from working, and each failure is reported with
	// ffmpeg's own output. The outcomes are returned separately — a font-attachment
	// failure degrades rendering (libass falls back) but must never remove the subtitles
	// themselves, so the /subs/ endpoint fails fast only on a subtitle failure.
	if len(mediaInfo.Subtitles) > 0 {
		subsErr = extractSubtitles(ffmpegPath, path, subsPath, mediaInfo)
		if subsErr != nil {
			logger.Error().Err(subsErr).Msgf("videofile: Failed to extract subtitles")
		}
	}
	attErr = extractAttachments(ffmpegPath, path, attachmentPath, mediaInfo)
	if attErr != nil {
		logger.Error().Err(attErr).Msgf("videofile: Failed to extract attachments")
	}

	if subsErr != nil || attErr != nil {
		// Surface ffmpeg's own error output in the main log; exit codes alone
		// ("exit status 234") are not diagnosable.
		lastFfmpegOutput.mu.Lock()
		lastOut := lastFfmpegOutput.output
		lastFfmpegOutput.mu.Unlock()
		if lastOut != "" {
			logger.Error().Msgf("videofile: ffmpeg output: %s", lastOut)
		}
	}

	if subsErr == nil && attErr == nil {
		_ = os.WriteFile(markerPath, []byte("ok"), 0644)
	}

	return subsErr, attErr
}
