package watchparty

// Same-server watch parties ("Watch Together").
//
// Nakama watch parties link two separate Seanime instances over the network. This module
// does it without a second instance: every device (a browser tab, a Denshi app) already
// talks to this one server over its own websocket with its own clientId, and VideoCore
// keeps per-client playback state — so one device's playback can be mirrored onto the
// others by translating its events into per-client commands (Pause/Resume/SeekTo) and by
// one-way drift correction from the source's periodic status events.
//
// One active session at a time. The device that creates it is the source; when the source
// leaves, the first remaining participant is promoted. Joiners follow the source and never
// drive the sync themselves.

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"seanime/internal/events"
	"seanime/internal/videocore"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// watchpartySubscriberId identifies this module's VideoCore subscription.
const watchpartySubscriberId = "watchparty"

type (
	// Settings tunes how tightly participants follow the source.
	Settings struct {
		// SyncThreshold is the seconds of drift tolerated before a participant is seeked
		// back in line with the source.
		SyncThreshold float64 `json:"syncThreshold"`
	}

	// MediaInfo describes what the source is playing, so joiners can start the same
	// episode and the UI can show it.
	MediaInfo struct {
		MediaId            int                           `json:"mediaId"`
		MediaTitle         string                        `json:"mediaTitle,omitempty"`
		EpisodeNumber      int                           `json:"episodeNumber"`
		EpisodeTitle       string                        `json:"episodeTitle,omitempty"`
		AniDBEpisode       string                        `json:"aniDbEpisode,omitempty"`
		StreamType         string                        `json:"streamType"` // "localfile" | "torrent" | "debrid" | "onlinestream" | "nakama" | "unknown"
		PlaybackType       string                        `json:"playbackType,omitempty"`
		LocalFilePath      string                        `json:"localFilePath,omitempty"`
		OnlinestreamParams *videocore.OnlinestreamParams `json:"onlinestreamParams,omitempty"`
	}

	// Participant is a device in the session. A profile can appear once per device;
	// participants are keyed by clientId (the device's VideoCore identity).
	Participant struct {
		ClientId  string    `json:"clientId"`
		ProfileID uint      `json:"profileId"`
		Username  string    `json:"username"`
		IsSource  bool      `json:"isSource"`
		JoinedAt  time.Time `json:"joinedAt"`
		LastSeen  time.Time `json:"lastSeen"`
		// Epoch is the session media generation this participant has loaded. It is 0 until
		// the participant starts the session's current media, which is how sync skips
		// devices that are still loading or were left behind on the previous episode.
		Epoch int `json:"epoch"`
		// PlaybackStatus mirrors the participant's last known playback, for display.
		PlaybackStatus *PlaybackStatusInfo `json:"playbackStatus,omitempty"`
		// PlaybackId is the id of the participant's current playback. Used to tell a real
		// player close apart from the cleanup dispatch during episode transitions.
		PlaybackId string `json:"-"`
	}

	PlaybackStatusInfo struct {
		Paused      bool    `json:"paused"`
		CurrentTime float64 `json:"currentTime"` // in seconds
		Duration    float64 `json:"duration"`    // in seconds
	}

	// Session is the shared watch party state. It is broadcast to every connected client
	// on every membership or media change.
	Session struct {
		ID           string         `json:"id"`
		Participants []*Participant `json:"participants"`
		MediaInfo    *MediaInfo     `json:"mediaInfo,omitempty"` // nil while the source plays nothing
		Settings     Settings       `json:"settings"`
		CreatedAt    time.Time      `json:"createdAt"`
		// Epoch is bumped every time the source's media changes. Participants carry the
		// epoch of the media they have loaded.
		Epoch int `json:"epoch"`
	}
)

// participant returns the participant with the given clientId, or nil.
func (s *Session) participant(clientId string) *Participant {
	for _, p := range s.Participants {
		if p.ClientId == clientId {
			return p
		}
	}
	return nil
}

