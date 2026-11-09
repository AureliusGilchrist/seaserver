package onlinestream_download

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/onlinestream"
	"strings"
	"sync/atomic"
	"testing"
)

func TestLanguageCode(t *testing.T) {
	cases := map[string]string{
		"English":                 "eng",
		"Spanish - Latin America": "spa",
		"Português (Brasil)":      "por",
		"en-US":                   "eng",
		"ger":                     "ger",
		"Arabic":                  "ara",
		"Klingon":                 "und",
		"":                        "und",
	}
	for in, want := range cases {
		if got := languageCode(in); got != want {
			t.Errorf("languageCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestChooseDefaultSubtitle(t *testing.T) {
	subs := []*downloadedSubtitle{
		{Label: "Arabic", Language: "ara"},
		{Label: "English", Language: "eng"},
		{Label: "Spanish", Language: "spa", IsDefault: true},
	}
	if got := chooseDefaultSubtitle(subs, "English"); got != 1 {
		t.Errorf("shown English: got %d", got)
	}
	if got := chooseDefaultSubtitle(subs, ""); got != 2 {
		t.Errorf("provider default: got %d", got)
	}
	subs[2].IsDefault = false
	if got := chooseDefaultSubtitle(subs, ""); got != 1 {
		t.Errorf("english fallback: got %d", got)
	}
}

func TestStripTSDisguise(t *testing.T) {
	ts := bytes.Repeat(append([]byte{0x47}, make([]byte, 187)...), 4)
	disguised := append([]byte("\x89PNG\r\n\x1a\nfakeheader"), ts...)
	r, err := stripTSDisguise(bytes.NewReader(disguised))
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	_, _ = out.ReadFrom(r)
	if !bytes.Equal(out.Bytes(), ts) {
		t.Fatalf("disguise not stripped: got %d bytes, want %d", out.Len(), len(ts))
	}
}

// TestDownloadAndMux builds a real HLS stream with ffmpeg, serves it with a host that answers 429
// now and then and requires a Referer, and checks the result is an MKV with the soft subtitles.
func TestDownloadAndMux(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed")
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Skip("ffprobe not installed")
	}

	src := t.TempDir()
	gen := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc=size=320x240:rate=24",
		"-f", "lavfi", "-i", "sine=frequency=440",
		"-t", "6", "-c:v", "libx264", "-preset", "ultrafast", "-g", "24", "-c:a", "aac",
		"-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(src, "s%03d.ts"), filepath.Join(src, "media.m3u8"))
	if out, err := gen.CombinedOutput(); err != nil {
		t.Fatalf("generate hls: %v %s", err, out)
	}
	master := "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=160x120\nlow/media.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=320x240\nmedia.m3u8\n"
	_ = os.WriteFile(filepath.Join(src, "master.m3u8"), []byte(master), 0o644)
	_ = os.WriteFile(filepath.Join(src, "en.vtt"), []byte("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there\n"), 0o644)
	_ = os.WriteFile(filepath.Join(src, "es.srt"), []byte("1\n00:00:01,000 --> 00:00:03,000\nHola\n"), 0o644)

	var requests, throttled atomic.Int64
	fs := http.FileServer(http.Dir(src))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Referer") != "https://provider.example/" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if requests.Add(1)%4 == 0 {
			throttled.Add(1)
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		fs.ServeHTTP(w, r)
	}))
	defer srv.Close()

	work := t.TempDir()
	d := &downloader{client: NewRateLimitedClient(), provider: "test", headers: map[string]string{"Referer": "https://provider.example/"}}
	ctx := context.Background()

	subs, warnings := d.downloadSubtitles(ctx, []*subtitleSource{
		{URL: srv.URL + "/en.vtt", Language: "English"},
		{URL: srv.URL + "/es.srt", Language: "Spanish"},
		{URL: srv.URL + "/thumbs.vtt", Language: "thumbnails"},
	}, work)
	if len(warnings) > 0 || len(subs) != 2 {
		t.Fatalf("subtitles: %d downloaded, warnings %v", len(subs), warnings)
	}
	for i, s := range subs {
		out := filepath.Join(work, "c"+string(rune('0'+i))+".ass")
		if err := convertSubtitleToASS(ctx, ffmpeg, s.Path, out); err != nil {
			t.Fatalf("convert %s: %v", s.Label, err)
		}
		s.Path = out
	}

	body, err := d.client.GetBytes(ctx, "test", srv.URL+"/master.m3u8", d.headers, maxPlaylistSize)
	if err != nil || !isMasterPlaylist(body) {
		t.Fatalf("master: %v", err)
	}
	base, _ := url.Parse(srv.URL + "/master.m3u8")
	v := pickVariant(parseMaster(body, base).Variants, "")
	if v == nil || !strings.HasSuffix(v.URL, "/media.m3u8") || strings.Contains(v.URL, "low") {
		t.Fatalf("picked wrong variant: %+v", v)
	}
	vdir := filepath.Join(work, "video")
	_ = os.MkdirAll(vdir, 0o755)
	var lastDone, lastTotal int
	pl, err := d.downloadMediaPlaylist(ctx, v.URL, vdir, "v_", func(done, total int, _ int64) { lastDone, lastTotal = done, total })
	if err != nil {
		t.Fatalf("download playlist: %v", err)
	}
	if lastTotal == 0 || lastDone != lastTotal {
		t.Fatalf("progress %d/%d", lastDone, lastTotal)
	}

	outPath := filepath.Join(work, "out.mkv")
	if err := mux(ctx, ffmpeg, &muxInput{
		VideoPath: pl.Path, VideoHLS: true, Subtitles: subs, DefaultSub: chooseDefaultSubtitle(subs, "English"),
		Audio: []*muxAudio{{Language: "jpn", Default: true}}, Title: "Test - 01", OutputPath: outPath,
	}); err != nil {
		t.Fatalf("mux: %v", err)
	}

	probe, err := exec.Command(ffprobe, "-v", "error", "-show_entries",
		"stream=codec_type,codec_name:stream_tags=language:stream_disposition=default", "-of", "csv=p=0", outPath).Output()
	if err != nil {
		t.Fatalf("ffprobe: %v", err)
	}
	got := string(probe)
	for _, want := range []string{"h264,video", "aac,audio", "ass,subtitle,1,eng", "ass,subtitle,0,spa"} {
		if !strings.Contains(strings.ReplaceAll(got, "\r", ""), want) {
			t.Errorf("output streams missing %q:\n%s", want, got)
		}
	}
	if throttled.Load() == 0 {
		t.Errorf("the test server never throttled; retry path not exercised")
	}
	t.Logf("requests=%d throttled=%d\n%s", requests.Load(), throttled.Load(), got)
}

