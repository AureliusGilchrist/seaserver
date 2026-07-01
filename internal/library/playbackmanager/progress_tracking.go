package playbackmanager

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/api/aniskip"
	"seanime/internal/api/filler"
	"seanime/internal/continuity"
	discordrpc_presence "seanime/internal/discordrpc/presence"
	"seanime/internal/events"
	"seanime/internal/library/anime"
	"seanime/internal/mediaplayers/mediaplayer"
	"seanime/internal/platforms/shared_platform"
	"seanime/internal/util"
	"strconv"
	"time"

	"github.com/samber/mo"
)

// aniskipData holds the OP/ED intervals fetched from AniSkip for the current episode.
type aniskipData struct {
	opStart float64
	opEnd   float64
	edStart float64
	edEnd   float64
	hasOP   bool
	hasED   bool
}

var (
	ErrProgressUpdateAnilist = errors.New("playback manager: Failed to update progress on AniList")
	ErrProgressUpdateMAL     = errors.New("playback manager: Failed to update progress on MyAnimeList")
)

func (pm *PlaybackManager) listenToMediaPlayerEvents(ctx context.Context) {
	// Listen for media player events
	go func() {
		for {
			select {
			// Stop listening when the context is cancelled -- meaning a new MediaPlayer instance is set
			case <-ctx.Done():
				return
			case event := <-pm.mediaPlayerRepoSubscriber.EventCh:
				switch e := event.(type) {
				// Local file events
				case mediaplayer.TrackingStartedEvent: // New video has started playing
					pm.handleTrackingStarted(e.Status)
				case mediaplayer.VideoCompletedEvent: // Video has been watched completely but still tracking
					pm.handleVideoCompleted(e.Status)
				case mediaplayer.TrackingStoppedEvent: // Tracking has stopped completely
					pm.handleTrackingStopped(e.Reason)
				case mediaplayer.PlaybackStatusEvent: // Playback status has changed
					pm.handlePlaybackStatus(e.Status)
				case mediaplayer.TrackingRetryEvent: // Error occurred while starting tracking
					pm.handleTrackingRetry(e.Reason)

				// Streaming events
				case mediaplayer.StreamingTrackingStartedEvent:
					pm.handleStreamingTrackingStarted(e.Status)
				case mediaplayer.StreamingPlaybackStatusEvent:
					pm.handleStreamingPlaybackStatus(e.Status)
				case mediaplayer.StreamingVideoCompletedEvent:
					pm.handleStreamingVideoCompleted(e.Status)
				case mediaplayer.StreamingTrackingStoppedEvent:
					pm.handleStreamingTrackingStopped(e.Reason)
				case mediaplayer.StreamingTrackingRetryEvent:
					pm.handleTrackingRetry(e.Reason)
				}
			}
		}
	}()
}

