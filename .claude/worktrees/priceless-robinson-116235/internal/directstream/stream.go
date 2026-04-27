package directstream

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/library/anime"
	"seanime/internal/mkvparser"
	"seanime/internal/nativeplayer"
	"seanime/internal/util"
	"seanime/internal/util/result"
	"seanime/internal/videocore"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// Stream is the common interface for all stream types.
type Stream interface {
	// Type returns the type of the stream.
	Type() nativeplayer.StreamType
	// LoadContentType loads and returns the content type of the stream.
	// e.g. "video/mp4", "video/webm", "video/x-matroska"
	LoadContentType() string
	// ClientId returns the client ID of the current stream.
	ClientId() string
	// ProfileID returns the profile ID associated with this stream.
	ProfileID() uint
	// Media returns the media of the current stream.
	Media() *anilist.BaseAnime
	// Episode returns the episode of the current stream.
	Episode() *anime.Episode
	// ListEntryData returns the list entry data for the current stream.
	ListEntryData() *anime.EntryListData
	// EpisodeCollection returns the episode collection for the media of the current stream.
	EpisodeCollection() *anime.EpisodeCollection
	// LoadPlaybackInfo loads and returns the playback info.
	LoadPlaybackInfo() (*nativeplayer.PlaybackInfo, error)
	// GetAttachmentByName returns the attachment by name for the stream.
	// It is used to serve fonts and other attachments.
	GetAttachmentByName(filename string) (*mkvparser.AttachmentInfo, bool)
	// GetStreamHandler returns the stream handler.
	GetStreamHandler() http.Handler
	// StreamError is called when an error occurs while streaming.
	// This is used to notify the native player that an error occurred.
	// It will close the stream.
	StreamError(err error)
	// Terminate ends the stream.
	// Once this is called, the stream should not be used anymore.
	Terminate()
	// GetSubtitleEventCache accesses the subtitle event cache.
	GetSubtitleEventCache() *result.Map[string, *mkvparser.SubtitleEvent]
	// OnSubtitleFileUploaded is called when a subtitle file is uploaded.
	OnSubtitleFileUploaded(filename string, content string)
}

// getStreamHandlerByID finds the session whose stream PlaybackInfo ID matches streamID.
func (m *Manager) getStreamHandlerByID(streamID string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var found *ProfileStreamSession
		m.sessions.Range(func(_ string, s *ProfileStreamSession) bool {
			info, _ := s.Stream.LoadPlaybackInfo()
			if info != nil && info.ID == streamID {
				found = s
				return false
			}
			return true
		})
		if found == nil {
			http.Error(w, "no stream", http.StatusInternalServerError)
			return
		}
		found.Stream.GetStreamHandler().ServeHTTP(w, r)
	})
}

// getSessionByStreamID finds a session by stream playback info ID.
func (m *Manager) getSessionByStreamID(streamID string) (*ProfileStreamSession, bool) {
	var found *ProfileStreamSession
	m.sessions.Range(func(_ string, s *ProfileStreamSession) bool {
		info, _ := s.Stream.LoadPlaybackInfo()
		if info != nil && info.ID == streamID {
			found = s
			return false
		}
		return true
	})
	if found == nil {
		return nil, false
	}
	return found, true
}

func (m *Manager) PrepareNewStream(profileID uint, clientId string, step string) {
	m.prepareNewStreamForProfile(profileID, clientId, step)
}

func (m *Manager) StreamError(profileID uint, clientId string, err error) {
	// Clear the stream for the given client
	key := sessionKey(profileID, clientId)
	if session, ok := m.sessions.Get(key); ok {
		m.Logger.Warn().Err(err).Uint("profileID", profileID).Str("clientId", clientId).Msgf("directstream: Terminating stream with error")
		session.Stream.StreamError(err)
	}
}

func (m *Manager) AbortOpen(profileID uint, clientId string, err error) {
	m.abortPreparation(profileID, clientId, err)
}