// TestEncryptedHLS checks an AES-128 stream: the key is fetched through the limiter and the local
// playlist points ffmpeg at it.
func TestEncryptedHLS(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed")
	}
	src := t.TempDir()
	key := bytes.Repeat([]byte{0x2a}, 16)
	_ = os.WriteFile(filepath.Join(src, "enc.key"), key, 0o644)
	keyInfo := "enc.key\n" + filepath.Join(src, "enc.key") + "\n"
	_ = os.WriteFile(filepath.Join(src, "keyinfo"), []byte(keyInfo), 0o644)
	gen := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc=size=160x120:rate=24", "-t", "3",
		"-c:v", "libx264", "-preset", "ultrafast", "-g", "24",
		"-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod", "-hls_key_info_file", filepath.Join(src, "keyinfo"),
		"-hls_segment_filename", filepath.Join(src, "e%03d.ts"), filepath.Join(src, "enc.m3u8"))
	if out, err := gen.CombinedOutput(); err != nil {
		t.Fatalf("generate: %v %s", err, out)
	}
	srv := httptest.NewServer(http.FileServer(http.Dir(src)))
	defer srv.Close()

	work := t.TempDir()
	d := &downloader{client: NewRateLimitedClient(), provider: "test"}
	pl, err := d.downloadMediaPlaylist(context.Background(), srv.URL+"/enc.m3u8", work, "v_", nil)
	if err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(work, "out.mkv")
	if err := mux(context.Background(), ffmpeg, &muxInput{VideoPath: pl.Path, VideoHLS: true, DefaultSub: -1, OutputPath: out}); err != nil {
		t.Fatal(err)
	}
}

func TestBestSourcePicksHighestQuality(t *testing.T) {
	mk := func(q, typ string, subs int) *onlinestream.VideoSource {
		s := &onlinestream.VideoSource{Quality: q, Type: hibikeonlinestream.VideoSourceType(typ), URL: q}
		for i := 0; i < subs; i++ {
			s.Subtitles = append(s.Subtitles, &onlinestream.Subtitle{URL: "x"})
		}
		return s
	}
	cases := []struct {
		name    string
		sources []*onlinestream.VideoSource
		want    string
	}{
		{"explicit highest", []*onlinestream.VideoSource{mk("360p", "mp4", 0), mk("1080p", "mp4", 0), mk("720p", "mp4", 0)}, "1080p"},
		{"auto master beats 720p", []*onlinestream.VideoSource{mk("720p", "m3u8", 0), mk("auto", "m3u8", 0)}, "auto"},
		{"explicit 1080p beats auto", []*onlinestream.VideoSource{mk("auto", "m3u8", 0), mk("1080p", "m3u8", 0)}, "1080p"},
		{"soft subs break ties", []*onlinestream.VideoSource{mk("1080p", "m3u8", 0), mk("1080p ", "m3u8", 2)}, "1080p "},
		{"4k label", []*onlinestream.VideoSource{mk("1080p", "mp4", 0), mk("4K", "mp4", 0)}, "4K"},
	}
	for _, c := range cases {
		if got := bestSource(c.sources); got.Quality != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got.Quality, c.want)
		}
	}
}

func TestFilterAudio(t *testing.T) {
	jp := &onlinestream.VideoSource{Quality: "1080p - SubsPlease"}
	en := &onlinestream.VideoSource{Quality: "1080p - SubsPlease (Eng)"}
	if got := filterAudio([]*onlinestream.VideoSource{en, jp}, false); len(got) != 1 || got[0] != jp {
		t.Fatalf("sub picked %+v", got)
	}
	if got := filterAudio([]*onlinestream.VideoSource{en, jp}, true); len(got) != 1 || got[0] != en {
		t.Fatalf("dub picked %+v", got)
	}
	plain := &onlinestream.VideoSource{Quality: "720p"}
	if got := filterAudio([]*onlinestream.VideoSource{plain}, true); len(got) != 0 {
		t.Fatal("a source with no audio label is not a dub")
	}
}
