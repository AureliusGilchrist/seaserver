package mediastream

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/events"
	"seanime/internal/mediastream/videofile"
	"seanime/internal/util"
)

// Quick-edit captions: the player sends one line of a subtitle track with new wording, and the
// track is changed where it lives. The extracted copy the player reads is rewritten at once (so the
// next load shows it), and the subtitle track inside the video file is replaced by the edited one
// with a stream-copy remux, which keeps every other stream, the order, the languages and the fonts.

// ErrCueNotFound is returned when the line to edit is not in the track (the file changed, or the
// player sent a line from another track).
var ErrCueNotFound = errors.New("that line is not in the subtitle track")

// cueTolerance is how far apart a cue's times may be from the ones the player sent (seconds):
// the player rounds ASS's centiseconds and SRT's milliseconds.
const cueTolerance = 0.06

// ReplaceCue replaces the text of one cue in a subtitle file's content. ext is "ass", "ssa", "srt"
// or "vtt". The cue is the one whose text is exactly oldText and whose times match start and end;
// failing a timing match, the first cue with that text that overlaps them.
func ReplaceCue(content string, ext string, start, end float64, oldText, newText string) (string, bool) {
	switch strings.ToLower(ext) {
	case "ass", "ssa":
		return replaceAssCue(content, start, end, oldText, newText)
	case "srt", "vtt":
		return replaceSrtCue(content, start, end, oldText, newText)
	}
	return content, false
}

func parseAssTime(s string) (float64, bool) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 3 {
		return 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	sec, err3 := strconv.ParseFloat(parts[2], 64)
	if err1 != nil || err2 != nil || err3 != nil {
		return 0, false
	}
	return float64(h)*3600 + float64(m)*60 + sec, true
}

func parseSrtTime(s string) (float64, bool) {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	// "00:01.000" in VTT, "00:00:01.000" in both.
	parts := strings.Split(s, ":")
	if len(parts) == 2 {
		parts = append([]string{"0"}, parts...)
	}
	if len(parts) != 3 {
		return 0, false
	}
	return parseAssTime(strings.Join(parts, ":"))
}

type cueHit struct {
	exact bool
	at    int
}

func pickCue(hits []cueHit) (int, bool) {
	for _, h := range hits {
		if h.exact {
			return h.at, true
		}
	}
	if len(hits) > 0 {
		return hits[0].at, true
	}
	return 0, false
}

func timesMatch(a, b, start, end float64) (exact bool, overlap bool) {
	exact = math.Abs(a-start) <= cueTolerance && math.Abs(b-end) <= cueTolerance
	overlap = a < end+cueTolerance && b > start-cueTolerance
	return
}

func replaceAssCue(content string, start, end float64, oldText, newText string) (string, bool) {
	nl := "\n"
	if strings.Contains(content, "\r\n") {
		nl = "\r\n"
	}
	lines := strings.Split(content, nl)

	// Field positions from the [Events] Format line (the standard order when it is missing).
	fields := []string{"layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"}
	inEvents := false
	var hits []cueHit
	type loc struct {
		prefix string
	}
	locs := map[int]loc{}
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "[") {
			inEvents = strings.EqualFold(trimmed, "[Events]")
			continue
		}
		if !inEvents {
			continue
		}
		if strings.HasPrefix(trimmed, "Format:") {
			fields = nil
			for _, f := range strings.Split(strings.TrimPrefix(trimmed, "Format:"), ",") {
				fields = append(fields, strings.ToLower(strings.TrimSpace(f)))
			}
			continue
		}
		if !strings.HasPrefix(line, "Dialogue:") {
			continue
		}
		body := strings.TrimPrefix(line, "Dialogue:")
		parts := strings.SplitN(body, ",", len(fields))
		if len(parts) != len(fields) {
			continue
		}
		var cs, ce float64
		textIdx := len(fields) - 1
		for fi, f := range fields {
			switch f {
			case "start":
				cs, _ = parseAssTime(parts[fi])
			case "end":
				ce, _ = parseAssTime(parts[fi])
			case "text":
				textIdx = fi
			}
		}
		if parts[textIdx] != oldText {
			continue
		}
		exact, overlap := timesMatch(cs, ce, start, end)
		if !exact && !overlap {
			continue
		}
		hits = append(hits, cueHit{exact: exact, at: i})
		locs[i] = loc{prefix: "Dialogue:" + strings.Join(parts[:textIdx], ",") + ","}
	}
	at, ok := pickCue(hits)
	if !ok {
		return content, false
	}
	// Text is the last field; a line break in it is ASS's \N.
	lines[at] = locs[at].prefix + strings.ReplaceAll(strings.ReplaceAll(newText, "\r\n", "\\N"), "\n", "\\N")
	return strings.Join(lines, nl), true
}

