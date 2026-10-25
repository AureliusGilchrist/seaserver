package videocore

import (
	"fmt"
	"seanime/internal/continuity"
	"seanime/internal/discordrpc/presence"
	"seanime/internal/events"
	"seanime/internal/mkvparser"
	"time"

	"github.com/samber/lo"
)

// How often the watch position is persisted while the picture is playing. See the status handler
// below: the client reports every second, and writing every report to disk made playback cost a
// database write a second for its whole duration.
const watchHistoryWriteInterval = 5 * time.Second

// The last time each client's position was written. The shared-effects goroutine is the only
// reader and writer, so no lock is needed.
var lastHistoryWrite = make(map[string]time.Time)

// The latest position that has not been written yet, flushed when the client terminates.
var lastHistoryOptions = make(map[string]*continuity.UpdateWatchHistoryItemOptions)

// The "mediaId_episode" each client has completed, so later position reports don't revive it.
var completedPlayback = make(map[string]string)

func (vc *VideoCore) setupEffects() {
	vc.setupSharedEffects()
	vc.setupOnlinestreamEffects()
}

func (vc *VideoCore) setupSharedEffects() {
	subscriber := vc.Subscribe("videocore:shared")

	go func(subscriber *Subscriber) {
		for e := range subscriber.Events() {
			switch event := e.(type) {
			case *VideoPausedEvent:
				if vc.discordPresence != nil && !vc.isOfflineRef.Get() {
					go vc.discordPresence.UpdateAnimeActivityFor(event.GetClientId(), int(event.CurrentTime), int(event.Duration), true)
				}
			case *VideoResumedEvent:
				if vc.discordPresence != nil && !vc.isOfflineRef.Get() {
					go vc.discordPresence.UpdateAnimeActivityFor(event.GetClientId(), int(event.CurrentTime), int(event.Duration), false)
				}
			case *VideoEndedEvent:
				if vc.discordPresence != nil && !vc.isOfflineRef.Get() {
					go vc.discordPresence.CloseFor(event.GetClientId())
				}
			case *VideoLoadedMetadataEvent:
				state, ok := vc.getPlaybackStateFor(event.GetClientId())
				if !ok {
					continue
				}
				if vc.discordPresence != nil && !vc.isOfflineRef.Get() {
					vc.logger.Debug().Msgf("videocore: Setting Discord presence for %s", state.PlaybackInfo.Media.GetPreferredTitle())
					go vc.discordPresence.SetAnimeActivityFor(event.GetClientId(), &discordrpc_presence.AnimeActivity{
						ID:            state.PlaybackInfo.Media.GetID(),
						Title:         state.PlaybackInfo.Media.GetPreferredTitle(),
						Image:         state.PlaybackInfo.Media.GetCoverImageSafe(),
						IsMovie:       state.PlaybackInfo.Media.IsMovie(),
						EpisodeNumber: state.PlaybackInfo.Episode.EpisodeNumber,
						Progress:      int(event.CurrentTime),
						Duration:      int(event.Duration),
					})
				}
			case *VideoErrorEvent:
				if vc.discordPresence != nil && !vc.isOfflineRef.Get() {
					go vc.discordPresence.CloseFor(event.GetClientId())
				}
			case *VideoCompletedEvent:
				state, ok := vc.getPlaybackStateFor(event.GetClientId())
				if !ok {
					continue
				}
				mediaId := state.PlaybackInfo.Media.GetID()

				// Mark the episode as finished right away (before any early exit below), and stop
				// later position reports from reviving it as "in progress".
				if vc.continuityManager != nil {
					epNumber := state.PlaybackInfo.Episode.GetEpisodeNumber()
					completedPlayback[event.GetClientId()] = fmt.Sprintf("%d_%d", mediaId, epNumber)
					delete(lastHistoryOptions, event.GetClientId())
					if status, ok := vc.getPlaybackStatusFor(event.GetClientId()); ok && status != nil && status.Duration > 0 {
						_ = vc.continuityManager.UpdateWatchHistoryItem(&continuity.UpdateWatchHistoryItemOptions{
							CurrentTime:   status.Duration,
							Duration:      status.Duration,
							MediaId:       mediaId,
							EpisodeNumber: epNumber,
							Kind:          continuity.MediastreamKind,
						})
					}
				}

				// No AniList write here. This used to update progress through the global platform — the
				// shared/admin account, whichever profile was watching — on top of the per-profile writes
				// the direct-stream tracker and the client already make. Three writes per episode spent
				// rate-limit slots, and a 429 on the right one dropped the update and brought back the
				// progress prompt. Progress is written once, to the right account, via the progress queue.
			case *VideoTerminatedEvent:
				if opts, ok := lastHistoryOptions[event.GetClientId()]; ok {
					delete(lastHistoryOptions, event.GetClientId())
					_ = vc.continuityManager.UpdateWatchHistoryItem(opts)
				}
				delete(completedPlayback, event.GetClientId())
				if vc.discordPresence != nil && !vc.isOfflineRef.Get() {
					go vc.discordPresence.CloseFor(event.GetClientId())
				}
			case *VideoStatusEvent:
				state, ok := vc.getPlaybackStateFor(event.GetClientId())
				if !ok {
					continue
				}
				if completedPlayback[event.GetClientId()] == fmt.Sprintf("%d_%d", state.PlaybackInfo.Media.GetID(), state.PlaybackInfo.Episode.GetEpisodeNumber()) {
					continue
				}
				// The watch position is written to disk, and the client reports its position every
				// second — so this used to be one database write per second per playing client, all
				// the way through every episode. On a NAS that is enough to make the whole server
				// feel slow for the rest of the session, and it buys nothing: a resume position is
				// not worth a write per second.
				//
				// Written at most every ten seconds instead, and always when the picture is paused
				// (which is when a position is most likely to be left at) — so a resume lands within
				// ten seconds of where it was left, for a tenth of the writes.
				if event.Duration != 0 && (event.Paused || time.Since(lastHistoryWrite[event.GetClientId()]) >= watchHistoryWriteInterval) {
					lastHistoryWrite[event.GetClientId()] = time.Now()
					delete(lastHistoryOptions, event.GetClientId())
					_ = vc.continuityManager.UpdateWatchHistoryItem(&continuity.UpdateWatchHistoryItemOptions{
						CurrentTime:   event.CurrentTime,
						Duration:      event.Duration,
						MediaId:       state.PlaybackInfo.Media.GetID(),
						EpisodeNumber: state.PlaybackInfo.Episode.GetEpisodeNumber(),
						Kind:          continuity.MediastreamKind,
					})
				} else if event.Duration != 0 {
					// Remember the unsaved position so it can be flushed when the player goes away
					lastHistoryOptions[event.GetClientId()] = &continuity.UpdateWatchHistoryItemOptions{
						CurrentTime:   event.CurrentTime,
						Duration:      event.Duration,
						MediaId:       state.PlaybackInfo.Media.GetID(),
						EpisodeNumber: state.PlaybackInfo.Episode.GetEpisodeNumber(),
						Kind:          continuity.MediastreamKind,
					}
				}

				if vc.discordPresence != nil && !vc.isOfflineRef.Get() {
					go vc.discordPresence.UpdateAnimeActivityFor(event.GetClientId(), int(event.CurrentTime), int(event.Duration), event.Paused)
				}
			}
		}
	}(subscriber)
}

