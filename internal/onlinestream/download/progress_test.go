package onlinestream_download

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"seanime/internal/onlinestream"
	"sync"
	"testing"

	"github.com/rs/zerolog"
)

func TestKeepDualAudio(t *testing.T) {
	r := func(lang, name string, def bool) *hlsRendition {
		return &hlsRendition{URL: lang + name, Language: lang, Name: name, Default: def}
	}
	got := keepDualAudio([]*hlsRendition{r("de", "German", false), r("en", "English", false), r("ja", "Japanese", true), r("es", "Spanish", false), r("pt", "Portuguese", false)})
	if len(got) != 2 || got[0].Language != "ja" || got[1].Language != "en" {
		t.Fatalf("got %d tracks: %+v", len(got), got)
	}
	got = keepDualAudio([]*hlsRendition{r("", "German", false), r("", "Spanish", true)})
	if len(got) != 1 || got[0].Name != "Spanish" {
		t.Fatalf("fallback: %+v", got)
	}
}

// TestProgressNeverGoesBack downloads a stream whose master lists five audio languages, the way
// Kickassanime serves them. Each audio playlist used to add its segments to the total only when
// it started, so the bar reached 100% and fell back to ~84% for every language.
func TestProgressNeverGoesBack(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed")
	}
	src := t.TempDir()
	gen := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error",
		"-f", "lavfi", "-i", "testsrc=size=160x120:rate=24", "-f", "lavfi", "-i", "sine=frequency=440",
		"-t", "4", "-c:v", "libx264", "-preset", "ultrafast", "-g", "24", "-c:a", "aac",
		"-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod",
		"-hls_segment_filename", filepath.Join(src, "s%03d.ts"), filepath.Join(src, "media.m3u8"))
	if out, err := gen.CombinedOutput(); err != nil {
		t.Fatalf("generate: %v %s", err, out)
	}
	langs := []string{"ja", "en", "de", "es", "pt"}
	master := "#EXTM3U\n"
	for i, l := range langs {
		// Each language is its own playlist (a copy of the same media is enough here).
		b, _ := os.ReadFile(filepath.Join(src, "media.m3u8"))
		_ = os.WriteFile(filepath.Join(src, "audio_"+l+".m3u8"), b, 0o644)
		def := "NO"
		if i == 0 {
			def = "YES"
		}
		master += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",LANGUAGE="` + l + `",NAME="` + l + `",DEFAULT=` + def + `,URI="audio_` + l + `.m3u8"` + "\n"
	}
	master += "#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=160x120,AUDIO=\"aud\"\nmedia.m3u8\n"
	_ = os.WriteFile(filepath.Join(src, "master.m3u8"), []byte(master), 0o644)

	srv := httptest.NewServer(http.FileServer(http.Dir(src)))
	defer srv.Close()

	logger := zerolog.Nop()
	m := NewManager(NewManagerOptions{Logger: &logger, WorkDir: t.TempDir(), LibraryPath: func() string { return "x" }})
	var (
		mu     sync.Mutex
		values []float64
	)
	m.onProgress = func(p float64) {
		mu.Lock()
		values = append(values, p)
		mu.Unlock()
	}

	it := &Item{ID: "t"}
	d := &downloader{client: NewRateLimitedClient(), provider: "test"}
	source := &onlinestream.VideoSource{URL: srv.URL + "/master.m3u8", Type: "m3u8"}

	if !m.streamHasEnglishAudio(context.Background(), d, source) {
		t.Fatal("the English rendition was not seen, a separate dub would be fetched")
	}

	files, err := m.downloadStream(context.Background(), it, d, source, t.TempDir(), "jpn", "Japanese", true, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(files.Audio) != 2 || files.Audio[0].Language != "jpn" || files.Audio[1].Language != "eng" {
		t.Fatalf("audio tracks: %+v", files.Audio)
	}

	mu.Lock()
	defer mu.Unlock()
	for i := 1; i < len(values); i++ {
		if values[i] < values[i-1] {
			t.Fatalf("progress went back from %.3f to %.3f (step %d of %d)", values[i-1], values[i], i, len(values))
		}
	}
	if last := values[len(values)-1]; last < 0.999 {
		t.Fatalf("progress ended at %.3f", last)
	}
}
