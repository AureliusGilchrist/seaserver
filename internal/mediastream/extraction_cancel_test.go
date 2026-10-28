package mediastream

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"seanime/internal/database/models"
	"seanime/internal/mediastream/videofile"

	"github.com/rs/zerolog"
	"github.com/samber/mo"
)

// fakeFfmpegEnv makes the test binary act as an ffmpeg that never finishes (see TestMain).
const fakeFfmpegEnv = "MEDIASTREAM_TEST_FAKE_FFMPEG"

func TestMain(m *testing.M) {
	if os.Getenv(fakeFfmpegEnv) == "1" {
		if len(os.Args) > 1 && os.Args[1] == "-version" {
			_, _ = os.Stdout.WriteString("ffmpeg version fake\n")
			os.Exit(0)
		}
		time.Sleep(2 * time.Minute)
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// When the last client watching a file leaves, the file's extraction is cancelled and its ffmpeg
// stops, instead of reading the rest of the file in the background.
func TestCancellingContainerStopsExtraction(t *testing.T) {
	t.Setenv(fakeFfmpegEnv, "1")
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}

	// The console logger isn't safe for concurrent use; this test logs from several goroutines.
	nop := zerolog.Nop()
	logger := &nop
	repo := &Repository{
		logger:   logger,
		cacheDir: t.TempDir(),
		settings: mo.Some(&models.MediastreamSettings{FfmpegPath: self, FfprobePath: self}),
	}
	p := NewPlaybackManager(repo)
	repo.playbackManager = p

	mc := &MediaContainer{
		Filepath:  filepath.Join(t.TempDir(), "episode.mkv"),
		Hash:      "cancel-test",
		MediaInfo: &videofile.MediaInfo{},
	}
	p.ensureExtraction(mc, "client-a")

	status, ok := p.GetExtractionStatus(mc.Hash)
	if !ok {
		t.Fatal("no extraction started")
	}
	if status.Wait(t.Context(), 300*time.Millisecond) {
		t.Fatal("the fake ffmpeg finished on its own; the test proves nothing")
	}

	// The client moves on: nobody plays the file any more.
	start := time.Now()
	p.detachClient("client-a")
	if !status.Wait(t.Context(), 15*time.Second) {
		t.Fatal("extraction kept running after its context was cancelled")
	}
	if took := time.Since(start); took > 15*time.Second {
		t.Fatalf("ffmpeg took %s to stop", took)
	}
	if !status.wasCancelled() {
		t.Fatal("stopped extraction was not marked cancelled")
	}

	// A client coming back starts it again rather than finding a failure.
	p.ensureExtraction(mc, "client-b")
	p.extractions.mu.Lock()
	_, running := p.extractions.jobs[mc.Hash]
	p.extractions.mu.Unlock()
	if !running {
		t.Fatal("cancelled extraction was not restarted for a new client")
	}
	p.KillPlayback("client-b")
	status, _ = p.GetExtractionStatus(mc.Hash)
	if !status.Wait(t.Context(), 15*time.Second) {
		t.Fatal("restarted extraction did not stop when its session ended")
	}
}
