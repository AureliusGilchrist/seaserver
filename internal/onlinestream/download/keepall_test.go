package onlinestream_download

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// A release file (two audio tracks and a subtitle) is copied whole when KeepAll is set.
func TestMuxKeepAll(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("no ffmpeg")
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Skip("no ffprobe")
	}
	dir := t.TempDir()
	srt := filepath.Join(dir, "s.srt")
	if err := writeFile(srt, "1\n00:00:00,000 --> 00:00:01,000\nHello\n"); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(dir, "release.mkv")
	gen := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "color=c=black:s=64x64:d=1",
		"-f", "lavfi", "-i", "sine=f=440:d=1", "-f", "lavfi", "-i", "sine=f=880:d=1", "-i", srt,
		"-map", "0", "-map", "1", "-map", "2", "-map", "3",
		"-c:v", "libx264", "-c:a", "aac", "-c:s", "ass",
		"-metadata:s:a:0", "language=jpn", "-metadata:s:a:1", "language=eng", src)
	if out, err := gen.CombinedOutput(); err != nil {
		t.Skipf("could not make a test file: %v %s", err, out)
	}
	tracks := probeTracks(context.Background(), ffprobe, src)
	if !tracks.complete() || len(tracks.audio) != 2 || tracks.subtitles != 1 {
		t.Fatalf("probe: %+v", tracks)
	}
	if tracks.audio[1].language != "eng" {
		t.Errorf("second audio: %+v", tracks.audio[1])
	}
	out := filepath.Join(dir, "out.mkv")
	if err := mux(context.Background(), ffmpeg, &muxInput{VideoPath: src, KeepAll: true, Title: "T - 01", OutputPath: out}); err != nil {
		t.Fatal(err)
	}
	got := probeTracks(context.Background(), ffprobe, out)
	if len(got.audio) != 2 || got.subtitles != 1 {
		t.Fatalf("output lost tracks: %+v", got)
	}
}

func writeFile(path, content string) error { return os.WriteFile(path, []byte(content), 0o644) }
