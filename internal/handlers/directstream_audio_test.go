package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
)

// makeTwoTrackSource writes a 20s file with an AAC track (a:0) and a FLAC track (a:1).
func makeTwoTrackSource(t *testing.T) (ffmpeg, ffprobe, source string) {
	t.Helper()
	var err error
	if ffmpeg, err = exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is not installed")
	}
	if ffprobe, err = exec.LookPath("ffprobe"); err != nil {
		t.Skip("ffprobe is not installed")
	}
	source = filepath.Join(t.TempDir(), "source.mkv")
	out, err := exec.Command(ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=20",
		"-f", "lavfi", "-i", "sine=frequency=880:duration=20",
		"-map", "0:a", "-map", "1:a", "-c:a:0", "aac", "-c:a:1", "flac", source).CombinedOutput()
	if err != nil {
		t.Fatalf("could not make the test file: %v: %s", err, out)
	}
	return
}

func probeDuration(t *testing.T, ffprobe, path string) float64 {
	t.Helper()
	out, err := exec.Command(ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path).Output()
	if err != nil {
		t.Fatalf("ffprobe %s: %v", path, err)
	}
	d, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return d
}

// faststart puts the moov box before mdat.
func isFaststart(t *testing.T, path string) bool {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	moov, mdat := bytes.Index(data, []byte("moov")), bytes.Index(data, []byte("mdat"))
	return moov >= 0 && mdat >= 0 && moov < mdat
}

func TestAudioTrackCopyAndStream(t *testing.T) {
	ffmpeg, ffprobe, source := makeTwoTrackSource(t)
	ctx := context.Background()

	if got := probeAudioCodec(ctx, ffprobe, source, 0); got != "aac" {
		t.Fatalf("track 0 codec = %q, want aac", got)
	}
	if got := probeAudioCodec(ctx, ffprobe, source, 1); got != "flac" {
		t.Fatalf("track 1 codec = %q, want flac", got)
	}

	t.Run("aac is copied", func(t *testing.T) {
		out := filepath.Join(t.TempDir(), "a0.m4a")
		if err := copyAudioTrack(ctx, ffmpeg, source, 0, out); err != nil {
			t.Fatal(err)
		}
		if d := probeDuration(t, ffprobe, out); d < 19 || d > 21 {
			t.Fatalf("duration %.2f, want ~20", d)
		}
		if !isFaststart(t, out) {
			t.Fatal("copy is not faststart")
		}
	})

	t.Run("other codecs stream while encoding", func(t *testing.T) {
		out := filepath.Join(t.TempDir(), "a1.m4a")
		rec := httptest.NewRecorder()
		resp := echo.NewResponse(rec, echo.New())
		done := make(chan struct{})
		sent, err := streamAudioEncode(ctx, resp, nil, ffmpeg, source, 1, out,
			func(err error) { t.Errorf("remux failed: %v", err) },
			func() { close(done) })
		if err != nil || !sent {
			t.Fatalf("sent=%v err=%v", sent, err)
		}
		if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "audio/mp4" {
			t.Fatalf("code %d, content type %q", rec.Code, rec.Header().Get("Content-Type"))
		}
		body := rec.Body.Bytes()
		if len(body) < 12 || string(body[4:8]) != "ftyp" || !bytes.Contains(body, []byte("moof")) {
			t.Fatalf("response is not fragmented MP4 (%d bytes)", len(body))
		}
		streamed := filepath.Join(t.TempDir(), "streamed.mp4")
		_ = os.WriteFile(streamed, body, 0644)
		if d := probeDuration(t, ffprobe, streamed); d < 19 || d > 21 {
			t.Fatalf("streamed duration %.2f, want ~20", d)
		}

		select {
		case <-done:
		case <-time.After(30 * time.Second):
			t.Fatal("faststart remux never finished")
		}
		if !isFaststart(t, out) {
			t.Fatal("cached copy is not faststart")
		}
		if d := probeDuration(t, ffprobe, out); d < 19 || d > 21 {
			t.Fatalf("cached duration %.2f, want ~20", d)
		}
		if _, err := os.Stat(out + ".frag.tmp"); !os.IsNotExist(err) {
			t.Fatalf("fragment file left behind: %v", err)
		}
	})

	t.Run("a failing encode reports before sending", func(t *testing.T) {
		out := filepath.Join(t.TempDir(), "a9.m4a")
		rec := httptest.NewRecorder()
		doneCalled := false
		sent, err := streamAudioEncode(ctx, echo.NewResponse(rec, echo.New()), nil, ffmpeg, source, 9, out,
			func(error) {}, func() { doneCalled = true })
		if err == nil || sent || !doneCalled {
			t.Fatalf("sent=%v err=%v done=%v, want an error before anything was sent", sent, err, doneCalled)
		}
		if _, err := os.Stat(out + ".frag.tmp"); !os.IsNotExist(err) {
			t.Fatalf("fragment file left behind: %v", err)
		}
	})
}