func (m *Manager) prepareNewStreamForProfile(profileID uint, clientId string, step string) {
	// Cancel the previous playback for this client
	key := sessionKey(profileID, clientId)
	if session, ok := m.sessions.Get(key); ok {
		if session.PlaybackCtxCancel != nil {
			m.Logger.Trace().Uint("profileID", profileID).Str("clientId", clientId).Msgf("directstream: Cancelling previous playback")
			session.PlaybackCtxCancel()
		}
		m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msgf("directstream: Terminating previous stream before preparing new stream")
		session.Stream.Terminate()
		m.sessions.Delete(key)
	}

	m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msgf("directstream: Signaling native player that a new stream is starting")
	m.nativePlayer.OpenAndAwait(clientId, step)
}

func (m *Manager) abortPreparation(profileID uint, clientId string, err error) {
	// Cancel the previous playback for this client
	key := sessionKey(profileID, clientId)
	if session, ok := m.sessions.Get(key); ok {
		if session.PlaybackCtxCancel != nil {
			m.Logger.Trace().Uint("profileID", profileID).Str("clientId", clientId).Msgf("directstream: Cancelling previous playback")
			session.PlaybackCtxCancel()
		}
		m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msgf("directstream: Terminating previous stream before aborting")
		session.Stream.Terminate()
		m.sessions.Delete(key)
	}

	m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msgf("directstream: Signaling native player to abort stream preparation, reason: %s", err.Error())
	m.nativePlayer.AbortOpen(clientId, err.Error())
}

// loadStream loads a new stream for a profile and cancels the previous one.
// Caller should use mutex to lock the manager.
func (m *Manager) loadStream(profileID uint, stream Stream) {
	m.prepareNewStreamForProfile(profileID, stream.ClientId(), "Loading stream...")

	m.Logger.Debug().Uint("profileID", profileID).Str("clientId", stream.ClientId()).Msgf("directstream: Loading stream")

	// Create a new context for this client's playback
	ctx, cancel := context.WithCancel(context.Background())
	session := &ProfileStreamSession{
		ProfileID:         profileID,
		Stream:            stream,
		PlaybackCtx:       ctx,
		PlaybackCtxCancel: cancel,
	}
	key := sessionKey(profileID, stream.ClientId())
	m.sessions.Set(key, session)

	m.Logger.Debug().Uint("profileID", profileID).Msgf("directstream: Loading content type")
	m.nativePlayer.OpenAndAwait(stream.ClientId(), "Loading metadata...")
	contentType := stream.LoadContentType()
	if contentType == "" {
		m.Logger.Error().Uint("profileID", profileID).Msg("directstream: Failed to load content type")
		m.preStreamError(stream, fmt.Errorf("failed to load content type"))
		return
	}

	m.Logger.Debug().Uint("profileID", profileID).Msgf("directstream: Signaling native player that metadata is being loaded")

	playbackInfo, err := stream.LoadPlaybackInfo()
	if err != nil {
		m.Logger.Error().Err(err).Uint("profileID", profileID).Msg("directstream: Failed to load playback info")
		m.preStreamError(stream, fmt.Errorf("failed to load playback info: %w", err))
		return
	}

	m.Logger.Debug().Uint("profileID", profileID).Msgf("directstream: Signaling native player that stream is ready")
	m.nativePlayer.Watch(stream.ClientId(), playbackInfo)
}

