package transcoder

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"seanime/internal/mediastream/videofile"
	"seanime/internal/util"
)

const ffmpegCodecsCuvidSample = `Codecs:
 D..... = Decoding supported
 -------
 D.VILS h264                 H.264 (decoders: h264_cuvid ) (encoders: h264_nvenc )
 DEV.L. hevc                 H.265 / HEVC (decoders: hevc hevc_cuvid) (encoders: hevc_nvenc)
 DEA.L. aac                  AAC (Advanced Audio Coding) (decoders: aac aac_fixed) (encoders: aac)
 D.A.L. flac                 FLAC
`

func TestParseFFmpegDecoderNames(t *testing.T) {
	parsed := parseFFmpegCodecs(ffmpegCodecsCuvidSample)
	for _, want := range []string{"h264_cuvid", "hevc", "hevc_cuvid", "aac", "aac_fixed", "flac"} {
		if !parsed.decoders[want] {
			t.Errorf("decoder %q missing: %v", want, parsed.decoders)
		}
	}
	if parsed.decoders["h264"] {
		t.Errorf("h264 has only a cuvid decoder in this build: %v", parsed.decoders)
	}
	if !parsed.codecs["h264"] {
		t.Errorf("h264 is still decodable as a codec: %v", parsed.codecs)
	}
}

func TestCuvidDecoderOnlyWhenTheRegularOneIsMissing(t *testing.T) {
	nvidia := GetHardwareAccelSettings(HwAccelOptions{Kind: "nvidia", Preset: "fast"})
	decoders := parseFFmpegCodecs(ffmpegCodecsCuvidSample).decoders

	if got := cuvidDecoderFlags(nvidia, "h264", decoders); !slices.Equal(got, []string{"-c:v", "h264_cuvid"}) {
		t.Errorf("h264 without a regular decoder: got %v, want h264_cuvid", got)
	}
	if got := cuvidDecoderFlags(nvidia, "hevc", decoders); got != nil {
		t.Errorf("hevc has a regular decoder, got %v", got)
	}
	if got := cuvidDecoderFlags(*nvidia.CPUFrames, "h264", decoders); got == nil {
		t.Errorf("the CPU-scale fallback still decodes on the GPU and needs h264_cuvid")
	}
	cpu := GetHardwareAccelSettings(HwAccelOptions{Kind: "cpu", Preset: "fast"})
	if got := cuvidDecoderFlags(cpu, "h264", decoders); got != nil {
		t.Errorf("CPU settings must not pick a GPU decoder, got %v", got)
	}
	if got := cuvidDecoderFlags(nvidia, "h264", nil); got != nil {
		t.Errorf("unknown decoders must not pick one, got %v", got)
	}
}

// The GPU pipeline falls back to the CPU-scale one first, then to encode only, then to the CPU.
func TestNvidiaFallbackLadder(t *testing.T) {
	settings := &Settings{
		HwAccel:         GetHardwareAccelSettings(HwAccelOptions{Kind: "nvidia", Preset: "fast"}),
		SoftwareHwAccel: GetHardwareAccelSettings(HwAccelOptions{Kind: softwareHwAccelName, Preset: "veryfast"}),
	}

	full := settings.activeHwAccel()
	if !strings.Contains(full.ScaleFilter, "scale_cuda") || !slices.Contains(full.DecodeFlags, "-hwaccel_output_format") {
		t.Fatalf("nvidia does not keep frames on the GPU: %+v", full)
	}
	if slices.Contains(full.EncodeFlags, "-pix_fmt") {
		t.Fatalf("-pix_fmt cannot be used with CUDA frames: %v", full.EncodeFlags)
	}

	settings.fallBackFrom(full)
	settings.fallBackFrom(full) // a second head failing on the same settings
	cpuScale := settings.activeHwAccel()
	if cpuScale.ScaleFilter != "scale=%d:%d" || !slices.Contains(cpuScale.DecodeFlags, "cuda") {
		t.Fatalf("first fallback should decode on the GPU and scale on the CPU: %+v", cpuScale)
	}

	settings.fallBackFrom(cpuScale)
	encodeOnly := settings.activeHwAccel()
	if len(encodeOnly.DecodeFlags) != 0 || encodeOnly.ScaleFilter != "scale=%d:%d" || encodeOnly.EncodeFlags[1] != "h264_nvenc" {
		t.Fatalf("second fallback should only encode on the GPU: %+v", encodeOnly)
	}

	settings.fallBackFrom(encodeOnly)
	if name := settings.activeHwAccel().Name; name != softwareHwAccelName {
		t.Fatalf("active encoder is %q, want the CPU", name)
	}
}

func TestUnknownHwAccelUsesTheCPU(t *testing.T) {
	got := GetHardwareAccelSettings(HwAccelOptions{Kind: "no-such-gpu", Preset: "fast"})
	if got.Name != softwareHwAccelName {
		t.Fatalf("got %q, want the CPU", got.Name)
	}
}

