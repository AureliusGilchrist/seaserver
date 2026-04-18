package mediastream

import (
	"fmt"
	"seanime/internal/mediastream/videofile"
	"seanime/internal/util/result"

	"github.com/rs/zerolog"
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
		logger:          repository.logger,
		repository:      repository,
		activeStreams:   result.NewMap[string, *MediaContainer](),
		mediaContainers: result.NewMap[string, *MediaContainer](),
	}
}

func (p *PlaybackManager) KillPlayback(clientId string) {
	p.logger.Debug().Str("clientId", clientId).Msg("mediastream: Killing playback for client")
	p.activeStreams.Delete(clientId)
}

func (p *PlaybackManager) KillAllPlayback() {
	p.logger.Debug().Msg("mediastream: Killing all playback")
	p.activeStreams.Clear()
}

// GetActiveStream returns the active media container for a given client.
func (p *PlaybackManager) GetActiveStream(clientId string) (*MediaContainer, bool) {
	return p.activeStreams.Get(clientId)
}

// RequestPlayback is called by the frontend to stream a media file
func (p *PlaybackManager) RequestPlayback(filepath string, streamType StreamType, clientId string) (ret *MediaContainer, err error) {

	p.logger.Debug().Str("filepath", filepath).Any("type", streamType).Str("clientId", clientId).Msg("mediastream: Requesting playback")

	// Create a new media container (or get from cache)
	container, err := p.newMediaContainer(filepath, streamType)

	if err != nil {
		p.logger.Error().Err(err).Msg("mediastream: Failed to create media container")
		return nil, fmt.Errorf("failed to create media container: %v", err)
	}

	// Store as active stream for this client
	p.activeStreams.Set(clientId, container)

	// Build client-specific stream URL
	streamUrl := ""
	switch streamType {
	case StreamTypeDirect:
		streamUrl = fmt.Sprintf("/api/v1/mediastream/direct/%s", clientId)
	case StreamTypeTranscode:
		streamUrl = fmt.Sprintf("/api/v1/mediastream/transcode/%s/master.m3u8", clientId)
	case StreamTypeOptimized:
		streamUrl = fmt.Sprintf("/api/v1/mediastream/hls/%s/master.m3u8", clientId)
	}

	// Return a per-client copy with the correct stream URL
	ret = &MediaContainer{
		Filepath:   container.Filepath,
		Hash:       container.Hash,
		StreamType: container.StreamType,
		StreamUrl:  streamUrl,
		MediaInfo:  container.MediaInfo,
	}

	p.logger.Info().Str("filepath", filepath).Str("clientId", clientId).Msg("mediastream: Ready to play media")

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

func (p *PlaybackManager) newMediaContainer(filepath string, streamType StreamType) (ret *MediaContainer, err error) {
	p.logger.Debug().Str("filepath", filepath).Any("type", streamType).Msg("mediastream: New media container requested")
	// Get the hash of the file.
	hash, err := videofile.GetHashFromPath(filepath)
	if err != nil {
		return nil, err
	}

	p.logger.Trace().Str("hash", hash).Msg("mediastream: Checking cache")

	// Check the cache ONLY if the stream type is the same.
	if mc, ok := p.mediaContainers.Get(hash); ok && mc.StreamType == streamType {
		p.logger.Debug().Str("hash", hash).Msg("mediastream: Media container cache HIT")
		return mc, nil
	}

	p.logger.Trace().Str("hash", hash).Msg("mediastream: Creating media container")

	// Get the media information of the file.
	ret = &MediaContainer{
		Filepath:   filepath,
		Hash:       hash,
		StreamType: streamType,
	}

	p.logger.Debug().Msg("mediastream: Extracting media info")

	ret.MediaInfo, err = p.repository.mediaInfoExtractor.GetInfo(p.repository.settings.MustGet().FfprobePath, filepath)
	if err != nil {
		return nil, err
	}

	p.logger.Debug().Msg("mediastream: Extracted media info")

	// Store the media container in the cache immediately so the frontend can start playback.
	// Attachment extraction (subtitles + fonts) runs in the background — they are only
	// needed when the player requests them via the /subs/ or /att/ endpoints.
	p.mediaContainers.Set(hash, ret)

	go func() {
		err := videofile.ExtractAttachment(p.repository.settings.MustGet().FfmpegPath, filepath, hash, ret.MediaInfo, p.repository.cacheDir, p.logger)
		if err != nil {
			p.logger.Error().Err(err).Msg("mediastream: Background attachment extraction failed")
		} else {
			p.logger.Debug().Msg("mediastream: Background attachment extraction complete")
		}
	}()

	return
}
