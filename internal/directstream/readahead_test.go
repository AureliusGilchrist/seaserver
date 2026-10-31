package directstream

import (
	"bytes"
	"io"
	"math/rand"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type countingSource struct {
	*bytes.Reader
	reads  atomic.Int64
	gate   chan struct{} // When set, each read waits for a value.
	closed atomic.Bool
}

func (s *countingSource) Read(p []byte) (int, error) {
	if s.gate != nil {
		<-s.gate
	}
	n, err := s.Reader.Read(p)
	s.reads.Add(int64(n))
	return n, err
}

func (s *countingSource) Close() error {
	s.closed.Store(true)
	return nil
}

func readAheadTestData(size int) []byte {
	data := make([]byte, size)
	rand.New(rand.NewSource(1)).Read(data)
	return data
}

func TestReadAheadReader_ReturnsTheFileInOrder(t *testing.T) {
	data := readAheadTestData(3*readAheadBlockSize + 12345)
	r := newReadAheadReader(&countingSource{Reader: bytes.NewReader(data)}, nil)
	defer r.Close()

	_, err := r.Seek(1000, io.SeekStart)
	require.NoError(t, err)

	got, err := io.ReadAll(r)
	require.NoError(t, err)
	require.True(t, bytes.Equal(data[1000:], got))
}

// http.ServeContent sniffs the start of the file and then seeks back to it.
func TestReadAheadReader_SeekAfterReading(t *testing.T) {
	data := readAheadTestData(2*readAheadBlockSize + 77)
	r := newReadAheadReader(&countingSource{Reader: bytes.NewReader(data)}, nil)
	defer r.Close()

	head := make([]byte, 512)
	_, err := io.ReadFull(r, head)
	require.NoError(t, err)

	pos, err := r.Seek(100, io.SeekCurrent)
	require.NoError(t, err)
	require.EqualValues(t, 612, pos)

	next := make([]byte, 10)
	_, err = io.ReadFull(r, next)
	require.NoError(t, err)
	require.Equal(t, data[612:622], next)

	size, err := r.Seek(0, io.SeekEnd)
	require.NoError(t, err)
	require.EqualValues(t, len(data), size)

	_, err = r.Seek(0, io.SeekStart)
	require.NoError(t, err)
	got, err := io.ReadAll(r)
	require.NoError(t, err)
	require.True(t, bytes.Equal(data, got))
}

func TestReadAheadReader_WindowGrowsWithConsumption(t *testing.T) {
	src := &countingSource{Reader: bytes.NewReader(readAheadTestData(2 * readAheadMaxBytes))}
	r := newReadAheadReader(src, nil)
	defer r.Close()

	buf := make([]byte, 1024)
	_, err := io.ReadFull(r, buf)
	require.NoError(t, err)

	// A request that reads a little and stops costs the small window, not the whole buffer.
	require.Eventually(t, func() bool { return src.reads.Load() >= readAheadMinBytes }, time.Second, time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	require.LessOrEqual(t, src.reads.Load(), int64(readAheadMinBytes+2*readAheadBlockSize))

	// A player that keeps reading gets the full buffer, and no more than that.
	_, err = io.ReadFull(r, make([]byte, readAheadMaxBytes))
	require.NoError(t, err)
	require.Eventually(t, func() bool { return src.reads.Load() >= 2*readAheadMaxBytes-readAheadBlockSize }, 5*time.Second, time.Millisecond)
	r.mu.Lock()
	buffered := r.buffered
	r.mu.Unlock()
	require.LessOrEqual(t, buffered, readAheadMaxBytes+readAheadBlockSize)
}

func TestReadAheadReader_CloseWhileFilling(t *testing.T) {
	src := &countingSource{Reader: bytes.NewReader(readAheadTestData(readAheadMaxBytes)), gate: make(chan struct{}, 1)}
	r := newReadAheadReader(src, nil)

	src.gate <- struct{}{}
	_, err := r.Read(make([]byte, 16))
	require.NoError(t, err)

	closed := make(chan struct{})
	go func() {
		_ = r.Close()
		close(closed)
	}()

	// The disk read in progress has to finish before the file can be closed under it.
	select {
	case <-closed:
		t.Fatal("closed while a read was in progress")
	case <-time.After(20 * time.Millisecond):
	}

	close(src.gate)
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("close did not return")
	}
	require.True(t, src.closed.Load())
}
