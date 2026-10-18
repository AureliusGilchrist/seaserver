package watchparty

// Event handling and playback sync.
//
// The module subscribes to every VideoCore event the server sees. Events carry the
// originating clientId; only events from the session's source drive commands to the
// other participants, so a joiner's own player can never start an echo loop.
//
// Participants carry an `epoch` — the generation of the source's media they have loaded.
// Drift correction ignores participants on an older epoch: they are either still loading
// the current episode (their client auto-starts it from the media-change broadcast) or
// were left behind, and either way seeking them against the new timeline is noise.

import (
	"context"
	"math"
	"time"

	"seanime/internal/videocore"
)

// peerRef is a lock-free view of a participant for the duration of one event.
type peerRef struct {
	clientId string
	epoch    int
}

// peerSync holds per-participant sync bookkeeping.
type peerSync struct {
	lastSeekTime time.Time
	// catchUp identifies the running catch-up. CancelFunc values aren't comparable, so
	// ownership is tracked with a generation token the goroutine matches against.
	catchUpToken  int
	catchUpCancel context.CancelFunc
}

func (m *Manager) getPeerSync(clientId string) *peerSync {
	m.syncMu.Lock()
	defer m.syncMu.Unlock()
	ps, ok := m.peerSyncs[clientId]
	if !ok {
		ps = &peerSync{}
		m.peerSyncs[clientId] = ps
	}
	return ps
}

// resetPeerSyncs cancels every running catch-up and clears the bookkeeping.
func (m *Manager) resetPeerSyncs() {
	m.syncMu.Lock()
	defer m.syncMu.Unlock()
	for _, ps := range m.peerSyncs {
		if ps.catchUpCancel != nil {
			ps.catchUpCancel()
		}
	}
	m.peerSyncs = make(map[string]*peerSync)
}

func (m *Manager) cancelCatchUp(st *peerSync) {
	m.syncMu.Lock()
	if st.catchUpCancel != nil {
		st.catchUpCancel()
		st.catchUpToken = 0
		st.catchUpCancel = nil
	}
	m.syncMu.Unlock()
}

// handleVideoEvent routes a player event to the sync logic when it comes from a
// session participant.
func (m *Manager) handleVideoEvent(event videocore.VideoEvent) {
	clientId := event.GetClientId()
	if clientId == "" {
		return
	}

	// Snapshot the session state we need without holding the lock while we act on it.
	m.mu.RLock()
	session := m.session
	var (
		isParticipant bool
		isSource      bool
		threshold     float64
		others        []peerRef
	)
	if session != nil {
		if p := session.participant(clientId); p != nil {
			isParticipant = true
			isSource = p.IsSource
			threshold = session.Settings.SyncThreshold
			for _, pp := range session.Participants {
				if pp != p {
					others = append(others, peerRef{clientId: pp.ClientId, epoch: pp.Epoch})
				}
			}
		}
	}
	m.mu.RUnlock()

	if !isParticipant {
		return
	}

	switch e := event.(type) {
	case *videocore.VideoStatusEvent:
		// Track the participant's playback for the UI.
		m.mu.Lock()
		if s := m.session; s != nil {
			if p := s.participant(clientId); p != nil {
				p.LastSeen = time.Now()
				p.PlaybackStatus = &PlaybackStatusInfo{
					Paused:      e.Paused,
					CurrentTime: e.CurrentTime,
					Duration:    e.Duration,
				}
			}
		}
		m.mu.Unlock()

		if isSource && len(others) > 0 {
			for _, p := range others {
				m.syncPeer(threshold, e, p)
			}
		}

	case *videocore.VideoPausedEvent:
		if isSource {
			m.onSourcePaused(e, others)
		}

	case *videocore.VideoResumedEvent:
		if isSource {
			m.onSourceResumed(e, others)
		}

	case *videocore.VideoSeekedEvent:
		if isSource {
			m.onSourceSeeked(e, others)
		}

	case *videocore.VideoLoadedEvent:
		if isSource {
			m.onSourceLoaded(e)
		} else {
			// A participant finished loading the session's current media.
			m.mu.Lock()
			if s := m.session; s != nil {
				if p := s.participant(clientId); p != nil {
					p.Epoch = s.Epoch
					m.logger.Trace().Str("clientId", clientId).Int("epoch", p.Epoch).Msg("watchparty: Participant loaded the session media")
				}
			}
			m.mu.Unlock()
		}

	case *videocore.VideoTerminatedEvent:
		if isSource {
			m.onSourceTerminated(e, others)
		}
	}
}

// --------------------------------------------------------------------------------------
// Source reactions
// --------------------------------------------------------------------------------------

