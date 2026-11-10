package onlinestream_download

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"seanime/internal/util"
)

// downloadDASH downloads an MPEG-DASH stream with ffmpeg, every track copied into one Matroska
// file. The provider's headers go with every request; onBytes follows the size written.
func downloadDASH(ctx context.Context, ffmpegPath string, manifestURL string, headers map[string]string, out string, onBytes func(int64)) error {
	args := []string{"-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-nostats", "-progress", "pipe:1"}
	var hdr strings.Builder
	keys := make([]string, 0, len(headers))
	for k := range headers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if strings.EqualFold(k, "User-Agent") {
			args = append(args, "-user_agent", headers[k])
			continue
		}
		hdr.WriteString(k + ": " + headers[k] + "\r\n")
	}
	if hdr.Len() > 0 {
		args = append(args, "-headers", hdr.String())
	}
	args = append(args, "-i", manifestURL, "-map", "0", "-c", "copy", "-f", "matroska", out)

	cmd := util.NewCmdCtx(ctx, ffmpegPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("ffmpeg could not start: %w", err)
	}
	done := make(chan error, 1)
	go func() {
		sc := bufio.NewScanner(stdout)
		for sc.Scan() {
			if v, ok := strings.CutPrefix(sc.Text(), "total_size="); ok && onBytes != nil {
				if n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64); err == nil && n > 0 {
					onBytes(n)
				}
			}
		}
		done <- cmd.Wait()
	}()
	// A stop returns at once: where ffmpeg is a launcher (a Chocolatey shim), killing it can
	// leave the real ffmpeg finishing in the background with the output pipe open.
	select {
	case err = <-done:
	case <-ctx.Done():
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		return ctx.Err()
	}
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		msg := strings.TrimSpace(stderr.String())
		if len(msg) > 600 {
			msg = msg[len(msg)-600:]
		}
		return fmt.Errorf("ffmpeg could not download the DASH stream: %v: %s", err, msg)
	}
	if st, err := os.Stat(out); err != nil || st.Size() == 0 {
		return fmt.Errorf("ffmpeg produced no file from the DASH stream")
	}
	return nil
}