func (m *Manager) listenToPlayerEvents() {
	go func() {
		defer func() {
			m.Logger.Trace().Msg("directstream: Stream loop goroutine exited")
		}()

		for {
			select {
			case event := <-m.videoCoreSubscriber.Events():
				if !event.IsNativePlayer() {
					continue
				}

				// Find the session whose stream matches this event's clientId
				var cs Stream
				var session *ProfileStreamSession
				m.sessions.Range(func(_ string, s *ProfileStreamSession) bool {
					if s.Stream.ClientId() == event.GetClientId() {
						cs = s.Stream
						session = s
						return false // stop iterating
					}
					return true
				})

				if cs == nil || session == nil {
					continue
				}

				switch event := event.(type) {
				case *videocore.VideoLoadedMetadataEvent:
					m.Logger.Debug().Msgf("directstream: Video loaded metadata")
					if lfStream, ok := cs.(*LocalFileStream); ok {
						subReader, err := lfStream.newReader()
						if err != nil {
							m.Logger.Error().Err(err).Msg("directstream: Failed to create subtitle reader")
							cs.StreamError(fmt.Errorf("failed to create subtitle reader: %w", err))
							return
						}
						lfStream.StartSubtitleStream(lfStream, session.PlaybackCtx, subReader, 0)
					} else if ts, ok := cs.(*TorrentStream); ok {
						subReader := ts.file.NewReader()
						subReader.SetResponsive()
						ts.StartSubtitleStream(ts, session.PlaybackCtx, subReader, 0)
					}
				case *videocore.VideoErrorEvent:
					m.Logger.Debug().Msgf("directstream: Video error, Error: %s", event.Error)
					cs.StreamError(errors.New(event.Error))
				case *videocore.SubtitleFileUploadedEvent:
					m.Logger.Debug().Msgf("directstream: Subtitle file uploaded, Filename: %s", event.Filename)
					cs.OnSubtitleFileUploaded(event.Filename, event.Content)
				case *videocore.VideoTerminatedEvent:
					m.Logger.Debug().Msgf("directstream: Video terminated")
					cs.Terminate()
				case *videocore.VideoCompletedEvent:
					m.Logger.Debug().Msgf("directstream: Video completed")

					if baseStream, ok := cs.(*BaseStream); ok {
						baseStream.updateProgress.Do(func() {
							mediaId := baseStream.media.GetID()
							epNum := baseStream.episode.GetProgressNumber()
							totalEpisodes := baseStream.media.GetTotalEpisodeCount()

							_ = baseStream.manager.platformRef.Get().UpdateEntryProgress(context.Background(), mediaId, epNum, &totalEpisodes)
						})
					}
				}
			}
		}
	}()
}

