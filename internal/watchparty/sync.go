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

	// The seek still on its way to the participant, if any (see seekLandTimeout).
	seek pendingSeek
	// The participant's position at the previous check, to tell playing from stalled.
	lastPeerTime float64
}

// pendingSeek is a seek sent to a participant that hasn't landed yet.
type pendingSeek struct {
	active bool
	target float64
	at     time.Time
	// measure: the source was playing when it was sent, so how long it took to land is how
	// far ahead of the source the next seek should aim.
	measure bool
}

// seekLanding reports whether a pending seek has landed, given the participant's current
// position and the position it reported last time. It returns the time the seek took to
// land (seconds), when that is meaningful.
func seekLanding(seek pendingSeek, now time.Time, cur, prev float64, paused, srcPaused bool) (landed bool, took float64, ok bool) {
	if !seek.active {
		return true, 0, false
	}
	if paused {
		// With the source paused too, being at the target is all there is to it. With the
		// source playing, the participant is being resumed and still has to buffer.
		if srcPaused && math.Abs(cur-seek.target) <= seekLandTolerance {
			return true, 0, false
		}
		return false, 0, false
	}
	// Playing from the target (or past it): landed once the position moves.
	if cur >= seek.target-seekLandTolerance && cur > prev+0.05 {
		if !seek.measure {
			return true, 0, false
		}
		// It started playing at the target and has played (cur - target) since.
		took = now.Sub(seek.at).Seconds() - math.Max(0, cur-seek.target)
		return true, math.Max(0, math.Min(took, maxSeekLead)), true
	}
	return false, 0, false
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

// resetPeerSyncsLocked cancels the catch-ups of one room's participants and clears their
// bookkeeping. Callers hold m.mu (read or write).
func (m *Manager) resetPeerSyncsLocked(s *Session) {
	for _, p := range s.Participants {
		m.dropPeerSync(p.ClientId)
	}
}

// dropPeerSync cancels a device's catch-up and forgets its bookkeeping.
func (m *Manager) dropPeerSync(clientId string) {
	m.syncMu.Lock()
	defer m.syncMu.Unlock()
	if ps, ok := m.peerSyncs[clientId]; ok {
		if ps.catchUpCancel != nil {
			ps.catchUpCancel()
		}
		delete(m.peerSyncs, clientId)
	}
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
	var (
		isParticipant bool
		isSource      bool
		threshold     float64
		others        []peerRef
	)
	if session, p := m.findByClientLocked(clientId); session != nil {
		isParticipant = true
		isSource = p.IsSource
		threshold = session.Settings.SyncThreshold
		for _, pp := range session.Participants {
			if pp != p {
				others = append(others, peerRef{clientId: pp.ClientId, epoch: pp.Epoch})
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
		var finished []HistoryEntry
		if s, p := m.findByClientLocked(clientId); s != nil {
			p.LastSeen = time.Now()
			p.PlaybackStatus = &PlaybackStatusInfo{
				Paused:      e.Paused,
				CurrentTime: e.CurrentTime,
				Duration:    e.Duration,
			}
			if p.IsSource {
				finished = m.tickHistoryLocked(s, e.Paused, e.Duration)
			}
		}
		m.mu.Unlock()
		m.saveHistory(finished)

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
			if s, p := m.findByClientLocked(clientId); s != nil {
				p.Epoch = s.Epoch
				p.PlaybackId = ""
				if e.State.PlaybackInfo != nil {
					p.PlaybackId = e.State.PlaybackInfo.Id
				}
				m.logger.Trace().Str("clientId", clientId).Int("epoch", p.Epoch).Msg("watchparty: Participant loaded the session media")
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

	m.mu.Lock()
	session, src := m.findByClientLocked(e.GetClientId())
	if session == nil || !src.IsSource {
		m.mu.Unlock()
		return
	}
	m.resetPeerSyncsLocked(session)
	changed := !mediaInfoEqual(session.MediaInfo, mi)
	session.MediaInfo = mi
	if changed {
		session.Epoch++
	}
	// The source is definitionally in sync with its own media.
	src.Epoch = session.Epoch
	if e.State.PlaybackInfo != nil {
		src.PlaybackId = e.State.PlaybackInfo.Id
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
		m.cancelCatchUp(st)
		m.seekPeer(p.clientId, e.CurrentTime, st)
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
	matches := false
	if session, p := m.findByClientLocked(e.GetClientId()); session != nil {
		matches = p.IsSource && p.PlaybackId != "" && p.PlaybackId == e.Id
	}
	m.mu.RUnlock()
	if !matches {
		return
	}

	for _, p := range others {
		m.videoCore.Pause(p.clientId)
		m.videoCore.ShowMessage("Watch party: the remote holder stopped playback", 3000, p.clientId)
	}

	m.mu.Lock()
	if s, p := m.findByClientLocked(e.GetClientId()); s != nil {
		m.resetPeerSyncsLocked(s)
		m.saveHistory(m.finishTallyLocked(s))
		s.MediaInfo = nil
		p.PlaybackId = ""
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

	if !m.seekSettled(p.clientId, st, peerStatus, src.Paused) {
		// A seek is still landing (buffering over a slow link): sending another would cancel
		// it. Only keep play/pause in line meanwhile.
		if src.Paused && !peerStatus.Paused {
			m.videoCore.Pause(p.clientId)
		} else if !src.Paused && peerStatus.Paused {
			m.videoCore.Resume(p.clientId)
		}
		return
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
		if (drift < -resumePositionDriftThreshold || drift > resumeAheadTolerance) && m.canSeek(st) {
			m.seekPeerAhead(p.clientId, src.CurrentTime, st)
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
			m.seekPeerAhead(p.clientId, src.CurrentTime, st)
		}
	}
}

// seekSettled reports whether the participant has no seek still landing. It records how
// long a landed seek took, and gives up on one that never landed.
func (m *Manager) seekSettled(clientId string, st *peerSync, status *videocore.PlaybackStatus, srcPaused bool) bool {
	now := time.Now()
	m.syncMu.Lock()
	defer m.syncMu.Unlock()
	prev := st.lastPeerTime
	st.lastPeerTime = status.CurrentTime
	if !st.seek.active {
		return true
	}
	landed, took, ok := seekLanding(st.seek, now, status.CurrentTime, prev, status.Paused, srcPaused)
	if landed {
		if ok {
			if old, had := m.peerLeads[clientId]; had {
				m.peerLeads[clientId] = old*(1-seekLeadSmoothing) + took*seekLeadSmoothing
			} else {
				m.peerLeads[clientId] = took
			}
			m.logger.Trace().Str("clientId", clientId).Float64("took", took).Float64("lead", m.peerLeads[clientId]).Msg("watchparty: Seek landed")
		}
		st.seek = pendingSeek{}
		return true
	}
	if now.Sub(st.seek.at) >= seekLandTimeout {
		m.logger.Debug().Str("clientId", clientId).Float64("target", st.seek.target).Msg("watchparty: Seek didn't land in time, retrying")
		st.seek = pendingSeek{}
		return true
	}
	return false
}

// seekPeerAhead seeks a participant to where the playing source will be by the time the
// seek has landed on that participant's connection.
func (m *Manager) seekPeerAhead(clientId string, srcTime float64, st *peerSync) {
	m.syncMu.Lock()
	lead := m.peerLeads[clientId]
	m.syncMu.Unlock()
	m.sendSeek(clientId, srcTime+lead, st, true)
}

func (m *Manager) canSeek(st *peerSync) bool {
	m.syncMu.Lock()
	defer m.syncMu.Unlock()
	return time.Since(st.lastSeekTime) >= seekCooldown
}

// seekPeer seeks a participant to an exact position (the source is paused or scrubbed).
func (m *Manager) seekPeer(clientId string, position float64, st *peerSync) {
	m.sendSeek(clientId, position, st, false)
}

func (m *Manager) sendSeek(clientId string, position float64, st *peerSync, measure bool) {
	now := time.Now()
	m.syncMu.Lock()
	st.lastSeekTime = now
	st.seek = pendingSeek{active: true, target: position, at: now, measure: measure}
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
		MediaImage:    mediaImage(info),
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

func mediaImage(info *videocore.VideoPlaybackInfo) string {
	if info.Media == nil || info.Media.CoverImage == nil {
		return ""
	}
	if c := info.Media.CoverImage; c.ExtraLarge != nil && *c.ExtraLarge != "" {
		return *c.ExtraLarge
	} else if c.Large != nil {
		return *c.Large
	}
	return ""
}
