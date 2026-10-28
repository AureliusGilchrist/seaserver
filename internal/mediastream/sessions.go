package mediastream

import (
	"context"
	"seanime/internal/mediastream/videofile"
	"sync"
	"sync/atomic"
	"time"
)

// Per-client sessions and the background extraction tied to them.
//
// Each file's subtitle/font extraction runs under a context shared by the clients playing that file.
// It is cancelled once the last of them moves to another file or ends its session, so a client
// skipping through episodes no longer leaves one full-file ffmpeg pass running per episode, each
// competing for the disk with the episode actually being played.

// idleStreamTimeout is how long a client's stream may go without a request before it no longer
// counts as active.
const idleStreamTimeout = 10 * time.Minute

// idleStreamForget is how long an idle stream is kept so its client can resume it.
const idleStreamForget = 6 * time.Hour

type (
	extractionJob struct {
		cancel  context.CancelFunc
		clients map[string]struct{}
	}

	clientActivity struct {
		lastSeen atomic.Int64 // unix nanoseconds of the last request
		inflight atomic.Int32 // requests being served right now (a direct-play response can last minutes)
	}

	extractionTracker struct {
		mu         sync.Mutex
		jobs       map[string]*extractionJob // by file hash
		clientHash map[string]string         // clientId -> hash of the file it plays
	}
)

func newExtractionTracker() *extractionTracker {
	return &extractionTracker{
		jobs:       make(map[string]*extractionJob),
		clientHash: make(map[string]string),
	}
}

// ensureExtraction makes sure the file's subtitles and fonts are (being) extracted, and attaches the
// client to that extraction. A client attached to another file is detached from it first. An empty
// clientId (preload) starts the extraction without attaching anyone.
func (p *PlaybackManager) ensureExtraction(mc *MediaContainer, clientId string) {
	et := p.extractions
	et.mu.Lock()
	defer et.mu.Unlock()

	if clientId != "" {
		if prev, ok := et.clientHash[clientId]; ok && prev != mc.Hash {
			p.detachLocked(clientId)
		}
		et.clientHash[clientId] = mc.Hash
	}

	if job, ok := et.jobs[mc.Hash]; ok {
		if clientId != "" {
			job.clients[clientId] = struct{}{}
		}
		return
	}

	// Finished (or failed for real) before: nothing to do. Only an extraction that was stopped
	// because everyone left is run again.
	if status, ok := p.extractionStatuses.Get(mc.Hash); ok && !status.wasCancelled() {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	job := &extractionJob{cancel: cancel, clients: make(map[string]struct{})}
	if clientId != "" {
		job.clients[clientId] = struct{}{}
	}
	et.jobs[mc.Hash] = job

	// Recorded before the goroutine starts, so a subtitle request arriving at once already sees a
	// running extraction to wait for.
	p.BeginExtraction(mc.Hash)

	settings := p.repository.settings.MustGet()
	cacheDir := p.repository.cacheDir
	go func() {
		defer cancel()
		start := time.Now()
		subsErr, attErr := videofile.ExtractAttachment(ctx, settings.FfmpegPath, mc.Filepath, mc.Hash, mc.MediaInfo, cacheDir, p.logger)

		et.mu.Lock()
		if et.jobs[mc.Hash] == job {
			delete(et.jobs, mc.Hash)
		}
		et.mu.Unlock()

		if ctx.Err() != nil {
			p.cancelExtraction(mc.Hash, ctx.Err())
			p.logger.Debug().Str("hash", mc.Hash).Dur("after", time.Since(start)).Msg("mediastream: Background attachment extraction stopped, no client is playing the file")
			return
		}
		p.CompleteExtraction(mc.Hash, subsErr, attErr)
		if attErr != nil {
			p.logger.Error().Err(attErr).Msg("mediastream: Background attachment extraction failed")
		}
		if subsErr != nil {
			p.logger.Error().Err(subsErr).Msg("mediastream: Background subtitle extraction failed")
		}
		if subsErr == nil && attErr == nil {
			p.logger.Debug().Str("hash", mc.Hash).Dur("took", time.Since(start)).Msg("mediastream: Background attachment extraction complete")
		}
	}()
}

// detachLocked detaches the client from its file's extraction, stopping it if nobody else plays the
// file. et.mu must be held.
func (p *PlaybackManager) detachLocked(clientId string) {
	et := p.extractions
	hash, ok := et.clientHash[clientId]
	if !ok {
		return
	}
	delete(et.clientHash, clientId)
	job, ok := et.jobs[hash]
	if !ok {
		return
	}
	delete(job.clients, clientId)
	if len(job.clients) == 0 {
		job.cancel()
	}
}

func (p *PlaybackManager) detachClient(clientId string) {
	p.extractions.mu.Lock()
	defer p.extractions.mu.Unlock()
	p.detachLocked(clientId)
}

func (p *PlaybackManager) detachAllClients() {
	p.extractions.mu.Lock()
	defer p.extractions.mu.Unlock()
	for clientId := range p.extractions.clientHash {
		p.detachLocked(clientId)
	}
}

// touch records a request from the client.
func (p *PlaybackManager) touch(clientId string) *clientActivity {
	a, _ := p.activity.GetOrSet(clientId, func() (*clientActivity, error) {
		return &clientActivity{}, nil
	})
	a.lastSeen.Store(time.Now().UnixNano())
	return a
}

// BeginRequest marks a long-running request (a direct-play response) for the client, so the client
// isn't counted idle while it is being served. Call the returned function when it ends.
func (p *PlaybackManager) BeginRequest(clientId string) func() {
	a := p.touch(clientId)
	a.inflight.Add(1)
	return func() {
		a.inflight.Add(-1)
		a.lastSeen.Store(time.Now().UnixNano())
	}
}

type reapedStream struct {
	clientId   string
	streamType StreamType
}

// reapIdle moves streams nobody has requested anything from for maxIdle out of the active set, so
// they no longer keep the transcoder alive, and stops their extraction. They are kept aside for a
// while: a client coming back from a long pause gets its stream back (see GetActiveStream).
func (p *PlaybackManager) reapIdle(maxIdle time.Duration) (reaped []reapedStream) {
	now := time.Now()
	p.activeStreams.Range(func(clientId string, mc *MediaContainer) bool {
		a, ok := p.activity.Get(clientId)
		if ok && (a.inflight.Load() > 0 || now.Sub(time.Unix(0, a.lastSeen.Load())) < maxIdle) {
			return true
		}
		reaped = append(reaped, reapedStream{clientId: clientId, streamType: mc.StreamType})
		return true
	})
	for _, r := range reaped {
		if mc, ok := p.activeStreams.Pop(r.clientId); ok {
			p.idleStreams.Set(r.clientId, mc)
		}
		p.detachClient(r.clientId)
		p.logger.Debug().Str("clientId", r.clientId).Msg("mediastream: Stream idle, no longer counted as active")
	}

	var forget []string
	p.idleStreams.Range(func(clientId string, _ *MediaContainer) bool {
		a, ok := p.activity.Get(clientId)
		if !ok || now.Sub(time.Unix(0, a.lastSeen.Load())) > idleStreamForget {
			forget = append(forget, clientId)
		}
		return true
	})
	for _, clientId := range forget {
		p.idleStreams.Delete(clientId)
		p.activity.Delete(clientId)
	}
	return
}

func (p *PlaybackManager) hasActiveStreams() bool {
	has := false
	p.activeStreams.Range(func(_ string, _ *MediaContainer) bool {
		has = true
		return false
	})
	return has
}
