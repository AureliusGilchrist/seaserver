package chat

// Package chat implements the server-side store for the end-to-end encrypted
// profile chat. The server never sees plaintext: every message, reaction and
// image is stored as {iv, ciphertext} encrypted by the clients with a key
// derived from a conversation key (ECDH between profile identity keys, which
// themselves are sealed with a PIN-derived key). Read receipts and typing
// indicators are timing metadata only.
//
// Persistence is a single JSON file next to the other app data. Writes are
// debounced and flushed by a background goroutine.

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// Limits.
const (
	// MaxMessageChars of ciphertext base64 we accept (~24KB of plaintext slack).
	MaxMessageChars = 64 * 1024
	// MaxImageBytes is the encrypted image blob cap.
	MaxImageBytes = 12 * 1024 * 1024
	// MaxMessagesPerConversation keeps the JSON file from growing forever.
	MaxMessagesPerConversation = 3000
	// typingWindow is how long a typing ping is considered current.
	typingWindow = 5 * time.Second
	// saveDebounce batches bursts of sends/edits into one disk write.
	saveDebounce = 800 * time.Millisecond
)

// PinState holds one profile's chat identity, all of it opaque to the server:
//   - Salt:        PBKDF2 salt the client used for the PIN key
//   - Verifier:    AES-GCM encryption of a known constant under the PIN key —
//                  proves a PIN is correct without the server ever seeing it
//   - PublicKey:   ECDH public key (JWK), shared with chat partners
//   - EncPrivKey:  the ECDH private key sealed under the PIN key
type PinState struct {
	Salt         string `json:"salt"`
	Verifier     string `json:"verifier"`
	PublicKey    string `json:"publicKey"`
	EncPrivKey   string `json:"encPrivKey"`
	SetupAt      string `json:"setupAt"`
}

// Message is one encrypted chat message. Ciphertext is encrypted with the
// conversation key shared by From and To.
type Message struct {
	ID         string               `json:"id"`
	From       uint                 `json:"from"`
	To         uint                 `json:"to"`
	IV         string               `json:"iv"`
	Ciphertext string               `json:"ciphertext"`
	CreatedAt  string               `json:"createdAt"`
	EditedAt   string               `json:"editedAt,omitempty"`
	DeletedAt  string               `json:"deletedAt,omitempty"`
	ReadAt     string               `json:"readAt,omitempty"`
	ReplyToID  string               `json:"replyToId,omitempty"`
	ImageID    string               `json:"imageId,omitempty"`
	ImageIV    string               `json:"imageIv,omitempty"`
	ImageMime  string               `json:"imageMime,omitempty"`
	Reactions  map[uint]Reaction    `json:"reactions,omitempty"`
}

// Reaction is a profile's (possibly multiple) emoji reaction on a message,
// stored encrypted with the conversation key.
type Reaction struct {
	IV         string `json:"iv"`
	Ciphertext string `json:"ciphertext"`
}

// ImageMeta describes one encrypted image blob on disk.
type ImageMeta struct {
	From      uint   `json:"from"`
	To        uint   `json:"to"`
	Size      int    `json:"size"`
	CreatedAt string `json:"createdAt"`
}

// EventPayload is the WS event pushed to profiles. One event type ("chat"),
// discriminated by Type.
type EventPayload struct {
	Type     string   `json:"type"` // "message" | "typing" | "read" | "pin-setup"
	Message  *Message `json:"message,omitempty"`
	FromID   uint     `json:"fromId,omitempty"`
	IsTyping bool     `json:"isTyping,omitempty"`
	At       string   `json:"at,omitempty"`
}

// State is the payload of the chat state endpoint: this profile's chat identity.
type State struct {
	HasPin              bool   `json:"hasPin"`
	Salt                string `json:"salt,omitempty"`
	Verifier            string `json:"verifier,omitempty"`
	PublicKey           string `json:"publicKey,omitempty"`
	EncryptedPrivateKey string `json:"encryptedPrivateKey,omitempty"`
	UnreadCount         int    `json:"unreadCount"`
}

