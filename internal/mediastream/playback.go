package mediastream

import (
	"context"
	"fmt"
	"net/url"
	"seanime/internal/mediastream/videofile"
	"seanime/internal/util/result"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"golang.org/x/sync/singleflight"
)

const (
	StreamTypeTranscode StreamType = "transcode" // On-the-fly transcoding
	StreamTypeOptimized StreamType = "optimized" // Pre-transcoded
	StreamTypeDirect    StreamType = "direct"    // Direct streaming
)

type (
	StreamType string

	PlaybackManager struct {
		logger          *zerolog.Logger
		activeStreams   *result.Map[string, *MediaContainer] // Per-client active streams, keyed by clientId.
		repository      *Repository
		mediaContainers *result.Map[string, *MediaContainer] // Temporary cache for the media containers, keyed by hash.
		// extractionStatuses tracks the outcome of the background attachment extraction
		// per file hash so that the /subs/ and /att/ endpoints can fail fast instead of
		// making the client wait when extraction has already failed.
		extractionStatuses *result.Map[string, *ExtractionStatus]
		extractions        *extractionTracker
		// idleStreams holds streams set aside by reapIdle, keyed by clientId.
		idleStreams *result.Map[string, *MediaContainer]
		activity    *result.Map[string, *clientActivity]
		// probeGroup makes concurrent requests for the same file share one stat + ffprobe.
		probeGroup singleflight.Group
	}

	ExtractionStatus struct {
		mu     sync.Mutex
		done   bool
		failed bool
		err    error
		// subsFailed is tracked separately: the subtitle files and the font attachments
		// are extracted by two independent ffmpeg invocations, and one failing must not
		// fail-fast the other's endpoint. A missing font degrades rendering (libass falls
		// back); a missing subtitle file removes it entirely — so an attachment-only
		// failure (ffmpeg refusing an unsafe embedded filename, say) must never block
		// the /subs/ endpoint.
		subsFailed bool
		// cancelled: stopped because no client plays the file any more; the next request runs it again.
		cancelled bool
		// doneCh closes when the extraction finishes (see BeginExtraction / Wait).
		doneCh   chan struct{}
		doneOnce sync.Once
	}

	PlaybackState struct {
		MediaId int `json:"mediaId"` // The media ID
	}

	MediaContainer struct {
		Filepath   string               `json:"filePath"`
		Hash       string               `json:"hash"`
		StreamType StreamType           `json:"streamType"` // Tells the frontend how to play the media.
		StreamUrl  string               `json:"streamUrl"`  // The relative endpoint to stream the media.
		MediaInfo  *videofile.MediaInfo `json:"mediaInfo"`
		//Metadata  *Metadata       `json:"metadata"`
		// todo: add more fields (e.g. metadata)
	}
)

func NewPlaybackManager(repository *Repository) *PlaybackManager {
	return &PlaybackManager{
		logger:             repository.logger,
		repository:         repository,
		activeStreams:      result.NewMap[string, *MediaContainer](),
		mediaContainers:    result.NewMap[string, *MediaContainer](),
		extractionStatuses: result.NewMap[string, *ExtractionStatus](),
		extractions:        newExtractionTracker(),
		idleStreams:        result.NewMap[string, *MediaContainer](),
		activity:           result.NewMap[string, *clientActivity](),
	}
}

// GetExtractionStatus returns the background extraction status for a file hash.
// The second return value is false when no extraction has been started for it.
func (p *PlaybackManager) GetExtractionStatus(hash string) (*ExtractionStatus, bool) {
	return p.extractionStatuses.Get(hash)
}

// BeginExtraction records that a background extraction for the file has started, so the
// /subs/ and /att/ endpoints can wait for it instead of guessing from files on disk.
func (p *PlaybackManager) BeginExtraction(hash string) {
	p.extractionStatuses.Set(hash, &ExtractionStatus{doneCh: make(chan struct{})})
}

// Wait blocks until the extraction has finished, the context ends or maxWait passes, and reports
// whether it finished. A status recorded without a running extraction counts as finished.
func (s *ExtractionStatus) Wait(ctx context.Context, maxWait time.Duration) bool {
	s.mu.Lock()
	done, ch := s.done, s.doneCh
	s.mu.Unlock()
	if done || ch == nil {
		return true
	}
	timer := time.NewTimer(maxWait)
	defer timer.Stop()
	select {
	case <-ch:
		return true
	case <-ctx.Done():
		return false
	case <-timer.C:
		return false
	}
}

