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
// Several rooms can be open at once. Each room has exactly one "remote" holder (the
// participant with IsSource set): only that device's playback drives the room, and it can
// hand the remote to anyone else in the room. A profile occupies at most one seat across
// every room — joining from another device moves that profile's seat to the new device,
// and joining another room leaves the previous one — so nobody can appear twice. (Without
// profiles, every request has profile id 0 and a seat is per device instead.)
//
// Every room has a realtime text chat. Messages are kept in memory (bounded) and pushed
// to the room's devices over the websocket.

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"seanime/internal/events"
	"seanime/internal/videocore"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

// watchpartySubscriberId identifies this module's VideoCore subscription.
const watchpartySubscriberId = "watchparty"

const (
	maxChatHistory     = 200
	maxChatMessageLen  = 500
	maxRoomNameLen     = 60
	chatRateLimitCount = 8               // messages…
	chatRateLimitSpan  = 5 * time.Second // …per span, per participant
)

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
		MediaImage         string                        `json:"mediaImage,omitempty"`
		EpisodeNumber      int                           `json:"episodeNumber"`
		EpisodeTitle       string                        `json:"episodeTitle,omitempty"`
		AniDBEpisode       string                        `json:"aniDbEpisode,omitempty"`
		StreamType         string                        `json:"streamType"` // "localfile" | "torrent" | "debrid" | "onlinestream" | "nakama" | "unknown"
		PlaybackType       string                        `json:"playbackType,omitempty"`
		LocalFilePath      string                        `json:"localFilePath,omitempty"`
		OnlinestreamParams *videocore.OnlinestreamParams `json:"onlinestreamParams,omitempty"`
	}

	// Participant is a seat in a room. A profile holds at most one seat across all rooms;
	// the seat is bound to the device (clientId) the profile last joined from.
	Participant struct {
		ClientId  string    `json:"clientId"`
		ProfileID uint      `json:"profileId"`
		Username  string    `json:"username"`
		IsSource  bool      `json:"isSource"` // holds the remote
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

		chatTimes []time.Time
	}

	PlaybackStatusInfo struct {
		Paused      bool    `json:"paused"`
		CurrentTime float64 `json:"currentTime"` // in seconds
		Duration    float64 `json:"duration"`    // in seconds
	}

	// ChatMessage is one line of a room's chat. System messages (joins, remote hand-offs)
	// have Kind "system" and no author.
	ChatMessage struct {
		ID        string    `json:"id"`
		SessionID string    `json:"sessionId"`
		Kind      string    `json:"kind"` // "user" | "system"
		ProfileID uint      `json:"profileId,omitempty"`
		Username  string    `json:"username,omitempty"`
		Text      string    `json:"text"`
		Timestamp time.Time `json:"timestamp"`
	}

	// Session is one watch party room. It is broadcast to every connected client on every
	// membership or media change so devices can list rooms and follow the one they're in.
	Session struct {
		ID           string         `json:"id"`
		Name         string         `json:"name"`
		Participants []*Participant `json:"participants"`
		MediaInfo    *MediaInfo     `json:"mediaInfo,omitempty"` // nil while the remote holder plays nothing
		Settings     Settings       `json:"settings"`
		CreatedAt    time.Time      `json:"createdAt"`
		// Epoch is bumped every time the source's media changes. Participants carry the
		// epoch of the media they have loaded.
		Epoch int `json:"epoch"`

		messages []*ChatMessage
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

// participantByPerson returns the seat held by the same person: the same profile, or —
// when profiles aren't in use (profile id 0) — the same device.
func (s *Session) participantByPerson(profileID uint, clientId string) *Participant {
	for _, p := range s.Participants {
		if samePerson(p, profileID, clientId) {
			return p
		}
	}
	return nil
}

func samePerson(p *Participant, profileID uint, clientId string) bool {
	if profileID == 0 {
		return p.ClientId == clientId
	}
	return p.ProfileID == profileID
}

func (s *Session) source() *Participant {
	for _, p := range s.Participants {
		if p.IsSource {
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

		// mu guards the sessions and everything reachable from them.
		mu       sync.RWMutex
		sessions map[string]*Session
		order    []string // session ids, oldest first

		// syncMu guards the per-participant sync bookkeeping. Keys are clientIds, which
		// are unique across rooms because a device holds at most one seat.
		syncMu    sync.Mutex
		peerSyncs map[string]*peerSync

		sub *videocore.Subscriber
	}

	// StatePayload is the payload of the watch-party-state websocket event.
	StatePayload struct {
		Sessions []*Session `json:"sessions"`
	}

	// ChatPayload is the payload of the watch-party-chat websocket event.
	ChatPayload struct {
		Message *ChatMessage `json:"message"`
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
		sessions:       make(map[string]*Session),
		peerSyncs:      make(map[string]*peerSync),
	}
	if m.videoCore != nil {
		m.sub = m.videoCore.Subscribe(watchpartySubscriberId)
		go m.listen()
	}
	return m
}

// Shutdown ends every room and stops listening to player events.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	had := len(m.sessions) > 0
	m.sessions = make(map[string]*Session)
	m.order = nil
	m.mu.Unlock()

	m.resetPeerSyncs()

	if m.sub != nil {
		m.videoCore.Unsubscribe(watchpartySubscriberId)
		m.sub = nil
	}

	if had {
		m.broadcastState()
	}
}

// --------------------------------------------------------------------------------------
// Room management (called by the HTTP handlers)
// --------------------------------------------------------------------------------------

// Create opens a new room with the calling device holding the remote. The profile's seat
// in any other room is given up first.
func (m *Manager) Create(profileID uint, clientId string, name string, settings *Settings) (*Session, error) {
	if clientId == "" {
		return nil, errors.New("missing client id")
	}

	username := m.profileName(profileID)

	m.mu.Lock()
	// Idempotent for the device that already holds the remote of a room (page reload).
	if s, p := m.findByClientLocked(clientId); s != nil && p.IsSource && p.ProfileID == profileID {
		snap := s.snapshot()
		m.mu.Unlock()
		return snap, nil
	}

	var notes []*ChatMessage
	notes = append(notes, m.vacateLocked(profileID, clientId)...)

	s := Settings{SyncThreshold: defaultSyncThreshold}
	if settings != nil && settings.SyncThreshold > 0 {
		s.SyncThreshold = settings.SyncThreshold
	}

	name = cleanText(name, maxRoomNameLen)
	if name == "" {
		name = username + "'s room"
	}

	session := &Session{
		ID:        uuid.NewString(),
		Name:      name,
		Settings:  s,
		CreatedAt: time.Now(),
		Epoch:     1,
		Participants: []*Participant{{
			ClientId:  clientId,
			ProfileID: profileID,
			Username:  username,
			IsSource:  true,
			JoinedAt:  time.Now(),
			LastSeen:  time.Now(),
		}},
	}
	m.sessions[session.ID] = session
	m.order = append(m.order, session.ID)
	notes = append(notes, m.systemMessageLocked(session, username+" opened the room and has the remote"))
	snap := session.snapshot()
	m.mu.Unlock()

	m.logger.Info().Str("sessionId", session.ID).Str("clientId", clientId).Uint("profileId", profileID).Msg("watchparty: Room created")
	m.broadcastState()
	m.deliverChat(notes...)
	return snap, nil
}

// Join seats the calling device in a room. If the profile already has a seat in that room
// from another device, the seat moves to this device (keeping the remote if it had it);
// a seat in any other room is given up.
func (m *Manager) Join(profileID uint, clientId string, sessionId string) (*Session, error) {
	if clientId == "" {
		return nil, errors.New("missing client id")
	}

	m.mu.Lock()
	session := m.sessionLocked(sessionId)
	if session == nil {
		m.mu.Unlock()
		return nil, errors.New("that watch party no longer exists")
	}

	username := m.profileName(profileID)
	var notes []*ChatMessage

	if p := session.participantByPerson(profileID, clientId); p != nil {
		if p.ClientId != clientId {
			// Same profile, new device: move the seat. The old device stops being synced.
			oldClient := p.ClientId
			// The new device might be seated elsewhere under another profile.
			notes = append(notes, m.vacateClientLocked(clientId, session.ID)...)
			if other := session.participant(clientId); other != nil && other != p {
				notes = append(notes, m.removeParticipantLocked(session, other)...)
			}
			m.dropPeerSync(oldClient)
			p.ClientId = clientId
			p.Epoch = 0
			p.PlaybackId = ""
			p.PlaybackStatus = nil
			m.logger.Info().Str("sessionId", session.ID).Str("from", oldClient).Str("to", clientId).Msg("watchparty: Seat moved to another device")
		}
		p.Username = username
		p.LastSeen = time.Now()
		snap := session.snapshot()
		m.mu.Unlock()
		m.broadcastState()
		m.deliverChat(notes...)
		return snap, nil
	}

	notes = append(notes, m.vacateLocked(profileID, clientId)...)
	if m.sessions[session.ID] == nil {
		// Vacating this device's other seat emptied the very room being joined.
		m.mu.Unlock()
		m.broadcastState()
		return nil, errors.New("that watch party no longer exists")
	}

	session.Participants = append(session.Participants, &Participant{
		ClientId:  clientId,
		ProfileID: profileID,
		Username:  username,
		JoinedAt:  time.Now(),
		LastSeen:  time.Now(),
	})
	notes = append(notes, m.systemMessageLocked(session, username+" joined"))
	snap := session.snapshot()
	m.mu.Unlock()

	m.logger.Info().Str("sessionId", session.ID).Str("clientId", clientId).Uint("profileId", profileID).Msg("watchparty: Participant joined")
	m.broadcastState()
	m.deliverChat(notes...)
	return snap, nil
}

// Leave gives up the calling device's seat. When the remote holder leaves, the remote
// passes to the longest-seated participant. When the last participant leaves, the room
// closes.
func (m *Manager) Leave(profileID uint, clientId string) error {
	if clientId == "" {
		return errors.New("missing client id")
	}

	m.mu.Lock()
	session, p := m.findByClientLocked(clientId)
	if session == nil {
		m.mu.Unlock()
		return errors.New("not in a watch party")
	}
	if p.ProfileID != profileID {
		m.mu.Unlock()
		return errors.New("not this profile's seat")
	}
	notes := m.removeParticipantLocked(session, p)
	m.mu.Unlock()

	m.logger.Info().Str("sessionId", session.ID).Str("clientId", clientId).Msg("watchparty: Participant left")
	m.broadcastState()
	m.deliverChat(notes...)
	return nil
}

// Stop closes the caller's room for everyone. Only the remote holder may do it.
func (m *Manager) Stop(profileID uint, clientId string) error {
	if clientId == "" {
		return errors.New("missing client id")
	}

	m.mu.Lock()
	session, p := m.findByClientLocked(clientId)
	if session == nil || !p.IsSource {
		m.mu.Unlock()
		return errors.New("only the remote holder can end the watch party")
	}
	m.closeSessionLocked(session)
	m.mu.Unlock()

	m.logger.Info().Str("sessionId", session.ID).Uint("profileId", profileID).Msg("watchparty: Room closed by the remote holder")
	m.broadcastState()
	return nil
}

// PassRemote hands the remote from the caller (who must hold it) to another participant
// of the same room.
func (m *Manager) PassRemote(profileID uint, clientId string, toClientId string) (*Session, error) {
	m.mu.Lock()
	session, p := m.findByClientLocked(clientId)
	if session == nil {
		m.mu.Unlock()
		return nil, errors.New("not in a watch party")
	}
	if !p.IsSource || p.ProfileID != profileID {
		m.mu.Unlock()
		return nil, errors.New("you don't have the remote")
	}
	target := session.participant(toClientId)
	if target == nil {
		m.mu.Unlock()
		return nil, errors.New("that person isn't in this room")
	}
	if target == p {
		snap := session.snapshot()
		m.mu.Unlock()
		return snap, nil
	}
	p.IsSource = false
	target.IsSource = true
	m.resetPeerSyncsLocked(session)
	note := m.systemMessageLocked(session, p.Username+" passed the remote to "+target.Username)
	snap := session.snapshot()
	m.mu.Unlock()

	m.logger.Info().Str("sessionId", session.ID).Str("to", toClientId).Msg("watchparty: Remote passed")
	m.broadcastState()
	m.deliverChat(note)
	return snap, nil
}

// RequestRemote posts a request for the remote into the room's chat.
func (m *Manager) RequestRemote(profileID uint, clientId string) error {
	m.mu.Lock()
	session, p := m.findByClientLocked(clientId)
	if session == nil || p.ProfileID != profileID {
		m.mu.Unlock()
		return errors.New("not in a watch party")
	}
	if p.IsSource {
		m.mu.Unlock()
		return errors.New("you already have the remote")
	}
	note := m.systemMessageLocked(session, p.Username+" is asking for the remote")
	m.mu.Unlock()

	m.deliverChat(note)
	return nil
}

// SendChat posts a message from the caller to their room.
func (m *Manager) SendChat(profileID uint, clientId string, text string) (*ChatMessage, error) {
	text = cleanText(text, maxChatMessageLen)
	if text == "" {
		return nil, errors.New("empty message")
	}

	m.mu.Lock()
	session, p := m.findByClientLocked(clientId)
	if session == nil || p.ProfileID != profileID {
		m.mu.Unlock()
		return nil, errors.New("not in a watch party")
	}

	// Simple flood guard.
	now := time.Now()
	recent := p.chatTimes[:0]
	for _, t := range p.chatTimes {
		if now.Sub(t) < chatRateLimitSpan {
			recent = append(recent, t)
		}
	}
	p.chatTimes = recent
	if len(recent) >= chatRateLimitCount {
		m.mu.Unlock()
		return nil, errors.New("slow down a little")
	}
	p.chatTimes = append(p.chatTimes, now)
	p.LastSeen = now

	msg := &ChatMessage{
		ID:        uuid.NewString(),
		SessionID: session.ID,
		Kind:      "user",
		ProfileID: p.ProfileID,
		Username:  p.Username,
		Text:      text,
		Timestamp: now,
	}
	session.appendMessage(msg)
	m.mu.Unlock()

	m.deliverChat(msg)
	return msg, nil
}

// ChatHistory returns the caller's room's chat history.
func (m *Manager) ChatHistory(clientId string) []*ChatMessage {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session, _ := m.findByClientLocked(clientId)
	if session == nil {
		return []*ChatMessage{}
	}
	out := make([]*ChatMessage, len(session.messages))
	copy(out, session.messages)
	return out
}

// Status returns a snapshot of every open room, oldest first.
func (m *Manager) Status() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.snapshotAllLocked()
}