// PeerKey is a peer profile's public chat key.
type PeerKey struct {
	HasPin    bool   `json:"hasPin"`
	PublicKey string `json:"publicKey,omitempty"`
}

// Conversation is one peer conversation as seen by the requesting profile.
type Conversation struct {
	PeerID       uint     `json:"peerId"`
	PeerName     string   `json:"peerName,omitempty"`
	LastMessage  *Message `json:"lastMessage,omitempty"`
	LastActivity string   `json:"lastActivity,omitempty"`
	UnreadCount  int      `json:"unreadCount"`
	IsPeerTyping bool     `json:"isPeerTyping"`
}

// Conversations is the payload of the conversations endpoint.
type Conversations struct {
	Conversations []*Conversation `json:"conversations"`
}

// Messages is the payload of the messages endpoint.
type Messages struct {
	Messages []*Message `json:"messages"`
}

// ImageUpload is the response of the image upload endpoint.
type ImageUpload struct {
	ImageID string `json:"imageId"`
}

// Manager is the chat store.
type Manager struct {
	mu        sync.RWMutex
	filePath  string
	imagesDir string
	logger    *zerolog.Logger

	pinStates map[uint]*PinState
	messages  []*Message
	images    map[string]*ImageMeta

	// typing[typerProfileId] = last ping time (global; the handler filters by peer)
	typing map[uint]time.Time

	dirty    chan struct{}
	stopOnce sync.Once
	stopCh   chan struct{}
}

func NewManager(dataDir string, logger *zerolog.Logger) *Manager {
	m := &Manager{
		filePath:  filepath.Join(dataDir, "chat.json"),
		imagesDir: filepath.Join(dataDir, "chat-images"),
		logger:    logger,
		pinStates: make(map[uint]*PinState),
		messages:  make([]*Message, 0),
		images:    make(map[string]*ImageMeta),
		typing:    make(map[uint]time.Time),
		dirty:     make(chan struct{}, 1),
		stopCh:    make(chan struct{}),
	}
	m.load()
	go m.saveLoop()
	return m
}

func (m *Manager) Close() {
	m.stopOnce.Do(func() { close(m.stopCh) })
	m.mu.Lock()
	defer m.mu.Unlock()
	m.flushLocked()
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence

type fileState struct {
	PinStates map[uint]*PinState `json:"pinStates"`
	Messages  []*Message         `json:"messages"`
	Images    map[string]*ImageMeta `json:"images"`
}

func (m *Manager) load() {
	data, err := os.ReadFile(m.filePath)
	if err != nil {
		return // first run
	}
	var st fileState
	if err := json.Unmarshal(data, &st); err != nil {
		m.logger.Error().Err(err).Msg("chat: failed to parse chat.json, starting fresh")
		return
	}
	if st.PinStates != nil {
		m.pinStates = st.PinStates
	}
	if st.Messages != nil {
		m.messages = st.Messages
	}
	if st.Images != nil {
		m.images = st.Images
	}
	m.logger.Info().Int("messages", len(m.messages)).Msg("chat: loaded chat store")
}

// saveLoop debounces disk writes: markDirty sends a token, we coalesce them.
func (m *Manager) saveLoop() {
	for {
		select {
		case <-m.stopCh:
			return
		case <-m.dirty:
			time.Sleep(saveDebounce)
			m.mu.Lock()
			m.flushLocked()
			m.mu.Unlock()
		}
	}
}

func (m *Manager) markDirty() {
	select {
	case m.dirty <- struct{}{}:
	default:
	}
}

func (m *Manager) flushLocked() {
	st := fileState{
		PinStates: m.pinStates,
		Messages:  m.messages,
		Images:    m.images,
	}
	data, err := json.Marshal(st)
	if err != nil {
		m.logger.Error().Err(err).Msg("chat: failed to marshal chat store")
		return
	}
	if err := os.MkdirAll(filepath.Dir(m.filePath), 0755); err != nil {
		m.logger.Error().Err(err).Msg("chat: failed to create data dir")
		return
	}
	tmp := m.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		m.logger.Error().Err(err).Msg("chat: failed to write chat store")
		return
	}
	if err := os.Rename(tmp, m.filePath); err != nil {
		m.logger.Error().Err(err).Msg("chat: failed to rename chat store")
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Pin states

func (m *Manager) PinState(profileID uint) (*PinState, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ps, ok := m.pinStates[profileID]
	if !ok {
		return nil, false
	}
	return ps, true
}

func (m *Manager) SetPinState(profileID uint, ps *PinState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pinStates[profileID] = ps
	m.markDirty()
}

func (m *Manager) DeletePinState(profileID uint) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.pinStates, profileID)
	m.markDirty()
}