func (pm *PlaybackManager) handleTrackingStarted(status *mediaplayer.PlaybackStatus) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	// Set the playback type
	pm.currentPlaybackType = LocalFilePlayback

	// Reset the history map
	pm.historyMap = make(map[string]PlaybackState)

	// Reset activity recording flag for this new session
	pm.activeProfileIDMu.Lock()
	pm.activityRecorded = false
	pm.activeProfileIDMu.Unlock()

	// Reset session-level last-synced episode tracking
	pm.sessionLastSyncedEpisodeMu.Lock()
	pm.sessionLastSyncedEpisode = nil
	pm.sessionLastSyncedEpisodeMu.Unlock()

	// Set the current media playback status
	pm.currentMediaPlaybackStatus = status

	// Resolve the local file details FIRST so the playback state has real data.
	// Previously this was done after building the state, causing the client to
	// receive an empty PlaybackState{} on the TrackingStarted event.
	pm.Logger.Debug().Msg("playback manager: Tracking started, extracting metadata...")
	currentMediaListEntry, currentLocalFile, currentLocalFileWrapperEntry, err := pm.getLocalFilePlaybackDetails(status.Filepath)
	if err != nil {
		pm.Logger.Warn().Err(err).Msg("playback manager: Could not match file for tracking — playback continues without progress tracking")
		pm.sendEventToCurrentClient(events.WarningToast, "Playing without tracking: "+err.Error())
		return
	}

	pm.currentMediaListEntry = mo.Some(currentMediaListEntry)
	pm.currentLocalFile = mo.Some(currentLocalFile)
	pm.currentLocalFileWrapperEntry = mo.Some(currentLocalFileWrapperEntry)
	pm.Logger.Debug().
		Str("media", pm.currentMediaListEntry.MustGet().GetMedia().GetPreferredTitle()).
		Int("episode", pm.currentLocalFile.MustGet().GetEpisodeNumber()).
		Msg("playback manager: Playback started")

	// Now build the playback state — fields are populated, so this has real values.
	_ps := pm.getLocalFilePlaybackState(status)
	// Send event to the client
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressTrackingStarted, _ps)

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- PlaybackStatusChangedEvent{Status: *status, State: _ps}
			value.EventCh <- VideoStartedEvent{Filename: status.Filename, Filepath: status.Filepath}
			return true
		})
	}()

	pm.continuityManager.SetExternalPlayerEpisodeDetails(&continuity.ExternalPlayerEpisodeDetails{
		EpisodeNumber: pm.currentLocalFile.MustGet().GetEpisodeNumber(),
		MediaId:       pm.currentMediaListEntry.MustGet().GetMedia().GetID(),
		Filepath:      pm.currentLocalFile.MustGet().GetPath(),
	})

	// append next episode to media player if no playlist is active
	if !pm.isPlaylistActive.Load() && pm.settings.AutoPlayNextEpisode {
		if nextEpisode, ok := currentLocalFileWrapperEntry.FindNextEpisode(currentLocalFile); ok {
			pm.Logger.Debug().Msg("playback manager: Appending next episode file path to media player")
			_ = pm.MediaPlayerRepository.Append(nextEpisode.Path)
		}
	}

	// ------- AniSkip auto-skip (mpv/IINA) ------- //
	pm.currentAniSkipData = nil
	pm.aniSkipSkippedOP = false
	pm.aniSkipSkippedED = false
	dbSettings, _ := pm.Database.GetSettings()
	var mpvAutoSkipOpening, mpvAutoSkipEnding bool
	if dbSettings != nil && dbSettings.MediaPlayer != nil {
		mpvAutoSkipOpening = dbSettings.MediaPlayer.MpvAutoSkipOpening
		mpvAutoSkipEnding = dbSettings.MediaPlayer.MpvAutoSkipEnding
	}
	if mpvAutoSkipOpening || mpvAutoSkipEnding {
		malIdPtr := currentMediaListEntry.GetMedia().GetIDMal()
		episodeNumber := currentLocalFileWrapperEntry.GetProgressNumber(currentLocalFile)
		if malIdPtr != nil && *malIdPtr > 0 && episodeNumber > 0 {
			go func(malId, ep int) {
				data, err := aniskip.FetchSkipData(malId, ep)
				if err != nil {
					pm.Logger.Warn().Err(err).Int("malId", malId).Int("episode", ep).Msg("playback manager: AniSkip fetch failed")
					return
				}
				if data == nil {
					return
				}
				sd := &aniskipData{}
				if data.OP != nil {
					sd.hasOP = true
					sd.opStart = data.OP.Interval.StartTime
					sd.opEnd = data.OP.Interval.EndTime
				}
				if data.ED != nil {
					sd.hasED = true
					sd.edStart = data.ED.Interval.StartTime
					sd.edEnd = data.ED.Interval.EndTime
				}
				pm.eventMu.Lock()
				pm.currentAniSkipData = sd
				pm.eventMu.Unlock()
				pm.Logger.Debug().Int("malId", malId).Int("episode", ep).Msg("playback manager: AniSkip data loaded")
			}(*malIdPtr, episodeNumber)
		}
	}

	// ------- Filler skip (mpv/IINA) ------- //
	pm.currentFillerEpisodes = nil
	var mpvAutoSkipFiller bool
	if dbSettings != nil && dbSettings.MediaPlayer != nil {
		mpvAutoSkipFiller = dbSettings.MediaPlayer.MpvAutoSkipFiller
	}
	if mpvAutoSkipFiller {
		media := currentMediaListEntry.GetMedia()
		titles := []string{media.GetRomajiTitleSafe(), media.GetEnglishTitleSafe()}
		episodeNumber := currentLocalFileWrapperEntry.GetProgressNumber(currentLocalFile)
		go func(titles []string, currentEp int, wrapperEntry *anime.LocalFileWrapperEntry, currentLF *anime.LocalFile) {
			af := filler.NewAnimeFillerList(pm.Logger)
			result, err := af.Search(filler.SearchOptions{Titles: titles})
			if err != nil || result == nil {
				pm.Logger.Warn().Err(err).Msg("playback manager: Filler search failed")
				return
			}
			data, err := af.FindFillerData(result.Slug)
			if err != nil || data == nil {
				pm.Logger.Warn().Err(err).Msg("playback manager: Filler data fetch failed")
				return
			}
			fillerSet := make(map[int]bool, len(data.FillerEpisodes))
			for _, s := range data.FillerEpisodes {
				n, err := strconv.Atoi(s)
				if err == nil {
					fillerSet[n] = true
				}
			}
			pm.eventMu.Lock()
			pm.currentFillerEpisodes = make([]int, 0, len(fillerSet))
			for n := range fillerSet {
				pm.currentFillerEpisodes = append(pm.currentFillerEpisodes, n)
			}
			pm.eventMu.Unlock()
			// If the currently playing episode is filler, jump to next non-filler
			if fillerSet[currentEp] {
				pm.Logger.Info().Int("episode", currentEp).Msg("playback manager: Episode is filler, skipping")
				// Find next non-filler local file
				next := currentLF
				for {
					n, ok := wrapperEntry.FindNextEpisode(next)
					if !ok {
						break
					}
					nextEp := wrapperEntry.GetProgressNumber(n)
					if !fillerSet[nextEp] {
						pm.Logger.Info().Int("episode", nextEp).Msg("playback manager: Jumping to next non-filler episode")
						_ = pm.MediaPlayerRepository.Play(n.Path)
						return
					}
					next = n
				}
				pm.Logger.Warn().Msg("playback manager: No non-filler episode found to skip to")
			}
		}(titles, episodeNumber, currentLocalFileWrapperEntry, currentLocalFile)
	}

	// ------- Discord ------- //
	if pm.discordPresence != nil && !pm.isOfflineRef.Get() {
		go pm.discordPresence.SetAnimeActivity(&discordrpc_presence.AnimeActivity{
			ID:                  pm.currentMediaListEntry.MustGet().GetMedia().GetID(),
			Title:               pm.currentMediaListEntry.MustGet().GetMedia().GetPreferredTitle(),
			Image:               pm.currentMediaListEntry.MustGet().GetMedia().GetCoverImageSafe(),
			IsMovie:             pm.currentMediaListEntry.MustGet().GetMedia().IsMovie(),
			EpisodeNumber:       pm.currentLocalFileWrapperEntry.MustGet().GetProgressNumber(pm.currentLocalFile.MustGet()),
			Progress:            int(pm.currentMediaPlaybackStatus.CurrentTimeInSeconds),
			Duration:            int(pm.currentMediaPlaybackStatus.DurationInSeconds),
			TotalEpisodes:       pm.currentMediaListEntry.MustGet().GetMedia().Episodes,
			CurrentEpisodeCount: pm.currentMediaListEntry.MustGet().GetMedia().GetCurrentEpisodeCountOrNil(),
		})
	}
}