// --------------------------------------------------------------------------------------
// Internals (callers hold m.mu for writing unless noted)
// --------------------------------------------------------------------------------------

func (m *Manager) sessionLocked(id string) *Session {
	return m.sessions[id]
}

// findByClientLocked returns the room and seat of a device. Read or write lock.
func (m *Manager) findByClientLocked(clientId string) (*Session, *Participant) {
	for _, id := range m.order {
		s := m.sessions[id]
		if p := s.participant(clientId); p != nil {
			return s, p
		}
	}
	return nil, nil
}

// vacateLocked removes every seat held by the profile or the device, in any room, so the
// caller can take a fresh one. Returns the system messages to deliver.
func (m *Manager) vacateLocked(profileID uint, clientId string) []*ChatMessage {
	var notes []*ChatMessage
	for _, id := range append([]string(nil), m.order...) {
		s := m.sessions[id]
		if s == nil {
			continue
		}
		for _, p := range append([]*Participant(nil), s.Participants...) {
			if samePerson(p, profileID, clientId) || p.ClientId == clientId {
				notes = append(notes, m.removeParticipantLocked(s, p)...)
			}
		}
	}
	return notes
}

// vacateClientLocked removes the device's seat from every room except keepSessionId.
func (m *Manager) vacateClientLocked(clientId string, keepSessionId string) []*ChatMessage {
	var notes []*ChatMessage
	for _, id := range append([]string(nil), m.order...) {
		if id == keepSessionId {
			continue
		}
		s := m.sessions[id]
		if s == nil {
			continue
		}
		if p := s.participant(clientId); p != nil {
			notes = append(notes, m.removeParticipantLocked(s, p)...)
		}
	}
	return notes
}