func (m *Manager) HasPin(profileID uint) bool {
	_, ok := m.PinState(profileID)
	return ok
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages

func (m *Manager) AddMessage(msg *Message) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = append(m.messages, msg)
	m.pruneConversationLocked(msg.From, msg.To)
	m.markDirty()
}

func (m *Manager) GetMessage(id string) (*Message, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, msg := range m.messages {
		if msg.ID == id {
			return msg, true
		}
	}
	return nil, false
}

// updateMessage mutates a message in place under the lock. fn returns false to
// reject the change (authorization/state checks). fn must not call back into
// the manager.
func (m *Manager) UpdateMessage(id string, fn func(msg *Message) bool) (*Message, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, msg := range m.messages {
		if msg.ID == id {
			if !fn(msg) {
				return nil, false
			}
			m.markDirty()
			return msg, true
		}
	}
	return nil, false
}

// MarkRead marks every unread message sent to profileID by peerID as read.
func (m *Manager) MarkRead(profileID, peerID uint, readAt string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, msg := range m.messages {
		if msg.To == profileID && msg.From == peerID && msg.ReadAt == "" && msg.DeletedAt == "" {
			msg.ReadAt = readAt
		}
	}
	m.markDirty()
}

// MessagesBetween returns the conversation between two profiles, oldest first.
// With beforeID set, only messages older than that message are returned.
func (m *Manager) MessagesBetween(a, b uint, limit int, beforeID string) []*Message {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Find the index cutoff first.
	cutoff := len(m.messages)
	if beforeID != "" {
		for i, msg := range m.messages {
			if msg.ID == beforeID {
				cutoff = i
				break
			}
		}
	}

	ret := make([]*Message, 0, limit)
	for i := cutoff - 1; i >= 0 && len(ret) < limit; i-- {
		msg := m.messages[i]
		if (msg.From == a && msg.To == b) || (msg.From == b && msg.To == a) {
			ret = append(ret, msg)
		}
	}
	// Reverse into chronological order.
	for i, j := 0, len(ret)-1; i < j; i, j = i+1, j-1 {
		ret[i], ret[j] = ret[j], ret[i]
	}
	return ret
}

// pruneConversationLocked caps a conversation's length, dropping the oldest.
func (m *Manager) pruneConversationLocked(a, b uint) {
	count := 0
	firstIdx := -1
	for i, msg := range m.messages {
		if (msg.From == a && msg.To == b) || (msg.From == b && msg.To == a) {
			count++
			if firstIdx == -1 {
				firstIdx = i
			}
		}
	}
	if count <= MaxMessagesPerConversation || firstIdx == -1 {
		return
	}
	toDrop := count - MaxMessagesPerConversation
	dropped := 0
	kept := make([]*Message, 0, len(m.messages)-toDrop)
	for i, msg := range m.messages {
		isConv := (msg.From == a && msg.To == b) || (msg.From == b && msg.To == a)
		if isConv && dropped < toDrop && i < firstIdx+count {
			dropped++
			if msg.ImageID != "" {
				m.deleteImageLocked(msg.ImageID)
			}
			continue
		}
		kept = append(kept, msg)
	}
	m.messages = kept
}

