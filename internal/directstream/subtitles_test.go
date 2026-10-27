package directstream

import (
	"bytes"
	"io"
	"testing"
	"time"

	"seanime/internal/util/result"
)

type nopSeekCloser struct{ *bytes.Reader }

func (nopSeekCloser) Close() error { return nil }

func TestRunningStreamCoversNearbyOffsetsOnly(t *testing.T) {
	s := &BaseStream{activeSubtitleStreams: result.NewMap[string, *SubtitleStream]()}
	running := &SubtitleStream{offset: 0}
	running.pos.Store(100 * 1024 * 1024)
	s.activeSubtitleStreams.Set("a", running)

	if !s.coveredByRunningStream(120 * 1024 * 1024) {
		t.Error("a stream 20 MB behind the offset should cover it")
	}
	if s.coveredByRunningStream(2 * 1024 * 1024 * 1024) {
		t.Error("a stream gigabytes behind should not cover a far seek")
	}
	running.stopped.Store(true)
	if s.coveredByRunningStream(120 * 1024 * 1024) {
		t.Error("a stopped stream covers nothing")
	}
	ahead := &SubtitleStream{offset: 500 * 1024 * 1024}
	s.activeSubtitleStreams.Set("b", ahead)
	if s.coveredByRunningStream(120 * 1024 * 1024) {
		t.Error("a stream that started after the offset cannot cover it")
	}
}

func TestThrottledReaderKeepsToItsRate(t *testing.T) {
	data := make([]byte, 400*1024)
	r := newThrottledReader(nopSeekCloser{bytes.NewReader(data)}, 1024*1024) // 1 MB/s
	start := time.Now()
	if _, err := io.Copy(io.Discard, r); err != nil {
		t.Fatal(err)
	}
	if elapsed := time.Since(start); elapsed < 350*time.Millisecond {
		t.Fatalf("400 KB at 1 MB/s took %v, want about 400ms", elapsed)
	}
}
