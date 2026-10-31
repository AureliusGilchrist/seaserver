package directstream

import (
	"io"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

const (
	readAheadBlockSize = 1 << 20 // 1 MiB
	// The player only keeps about ten seconds ahead of itself, so a disk that stops answering for
	// longer than that shows up as buffering. Active downloads writing to the same pool are enough
	// to do it. This keeps roughly another 30 seconds of a typical episode in memory on top.
	readAheadMaxBytes = 64 << 20 // 64 MiB
	// Where a request starts. Seeking and probing open many requests that read a few KB and leave,
	// so the window only grows with what the player has actually consumed.
	readAheadMinBytes = 4 << 20 // 4 MiB

	readAheadSlowThreshold = time.Second
)

var readAheadBlocks = sync.Pool{New: func() any {
	b := make([]byte, readAheadBlockSize)
	return &b
}}

type readAheadBlock struct {
	buf  *[]byte
	data []byte
}

// readAheadReader reads a file ahead of the player from its own goroutine, so a slow disk read
// spends the buffer instead of holding up the response. It stops reading once the buffer is full,
// which is most of the time: the player only drains it at the video's bitrate.
type readAheadReader struct {
	src    io.ReadSeekCloser
	logger *zerolog.Logger

	mu       sync.Mutex
	cond     *sync.Cond
	blocks   []readAheadBlock
	buffered int
	consumed int64
	pos      int64 // Where the next Read returns from, which is behind src while filling.
	err      error
	stop     bool
	done     chan struct{} // Set while the filling goroutine runs.
}

var _ io.ReadSeekCloser = (*readAheadReader)(nil)

func newReadAheadReader(src io.ReadSeekCloser, logger *zerolog.Logger) *readAheadReader {
	r := &readAheadReader{src: src, logger: logger}
	r.cond = sync.NewCond(&r.mu)
	return r
}

func (r *readAheadReader) target() int {
	target := int64(readAheadMinBytes) + r.consumed
	if target > readAheadMaxBytes {
		return readAheadMaxBytes
	}
	return int(target)
}

func (r *readAheadReader) fill(done chan struct{}) {
	defer close(done)

	for {
		r.mu.Lock()
		for !r.stop && r.buffered >= r.target() {
			r.cond.Wait()
		}
		if r.stop {
			r.mu.Unlock()
			return
		}
		r.mu.Unlock()

		buf := readAheadBlocks.Get().(*[]byte)
		start := time.Now()
		n, err := r.src.Read(*buf)
		if took := time.Since(start); took >= readAheadSlowThreshold && r.logger != nil {
			r.logger.Warn().Dur("took", took).Int("bytes", n).Msg("directstream: Slow disk read")
		}

		r.mu.Lock()
		if n > 0 {
			r.blocks = append(r.blocks, readAheadBlock{buf: buf, data: (*buf)[:n]})
			r.buffered += n
		} else {
			readAheadBlocks.Put(buf)
		}
		if err != nil {
			r.err = err
		}
		r.cond.Broadcast()
		r.mu.Unlock()

		if err != nil {
			return
		}
	}
}

func (r *readAheadReader) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.done == nil && r.err == nil {
		r.stop = false
		r.done = make(chan struct{})
		go r.fill(r.done)
	}

	start := time.Now()
	for len(r.blocks) == 0 && r.err == nil {
		r.cond.Wait()
	}
	// The first read of a request has nothing to wait for but the disk's first answer.
	if took := time.Since(start); took >= readAheadSlowThreshold && r.consumed > 0 && r.logger != nil {
		r.logger.Warn().Dur("took", took).Int64("position", r.pos).Msg("directstream: Read-ahead ran dry, the player was left waiting")
	}

	if len(r.blocks) == 0 {
		return 0, r.err
	}

	block := &r.blocks[0]
	n := copy(p, block.data)
	block.data = block.data[n:]
	if len(block.data) == 0 {
		readAheadBlocks.Put(block.buf)
		r.blocks[0] = readAheadBlock{}
		r.blocks = r.blocks[1:]
	}
	r.buffered -= n
	r.consumed += int64(n)
	r.pos += int64(n)
	r.cond.Broadcast()

	return n, nil
}

// halt stops the filling goroutine and waits for it, so nothing is reading src on return.
func (r *readAheadReader) halt() {
	r.mu.Lock()
	r.stop = true
	r.cond.Broadcast()
	done := r.done
	r.mu.Unlock()

	if done != nil {
		<-done
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	for _, block := range r.blocks {
		readAheadBlocks.Put(block.buf)
	}
	r.blocks = nil
	r.buffered = 0
	r.err = nil
	r.done = nil
}

func (r *readAheadReader) Seek(offset int64, whence int) (int64, error) {
	r.halt()

	// src has moved on from where the caller thinks it is.
	if whence == io.SeekCurrent {
		offset += r.pos
		whence = io.SeekStart
	}

	pos, err := r.src.Seek(offset, whence)
	if err != nil {
		return pos, err
	}
	r.pos = pos
	r.consumed = 0
	return pos, nil
}

func (r *readAheadReader) Close() error {
	r.halt()
	return r.src.Close()
}