// UnreadCount returns how many unread messages a profile has from everyone.
func (m *Manager) UnreadCount(profileID uint) int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	n := 0
	for _, msg := range m.messages {
		if msg.To == profileID && msg.ReadAt == "" && msg.DeletedAt == "" {
			n++
		}
	}
	return n
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing

func (m *Manager) SetTyping(profileID uint, isTyping bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if isTyping {
		m.typing[profileID] = time.Now()
	} else {
		delete(m.typing, profileID)
	}
}

// IsTyping reports whether a profile pinged typing within the last window.
func (m *Manager) IsTyping(profileID uint) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.typing[profileID]
	if !ok {
		return false
	}
	return time.Since(t) < typingWindow
}

// ─────────────────────────────────────────────────────────────────────────────
// Images

func (m *Manager) StoreImage(id string, from, to uint, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(data) > MaxImageBytes {
		return errTooLarge
	}
	if err := os.MkdirAll(m.imagesDir, 0755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(m.imagesDir, id), data, 0644); err != nil {
		return err
	}
	m.images[id] = &ImageMeta{
		From:      from,
		To:        to,
		Size:      len(data),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	m.markDirty()
	return nil
}

func (m *Manager) GetImage(id string) ([]byte, *ImageMeta, bool) {
	m.mu.RLock()
	meta, ok := m.images[id]
	m.mu.RUnlock()
	if !ok {
		return nil, nil, false
	}
	data, err := os.ReadFile(filepath.Join(m.imagesDir, id))
	if err != nil {
		return nil, nil, false
	}
	return data, meta, true
}

func (m *Manager) deleteImageLocked(id string) {
	if _, ok := m.images[id]; !ok {
		return
	}
	_ = os.Remove(filepath.Join(m.imagesDir, id))
	delete(m.images, id)
}

var errTooLarge = errors.New("image too large")

// ─────────────────────────────────────────────────────────────────────────────
// Conversations

// ConversationSummary is what the conversations endpoint reports per peer.
type ConversationSummary struct {
	PeerID        uint      `json:"peerId"`
	LastMessage   *Message  `json:"lastMessage,omitempty"`
	LastActivity  string    `json:"lastActivity,omitempty"`
	UnreadCount   int       `json:"unreadCount"`
	IsPeerTyping  bool      `json:"isPeerTyping"`
}

// Conversations returns summaries for every profile this profile has chatted
// with (or that has chatted with them), newest activity first.
func (m *Manager) Conversations(profileID uint) []*ConversationSummary {
	m.mu.RLock()
	defer m.mu.RUnlock()

	byPeer := make(map[uint]*ConversationSummary)
	var peers []uint
	for _, msg := range m.messages {
		if msg.DeletedAt != "" {
			// Deleted messages still establish the conversation but don't count as unread.
		}
		peer := uint(0)
		if msg.From == profileID {
			peer = msg.To
		} else if msg.To == profileID {
			peer = msg.From
		} else {
			continue
		}
		sum, ok := byPeer[peer]
		if !ok {
			sum = &ConversationSummary{PeerID: peer}
			byPeer[peer] = sum
			peers = append(peers, peer)
		}
		// messages are chronological; later ones are newer
		sum.LastMessage = msg
		sum.LastActivity = msg.CreatedAt
		if msg.To == profileID && msg.ReadAt == "" && msg.DeletedAt == "" {
			sum.UnreadCount++
		}
	}

	ret := make([]*ConversationSummary, 0, len(peers))
	for _, peer := range peers {
		sum := byPeer[peer]
		// Typing check must not hold the write lock — IsTyping takes RLock, we already hold it.
		t, ok := m.typing[peer]
		sum.IsPeerTyping = ok && time.Since(t) < typingWindow
		ret = append(ret, sum)
	}
	sort.Slice(ret, func(i, j int) bool {
		return ret[i].LastActivity > ret[j].LastActivity
	})
	return ret
}