// onSourceLoaded records what the source started playing and, when it is a different
// episode, bumps the media epoch and tells every client about it.
func (m *Manager) onSourceLoaded(e *videocore.VideoLoadedEvent) {
	mi := mediaInfoFromPlaybackInfo(e.State.PlaybackInfo)
	if mi == nil {
		return
	}

	m.resetPeerSyncs()

	m.mu.Lock()
	session := m.session
	if session == nil {
		m.mu.Unlock()
		return
	}
	changed := !mediaInfoEqual(session.MediaInfo, mi)
	session.MediaInfo = mi
	if changed {
		session.Epoch++
	}
	if p := session.participant(e.GetClientId()); p != nil {
		// The source is definitionally in sync with its own media.
		p.Epoch = session.Epoch
		if e.State.PlaybackInfo != nil {
			p.PlaybackId = e.State.PlaybackInfo.Id
		}
	}
	epoch := session.Epoch
	m.mu.Unlock()

	if changed {
		m.logger.Info().
			Int("mediaId", mi.MediaId).
			Int("episode", mi.EpisodeNumber).
			Str("streamType", mi.StreamType).
			Int("epoch", epoch).
			Msg("watchparty: Source media changed")
		m.broadcastState()
	}
}

// onSourcePaused pauses the participants, letting a far-behind one finish catching up
// before it is pinned at the source's position.
func (m *Manager) onSourcePaused(e *videocore.VideoPausedEvent, others []peerRef) {
	for _, p := range others {
		if peerStatus, ok := m.videoCore.GetPlaybackStatusFor(p.clientId); ok {
			drift := e.CurrentTime - peerStatus.CurrentTime
			if drift > catchUpBehindThreshold {
				m.startCatchUp(p.clientId, e.CurrentTime, m.getPeerSync(p.clientId))
				continue
			}
			if math.Abs(drift) > pausePositionSyncThreshold {
				m.seekPeer(p.clientId, e.CurrentTime, m.getPeerSync(p.clientId))
			}
		}
		m.videoCore.Pause(p.clientId)
	}
}

// onSourceResumed realigns out-of-tolerance participants and resumes them.
func (m *Manager) onSourceResumed(e *videocore.VideoResumedEvent, others []peerRef) {
	for _, p := range others {
		m.cancelCatchUp(m.getPeerSync(p.clientId))
		if peerStatus, ok := m.videoCore.GetPlaybackStatusFor(p.clientId); ok {
			drift := e.CurrentTime - peerStatus.CurrentTime
			if drift < -resumePositionDriftThreshold || drift > resumeAheadTolerance {
				m.seekPeer(p.clientId, e.CurrentTime, m.getPeerSync(p.clientId))
			}
		}
		m.videoCore.Resume(p.clientId)
	}
}

// onSourceSeeked mirrors an explicit scrub on the source to every participant.
func (m *Manager) onSourceSeeked(e *videocore.VideoSeekedEvent, others []peerRef) {
	for _, p := range others {
		// A scrub is explicit intent — bypass the cooldown.
		st := m.getPeerSync(p.clientId)
		m.syncMu.Lock()
		st.lastSeekTime = time.Now()
		m.syncMu.Unlock()
		m.cancelCatchUp(st)
		m.videoCore.SeekTo(e.CurrentTime, p.clientId)
	}
}

// onSourceTerminated reacts to the source closing its player (not to the empty-id
// cleanup dispatch that episode transitions produce): pin the participants where they
// are and clear the session media until the source plays something again.
func (m *Manager) onSourceTerminated(e *videocore.VideoTerminatedEvent, others []peerRef) {
	if e.Id == "" {
		return
	}

	m.mu.RLock()
	session := m.session
	matches := false
	if session != nil {
		if p := session.participant(e.GetClientId()); p != nil {
			matches = p.PlaybackId != "" && p.PlaybackId == e.Id
		}
	}
	m.mu.RUnlock()
	if !matches {
		return
	}

	for _, p := range others {
		m.videoCore.Pause(p.clientId)
		m.videoCore.ShowMessage("Watch together: the source's playback ended", 3000, p.clientId)
	}

	m.resetPeerSyncs()

	m.mu.Lock()
	if s := m.session; s != nil {
		s.MediaInfo = nil
		if p := s.participant(e.GetClientId()); p != nil {
			p.PlaybackId = ""
		}
	}
	m.mu.Unlock()
	m.broadcastState()
}

// --------------------------------------------------------------------------------------
// Drift correction
// --------------------------------------------------------------------------------------