// CompleteExtraction records the outcome of a background attachment extraction.
// subsErr and attErr are the outcomes of the two independent ffmpeg invocations.
func (p *PlaybackManager) CompleteExtraction(hash string, subsErr error, attErr error) {
	status := &ExtractionStatus{}
	if existing, ok := p.extractionStatuses.Get(hash); ok {
		status = existing
	}
	status.mu.Lock()
	status.done = true
	status.failed = subsErr != nil || attErr != nil
	status.err = attErr
	if status.err == nil {
		status.err = subsErr
	}
	status.subsFailed = subsErr != nil
	ch := status.doneCh
	status.mu.Unlock()
	if ch != nil {
		status.doneOnce.Do(func() { close(ch) })
	}
	p.extractionStatuses.Set(hash, status)
}

// cancelExtraction records that an extraction was stopped before it finished. Whoever waits on it is
// released with err, and the next request for the file starts it again.
func (p *PlaybackManager) cancelExtraction(hash string, err error) {
	p.CompleteExtraction(hash, err, err)
	if status, ok := p.extractionStatuses.Get(hash); ok {
		status.mu.Lock()
		status.cancelled = true
		status.mu.Unlock()
	}
}

func (s *ExtractionStatus) wasCancelled() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cancelled
}

// WaitOrFailure returns the recorded extraction error, if any. It blocks while the
// extraction is still running (up to maxWait), then returns whether it failed.
func (s *ExtractionStatus) Failure() (error, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failed {
		return s.err, true
	}
	return nil, false
}

// SubsFailure returns the recorded subtitle-extraction error, if any. Attachment
// failures are not reported here — see the note on ExtractionStatus.
func (s *ExtractionStatus) SubsFailure() (error, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.subsFailed {
		return s.err, true
	}
	return nil, false
}

func (p *PlaybackManager) KillPlayback(clientId string) {
	p.logger.Debug().Str("clientId", clientId).Msg("mediastream: Killing playback for client")
	p.activeStreams.Delete(clientId)
	p.idleStreams.Delete(clientId)
	p.activity.Delete(clientId)
	p.detachClient(clientId)
}

func (p *PlaybackManager) KillAllPlayback() {
	p.logger.Debug().Msg("mediastream: Killing all playback")
	p.activeStreams.Clear()
	p.idleStreams.Clear()
	p.activity.Clear()
	p.detachAllClients()
}

// GetActiveStream returns the active media container for a given client, and records the request.
// A stream set aside as idle is brought back.
func (p *PlaybackManager) GetActiveStream(clientId string) (*MediaContainer, bool) {
	mc, ok := p.activeStreams.Get(clientId)
	if !ok {
		mc, ok = p.idleStreams.Pop(clientId)
		if !ok {
			return nil, false
		}
		p.activeStreams.Set(clientId, mc)
		p.ensureExtraction(mc, clientId)
	}
	p.touch(clientId)
	return mc, true
}

// lookupStream returns the client's stream, active or idle, without counting it as a request.
func (p *PlaybackManager) lookupStream(clientId string) (*MediaContainer, bool) {
	if mc, ok := p.activeStreams.Get(clientId); ok {
		return mc, true
	}
	return p.idleStreams.Get(clientId)
}

// startPlayback makes the container the client's active stream (replacing whatever it played before)
// and returns the client's copy with its stream URL. The caller holds the repository's reqMu.
func (p *PlaybackManager) startPlayback(container *MediaContainer, streamType StreamType, clientId string) (ret *MediaContainer) {
	prev, hadPrev := p.lookupStream(clientId)

	active := &MediaContainer{
		Filepath:   container.Filepath,
		Hash:       container.Hash,
		StreamType: streamType,
		MediaInfo:  container.MediaInfo,
	}
	p.idleStreams.Delete(clientId)
	p.activeStreams.Set(clientId, active)
	p.touch(clientId)

	// The tracker only notices a transcoding client leaving when it asks for another transcoded file;
	// one that switches to direct play kept its encoders running for an hour.
	if hadPrev && prev.StreamType == StreamTypeTranscode && (streamType != StreamTypeTranscode || prev.Hash != active.Hash) {
		p.repository.forgetTranscodeClient(clientId)
	}

	p.ensureExtraction(active, clientId)

	// Build client-specific stream URL
	streamUrl := ""
	switch streamType {
	case StreamTypeDirect:
		// The file's hash rides along: every episode used to share one URL per client, so a <video>
		// still alive from the previous episode kept pulling the *new* file's bytes, and the browser
		// treated a new episode as the same resource. See ServeEchoDirectPlay.
		streamUrl = fmt.Sprintf("/api/v1/mediastream/direct/%s?h=%s", clientId, url.QueryEscape(active.Hash))
	case StreamTypeTranscode:
		streamUrl = fmt.Sprintf("/api/v1/mediastream/transcode/%s/master.m3u8", clientId)
	case StreamTypeOptimized:
		streamUrl = fmt.Sprintf("/api/v1/mediastream/hls/%s/master.m3u8", clientId)
	}

	// Return a per-client copy with the correct stream URL
	ret = &MediaContainer{
		Filepath:   active.Filepath,
		Hash:       active.Hash,
		StreamType: active.StreamType,
		StreamUrl:  streamUrl,
		MediaInfo:  active.MediaInfo,
	}

	p.logger.Info().Str("filepath", active.Filepath).Str("clientId", clientId).Msg("mediastream: Ready to play media")

	return
}

