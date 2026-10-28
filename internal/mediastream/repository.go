package mediastream

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/mediastream/optimizer"
	"seanime/internal/mediastream/transcoder"
	"seanime/internal/mediastream/videofile"
	"seanime/internal/util/filecache"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"github.com/samber/mo"
)

type (
	Repository struct {
		transcoder         mo.Option[*transcoder.Transcoder]
		optimizer          *optimizer.Optimizer
		settings           mo.Option[*models.MediastreamSettings]
		playbackManager    *PlaybackManager
		mediaInfoExtractor *videofile.MediaInfoExtractor
		logger             *zerolog.Logger
		wsEventManager     events.WSEventManagerInterface
		fileCacher         *filecache.Cacher
		reqMu              sync.Mutex
		cacheDir           string // where attachments are stored
		transcodeDir       string // where stream segments are stored
	}

	NewRepositoryOptions struct {
		Logger         *zerolog.Logger
		WSEventManager events.WSEventManagerInterface
		FileCacher     *filecache.Cacher
	}
)

func NewRepository(opts *NewRepositoryOptions) *Repository {
	ret := &Repository{
		logger: opts.Logger,
		optimizer: optimizer.NewOptimizer(&optimizer.NewOptimizerOptions{
			Logger:         opts.Logger,
			WSEventManager: opts.WSEventManager,
		}),
		settings:           mo.None[*models.MediastreamSettings](),
		transcoder:         mo.None[*transcoder.Transcoder](),
		wsEventManager:     opts.WSEventManager,
		fileCacher:         opts.FileCacher,
		mediaInfoExtractor: videofile.NewMediaInfoExtractor(opts.FileCacher, opts.Logger),
	}
	ret.playbackManager = NewPlaybackManager(ret)

	go ret.reapIdleStreamsLoop()

	return ret
}

// reapIdleStreamsLoop sets aside streams that have gone quiet (a closed tab never says goodbye), so
// they stop counting as active and the transcoder can be reset once nobody is watching.
func (r *Repository) reapIdleStreamsLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		if !r.IsInitialized() {
			continue
		}
		r.reqMu.Lock()
		reaped := r.playbackManager.reapIdle(idleStreamTimeout)
		for _, s := range reaped {
			if s.streamType == StreamTypeTranscode {
				r.forgetTranscodeClient(s.clientId)
			}
		}
		if len(reaped) > 0 {
			r.resetTranscoderIfIdle()
		}
		r.reqMu.Unlock()
	}
}

func (r *Repository) IsInitialized() bool {
	return r.settings.IsPresent()
}

func (r *Repository) OnCleanup() {

}

func (r *Repository) InitializeModules(settings *models.MediastreamSettings, cacheDir string, transcodeDir string) {
	if settings == nil {
		r.logger.Error().Msg("mediastream: Settings not present")
		return
	}
	// Create the temp directory
	err := os.MkdirAll(transcodeDir, 0755)
	if err != nil {
		r.logger.Error().Err(err).Msg("mediastream: Failed to create transcode directory")
	}

	if settings.FfmpegPath == "" {
		settings.FfmpegPath = "ffmpeg"
	}

	if settings.FfprobePath == "" {
		settings.FfprobePath = "ffprobe"
	}

	// Set the settings
	r.settings = mo.Some[*models.MediastreamSettings](settings)

	r.cacheDir = cacheDir
	r.transcodeDir = transcodeDir

	// Set the optimizer settings
	r.optimizer.SetLibraryDir(settings.PreTranscodeLibraryDir)

	// Initialize the transcoder
	if ok := r.initializeTranscoder(r.settings); ok {
	}

	// Warm up ffmpeg/ffprobe in the background so the first stream doesn't pay the
	// binary cold-start + hardware-acceleration probing cost. This addresses the
	// first-launch lag where subtitles/streams stutter until the process warms up.
	go r.warmUp(settings)

	r.logger.Info().Msg("mediastream: Module initialized")
}

// warmUp pre-warms the ffmpeg and ffprobe binaries (OS binary cache) and memoizes the
// hardware-acceleration filter probe so the first playback request is not delayed by
// cold-start costs. It is safe to run in the background and errors are non-fatal.
func (r *Repository) warmUp(settings *models.MediastreamSettings) {
	if settings == nil {
		return
	}

	ffmpegPath := settings.FfmpegPath
	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}
	ffprobePath := settings.FfprobePath
	if ffprobePath == "" {
		ffprobePath = "ffprobe"
	}

	// Log the ffmpeg version so extraction/streaming issues can be matched against the
	// binary actually in use (distro builds vary wildly in supported options and codecs).
	videofile.LogFfmpegVersion(ffmpegPath, r.logger)

	// Memoize `ffmpeg -filters` so hardware-accel probing is instant on first stream.
	transcoder.WarmUpHardwareAccel(ffmpegPath)

	// Touch ffprobe so its binary is resident in the OS cache before the first probe.
	_ = exec.Command(ffprobePath, "-version").Run()

	r.logger.Debug().Msg("mediastream: Warm-up complete (ffmpeg/ffprobe ready)")
}