// removeParticipantLocked takes a seat out of a room, passing the remote on or closing the
// room as needed.
func (m *Manager) removeParticipantLocked(s *Session, p *Participant) []*ChatMessage {
	remaining := make([]*Participant, 0, len(s.Participants))
	for _, pp := range s.Participants {
		if pp != p {
			remaining = append(remaining, pp)
		}
	}
	s.Participants = remaining
	m.dropPeerSync(p.ClientId)

	if len(remaining) == 0 {
		m.closeSessionLocked(s)
		m.logger.Info().Str("sessionId", s.ID).Msg("watchparty: Room closed (no participants left)")
		return nil
	}

	notes := []*ChatMessage{m.systemMessageLocked(s, p.Username+" left")}
	if p.IsSource {
		remaining[0].IsSource = true
		m.resetPeerSyncsLocked(s)
		notes = append(notes, m.systemMessageLocked(s, remaining[0].Username+" has the remote now"))
		m.logger.Info().Str("sessionId", s.ID).Str("clientId", remaining[0].ClientId).Msg("watchparty: Remote passed on")
	}
	return notes
}

func (m *Manager) closeSessionLocked(s *Session) {
	m.resetPeerSyncsLocked(s)
	delete(m.sessions, s.ID)
	for i, id := range m.order {
		if id == s.ID {
			m.order = append(m.order[:i], m.order[i+1:]...)
			break
		}
	}
}