func (m *Manager) unloadStream(profileID uint, clientId string) {
	key := sessionKey(profileID, clientId)
	m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msg("directstream: Unloading stream")

	session, ok := m.sessions.Get(key)
	if !ok {
		m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msg("directstream: No stream to unload")
		return
	}

	// Cancel playback context
	if session.PlaybackCtxCancel != nil {
		m.Logger.Trace().Uint("profileID", profileID).Str("clientId", clientId).Msg("directstream: Cancelling playback context")
		session.PlaybackCtxCancel()
	}

	// Terminate the stream
	m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msg("directstream: Terminating stream")
	session.Stream.Terminate()

	m.sessions.Delete(key)
	m.Logger.Debug().Uint("profileID", profileID).Str("clientId", clientId).Msg("directstream: Stream unloaded successfully")
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type BaseStream struct {
	logger                 *zerolog.Logger
	clientId               string
	profileId              uint
	contentType            string
	contentTypeOnce        sync.Once
	episode                *anime.Episode
	media                  *anilist.BaseAnime
	listEntryData          *anime.EntryListData
	episodeCollection      *anime.EpisodeCollection
	playbackInfo           *nativeplayer.PlaybackInfo
	playbackInfoErr        error
	playbackInfoOnce       sync.Once
	subtitleEventCache     *result.Map[string, *mkvparser.SubtitleEvent]
	terminateOnce          sync.Once
	serveContentCancelFunc context.CancelFunc
	filename               string // Name of the file being streamed, if applicable

	// Subtitle stream management
	activeSubtitleStreams *result.Map[string, *SubtitleStream]

	manager        *Manager
	updateProgress sync.Once
}

var _ Stream = (*BaseStream)(nil)

func (s *BaseStream) GetAttachmentByName(filename string) (*mkvparser.AttachmentInfo, bool) {
	return nil, false
}

func (s *BaseStream) GetStreamHandler() http.Handler {
	return nil
}

func (s *BaseStream) LoadContentType() string {
	return s.contentType
}

func (s *BaseStream) LoadPlaybackInfo() (*nativeplayer.PlaybackInfo, error) {
	return s.playbackInfo, s.playbackInfoErr
}

func (s *BaseStream) Type() nativeplayer.StreamType {
	return ""
}

func (s *BaseStream) Media() *anilist.BaseAnime {
	return s.media
}

func (s *BaseStream) Episode() *anime.Episode {
	return s.episode
}

func (s *BaseStream) ListEntryData() *anime.EntryListData {
	return s.listEntryData
}

func (s *BaseStream) EpisodeCollection() *anime.EpisodeCollection {
	return s.episodeCollection
}

func (s *BaseStream) ClientId() string {
	return s.clientId
}

func (s *BaseStream) ProfileID() uint {
	return s.profileId
}

// PlaybackCtx returns the playback context for this stream's session.
// Returns context.Background() if no session is found.
func (s *BaseStream) PlaybackCtx() context.Context {
	key := sessionKey(s.profileId, s.clientId)
	if session, ok := s.manager.sessions.Get(key); ok {
		return session.PlaybackCtx
	}
	return context.Background()
}

func (s *BaseStream) Terminate() {
	s.terminateOnce.Do(func() {
		// Cancel the playback context for this session
		key := sessionKey(s.profileId, s.clientId)
		if session, ok := s.manager.sessions.Get(key); ok {
			if session.PlaybackCtxCancel != nil {
				session.PlaybackCtxCancel()
			}
		}

		// Cancel all active subtitle streams
		s.activeSubtitleStreams.Range(func(_ string, s *SubtitleStream) bool {
			s.cleanupFunc()
			return true
		})
		s.activeSubtitleStreams.Clear()

		s.subtitleEventCache.Clear()
	})
}

func (s *BaseStream) StreamError(err error) {
	s.logger.Error().Err(err).Msg("directstream: Stream error occurred")
	s.manager.nativePlayer.Error(s.clientId, err)
	s.Terminate()
	s.manager.playbackMu.Lock()
	s.manager.unloadStream(s.profileId, s.clientId)
	s.manager.playbackMu.Unlock()
}

func (s *BaseStream) GetSubtitleEventCache() *result.Map[string, *mkvparser.SubtitleEvent] {
	return s.subtitleEventCache
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// loadContentType loads the content type of the file.
// If the content type cannot be determined from the file extension,
// the first reader will be used to determine the content type.
func loadContentType(path string, reader ...io.ReadSeekCloser) string {
	ext := filepath.Ext(path)

	switch ext {
	case ".mp4":
		return "video/mp4"
	case ".mkv":
		// Serve MKV as video/mp4 rather than video/webm.
		// MKV commonly contains H.264/HEVC which video/mp4 handles correctly
		// across all browsers and WebView2 (Tauri desktop).
		// video/webm misleads clients into expecting VP8/VP9/AV1 codecs.
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".m4v":
		return "video/mp4"
	case ".avi":
		return "video/x-msvideo"
	case ".mov":
		return "video/quicktime"
	case ".flv":
		return "video/x-flv"
	default:
	}

	// No extension found
	// Read the first 1KB to determine the content type
	if len(reader) > 0 {
		if mimeType, ok := mkvparser.ReadIsMkvOrWebm(reader[0]); ok {
			return mimeType
		}
	}

	return ""
}

func (m *Manager) preStreamError(stream Stream, err error) {
	stream.Terminate()
	m.nativePlayer.Error(stream.ClientId(), err)
	m.unloadStream(stream.ProfileID(), stream.ClientId())
}

func (m *Manager) getContentTypeAndLength(url string) (string, int64, error) {
	m.Logger.Trace().Msg("directstream(debrid): Fetching content type and length using HEAD request")

	// Create client with timeout for HEAD request (faster timeout since it's just headers)
	headClient := &http.Client{
		Timeout: 5 * time.Second,
	}

	// Try HEAD request first
	resp, err := headClient.Head(url)
	if err == nil {
		defer resp.Body.Close()

		contentType := resp.Header.Get("Content-Type")
		contentLengthStr := resp.Header.Get("Content-Length")

		// Parse content length
		var length int64
		if contentLengthStr != "" {
			length, err = strconv.ParseInt(contentLengthStr, 10, 64)
			if err != nil {
				m.Logger.Error().Err(err).Str("contentType", contentType).Str("contentLength", contentLengthStr).
					Msg("directstream(debrid): Failed to parse content length from header")
				return "", 0, fmt.Errorf("failed to parse content length: %w", err)
			}
		}

		// If we have content type, return early
		if contentType != "" {
			return contentType, length, nil
		}

		m.Logger.Trace().Msg("directstream(debrid): Content type not found in HEAD response headers")
	} else {
		m.Logger.Trace().Err(err).Msg("directstream(debrid): HEAD request failed")
	}

	// Fall back to GET with Range request (either HEAD failed or no content type in headers)
	m.Logger.Trace().Msg("directstream(debrid): Falling back to GET request")

	// Create client with longer timeout for GET request (downloading content)
	getClient := &http.Client{
		Timeout: 15 * time.Second,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", 0, fmt.Errorf("failed to create GET request: %w", err)
	}

	req.Header.Set("Range", "bytes=0-511")

	resp, err = getClient.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("GET request failed: %w", err)
	}
	defer resp.Body.Close()

	// Parse total length from Content-Range header (for Range requests)
	// Format: "bytes 0-511/1234567" where 1234567 is the total size
	var length int64
	if contentRange := resp.Header.Get("Content-Range"); contentRange != "" {
		// Extract total size from Content-Range header
		if idx := strings.LastIndex(contentRange, "/"); idx != -1 {
			totalSizeStr := contentRange[idx+1:]
			if totalSizeStr != "*" { // "*" means unknown size
				length, err = strconv.ParseInt(totalSizeStr, 10, 64)
				if err != nil {
					m.Logger.Warn().Err(err).Str("contentRange", contentRange).
						Msg("directstream(debrid): Failed to parse total size from Content-Range")
				}
			}
		}
	} else if contentLengthStr := resp.Header.Get("Content-Length"); contentLengthStr != "" {
		// Fallback to Content-Length if Content-Range not present (server might not support ranges)
		length, err = strconv.ParseInt(contentLengthStr, 10, 64)
		if err != nil {
			m.Logger.Warn().Err(err).Str("contentLength", contentLengthStr).
				Msg("directstream(debrid): Failed to parse content length from GET response")
		}
	}

	// Check if server provided Content-Type in GET response
	contentType := resp.Header.Get("Content-Type")
	if contentType != "" {
		return contentType, length, nil
	}

	// Read only what's needed for content type detection
	buf := make([]byte, 512)
	n, err := io.ReadFull(resp.Body, buf)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return "", 0, fmt.Errorf("failed to read response body: %w", err)
	}

	contentType = http.DetectContentType(buf[:n])

	return contentType, length, nil
}