func (pm *PlaybackManager) handleVideoCompleted(status *mediaplayer.PlaybackStatus) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	// Set the current media playback status
	pm.currentMediaPlaybackStatus = status
	// Get the playback state
	_ps := pm.getLocalFilePlaybackState(status)
	// Log
	pm.Logger.Debug().Msg("playback manager: Received video completed event")

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- PlaybackStatusChangedEvent{Status: *status, State: _ps}
			value.EventCh <- VideoCompletedEvent{Filename: status.Filename}
			return true
		})
	}()

	//
	// Update the progress on AniList if auto update progress is enabled
	//
	pm.autoSyncCurrentProgress(&_ps)

	// Send the playback state with the `ProgressUpdated` flag
	// The client will use this to notify the user if the progress has been updated
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressVideoCompleted, _ps)
	// Push the video playback state to the history
	pm.historyMap[status.Filename] = _ps

}

func (pm *PlaybackManager) handleTrackingStopped(reason string) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	pm.currentAniSkipData = nil
	pm.aniSkipSkippedOP = false
	pm.aniSkipSkippedED = false
	pm.currentFillerEpisodes = nil

	pm.Logger.Debug().Msg("playback manager: Received tracking stopped event")
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressTrackingStopped, reason)

	// Find the next episode and set it to [PlaybackManager.nextEpisodeLocalFile]
	if pm.currentMediaListEntry.IsPresent() && pm.currentLocalFile.IsPresent() && pm.currentLocalFileWrapperEntry.IsPresent() {
		lf, ok := pm.currentLocalFileWrapperEntry.MustGet().FindNextEpisode(pm.currentLocalFile.MustGet())
		if ok {
			pm.nextEpisodeLocalFile = mo.Some(lf)
		} else {
			pm.nextEpisodeLocalFile = mo.None[*anime.LocalFile]()
		}
	}

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- VideoStoppedEvent{Reason: reason}
			return true
		})
	}()

	if pm.currentMediaPlaybackStatus != nil {
		pm.continuityManager.UpdateExternalPlayerEpisodeWatchHistoryItem(pm.currentMediaPlaybackStatus.CurrentTimeInSeconds, pm.currentMediaPlaybackStatus.DurationInSeconds)
	}

	// ------- Discord ------- //
	if pm.discordPresence != nil && !pm.isOfflineRef.Get() {
		go pm.discordPresence.Close()
	}
}

