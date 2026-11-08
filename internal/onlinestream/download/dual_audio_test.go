package onlinestream_download

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestOrderAudioPutsJapaneseFirst(t *testing.T) {
	tracks := []*muxAudio{{Language: "eng", Default: true}, {Language: "spa"}, {Language: "jpn"}}
	orderAudio(tracks)
	if tracks[0].Language != "jpn" || !tracks[0].Default || tracks[1].Default || tracks[1].Language != "eng" {
		t.Fatalf("got %s(default=%v) %s %s", tracks[0].Language, tracks[0].Default, tracks[1].Language, tracks[2].Language)
	}
	merged := mergeAudio([]*muxAudio{{Language: "jpn"}}, []*muxAudio{{Language: "jpn"}, {Language: "eng"}})
	if len(merged) != 2 {
		t.Fatalf("merge kept %d tracks", len(merged))
	}
}

// TestDualAudioMux downloads a Japanese and a dub HLS stream and muxes the dub audio in as a
// second track: Japanese first and default, English second, video from the Japanese stream only.
func TestDualAudioMux(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed")
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Skip("ffprobe not installed")
	}

	src := t.TempDir()
	for _, v := range []struct{ name, freq string }{{"jp", "440"}, {"dub", "880"}} {
		gen := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error",
			"-f", "lavfi", "-i", "testsrc=size=160x120:rate=24",
			"-f", "lavfi", "-i", "sine=frequency="+v.freq,
			"-t", "4", "-c:v", "libx264", "-preset", "ultrafast", "-g", "24", "-c:a", "aac",
			"-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod",
			"-hls_segment_filename", filepath.Join(src, v.name+"%03d.ts"), filepath.Join(src, v.name+".m3u8"))
		if out, err := gen.CombinedOutput(); err != nil {
			t.Fatalf("generate %s: %v %s", v.name, err, out)
		}
	}
	srv := httptest.NewServer(http.FileServer(http.Dir(src)))
	defer srv.Close()

	work := t.TempDir()
	d := &downloader{client: NewRateLimitedClient(), provider: "test"}
	ctx := context.Background()
	jp, err := d.downloadMediaPlaylist(ctx, srv.URL+"/jp.m3u8", filepath.Join(work), "jp_", nil)
	if err != nil {
		t.Fatal(err)
	}
	dub, err := d.downloadMediaPlaylist(ctx, srv.URL+"/dub.m3u8", filepath.Join(work), "dub_", nil)
	if err != nil {
		t.Fatal(err)
	}
	if jp.Duration < 3.5 || jp.Duration > 4.5 || dub.Duration < 3.5 {
		t.Fatalf("durations: %v %v", jp.Duration, dub.Duration)
	}

	audio := mergeAudio([]*muxAudio{{Language: "jpn"}}, []*muxAudio{{Path: dub.Path, HLS: true, Language: "eng"}})
	orderAudio(audio)
	out := filepath.Join(work, "out.mkv")
	if err := mux(ctx, ffmpeg, &muxInput{VideoPath: jp.Path, VideoHLS: true, Audio: audio, DefaultSub: -1, OutputPath: out}); err != nil {
		t.Fatal(err)
	}

	probe, err := exec.Command(ffprobe, "-v", "error", "-show_entries",
		"stream=codec_type:stream_tags=language,title:stream_disposition=default", "-of", "csv=p=0", out).Output()
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(strings.ReplaceAll(string(probe), "\r", "")), "\n")
	if len(lines) != 3 {
		t.Fatalf("want 1 video + 2 audio streams, got:\n%s", probe)
	}
	if !strings.HasPrefix(lines[0], "video") ||
		lines[1] != "audio,1,jpn,Japanese" ||
		lines[2] != "audio,0,eng,English" {
		t.Fatalf("unexpected streams:\n%s", probe)
	}
}