func (m *Manager) systemMessageLocked(s *Session, text string) *ChatMessage {
	msg := &ChatMessage{
		ID:        uuid.NewString(),
		SessionID: s.ID,
		Kind:      "system",
		Text:      text,
		Timestamp: time.Now(),
	}
	s.appendMessage(msg)
	return msg
}

func (s *Session) appendMessage(msg *ChatMessage) {
	s.messages = append(s.messages, msg)
	if over := len(s.messages) - maxChatHistory; over > 0 {
		s.messages = append([]*ChatMessage(nil), s.messages[over:]...)
	}
}

// snapshot copies the session so it can be marshalled without racing later mutations.
// Callers must hold m.mu (read or write).
func (s *Session) snapshot() *Session {
	snap := *s
	snap.messages = nil
	snap.Participants = make([]*Participant, len(s.Participants))
	for i, p := range s.Participants {
		pc := *p
		pc.chatTimes = nil
		if p.PlaybackStatus != nil {
			ps := *p.PlaybackStatus
			pc.PlaybackStatus = &ps
		}
		snap.Participants[i] = &pc
	}
	return &snap
}

func (m *Manager) snapshotAllLocked() []*Session {
	out := make([]*Session, 0, len(m.order))
	for _, id := range m.order {
		if s := m.sessions[id]; s != nil {
			out = append(out, s.snapshot())
		}
	}
	return out
}