func TestThreadsOnlyForCPUEncodes(t *testing.T) {
	file := &FileStream{Info: &videofile.MediaInfo{Video: &videofile.Video{Width: 1920, Height: 1080}}}
	for _, tc := range []struct {
		kind string
		want bool
	}{{"cpu", true}, {"nvidia-decode", true}, {"nvidia", false}} {
		settings := &Settings{HwAccel: GetHardwareAccelSettings(HwAccelOptions{Kind: tc.kind, Preset: "fast"}), Threads: 6}
		vs := &VideoStream{quality: P720, logger: util.NewLogger(), settings: settings}
		vs.file = file
		args := strings.Join(vs.getTranscodeArgs("1"), " ")
		if got := strings.Contains(args, "-threads 6"); got != tc.want {
			t.Errorf("%s: -threads in args = %v, want %v (%s)", tc.kind, got, tc.want, args)
		}
	}
}

func TestEncodeSlots(t *testing.T) {
	s := &Settings{encodeSlots: make(chan struct{}, 1)}
	release, ok := s.acquireEncodeSlot(context.Background(), true)
	if !ok {
		t.Fatal("first slot refused")
	}
	if _, ok := s.acquireEncodeSlot(context.Background(), false); ok {
		t.Fatal("an encode ahead of the player took a slot over the cap")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, ok := s.acquireEncodeSlot(ctx, true); ok {
		t.Fatal("a waiting encode took a slot over the cap")
	}
	release()
	if release2, ok := s.acquireEncodeSlot(context.Background(), false); !ok {
		t.Fatal("slot not given back")
	} else {
		release2()
	}
}

// Runs the real GPU pipeline (CUDA decode, scale_cuda, NVENC) on an 8-bit H.264 and a 10-bit HEVC
// source, and checks the segment comes from it rather than from a fallback.
func TestNvidiaGPUPipeline(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not installed")
	}
	if out, err := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error", "-init_hw_device", "cuda=cu",
		"-f", "lavfi", "-i", "nullsrc=s=256x256:d=0.1", "-c:v", "h264_nvenc", "-f", "null", "-").CombinedOutput(); err != nil {
		t.Skipf("no usable NVIDIA GPU: %v: %s", err, out)
	}

	for _, src := range []struct {
		name string
		args []string
	}{
		{"h264", []string{"-c:v", "libx264", "-pix_fmt", "yuv420p"}},
		{"hevc-10bit", []string{"-c:v", "hevc_nvenc", "-pix_fmt", "p010le"}},
	} {
		t.Run(src.name, func(t *testing.T) {
			dir, err := os.MkdirTemp("", "gpu-pipeline-")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				for i := 0; i < 50 && os.RemoveAll(dir) != nil; i++ {
					time.Sleep(100 * time.Millisecond)
				}
			})
			source := filepath.Join(dir, "source.mkv")
			args := append([]string{"-y", "-hide_banner", "-loglevel", "error",
				"-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24", "-t", "4", "-g", "24"}, src.args...)
			if out, err := exec.Command(ffmpeg, append(args, source)...).CombinedOutput(); err != nil {
				t.Skipf("could not make a %s test video: %v: %s", src.name, err, out)
			}

			settings := &Settings{
				StreamDir:       dir,
				HwAccel:         GetHardwareAccelSettings(HwAccelOptions{Kind: "nvidia", Preset: "fast"}),
				SoftwareHwAccel: GetHardwareAccelSettings(HwAccelOptions{Kind: softwareHwAccelName, Preset: "ultrafast"}),
				FfmpegPath:      ffmpeg,
				encodeSlots:     make(chan struct{}, 2),
			}
			codec := "h264"
			if strings.HasPrefix(src.name, "hevc") {
				codec = "hevc"
			}
			file := &FileStream{
				Path:      source,
				Out:       filepath.Join(dir, "out"),
				Info:      &videofile.MediaInfo{Duration: 4, Video: &videofile.Video{Codec: codec, Width: 1280, Height: 720}},
				Keyframes: &Keyframe{Keyframes: []float64{0, 1, 2, 3}, IsDone: true, info: &KeyframeInfo{}},
			}
			stream := NewVideoStream(file, P480, util.NewLogger(), settings)
			defer stream.close()

			path, err := stream.GetSegment(0)
			if err != nil {
				t.Fatalf("segment failed: %v", err)
			}
			if info, err := os.Stat(path); err != nil || info.Size() == 0 {
				t.Fatalf("segment %s was not written: %v", path, err)
			}
			if step := settings.hwAccelStep.Load(); step != hwAccelFull {
				t.Fatalf("the GPU pipeline failed and fell back to step %d", step)
			}
			if len(settings.encodeSlots) > 1 {
				t.Fatalf("encode slots leaked: %d in use", len(settings.encodeSlots))
			}
		})
	}
}