// syncPeer corrects one participant against a source status event. The source reports
// every second; this is what keeps everyone on the same frame.
func (m *Manager) syncPeer(threshold float64, src *videocore.VideoStatusEvent, p peerRef) {
	st := m.getPeerSync(p.clientId)

	peerStatus, ok := m.videoCore.GetPlaybackStatusFor(p.clientId)
	if !ok {
		return // the participant has nothing loaded (or is still loading)
	}

	if threshold < minSyncThreshold {
		threshold = minSyncThreshold
	} else if threshold > maxSyncThreshold {
		threshold = maxSyncThreshold
	}

	switch {
	case src.Paused && peerStatus.Paused:
		// Both paused: nudge the participant into position if it drifted while paused.
		if drift := math.Abs(src.CurrentTime - peerStatus.CurrentTime); drift > pausePositionSyncThreshold && m.canSeek(st) {
			m.seekPeer(p.clientId, src.CurrentTime, st)
		}

	case src.Paused && !peerStatus.Paused:
		// Source paused, participant still playing: let a far-behind one finish catching
		// up, otherwise pause it in position.
		drift := src.CurrentTime - peerStatus.CurrentTime
		if drift > catchUpBehindThreshold {
			m.startCatchUp(p.clientId, src.CurrentTime, st)
			return
		}
		if math.Abs(drift) > pausePositionSyncThreshold {
			m.seekPeer(p.clientId, src.CurrentTime, st)
		}
		m.videoCore.Pause(p.clientId)

	case !src.Paused && peerStatus.Paused:
		// Source playing, participant stuck paused: realign and resume.
		drift := src.CurrentTime - peerStatus.CurrentTime
		if drift < -resumePositionDriftThreshold || drift > resumeAheadTolerance {
			m.seekPeer(p.clientId, src.CurrentTime, st)
		}
		m.videoCore.Resume(p.clientId)

	default:
		// Both playing: threshold drift correction with a seek cooldown, more aggressive
		// the further behind the participant is.
		drift := math.Abs(src.CurrentTime - peerStatus.CurrentTime)
		effective := threshold
		if drift > 3.0 {
			effective = threshold * aggressiveSyncMultiplier
		} else if drift > 1.5 {
			effective = threshold * moderateSyncMultiplier
		}
		if drift > effective && m.canSeek(st) {
			m.seekPeer(p.clientId, src.CurrentTime, st)
		}
	}
}

func (m *Manager) canSeek(st *peerSync) bool {
	m.syncMu.Lock()
	defer m.syncMu.Unlock()
	return time.Since(st.lastSeekTime) >= seekCooldown
}

func (m *Manager) seekPeer(clientId string, position float64, st *peerSync) {
	m.syncMu.Lock()
	st.lastSeekTime = time.Now()
	m.syncMu.Unlock()
	m.videoCore.SeekTo(position, clientId)
}

// startCatchUp lets a participant keep playing until it reaches the target position,
// then pins it there and pauses it. No-op when one is already running.
func (m *Manager) startCatchUp(clientId string, target float64, st *peerSync) {
	m.syncMu.Lock()
	if st.catchUpCancel != nil {
		m.syncMu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	st.catchUpToken++
	token := st.catchUpToken
	st.catchUpCancel = cancel
	m.syncMu.Unlock()

	go func() {
		defer func() {
			m.syncMu.Lock()
			if st.catchUpToken == token {
				st.catchUpToken = 0
				st.catchUpCancel = nil
			}
			m.syncMu.Unlock()
			cancel()
		}()

		ticker := time.NewTicker(catchUpTickInterval)
		defer ticker.Stop()
		deadline := time.Now().Add(maxCatchUpDuration)

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				status, ok := m.videoCore.GetPlaybackStatusFor(clientId)
				if !ok || status.Paused {
					return // playback gone or the user paused — give up quietly
				}
				behind := target - status.CurrentTime
				if behind <= catchUpTolerance || time.Now().After(deadline) {
					m.seekPeer(clientId, target, st)
					m.videoCore.Pause(clientId)
					return
				}
			}
		}
	}()
}

// --------------------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------------------

func mediaInfoFromPlaybackInfo(info *videocore.VideoPlaybackInfo) *MediaInfo {
	if info == nil || info.Media == nil || info.Episode == nil {
		return nil
	}
	mi := &MediaInfo{
		MediaId:       info.Media.ID,
		MediaTitle:    info.Media.GetPreferredTitle(),
		EpisodeNumber: info.Episode.EpisodeNumber,
		EpisodeTitle:  info.Episode.EpisodeTitle,
		AniDBEpisode:  info.Episode.AniDBEpisode,
		PlaybackType:  string(info.PlaybackType),
	}
	switch info.PlaybackType {
	case videocore.PlaybackTypeOnlinestream:
		mi.StreamType = "onlinestream"
		mi.OnlinestreamParams = info.OnlinestreamParams
	case videocore.PlaybackTypeLocalFile:
		mi.StreamType = "localfile"
		if info.LocalFile != nil {
			mi.LocalFilePath = info.LocalFile.Path
		}
	case videocore.PlaybackTypeTorrent:
		mi.StreamType = "torrent"
	case videocore.PlaybackTypeDebrid:
		mi.StreamType = "debrid"
	case videocore.PlaybackTypeNakama:
		mi.StreamType = "nakama"
	default:
		mi.StreamType = "unknown"
	}
	return mi
}