func (pm *PlaybackManager) handlePlaybackStatus(status *mediaplayer.PlaybackStatus) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	pm.currentPlaybackType = LocalFilePlayback

	// Set the current media playback status
	pm.currentMediaPlaybackStatus = status
	// Get the playback state
	_ps := pm.getLocalFilePlaybackState(status)
	// If the same PlaybackState is in the history, update the ProgressUpdated flag
	// PlaybackStatusCh has no way of knowing if the progress has been updated
	if h, ok := pm.historyMap[status.Filename]; ok {
		_ps.ProgressUpdated = h.ProgressUpdated
	}

	// ------- AniSkip auto-seek ------- //
	if pm.currentAniSkipData != nil && status.Playing {
		t := status.CurrentTimeInSeconds
		sd := pm.currentAniSkipData
		dbSettings, _ := pm.Database.GetSettings()
		skipOP := dbSettings != nil && dbSettings.MediaPlayer != nil && dbSettings.MediaPlayer.MpvAutoSkipOpening
		skipED := dbSettings != nil && dbSettings.MediaPlayer != nil && dbSettings.MediaPlayer.MpvAutoSkipEnding
		if skipOP && sd.hasOP && !pm.aniSkipSkippedOP && t >= sd.opStart && t < sd.opEnd {
			pm.aniSkipSkippedOP = true
			go func(seekTo float64) {
				if err := pm.MediaPlayerRepository.SeekTo(seekTo); err != nil {
					pm.Logger.Warn().Err(err).Float64("seekTo", seekTo).Msg("playback manager: AniSkip OP seek failed")
				} else {
					pm.Logger.Debug().Float64("seekTo", seekTo).Msg("playback manager: AniSkip skipped opening")
				}
			}(sd.opEnd)
		}
		if skipED && sd.hasED && !pm.aniSkipSkippedED && t >= sd.edStart && t < sd.edEnd {
			pm.aniSkipSkippedED = true
			go func(seekTo float64) {
				if err := pm.MediaPlayerRepository.SeekTo(seekTo); err != nil {
					pm.Logger.Warn().Err(err).Float64("seekTo", seekTo).Msg("playback manager: AniSkip ED seek failed")
				} else {
					pm.Logger.Debug().Float64("seekTo", seekTo).Msg("playback manager: AniSkip skipped ending")
				}
			}(sd.edEnd)
		}
	}

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- PlaybackStatusChangedEvent{Status: *status, State: _ps}
			return true
		})
	}()

	// Send the playback state to the client
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressPlaybackState, _ps)

	// ------- Discord ------- //
	if pm.discordPresence != nil && !pm.isOfflineRef.Get() {
		go pm.discordPresence.UpdateAnimeActivity(int(pm.currentMediaPlaybackStatus.CurrentTimeInSeconds), int(pm.currentMediaPlaybackStatus.DurationInSeconds), !pm.currentMediaPlaybackStatus.Playing)
	}
}

func (pm *PlaybackManager) handleTrackingRetry(reason string) {
	// DEVNOTE: This event is not sent to the client
	// We notify the playlist hub, so it can play the next episode (it's assumed that the user closed the player)

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- PlaybackErrorEvent{Reason: reason}
			return true
		})
	}()
}

func (pm *PlaybackManager) handleStreamingTrackingStarted(status *mediaplayer.PlaybackStatus) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	if pm.currentStreamEpisode.IsAbsent() || pm.currentStreamMedia.IsAbsent() {
		return
	}

	//// Get the media list entry
	//// Note that it might be absent if the user is watching a stream that is not in the library
	pm.currentMediaListEntry = pm.getStreamPlaybackDetails(pm.currentStreamMedia.MustGet().GetID())

	// Set the playback type
	pm.currentPlaybackType = StreamPlayback

	// Reset the history map
	pm.historyMap = make(map[string]PlaybackState)

	// Reset activity recording flag for this new session
	pm.activeProfileIDMu.Lock()
	pm.activityRecorded = false
	pm.activeProfileIDMu.Unlock()

	// Reset session-level last-synced episode tracking
	pm.sessionLastSyncedEpisodeMu.Lock()
	pm.sessionLastSyncedEpisode = nil
	pm.sessionLastSyncedEpisodeMu.Unlock()

	// Set the current media playback status
	pm.currentMediaPlaybackStatus = status
	// Get the playback state
	_ps := pm.getStreamPlaybackState(status)

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- PlaybackStatusChangedEvent{Status: *status, State: _ps}
			value.EventCh <- StreamStartedEvent{Filename: status.Filename, Filepath: status.Filepath}
			return true
		})
	}()

	// Log
	pm.Logger.Debug().Msg("playback manager: Tracking started for stream")
	// Send event to the client
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressTrackingStarted, _ps)

	pm.continuityManager.SetExternalPlayerEpisodeDetails(&continuity.ExternalPlayerEpisodeDetails{
		EpisodeNumber: pm.currentStreamEpisode.MustGet().GetProgressNumber(),
		MediaId:       pm.currentStreamMedia.MustGet().GetID(),
		Filepath:      "",
	})

	// ------- Discord ------- //
	if pm.discordPresence != nil && !pm.isOfflineRef.Get() {
		go pm.discordPresence.SetAnimeActivity(&discordrpc_presence.AnimeActivity{
			ID:                  pm.currentStreamMedia.MustGet().GetID(),
			Title:               pm.currentStreamMedia.MustGet().GetPreferredTitle(),
			Image:               pm.currentStreamMedia.MustGet().GetCoverImageSafe(),
			IsMovie:             pm.currentStreamMedia.MustGet().IsMovie(),
			EpisodeNumber:       pm.currentStreamEpisode.MustGet().GetProgressNumber(),
			Progress:            int(pm.currentMediaPlaybackStatus.CurrentTimeInSeconds),
			Duration:            int(pm.currentMediaPlaybackStatus.DurationInSeconds),
			TotalEpisodes:       pm.currentStreamMedia.MustGet().Episodes,
			CurrentEpisodeCount: pm.currentStreamMedia.MustGet().GetCurrentEpisodeCountOrNil(),
		})
	}
}

