package unmatched

import (
	"sync"
	"testing"

	"github.com/rs/zerolog"
)

func quietScanner() *Scanner {
	logger := zerolog.Nop()
	return &Scanner{logger: &logger}
}

// A scan pass is triggered by file-system activity, and a download in progress produces nothing but
// file-system activity in the directory being watched. Every pass used to start another
// verification of the same directory: dozens of goroutines awake at once, each walking the tree and
// each logging the same line.
func TestOnlyOneVerificationPerDirectoryAtATime(t *testing.T) {
	s := quietScanner()

	if !s.beginVerifying("some.release") {
		t.Fatal("the first pass was refused the directory")
	}
	if s.beginVerifying("some.release") {
		t.Error("a second verification started while the first was still running")
	}
	// A different download is unaffected — the limit is per directory, not global.
	if !s.beginVerifying("another.release") {
		t.Error("an unrelated directory was blocked")
	}

	s.finishVerifying("some.release")
	if !s.beginVerifying("some.release") {
		t.Error("the directory was not released when its verification finished")
	}
}

func TestBeginVerifyingIsSafeConcurrently(t *testing.T) {
	s := quietScanner()

	var claimed int
	var mu sync.Mutex
	var wg sync.WaitGroup

	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if s.beginVerifying("contended") {
				mu.Lock()
				claimed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if claimed != 1 {
		t.Errorf("%d goroutines claimed the same directory, want exactly 1", claimed)
	}
}

// The verdict is worth logging when it changes, not every time it is recomputed.
func TestVerdictIsLoggedOnlyWhenItChanges(t *testing.T) {
	s := quietScanner()

	if !s.noteVerdict("release", CompletionDownloading) {
		t.Error("the first report of a state was suppressed")
	}
	for i := 0; i < 10; i++ {
		if s.noteVerdict("release", CompletionDownloading) {
			t.Fatal("an unchanged state was reported again")
		}
	}
	if !s.noteVerdict("release", CompletionUnknown) {
		t.Error("a change of state was not reported")
	}
	// Each download is tracked on its own.
	if !s.noteVerdict("other", CompletionDownloading) {
		t.Error("a different download was silenced by another's state")
	}
}