func (vc *VideoCore) setupOnlinestreamEffects() {
	subscriber := vc.Subscribe("videocore:onlinestream")

	go func(subscriber *Subscriber) {
		for e := range subscriber.Events() {
			if !e.IsOnlinestream() && !e.IsWebPlayer() {
				continue
			}
			switch event := e.(type) {
			case *SubtitleFileUploadedEvent:
				vc.logger.Trace().Msgf("videocore: Subtitle file uploaded: %s", event.Filename)
				mkvTrack, err := vc.GenerateMkvSubtitleTrack(GenerateSubtitleFileOptions{
					Filename:  event.Filename,
					Content:   event.Content,
					Number:    0,
					ConvertTo: mkvparser.SubtitleTypeASS,
				})
				if err != nil {
					vc.wsEventManager.SendEventTo(vc.GetCurrentClientId(), events.ErrorToast, events.NewErrorToastFromError("Failed to upload subtitle file", err))
					continue
				}
				track := &VideoSubtitleTrack{
					Index:             0,
					Src:               nil,
					Content:           &mkvTrack.CodecPrivate,
					Label:             mkvTrack.Name,
					Language:          mkvTrack.Language,
					Type:              lo.ToPtr("ass"),
					Default:           lo.ToPtr(false),
					UseLibassRenderer: nil,
				}
				vc.AddExternalSubtitleTrack(track)
				vc.logger.Debug().Msgf("videocore: Sent converted subtitle tracks")
			}
		}
	}(subscriber)
}