// CacheWasCleared should be called when the cache directory is manually cleared.
func (r *Repository) CacheWasCleared() {
	r.playbackManager.mediaContainers.Clear()
	// The extracted subtitles and fonts went with the cache, so they must be extracted again.
	r.playbackManager.extractionStatuses.Clear()
}

func (r *Repository) ClearTranscodeDir() {
	r.reqMu.Lock()
	defer r.reqMu.Unlock()

	r.logger.Trace().Msg("mediastream: Clearing transcode directory")

	// Empty the transcode directory
	if r.transcodeDir != "" {
		files, err := os.ReadDir(r.transcodeDir)
		if err != nil {
			r.logger.Error().Err(err).Msg("mediastream: Failed to read transcode directory")
			return
		}

		for _, file := range files {
			err = os.RemoveAll(filepath.Join(r.transcodeDir, file.Name()))
			if err != nil {
				r.logger.Error().Err(err).Msg("mediastream: Failed to remove file from transcode directory")
			}
		}
	}

	r.logger.Debug().Msg("mediastream: Transcode directory cleared")

	r.playbackManager.mediaContainers.Clear()
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Optimize
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type StartMediaOptimizationOptions struct {
	Filepath          string
	Quality           optimizer.Quality
	AudioChannelIndex int
}

func (r *Repository) StartMediaOptimization(opts *StartMediaOptimizationOptions) (err error) {
	if !r.IsInitialized() {
		return errors.New("module not initialized")
	}

	mediaInfo, err := r.mediaInfoExtractor.GetInfo(r.settings.MustGet().FfmpegPath, opts.Filepath)
	if err != nil {
		return
	}

	err = r.optimizer.StartMediaOptimization(&optimizer.StartMediaOptimizationOptions{
		Filepath:  opts.Filepath,
		Quality:   opts.Quality,
		MediaInfo: mediaInfo,
	})
	return
}

func (r *Repository) RequestOptimizedStream(filepath string, clientId string) (ret *MediaContainer, err error) {
	return r.requestPlayback(filepath, StreamTypeOptimized, clientId)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Transcode
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

func (r *Repository) TranscoderIsInitialized() bool {
	return r.IsInitialized() && r.transcoder.IsPresent()
}

func (r *Repository) RequestTranscodeStream(filepath string, clientId string) (ret *MediaContainer, err error) {
	r.logger.Debug().Str("filepath", filepath).Msg("mediastream: Transcode stream requested")
	return r.requestPlayback(filepath, StreamTypeTranscode, clientId)
}

// requestPlayback makes the file the client's stream. Reading the file (stat, ffprobe) happens before
// taking reqMu: it can take seconds on a NAS, and every other client's request used to queue behind it.
func (r *Repository) requestPlayback(filepath string, streamType StreamType, clientId string) (ret *MediaContainer, err error) {
	if !r.IsInitialized() {
		return nil, errors.New("module not initialized")
	}

	start := time.Now()
	container, timings, err := r.playbackManager.loadMediaContainer(filepath)
	if err != nil {
		r.logger.Error().Err(err).Str("filepath", filepath).Msg("mediastream: Failed to create media container")
		return nil, fmt.Errorf("failed to create media container: %v", err)
	}

	lockStart := time.Now()
	r.reqMu.Lock()
	defer r.reqMu.Unlock()
	lockWait := time.Since(lockStart)

	if streamType == StreamTypeTranscode {
		// Initialize the transcoder if it isn't already running. The transcoder itself supports
		// multiple concurrent FileStreams (keyed by file path), so it must stay alive across
		// requests — recreating it here on every request would destroy every other client's
		// in-flight ffmpeg process (see initializeTranscoder/Transcoder.Destroy), which is what
		// caused concurrent clients (e.g. web + denshi) to fail to start ffmpeg for each other.
		// Settings changes are picked up via InitOrRefreshMediastreamSettings -> InitializeModules,
		// not here.
		if !r.transcoder.IsPresent() {
			if ok := r.initializeTranscoder(r.settings); !ok {
				return nil, errors.New("real-time transcoder not initialized, check your settings")
			}
		}
	}

	ret = r.playbackManager.startPlayback(container, streamType, clientId)

	r.logger.Info().
		Str("clientId", clientId).
		Str("type", string(streamType)).
		Dur("stat", timings.stat).
		Dur("probe", timings.probe).
		Bool("cached", timings.cached).
		Bool("shared", timings.shared).
		Dur("lockWait", lockWait).
		Dur("total", time.Since(start)).
		Msg("mediastream: Playback request timing")

	return ret, nil
}

func (r *Repository) RequestPreloadTranscodeStream(filepath string) (err error) {
	r.logger.Debug().Str("filepath", filepath).Msg("mediastream: Transcode stream preloading requested")

	if !r.IsInitialized() {
		return errors.New("module not initialized")
	}

	_, err = r.playbackManager.PreloadPlayback(filepath, StreamTypeTranscode)

	return
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Direct Play
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

func (r *Repository) RequestDirectPlay(filepath string, clientId string) (ret *MediaContainer, err error) {
	r.logger.Debug().Str("filepath", filepath).Msg("mediastream: Direct play requested")
	return r.requestPlayback(filepath, StreamTypeDirect, clientId)
}

func (r *Repository) RequestPreloadDirectPlay(filepath string) (err error) {
	r.logger.Debug().Str("filepath", filepath).Msg("mediastream: Direct stream preloading requested")

	if !r.IsInitialized() {
		return errors.New("module not initialized")
	}

	_, err = r.playbackManager.PreloadPlayback(filepath, StreamTypeDirect)

	return
}

// GetFilePathByClientId resolves the underlying file path for a given mediastream client session.
func (r *Repository) GetFilePathByClientId(clientId string) (string, error) {
	mc, found := r.playbackManager.lookupStream(clientId)
	if !found {
		return "", errors.New("no active stream for client")
	}
	return mc.Filepath, nil
}

///////////////////////////////////////////////////////////////////////////////////////////////

// initializeTranscoder replaces the transcoder with a new one built from the settings. The old one is
// shut down in the background; the new one has already moved its segments aside (NewTranscoder).
// The caller holds reqMu, or is setting the module up.
func (r *Repository) initializeTranscoder(settings mo.Option[*models.MediastreamSettings]) bool {
	old, hadOld := r.transcoder.Get()

	// The old transcoder stays in place until the new one is ready, so a segment request arriving
	// meanwhile doesn't find none.
	ok := r.createTranscoder(settings)
	if !ok {
		r.transcoder = mo.None[*transcoder.Transcoder]()
	}
	if hadOld {
		go func() {
			if ok {
				old.Stop()
			} else {
				old.Destroy()
			}
		}()
	}
	return ok
}

// resetTranscoderIfIdle replaces the transcoder once no client is streaming anything, so a session's
// leftover encoders and segments go away. The caller holds reqMu.
func (r *Repository) resetTranscoderIfIdle() bool {
	if r.playbackManager.hasActiveStreams() || !r.transcoder.IsPresent() {
		return false
	}
	r.logger.Debug().Msg("mediastream: No active streams, resetting the transcoder")
	r.initializeTranscoder(r.settings)
	return true
}

// forgetTranscodeClient stops the encoders only this client was using. The caller holds reqMu.
func (r *Repository) forgetTranscodeClient(clientId string) {
	if tc, ok := r.transcoder.Get(); ok {
		tc.ForgetClient(clientId)
	}
}

func (r *Repository) createTranscoder(settings mo.Option[*models.MediastreamSettings]) bool {
	// If the transcoder is not enabled, don't initialize the transcoder
	if !settings.MustGet().TranscodeEnabled {
		return false
	}

	// If the temp directory is not set, don't initialize the transcoder
	if r.transcodeDir == "" {
		r.logger.Error().Msg("mediastream: Transcode directory not set, could not initialize transcoder")
		return false
	}

	opts := &transcoder.NewTranscoderOptions{
		Logger:                r.logger,
		HwAccelKind:           settings.MustGet().TranscodeHwAccel,
		Preset:                settings.MustGet().TranscodePreset,
		FfmpegPath:            settings.MustGet().FfmpegPath,
		FfprobePath:           settings.MustGet().FfprobePath,
		HwAccelCustomSettings: settings.MustGet().TranscodeHwAccelCustomSettings,
		TempOutDir:            r.transcodeDir,
	}

	tc, err := transcoder.NewTranscoder(opts)
	if err != nil {
		r.logger.Error().Err(err).Msg("mediastream: Failed to initialize transcoder")
		return false
	}

	r.playbackManager.mediaContainers.Clear()

	r.logger.Info().Msg("mediastream: Transcoder module initialized")
	r.transcoder = mo.Some[*transcoder.Transcoder](tc)

	return true
}