func (pm *PlaybackManager) handleStreamingPlaybackStatus(status *mediaplayer.PlaybackStatus) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	if pm.currentStreamEpisode.IsAbsent() {
		return
	}

	pm.currentPlaybackType = StreamPlayback

	// Set the current media playback status
	pm.currentMediaPlaybackStatus = status
	// Get the playback state
	_ps := pm.getStreamPlaybackState(status)
	// If the same PlaybackState is in the history, update the ProgressUpdated flag
	// PlaybackStatusCh has no way of knowing if the progress has been updated
	if h, ok := pm.historyMap[status.Filename]; ok {
		_ps.ProgressUpdated = h.ProgressUpdated
	}

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- PlaybackStatusChangedEvent{Status: *status, State: _ps}
			return true
		})
	}()

	// Send the playback state to the client
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressPlaybackState, _ps)

	// ------- Discord ------- //
	if pm.discordPresence != nil && !pm.isOfflineRef.Get() {
		go pm.discordPresence.UpdateAnimeActivity(int(pm.currentMediaPlaybackStatus.CurrentTimeInSeconds), int(pm.currentMediaPlaybackStatus.DurationInSeconds), !pm.currentMediaPlaybackStatus.Playing)
	}
}

func (pm *PlaybackManager) handleStreamingVideoCompleted(status *mediaplayer.PlaybackStatus) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	if pm.currentStreamEpisode.IsAbsent() {
		return
	}

	// Set the current media playback status
	pm.currentMediaPlaybackStatus = status
	// Get the playback state
	_ps := pm.getStreamPlaybackState(status)
	// Log
	pm.Logger.Debug().Msg("playback manager: Received video completed event")

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- PlaybackStatusChangedEvent{Status: *status, State: _ps}
			value.EventCh <- StreamCompletedEvent{Filename: status.Filename}
			return true
		})
	}()
	//
	// Update the progress on AniList if auto update progress is enabled
	//
	pm.autoSyncCurrentProgress(&_ps)

	// Send the playback state with the `ProgressUpdated` flag
	// The client will use this to notify the user if the progress has been updated
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressVideoCompleted, _ps)
	// Push the video playback state to the history
	pm.historyMap[status.Filename] = _ps
}

