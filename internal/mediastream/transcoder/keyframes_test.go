package transcoder

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"seanime/internal/util"
)

// A keyframe scan that fails (here: ffprobe can't even start) must release everyone waiting on it and
// be forgotten, so a later caller starts a new scan instead of waiting forever on the failed one.
func TestGetKeyframesFailureDoesNotHang(t *testing.T) {
	dir := t.TempDir()
	settings := &Settings{
		StreamDir:   dir,
		FfprobePath: filepath.Join(dir, "no-such-ffprobe"),
	}
	logger := util.NewLogger()
	hash := "keyframes-failure-test"

	get := func() *Keyframe {
		done := make(chan *Keyframe, 1)
		go func() {
			done <- GetKeyframes(context.Background(), filepath.Join(dir, "missing.mkv"), hash, logger, settings)
		}()
		select {
		case kf := <-done:
			return kf
		case <-time.After(10 * time.Second):
			t.Fatal("GetKeyframes hung after the scan failed")
			return nil
		}
	}

	kf := get()
	// The failure is recorded right after the waiters are released.
	deadline := time.Now().Add(5 * time.Second)
	for kf.Err() == nil && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if kf.Err() == nil {
		t.Fatal("failed scan reported no error")
	}
	for keyframes.Has(hash) && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if keyframes.Has(hash) {
		t.Fatal("failed scan was not removed from the cache")
	}

	// A later caller must not hang either, and must get a fresh scan.
	if again := get(); again == kf {
		t.Fatal("later caller got the failed scan back")
	}
}