func mediaInfoEqual(a, b *MediaInfo) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.MediaId == b.MediaId &&
		a.EpisodeNumber == b.EpisodeNumber &&
		a.AniDBEpisode == b.AniDBEpisode &&
		a.StreamType == b.StreamType &&
		a.LocalFilePath == b.LocalFilePath
}

type (
	NewManagerOptions struct {
		Logger         *zerolog.Logger
		WsEventManager events.WSEventManagerInterface
		VideoCore      *videocore.VideoCore
		// GetProfileNameFunc resolves a profile id to a display name. Optional.
		GetProfileNameFunc func(profileID uint) string
	}

	Manager struct {
		logger         *zerolog.Logger
		wsEventManager events.WSEventManagerInterface
		videoCore      *videocore.VideoCore
		getProfileName func(profileID uint) string

		// mu guards the session and everything reachable from it.
		mu      sync.RWMutex
		session *Session

		// syncMu guards the per-participant sync bookkeeping.
		syncMu    sync.Mutex
		peerSyncs map[string]*peerSync

		sub *videocore.Subscriber
	}

	// StatePayload is the payload of the watch-party-state websocket event.
	StatePayload struct {
		Session *Session `json:"session"` // nil when no session is active
	}
)

func New(opts NewManagerOptions) *Manager {
	logger := opts.Logger
	if logger == nil {
		l := zerolog.Nop()
		logger = &l
	}
	m := &Manager{
		logger:         logger,
		wsEventManager: opts.WsEventManager,
		videoCore:      opts.VideoCore,
		getProfileName: opts.GetProfileNameFunc,
		peerSyncs:      make(map[string]*peerSync),
	}
	if m.videoCore != nil {
		m.sub = m.videoCore.Subscribe(watchpartySubscriberId)
		go m.listen()
	}
	return m
}

// Shutdown ends any active session and stops listening to player events.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	hadSession := m.session != nil
	m.session = nil
	m.mu.Unlock()

	m.resetPeerSyncs()

	if m.sub != nil {
		m.videoCore.Unsubscribe(watchpartySubscriberId)
		m.sub = nil
	}

	if hadSession {
		m.broadcastState()
	}
}

// --------------------------------------------------------------------------------------
// Session management (called by the HTTP handlers)
// --------------------------------------------------------------------------------------

// Create starts a new session with the calling device as the source.
func (m *Manager) Create(profileID uint, clientId string, settings *Settings) (*Session, error) {
	if clientId == "" {
		return nil, errors.New("missing client id")
	}

	m.mu.Lock()
	if m.session != nil {
		session := m.session
		m.mu.Unlock()
		// Idempotent for the device that created it (e.g. the page was reloaded).
		if p := session.participant(clientId); p != nil && p.IsSource {
			return m.snapshot(session), nil
		}
		return nil, errors.New("a watch party is already active")
	}

	s := Settings{SyncThreshold: defaultSyncThreshold}
	if settings != nil && settings.SyncThreshold > 0 {
		s.SyncThreshold = settings.SyncThreshold
	}

	session := &Session{
		ID:        uuid.NewString(),
		Settings:  s,
		CreatedAt: time.Now(),
		Epoch:     1,
		Participants: []*Participant{{
			ClientId:  clientId,
			ProfileID: profileID,
			Username:  m.profileName(profileID),
			IsSource:  true,
			JoinedAt:  time.Now(),
			LastSeen:  time.Now(),
		}},
	}
	m.session = session
	snap := m.snapshot(session)
	m.mu.Unlock()

	m.logger.Info().Str("clientId", clientId).Uint("profileId", profileID).Msg("watchparty: Session created")
	m.broadcastState()
	return snap, nil
}

// Join adds the calling device to the active session.
func (m *Manager) Join(profileID uint, clientId string) (*Session, error) {
	if clientId == "" {
		return nil, errors.New("missing client id")
	}

	m.mu.Lock()
	session := m.session
	if session == nil {
		m.mu.Unlock()
		return nil, errors.New("no active watch party")
	}
	if p := session.participant(clientId); p != nil {
		// Already in — refresh the profile info in case it changed.
		p.ProfileID = profileID
		p.Username = m.profileName(profileID)
		snap := m.snapshot(session)
		m.mu.Unlock()
		return snap, nil
	}
	session.Participants = append(session.Participants, &Participant{
		ClientId:  clientId,
		ProfileID: profileID,
		Username:  m.profileName(profileID),
		JoinedAt:  time.Now(),
		LastSeen:  time.Now(),
	})
	snap := m.snapshot(session)
	m.mu.Unlock()

	m.logger.Info().Str("clientId", clientId).Uint("profileId", profileID).Msg("watchparty: Participant joined")
	m.broadcastState()
	return snap, nil
}