type StreamInfo struct {
	ContentType   string
	ContentLength int64
}

func (m *Manager) FetchStreamInfo(streamUrl string) (info *StreamInfo, canStream bool) {
	hasExtension, isArchive := IsArchive(streamUrl)

	m.Logger.Debug().Str("url", streamUrl).Msg("directstream(http): Fetching stream info")

	// If we were able to verify that the stream URL is an archive, we can't stream it
	if isArchive {
		m.Logger.Warn().Str("url", streamUrl).Msg("directstream(http): Stream URL is an archive, cannot stream")
		return nil, false
	}

	// If the stream URL has an extension, we can stream it
	if hasExtension {
		// Strip query params before checking extension
		cleanUrl := streamUrl
		if idx := strings.IndexByte(cleanUrl, '?'); idx != -1 {
			cleanUrl = cleanUrl[:idx]
		}
		ext := filepath.Ext(cleanUrl)
		// If not a valid video extension, we can't stream it
		if !util.IsValidVideoExtension(ext) {
			m.Logger.Warn().Str("url", streamUrl).Str("ext", ext).Msg("directstream(http): Stream URL has an invalid video extension, cannot stream")
			return nil, false
		}
	}

	// We'll fetch headers to get the info
	// If the headers are not available, we can't stream it

	contentType, contentLength, err := m.getContentTypeAndLength(streamUrl)
	if err != nil {
		m.Logger.Error().Err(err).Str("url", streamUrl).Msg("directstream(http): Failed to fetch content type and length")
		return nil, false
	}

	// If not a video content type, we can't stream it
	if !strings.HasPrefix(contentType, "video/") && contentType != "application/octet-stream" && contentType != "application/force-download" {
		m.Logger.Warn().Str("url", streamUrl).Str("contentType", contentType).Msg("directstream(http): Stream URL has an invalid content type, cannot stream")
		return nil, false
	}

	return &StreamInfo{
		ContentType:   contentType,
		ContentLength: contentLength,
	}, true
}

func IsArchive(streamUrl string) (hasExtension bool, isArchive bool) {
	// Strip query params before checking extension
	u := streamUrl
	if idx := strings.IndexByte(u, '?'); idx != -1 {
		u = u[:idx]
	}
	ext := filepath.Ext(u)
	if ext == ".zip" || ext == ".rar" {
		return true, true
	}

	if ext != "" {
		return true, false
	}

	return false, false
}