// PreloadPlayback is called by the frontend to preload a media container so that the data is stored in advanced
func (p *PlaybackManager) PreloadPlayback(filepath string, streamType StreamType) (ret *MediaContainer, err error) {

	p.logger.Debug().Str("filepath", filepath).Any("type", streamType).Msg("mediastream: Preloading playback")

	// Create a new media container
	ret, err = p.newMediaContainer(filepath, streamType)

	if err != nil {
		p.logger.Error().Err(err).Msg("mediastream: Failed to create media container")
		return nil, fmt.Errorf("failed to create media container: %v", err)
	}

	p.logger.Info().Str("filepath", filepath).Msg("mediastream: Ready to play media")

	return
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Optimize
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// newMediaContainer returns the file's media container and starts the background extraction.
func (p *PlaybackManager) newMediaContainer(filepath string, streamType StreamType) (ret *MediaContainer, err error) {
	mc, _, err := p.loadMediaContainer(filepath)
	if err != nil {
		return nil, err
	}
	p.ensureExtraction(mc, "")
	return &MediaContainer{
		Filepath:   mc.Filepath,
		Hash:       mc.Hash,
		StreamType: streamType,
		MediaInfo:  mc.MediaInfo,
	}, nil
}

// containerTimings says where the time of a media container lookup went.
type containerTimings struct {
	stat   time.Duration
	probe  time.Duration
	cached bool
	shared bool // joined a lookup another request had already started
}

type loadedContainer struct {
	mc      *MediaContainer
	timings containerTimings
}

// loadMediaContainer returns the media container of a file: its hash and media info. It touches the
// disk (stat, ffprobe), so it runs outside the repository's request lock; concurrent lookups of the
// same file share one run.
//
// The media info belongs to the file, not to how it is streamed, so the cached container has no
// stream type; callers copy it with theirs. (A cache hit for another stream type used to count as a
// miss, so asking for transcode and then direct play probed the file twice.)
func (p *PlaybackManager) loadMediaContainer(filepath string) (*MediaContainer, containerTimings, error) {
	v, err, shared := p.probeGroup.Do(filepath, func() (any, error) {
		var t containerTimings

		start := time.Now()
		hash, err := videofile.GetHashFromPath(filepath)
		t.stat = time.Since(start)
		if err != nil {
			return nil, err
		}

		if mc, ok := p.mediaContainers.Get(hash); ok {
			p.logger.Debug().Str("hash", hash).Msg("mediastream: Media container cache HIT")
			t.cached = true
			return loadedContainer{mc: mc, timings: t}, nil
		}

		p.logger.Debug().Str("filepath", filepath).Msg("mediastream: Extracting media info")
		start = time.Now()
		mediaInfo, err := p.repository.mediaInfoExtractor.GetInfo(p.repository.settings.MustGet().FfprobePath, filepath)
		t.probe = time.Since(start)
		if err != nil {
			return nil, err
		}

		mc := &MediaContainer{
			Filepath:  filepath,
			Hash:      hash,
			MediaInfo: mediaInfo,
		}
		p.mediaContainers.Set(hash, mc)
		return loadedContainer{mc: mc, timings: t}, nil
	})
	if err != nil {
		return nil, containerTimings{}, err
	}
	loaded := v.(loadedContainer)
	loaded.timings.shared = shared
	return loaded.mc, loaded.timings, nil
}