func (m *Manager) profileName(profileID uint) string {
	if m.getProfileName != nil {
		if name := m.getProfileName(profileID); name != "" {
			return name
		}
	}
	return fmt.Sprintf("Profile %d", profileID)
}

// broadcastState sends every open room to every connected client.
func (m *Manager) broadcastState() {
	m.mu.RLock()
	payload := StatePayload{Sessions: m.snapshotAllLocked()}
	m.mu.RUnlock()
	m.wsEventManager.SendEvent(events.WatchPartyState, payload)
}

// deliverChat pushes chat messages to the devices seated in each message's room.
func (m *Manager) deliverChat(msgs ...*ChatMessage) {
	for _, msg := range msgs {
		if msg == nil {
			continue
		}
		m.mu.RLock()
		var clients []string
		if s := m.sessions[msg.SessionID]; s != nil {
			for _, p := range s.Participants {
				clients = append(clients, p.ClientId)
			}
		}
		m.mu.RUnlock()
		for _, c := range clients {
			m.wsEventManager.SendEventTo(c, events.WatchPartyChat, ChatPayload{Message: msg}, true)
		}
	}
}

// cleanText trims, collapses control characters and caps the length (in runes).
func cleanText(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return ' '
		}
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

func (m *Manager) listen() {
	defer m.videoCore.Unsubscribe(watchpartySubscriberId)
	for event := range m.sub.Events() {
		m.handleVideoEvent(event)
	}
}