func replaceSrtCue(content string, start, end float64, oldText, newText string) (string, bool) {
	nl := "\n"
	if strings.Contains(content, "\r\n") {
		nl = "\r\n"
	}
	lines := strings.Split(content, nl)
	var hits []cueHit
	spans := map[int]int{} // first text line -> one past the last
	for i := 0; i < len(lines); i++ {
		if !strings.Contains(lines[i], "-->") {
			continue
		}
		arrow := strings.SplitN(lines[i], "-->", 2)
		cs, ok1 := parseSrtTime(arrow[0])
		endField := strings.Fields(arrow[1])
		if !ok1 || len(endField) == 0 {
			continue
		}
		ce, ok2 := parseSrtTime(endField[0])
		if !ok2 {
			continue
		}
		j := i + 1
		for j < len(lines) && strings.TrimSpace(lines[j]) != "" {
			j++
		}
		text := strings.Join(lines[i+1:j], "\n")
		if text != strings.ReplaceAll(oldText, "\r\n", "\n") {
			continue
		}
		exact, overlap := timesMatch(cs, ce, start, end)
		if !exact && !overlap {
			continue
		}
		hits = append(hits, cueHit{exact: exact, at: i + 1})
		spans[i+1] = j
	}
	at, ok := pickCue(hits)
	if !ok {
		return content, false
	}
	// A blank line would end the cue: drop empty lines from the new text.
	var newLines []string
	for _, l := range strings.Split(strings.ReplaceAll(newText, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(l) != "" {
			newLines = append(newLines, l)
		}
	}
	if len(newLines) == 0 {
		newLines = []string{" "}
	}
	out := append([]string{}, lines[:at]...)
	out = append(out, newLines...)
	out = append(out, lines[spans[at]:]...)
	return strings.Join(out, nl), true
}

// One rewrite of a given video at a time; a second edit made meanwhile waits for the first.
var subtitleRewriteLocks sync.Map

// QuickEditSubtitle changes one line of a subtitle track of the video the client is playing.
// It returns once the extracted copy is updated; the video file itself is rewritten in the
// background, with a toast when it is done.
func (r *Repository) QuickEditSubtitle(clientId string, trackIndex int, start, end float64, oldText, newText string) error {
	if !r.IsInitialized() {
		return errors.New("mediastream is not initialized")
	}
	mc, found := r.playbackManager.GetActiveStream(clientId)
	if !found || mc == nil || mc.MediaInfo == nil {
		return errors.New("no file is playing for this client")
	}
	var track *videofile.Subtitle
	for i := range mc.MediaInfo.Subtitles {
		if int(mc.MediaInfo.Subtitles[i].Index) == trackIndex {
			track = &mc.MediaInfo.Subtitles[i]
		}
	}
	if track == nil || track.Link == nil || track.Extension == nil {
		return errors.New("that subtitle track cannot be edited")
	}

	cachePath := filepath.Join(videofile.GetFileSubsCacheDir(r.cacheDir, mc.Hash), strings.TrimPrefix(*track.Link, "/"))
	raw, err := os.ReadFile(cachePath)
	if err != nil {
		return fmt.Errorf("could not read the subtitle track: %w", err)
	}
	edited, ok := ReplaceCue(string(raw), *track.Extension, start, end, oldText, newText)
	if !ok {
		return ErrCueNotFound
	}
	if err := os.WriteFile(cachePath, []byte(edited), 0644); err != nil {
		return fmt.Errorf("could not save the subtitle track: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(mc.Filepath))
	if ext != ".mkv" && ext != ".mks" && ext != ".webm" {
		// Other containers keep their own subtitle formats; the edit stays in the extracted copy.
		r.wsEventManager.SendEvent(events.WarningToast, "Caption saved for this playback. Only MKV files can have their subtitles rewritten.")
		return nil
	}

	editedCopy := cachePath + ".edited." + *track.Extension
	if err := os.WriteFile(editedCopy, []byte(edited), 0644); err != nil {
		return err
	}
	ffmpeg := "ffmpeg"
	if s, ok := r.settings.Get(); ok && s.FfmpegPath != "" {
		ffmpeg = s.FfmpegPath
	}
	subCount := len(mc.MediaInfo.Subtitles)
	go r.rewriteSubtitleTrack(ffmpeg, mc.Filepath, editedCopy, trackIndex, subCount, *track)
	return nil
}

func (r *Repository) rewriteSubtitleTrack(ffmpeg, videoPath, editedPath string, trackIndex, subCount int, track videofile.Subtitle) {
	defer util.HandlePanicInModuleThen("mediastream/rewriteSubtitleTrack", func() {})
	defer os.Remove(editedPath)

	lockAny, _ := subtitleRewriteLocks.LoadOrStore(videoPath, &sync.Mutex{})
	lock := lockAny.(*sync.Mutex)
	lock.Lock()
	defer lock.Unlock()

	dir, base := filepath.Split(videoPath)
	tmp := filepath.Join(dir, "."+strings.TrimSuffix(base, filepath.Ext(base))+".caption-edit"+filepath.Ext(base))
	defer os.Remove(tmp)

	// Every stream of the original in its place, with the edited track standing in for its own.
	args := []string{"-hide_banner", "-loglevel", "error", "-y", "-i", videoPath, "-i", editedPath,
		"-map", "0:v?", "-map", "0:a?"}
	for j := 0; j < subCount; j++ {
		if j == trackIndex {
			args = append(args, "-map", "1:0")
		} else {
			args = append(args, "-map", fmt.Sprintf("0:s:%d", j))
		}
	}
	args = append(args, "-map", "0:t?", "-map", "0:d?", "-map_metadata", "0", "-map_chapters", "0", "-c", "copy")
	if track.Language != nil && *track.Language != "" {
		args = append(args, fmt.Sprintf("-metadata:s:s:%d", trackIndex), "language="+*track.Language)
	}
	if track.Title != nil && *track.Title != "" {
		args = append(args, fmt.Sprintf("-metadata:s:s:%d", trackIndex), "title="+*track.Title)
	}
	disposition := "0"
	switch {
	case track.IsDefault && track.IsForced:
		disposition = "default+forced"
	case track.IsDefault:
		disposition = "default"
	case track.IsForced:
		disposition = "forced"
	}
	args = append(args, fmt.Sprintf("-disposition:s:%d", trackIndex), disposition, tmp)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	cmd := util.NewCmdCtx(ctx, ffmpeg, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		r.logger.Error().Err(err).Str("output", string(out)).Str("file", videoPath).Msg("mediastream: Could not rewrite the subtitle track")
		r.wsEventManager.SendEvent(events.ErrorToast, "Could not save the caption into the video file. It stays changed for this playback.")
		return
	}
	// Keep the original's permissions, then swap the new file in.
	if fi, err := os.Stat(videoPath); err == nil {
		_ = os.Chmod(tmp, fi.Mode())
	}
	if err := os.Rename(tmp, videoPath); err != nil {
		r.logger.Error().Err(err).Str("file", videoPath).Msg("mediastream: Could not replace the video with the edited one")
		r.wsEventManager.SendEvent(events.ErrorToast, "Could not save the caption into the video file.")
		return
	}
	r.logger.Info().Str("file", videoPath).Int("track", trackIndex).Msg("mediastream: Caption edit saved into the video file")
	r.wsEventManager.SendEvent(events.SuccessToast, "Caption saved into the video file")
}
