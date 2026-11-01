package transcoder

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"seanime/internal/mediastream/videofile"
	"seanime/internal/util"
)

// A hardware encoder that dies before its first segment must not leave the player waiting: the segment
// comes from the CPU instead, and later encodes skip the hardware. This runs a real ffmpeg.
func TestBrokenHardwareEncoderFallsBackToCPU(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not installed")
	}

	dir := t.TempDir()
	source := filepath.Join(dir, "source.mkv")
	out, err := exec.Command(ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24", "-t", "4",
		"-c:v", "libx264", "-g", "24", "-pix_fmt", "yuv420p", source).CombinedOutput()
	if err != nil {
		t.Fatalf("could not make a test video: %v: %s", err, out)
	}

	settings := &Settings{
		StreamDir: dir,
		HwAccel: HwAccelSettings{
			Name:        "broken",
			EncodeFlags: []string{"-c:v", "no_such_encoder"},
			ScaleFilter: "scale=%d:%d",
		},
		SoftwareHwAccel: GetHardwareAccelSettings(HwAccelOptions{Kind: softwareHwAccelName, Preset: "ultrafast"}),
		FfmpegPath:      ffmpeg,
	}
	file := &FileStream{
		Path: source,
		Out:  filepath.Join(dir, "out"),
		Info: &videofile.MediaInfo{
			Duration: 4,
			Video:    &videofile.Video{Width: 320, Height: 240},
		},
		Keyframes: &Keyframe{Keyframes: []float64{0, 1, 2, 3}, IsDone: true, info: &KeyframeInfo{}},
	}

	stream := NewVideoStream(file, P240, util.NewLogger(), settings)
	defer stream.close()

	type result struct {
		path string
		err  error
	}
	done := make(chan result, 1)
	go func() {
		path, err := stream.GetSegment(0)
		done <- result{path, err}
	}()

	select {
	case res := <-done:
		if res.err != nil {
			t.Fatalf("segment failed: %v", res.err)
		}
		if info, err := os.Stat(res.path); err != nil || info.Size() == 0 {
			t.Fatalf("segment %s was not written: %v", res.path, err)
		}
	case <-time.After(20 * time.Second):
		t.Fatal("still waiting for the segment after the encoder failed")
	}

	if name := settings.activeHwAccel().Name; name != softwareHwAccelName {
		t.Fatalf("active encoder is %q, want the CPU", name)
	}
	if args := strings.Join(stream.getTranscodeArgs("1"), " "); !strings.Contains(args, "libx264") {
		t.Fatalf("later encodes do not use the CPU: %s", args)
	}
}
