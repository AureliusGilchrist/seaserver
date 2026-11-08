package onlinestream_download

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"seanime/internal/util"
	"strings"
)

type muxInput struct {
	VideoPath     string // local HLS playlist or MP4 file
	VideoHLS      bool
	AudioPath     string // optional separate audio rendition playlist
	Subtitles     []*downloadedSubtitle
	DefaultSub    int
	AudioLanguage string
	Title         string
	OutputPath    string
}

// convertSubtitleToASS turns a VTT/SRT/ASS file into ASS. Doing this per track, before the mux,
// means one broken subtitle file drops only that track instead of failing the whole download.
func convertSubtitleToASS(ctx context.Context, ffmpegPath string, inPath string, outPath string) error {
	cmd := util.NewCmdCtx(ctx, ffmpegPath, "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
		"-i", inPath, "-map", "0:s:0", "-c:s", "ass", "-f", "ass", outPath)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		msg := strings.TrimSpace(stderr.String())
		if len(msg) > 300 {
			msg = msg[len(msg)-300:]
		}
		return fmt.Errorf("%v: %s", err, msg)
	}
	if st, err := os.Stat(outPath); err != nil || st.Size() == 0 {
		return errors.New("conversion produced no output")
	}
	return nil
}

// mux copies the video and audio into one Matroska file and adds every subtitle the stream
// served as a soft ASS track. Nothing is re-encoded except the subtitles, which are text.
func mux(ctx context.Context, ffmpegPath string, in *muxInput) error {
	args := []string{"-hide_banner", "-nostdin", "-y", "-loglevel", "error"}

	hlsFlags := []string{"-allowed_extensions", "ALL", "-protocol_whitelist", "file,crypto,data"}

	if in.VideoHLS {
		args = append(args, hlsFlags...)
	}
	args = append(args, "-i", in.VideoPath)
	nextInput := 1
	audioInput := -1
	if in.AudioPath != "" {
		args = append(args, hlsFlags...)
		args = append(args, "-i", in.AudioPath)
		audioInput = nextInput
		nextInput++
	}
	subInputs := make([]int, len(in.Subtitles))
	for i, s := range in.Subtitles {
		args = append(args, "-i", s.Path)
		subInputs[i] = nextInput
		nextInput++
	}

	args = append(args, "-map", "0:v:0")
	if audioInput >= 0 {
		args = append(args, "-map", fmt.Sprintf("%d:a:0", audioInput))
	} else {
		args = append(args, "-map", "0:a?")
	}
	for _, idx := range subInputs {
		args = append(args, "-map", fmt.Sprintf("%d:s:0", idx))
	}

	args = append(args, "-c:v", "copy", "-c:a", "copy")
	if len(in.Subtitles) > 0 {
		// Already converted to ASS by convertSubtitleToASS.
		args = append(args, "-c:s", "copy")
	}

	if in.Title != "" {
		args = append(args, "-metadata", "title="+in.Title)
	}
	if in.AudioLanguage != "" {
		args = append(args, "-metadata:s:a", "language="+in.AudioLanguage)
	}
	for i, s := range in.Subtitles {
		args = append(args, fmt.Sprintf("-metadata:s:s:%d", i), "language="+s.Language)
		if s.Label != "" {
			args = append(args, fmt.Sprintf("-metadata:s:s:%d", i), "title="+s.Label)
		}
		disp := "0"
		if i == in.DefaultSub {
			disp = "default"
		}
		args = append(args, fmt.Sprintf("-disposition:s:%d", i), disp)
	}

	args = append(args, "-f", "matroska", in.OutputPath)

	cmd := util.NewCmdCtx(ctx, ffmpegPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		msg := strings.TrimSpace(stderr.String())
		if len(msg) > 600 {
			msg = msg[len(msg)-600:]
		}
		return fmt.Errorf("ffmpeg failed: %v: %s", err, msg)
	}

	st, err := os.Stat(in.OutputPath)
	if err != nil {
		return err
	}
	if st.Size() == 0 {
		return errors.New("ffmpeg produced an empty file")
	}
	return nil
}