func (pm *PlaybackManager) handleStreamingTrackingStopped(reason string) {
	pm.eventMu.Lock()
	defer pm.eventMu.Unlock()

	if pm.currentStreamEpisode.IsAbsent() {
		return
	}

	if pm.currentMediaPlaybackStatus != nil {
		pm.continuityManager.UpdateExternalPlayerEpisodeWatchHistoryItem(pm.currentMediaPlaybackStatus.CurrentTimeInSeconds, pm.currentMediaPlaybackStatus.DurationInSeconds)
	}

	// Notify subscribers
	go func() {
		pm.playbackStatusSubscribers.Range(func(key string, value *PlaybackStatusSubscriber) bool {
			if value.Canceled.Load() {
				return true
			}
			value.EventCh <- StreamStoppedEvent{Reason: reason}
			return true
		})
	}()

	pm.Logger.Debug().Msg("playback manager: Received tracking stopped event")
	pm.sendEventToCurrentClient(events.PlaybackManagerProgressTrackingStopped, reason)

	// ------- Discord ------- //
	if pm.discordPresence != nil && !pm.isOfflineRef.Get() {
		go pm.discordPresence.Close()
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Local File
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// getLocalFilePlaybackState returns a new PlaybackState
func (pm *PlaybackManager) getLocalFilePlaybackState(status *mediaplayer.PlaybackStatus) PlaybackState {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	currentLocalFileWrapperEntry, ok := pm.currentLocalFileWrapperEntry.Get()
	if !ok {
		return PlaybackState{}
	}

	currentLocalFile, ok := pm.currentLocalFile.Get()
	if !ok {
		return PlaybackState{}
	}

	currentMediaListEntry, ok := pm.currentMediaListEntry.Get()
	if !ok {
		return PlaybackState{}
	}

	// Find the following episode
	_, canPlayNext := currentLocalFileWrapperEntry.FindNextEpisode(currentLocalFile)

	return PlaybackState{
		EpisodeNumber:        currentLocalFileWrapperEntry.GetProgressNumber(currentLocalFile),
		AniDbEpisode:         currentLocalFile.GetAniDBEpisode(),
		MediaTitle:           currentMediaListEntry.GetMedia().GetPreferredTitle(),
		MediaTotalEpisodes:   currentMediaListEntry.GetMedia().GetCurrentEpisodeCount(),
		MediaCoverImage:      currentMediaListEntry.GetMedia().GetCoverImageSafe(),
		MediaId:              currentMediaListEntry.GetMedia().GetID(),
		Filename:             status.Filename,
		CompletionPercentage: status.CompletionPercentage,
		CanPlayNext:          canPlayNext,
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Stream
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// getStreamPlaybackState returns a new PlaybackState
func (pm *PlaybackManager) getStreamPlaybackState(status *mediaplayer.PlaybackStatus) PlaybackState {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	currentStreamEpisode, ok := pm.currentStreamEpisode.Get()
	if !ok {
		return PlaybackState{}
	}

	currentStreamMedia, ok := pm.currentStreamMedia.Get()
	if !ok {
		return PlaybackState{}
	}

	currentStreamAniDbEpisode, ok := pm.currentStreamAniDbEpisode.Get()
	if !ok {
		return PlaybackState{}
	}

	return PlaybackState{
		EpisodeNumber:        currentStreamEpisode.GetProgressNumber(),
		AniDbEpisode:         currentStreamAniDbEpisode,
		MediaTitle:           currentStreamMedia.GetPreferredTitle(),
		MediaTotalEpisodes:   currentStreamMedia.GetCurrentEpisodeCount(),
		MediaCoverImage:      currentStreamMedia.GetCoverImageSafe(),
		MediaId:              currentStreamMedia.GetID(),
		Filename:             cmp.Or(status.Filename, "Stream"),
		CompletionPercentage: status.CompletionPercentage,
		CanPlayNext:          false, // DEVNOTE: This is not used for streams
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// autoSyncCurrentProgress syncs the current video playback progress with providers.
// This is called once when a "video complete" event is heard.
func (pm *PlaybackManager) autoSyncCurrentProgress(_ps *PlaybackState) {

	shouldUpdate, err := pm.Database.AutoUpdateProgressIsEnabled()
	if err != nil {
		pm.Logger.Error().Err(err).Msg("playback manager: Failed to check if auto update progress is enabled")
		return
	}

	if !shouldUpdate {
		return
	}

	var mediaId int
	var epProgressNum int
	var currentProgress int

	switch pm.currentPlaybackType {
	case LocalFilePlayback:
		// Note :currentMediaListEntry MUST be defined since we assume that the media is in the user's library
		if pm.currentMediaListEntry.IsAbsent() || pm.currentLocalFileWrapperEntry.IsAbsent() || pm.currentLocalFile.IsAbsent() {
			return
		}
		// Check if we should update the progress
		// If the current progress is lower than the episode progress number
		epProgressNum = pm.currentLocalFileWrapperEntry.MustGet().GetProgressNumber(pm.currentLocalFile.MustGet())
		currentProgress = pm.currentMediaListEntry.MustGet().GetProgressSafe()
		if currentProgress >= epProgressNum {
			return
		}
		mediaId = pm.currentMediaListEntry.MustGet().GetMedia().GetID()

	case StreamPlayback:
		if pm.currentStreamEpisode.IsAbsent() || pm.currentStreamMedia.IsAbsent() {
			return
		}
		// Do not auto update progress is the media is in the library AND the progress is higher than the current episode
		epProgressNum = pm.currentStreamEpisode.MustGet().GetProgressNumber()
		if pm.currentMediaListEntry.IsPresent() {
			currentProgress = pm.currentMediaListEntry.MustGet().GetProgressSafe()
			if currentProgress >= epProgressNum {
				return
			}
		}
		mediaId = pm.currentStreamMedia.MustGet().ID
	}

	// Use the larger of the captured currentProgress (snapshot at session start) and the
	// most recent episode we already auto-synced during this session. This prevents the
	// gap-check from misfiring when the captured snapshot is stale (e.g. user has just
	// watched ep 1 → AniList=1, but currentMediaListEntry still reads 0, so ep 2 would
	// otherwise look like a 2-episode jump).
	effectiveProgress := currentProgress
	pm.sessionLastSyncedEpisodeMu.Lock()
	if pm.sessionLastSyncedEpisode != nil {
		if last, ok := pm.sessionLastSyncedEpisode[mediaId]; ok && last > effectiveProgress {
			effectiveProgress = last
		}
	}
	pm.sessionLastSyncedEpisodeMu.Unlock()

	// If the gap is larger than 1 episode, ask the client to confirm rather than silently
	// updating AniList. The client will call the dedicated confirm endpoint to apply the update.
	if epProgressNum-effectiveProgress >= 2 {
		pm.Logger.Debug().
			Int("mediaId", mediaId).
			Int("currentProgress", effectiveProgress).
			Int("newProgress", epProgressNum).
			Msg("playback manager: Progress gap > 1, asking client to confirm")
		pm.sendEventToCurrentClient(events.PlaybackManagerProgressUpdateConfirm, map[string]interface{}{
			"mediaId":         mediaId,
			"currentProgress": effectiveProgress,
			"newProgress":     epProgressNum,
		})
		return
	}

	// Update the progress on AniList
	pm.Logger.Debug().Msg("playback manager: Updating progress on AniList")
	err = pm.updateProgress()

	if err != nil {
		_ps.ProgressUpdated = false
		pm.sendEventToCurrentClient(events.ErrorToast, events.NewErrorToastFromError("Failed to update AniList progress", err))
	} else {
		_ps.ProgressUpdated = true
		pm.sendEventToCurrentClient(events.PlaybackManagerProgressUpdated, _ps)
	}

}

// SyncCurrentProgress syncs the current video playback progress with providers
// This method is called when the user manually requests to sync the progress
//   - This method will return an error only if the progress update fails on AniList
//   - This method will refresh the anilist collection
func (pm *PlaybackManager) SyncCurrentProgress() error {
	pm.eventMu.RLock()

	err := pm.updateProgress()
	if err != nil {
		pm.eventMu.RUnlock()
		return err
	}

	// Push the current playback state to the history
	if pm.currentMediaPlaybackStatus != nil {
		var _ps PlaybackState
		switch pm.currentPlaybackType {
		case LocalFilePlayback:
			pm.getLocalFilePlaybackState(pm.currentMediaPlaybackStatus)
		case StreamPlayback:
			pm.getStreamPlaybackState(pm.currentMediaPlaybackStatus)
		}
		_ps.ProgressUpdated = true
		pm.historyMap[pm.currentMediaPlaybackStatus.Filename] = _ps
		pm.sendEventToCurrentClient(events.PlaybackManagerProgressUpdated, _ps)
	}

	pm.refreshAnimeCollectionFunc()

	pm.eventMu.RUnlock()
	return nil
}

// updateProgress updates the progress of the current video playback on AniList and MyAnimeList.
// This only returns an error if the progress update fails on AniList
//   - /!\ When this is called, the PlaybackState should have been pushed to the history
func (pm *PlaybackManager) updateProgress() (err error) {

	var mediaId int
	var epNum int
	var totalEpisodes int

	switch pm.currentPlaybackType {
	case LocalFilePlayback:
		//
		// Local File
		//
		if pm.currentLocalFileWrapperEntry.IsAbsent() || pm.currentLocalFile.IsAbsent() || pm.currentMediaListEntry.IsAbsent() {
			return errors.New("no video is being watched")
		}

		defer util.HandlePanicInModuleWithError("playbackmanager/updateProgress", &err)

		/// Online
		mediaId = pm.currentMediaListEntry.MustGet().GetMedia().GetID()
		epNum = pm.currentLocalFileWrapperEntry.MustGet().GetProgressNumber(pm.currentLocalFile.MustGet())
		totalEpisodes = pm.currentMediaListEntry.MustGet().GetMedia().GetTotalEpisodeCount() // total episode count or -1

	case StreamPlayback:
		//
		// Stream
		//
		// Last sanity check
		if pm.currentStreamEpisode.IsAbsent() || pm.currentStreamMedia.IsAbsent() {
			return errors.New("no video is being watched")
		}

		mediaId = pm.currentStreamMedia.MustGet().ID
		epNum = pm.currentStreamEpisode.MustGet().GetProgressNumber()
		totalEpisodes = pm.currentStreamMedia.MustGet().GetTotalEpisodeCount() // total episode count or -1

	case ManualTrackingPlayback:
		//
		// Manual Tracking
		//
		if pm.currentManualTrackingState.IsAbsent() {
			return errors.New("no media file is being manually tracked")
		}

		defer func() {
			if pm.manualTrackingCtxCancel != nil {
				pm.manualTrackingCtxCancel()
			}
		}()

		/// Online
		mediaId = pm.currentManualTrackingState.MustGet().MediaId
		epNum = pm.currentManualTrackingState.MustGet().EpisodeNumber
		totalEpisodes = pm.currentManualTrackingState.MustGet().TotalEpisodes

	default:
		return errors.New("unknown playback type")
	}

	if mediaId == 0 { // Sanity check
		return errors.New("media ID not found")
	}

	// Update the progress on AniList
	// For profile users, route through the profile's own AniList client.
	pm.activeProfileIDMu.RLock()
	activeProfileID := pm.activeProfileID
	pm.activeProfileIDMu.RUnlock()

	if activeProfileID > 0 && pm.getProfileAnilistClientFunc != nil {
		client := pm.getProfileAnilistClientFunc(activeProfileID)
		if client != nil && client.IsAuthenticated() {
			status := anilist.MediaListStatusCurrent
			isCompleted := totalEpisodes > 0 && epNum >= totalEpisodes
			if isCompleted {
				status = anilist.MediaListStatusCompleted
			}
			now := time.Now()
			year, monthVal, day := now.Year(), int(now.Month()), now.Day()
			var startedAt, completedAt *anilist.FuzzyDateInput
			if epNum == 1 {
				startedAt = &anilist.FuzzyDateInput{Year: &year, Month: &monthVal, Day: &day}
			}
			if isCompleted {
				completedAt = &anilist.FuzzyDateInput{Year: &year, Month: &monthVal, Day: &day}
			}
			_, err = client.UpdateMediaListEntryProgress(context.Background(), &mediaId, &epNum, &status, startedAt, completedAt)
			// If AniList is unreachable, queue the update so the user's true progress is never
			// lost; it is replayed automatically when the API is available again. We then treat
			// this as a (locally) successful update so activity/achievements still advance.
			if err != nil && shared_platform.IsOutageError(err) && pm.enqueueProfilePendingProgressFunc != nil {
				pm.enqueueProfilePendingProgressFunc(activeProfileID, mediaId, epNum, &status, startedAt, completedAt)
				pm.Logger.Warn().Int("mediaId", mediaId).Int("episode", epNum).Msg("playback manager: AniList unreachable; queued progress update for later sync")
				err = nil
			}
		} else {
			err = errors.New("profile AniList account not authenticated")
		}
	} else {
		err = pm.platformRef.Get().UpdateEntryProgress(
			context.Background(),
			mediaId,
			epNum,
			&totalEpisodes,
		)
	}
	if err != nil {
		pm.Logger.Error().Err(err).Msg("playback manager: Error occurred while updating progress on AniList")
		return fmt.Errorf("%w: %v", ErrProgressUpdateAnilist, err)
	}

	// For profile users, invalidate their cached anime collection so subsequent fetches are fresh.
	if activeProfileID > 0 && pm.invalidateProfileAnimeCollectionFunc != nil {
		pm.invalidateProfileAnimeCollectionFunc(activeProfileID)
	}

	pm.refreshAnimeCollectionFunc() // Refresh the AniList collection

	pm.Logger.Info().Msg("playback manager: Updated progress on AniList")

	// Remember the last episode we successfully synced for this media, so that the
	// next gap-check uses fresh data rather than the stale captured snapshot.
	if mediaId > 0 && epNum > 0 {
		pm.sessionLastSyncedEpisodeMu.Lock()
		if pm.sessionLastSyncedEpisode == nil {
			pm.sessionLastSyncedEpisode = make(map[int]int)
		}
		if epNum > pm.sessionLastSyncedEpisode[mediaId] {
			pm.sessionLastSyncedEpisode[mediaId] = epNum
		}
		pm.sessionLastSyncedEpisodeMu.Unlock()
	}

	// Record activity + fire achievements exactly once per episode completion
	pm.activeProfileIDMu.RLock()
	profileID := pm.activeProfileID
	alreadyRecorded := pm.activityRecorded
	pm.activeProfileIDMu.RUnlock()

	if profileID > 0 && !alreadyRecorded {
		pm.activeProfileIDMu.Lock()
		pm.activityRecorded = true
		pm.activeProfileIDMu.Unlock()

		durationMinutes := 0
		if pm.currentMediaPlaybackStatus != nil {
			durationMinutes = int(pm.currentMediaPlaybackStatus.DurationInSeconds / 60)
		}

		// Update session tracking
		now := time.Now()
		pm.sessionMu.Lock()
		const sessionGapMinutes = 30
		if pm.sessionStartTime.IsZero() || now.Sub(pm.sessionLastCompletion) > time.Duration(sessionGapMinutes)*time.Minute {
			// Start a new session
			pm.sessionStartTime = now
			pm.sessionEpisodeCount = 0
			pm.sessionMinutes = 0
		}
		pm.sessionEpisodeCount++
		pm.sessionMinutes += durationMinutes
		pm.sessionLastCompletion = now
		activityEvt := &PlaybackActivityEvent{
			ProfileID:           profileID,
			MediaID:             mediaId,
			EpisodeNumber:       epNum,
			TotalEpisodes:       totalEpisodes,
			DurationMinutes:     durationMinutes,
			SessionEpisodeCount: pm.sessionEpisodeCount,
			SessionMinutes:      pm.sessionMinutes,
			SessionStartTime:    pm.sessionStartTime,
		}
		pm.sessionMu.Unlock()

		pm.activityTrackerMu.RLock()
		tracker := pm.activityTracker
		pm.activityTrackerMu.RUnlock()

		if tracker != nil {
			go tracker(activityEvt)
		}
	}

	return nil
}