// Leave removes a participant. When the source leaves, the first remaining participant
// becomes the source. When the last participant leaves, the session ends.
func (m *Manager) Leave(profileID uint, clientId string) error {
	if clientId == "" {
		return errors.New("missing client id")
	}

	m.mu.Lock()
	session := m.session
	if session == nil {
		m.mu.Unlock()
		return errors.New("no active watch party")
	}
	p := session.participant(clientId)
	if p == nil {
		m.mu.Unlock()
		return errors.New("not a participant")
	}
	if p.ProfileID != profileID {
		m.mu.Unlock()
		return errors.New("not this profile's participant")
	}

	remaining := make([]*Participant, 0, len(session.Participants)-1)
	for _, pp := range session.Participants {
		if pp != p {
			remaining = append(remaining, pp)
		}
	}
	wasSource := p.IsSource
	session.Participants = remaining

	if wasSource && len(remaining) > 0 {
		remaining[0].IsSource = true
		m.logger.Info().Str("clientId", remaining[0].ClientId).Msg("watchparty: Promoted new source")
	}

	destroyed := len(remaining) == 0
	if destroyed {
		m.session = nil
	}
	m.resetPeerSyncs()
	m.mu.Unlock()

	if destroyed {
		m.logger.Info().Msg("watchparty: Session ended (no participants left)")
	} else {
		m.logger.Info().Str("clientId", clientId).Msg("watchparty: Participant left")
	}
	m.broadcastState()
	return nil
}

// Stop ends the session for everyone. Only the source may stop it; other participants
// leave with Leave.
func (m *Manager) Stop(profileID uint, clientId string) error {
	if clientId == "" {
		return errors.New("missing client id")
	}

	m.mu.Lock()
	session := m.session
	if session == nil {
		m.mu.Unlock()
		return errors.New("no active watch party")
	}
	p := session.participant(clientId)
	if p == nil || !p.IsSource {
		m.mu.Unlock()
		return errors.New("only the source can stop the watch party")
	}
	m.session = nil
	m.resetPeerSyncs()
	m.mu.Unlock()

	m.logger.Info().Uint("profileId", profileID).Msg("watchparty: Session stopped by source")
	m.broadcastState()
	return nil
}

// Status returns a snapshot of the active session, or nil.
func (m *Manager) Status() *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.session == nil {
		return nil
	}
	return m.snapshot(m.session)
}

// --------------------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------------------

// snapshot copies the session so it can be marshalled without racing later mutations.
// Callers must hold m.mu (read or write).
func (m *Manager) snapshot(session *Session) *Session {
	snap := *session
	snap.Participants = make([]*Participant, len(session.Participants))
	for i, p := range session.Participants {
		pc := *p
		snap.Participants[i] = &pc
	}
	return &snap
}

func (m *Manager) profileName(profileID uint) string {
	if m.getProfileName != nil {
		if name := m.getProfileName(profileID); name != "" {
			return name
		}
	}
	return fmt.Sprintf("Profile %d", profileID)
}

// broadcastState sends the current session (or a null session) to every connected client.
func (m *Manager) broadcastState() {
	m.mu.RLock()
	var payload StatePayload
	if m.session != nil {
		payload.Session = m.snapshot(m.session)
	}
	m.mu.RUnlock()
	m.wsEventManager.SendEvent(events.WatchPartyState, payload)
}

func (m *Manager) listen() {
	defer m.videoCore.Unsubscribe(watchpartySubscriberId)
	for event := range m.sub.Events() {
		m.handleVideoEvent(event)
	}
}
