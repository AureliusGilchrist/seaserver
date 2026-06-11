package events

import (
	"os"
	"seanime/internal/util"
	"seanime/internal/util/result"
	"sync"
	"time"

	"github.com/davecgh/go-spew/spew"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
)

type WSEventManagerInterface interface {
	SendEvent(t string, payload interface{})
	SendEventTo(clientId string, t string, payload interface{}, noLog ...bool)
	SendEventToProfile(profileID uint, t string, payload interface{})
	SubscribeToClientEvents(id string) *ClientEventSubscriber
	SubscribeToClientNativePlayerEvents(id string) *ClientEventSubscriber
	SubscribeToClientVideoCoreEvents(id string) *ClientEventSubscriber
	SubscribeToClientNakamaEvents(id string) *ClientEventSubscriber
	SubscribeToClientPlaylistEvents(id string) *ClientEventSubscriber
	UnsubscribeFromClientEvents(id string)
}

type GlobalWSEventManagerWrapper struct {
	WSEventManager WSEventManagerInterface
}

var GlobalWSEventManager *GlobalWSEventManagerWrapper

func (w *GlobalWSEventManagerWrapper) SendEvent(t string, payload interface{}) {
	if w.WSEventManager == nil {
		return
	}
	w.WSEventManager.SendEvent(t, payload)
}

func (w *GlobalWSEventManagerWrapper) SendEventTo(clientId string, t string, payload interface{}, noLog ...bool) {
	if w.WSEventManager == nil {
		return
	}
	w.WSEventManager.SendEventTo(clientId, t, payload, noLog...)
}

func (w *GlobalWSEventManagerWrapper) SendEventToProfile(profileID uint, t string, payload interface{}) {
	if w.WSEventManager == nil {
		return
	}
	w.WSEventManager.SendEventToProfile(profileID, t, payload)
}

type (
	// WSEventManager holds the websocket connection instance.
	// It is attached to the App instance, so it is available to other handlers.
	WSEventManager struct {
		Conns                              []*WSConn
		Logger                             *zerolog.Logger
		hasHadConnection                   bool
		sidecarMonitorStopCh               chan struct{}
		sidecarMonitorOnce                 sync.Once
		sidecarMonitorStopOnce             sync.Once
		mu                                 sync.Mutex
		eventMu                            sync.RWMutex
		clientEventSubscribers             *result.Map[string, *ClientEventSubscriber]
		clientNativePlayerEventSubscribers *result.Map[string, *ClientEventSubscriber]
		clientVideoCoreEventSubscribers    *result.Map[string, *ClientEventSubscriber]
		nakamaEventSubscribers             *result.Map[string, *ClientEventSubscriber]
		playlistEventSubscribers           *result.Map[string, *ClientEventSubscriber]
	}

	ClientEventSubscriber struct {
		Channel chan *WebsocketClientEvent
		mu      sync.RWMutex
		closed  bool
	}

	WSConn struct {
		ID        string
		ProfileID uint
		Conn      *websocket.Conn
		// writeMu serializes writes to THIS connection (gorilla/websocket forbids concurrent
		// writes) without holding the manager-wide lock — so a slow/stuck client can't block
		// sends to other clients (which previously stalled e.g. the subtitle event stream).
		writeMu sync.Mutex
	}

	WSEvent struct {
		Type    string      `json:"type"`
		Payload interface{} `json:"payload"`
	}
)

// NewWSEventManager creates a new WSEventManager instance for App.
func NewWSEventManager(logger *zerolog.Logger) *WSEventManager {
	ret := &WSEventManager{
		Logger:                             logger,
		Conns:                              make([]*WSConn, 0),
		sidecarMonitorStopCh:               make(chan struct{}),
		clientEventSubscribers:             result.NewMap[string, *ClientEventSubscriber](),
		clientNativePlayerEventSubscribers: result.NewMap[string, *ClientEventSubscriber](),
		clientVideoCoreEventSubscribers:    result.NewMap[string, *ClientEventSubscriber](),
		nakamaEventSubscribers:             result.NewMap[string, *ClientEventSubscriber](),
		playlistEventSubscribers:           result.NewMap[string, *ClientEventSubscriber](),
	}
	GlobalWSEventManager = &GlobalWSEventManagerWrapper{
		WSEventManager: ret,
	}
	return ret
}

// ExitIfNoConnsAsDesktopSidecar monitors the websocket connection as a desktop sidecar.
// It checks for a connection every 5 seconds. If a connection is lost, it starts a countdown a waits for 15 seconds.
// If a connection is not established within 15 seconds, it will exit the app.
func (m *WSEventManager) ExitIfNoConnsAsDesktopSidecar() {
	m.sidecarMonitorOnce.Do(func() {
	go func() {
		defer util.HandlePanicInModuleThen("events/ExitIfNoConnsAsDesktopSidecar", func() {})

		m.Logger.Info().Msg("ws: Monitoring connection as desktop sidecar")
		// Create a ticker to check connection every 5 seconds
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		// Track connection loss time
		var connectionLostTime time.Time
		exitTimeout := 10 * time.Second

		for {
			select {
			case <-m.sidecarMonitorStopCh:
				return
			case <-ticker.C:
				// Check WebSocket connection status
				if len(m.Conns) == 0 && m.hasHadConnection {
					// If not connected and first detection of connection loss
					if connectionLostTime.IsZero() {
						m.Logger.Warn().Msg("ws: No connection detected. Starting countdown...")
						connectionLostTime = time.Now()
					}

					// Check if connection has been lost for more than 15 seconds
					if time.Since(connectionLostTime) > exitTimeout {
						m.Logger.Warn().Msg("ws: No connection detected for 10 seconds. Exiting...")
						os.Exit(1)
					}
				} else {
					// Connection is active, reset connection lost time
					connectionLostTime = time.Time{}
				}
			}
		}
	}()
	})
}

func (m *WSEventManager) Stop() {
	m.sidecarMonitorStopOnce.Do(func() {
		close(m.sidecarMonitorStopCh)
	})
}

func (m *WSEventManager) AddConn(id string, profileID uint, conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.hasHadConnection = true
	m.Conns = append(m.Conns, &WSConn{
		ID:        id,
		ProfileID: profileID,
		Conn:      conn,
	})
}

// RemoveConnByConn removes the specific connection instance. This is preferred over RemoveConn(id)
// because a reconnecting client reuses the same id, so removing by id can drop the wrong (live)
// connection. Removing by pointer guarantees each read goroutine only ever removes its own conn.
func (m *WSEventManager) RemoveConnByConn(conn *websocket.Conn) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, c := range m.Conns {
		if c.Conn == conn {
			m.Conns = append(m.Conns[:i], m.Conns[i+1:]...)
			break
		}
	}
}

func (m *WSEventManager) RemoveConn(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, conn := range m.Conns {
		if conn.ID == id {
			m.Conns = append(m.Conns[:i], m.Conns[i+1:]...)
			break
		}
	}
}

// wsWriteTimeout bounds an individual WriteJSON/WriteMessage so a stuck client can't hold its
// write mutex indefinitely.
const wsWriteTimeout = 10 * time.Second

// snapshotConns returns a copy of the connection list. Callers iterate the copy and write WITHOUT
// holding m.mu, so a slow write to one client cannot block sends to others (or block AddConn/
// RemoveConn). Per-connection writes are serialized by each conn's writeMu.
func (m *WSEventManager) snapshotConns() []*WSConn {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*WSConn, len(m.Conns))
	copy(out, m.Conns)
	return out
}

// writeJSON serializes the write on the connection and applies a write deadline.
func (c *WSConn) writeJSON(v interface{}) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.Conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
	_ = c.Conn.WriteJSON(v)
}

// SendEvent sends a websocket event to all clients.
func (m *WSEventManager) SendEvent(t string, payload interface{}) {
	if t != PlaybackManagerProgressPlaybackState && t != ChapterDownloadQueueUpdated && payload == nil {
		m.Logger.Trace().Str("type", t).Msg("ws: Sending message")
	}

	evt := WSEvent{Type: t, Payload: payload}
	for _, conn := range m.snapshotConns() {
		conn.writeJSON(evt)
	}
}

// SendEventTo sends a websocket event to the specified client.
func (m *WSEventManager) SendEventTo(clientId string, t string, payload interface{}, noLog ...bool) {
	evt := WSEvent{Type: t, Payload: payload}
	for _, conn := range m.snapshotConns() {
		if conn.ID == clientId {
			if t != "pong" {
				if len(noLog) == 0 || !noLog[0] {
					truncated := spew.Sprint(payload)
					if len(truncated) > 500 {
						truncated = truncated[:500] + "..."
					}
					m.Logger.Trace().Str("to", clientId).Str("type", t).Str("payload", truncated).Msg("ws: Sending message")
				}
			}
			conn.writeJSON(evt)
		}
	}
}

// SendEventToProfile sends a websocket event to all connections belonging to the specified profile.
// If profileID is 0, it falls back to broadcasting to all connections.
func (m *WSEventManager) SendEventToProfile(profileID uint, t string, payload interface{}) {
	if profileID == 0 {
		m.SendEvent(t, payload)
		return
	}

	m.Logger.Trace().Uint("profileID", profileID).Str("type", t).Msg("ws: Sending message to profile")

	evt := WSEvent{Type: t, Payload: payload}
	for _, conn := range m.snapshotConns() {
		if conn.ProfileID == profileID {
			conn.writeJSON(evt)
		}
	}
}

func (m *WSEventManager) SendStringTo(clientId string, s string) {
	for _, conn := range m.snapshotConns() {
		if conn.ID == clientId {
			conn.writeMu.Lock()
			_ = conn.Conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			_ = conn.Conn.WriteMessage(websocket.TextMessage, []byte(s))
			conn.writeMu.Unlock()
		}
	}
}

func (m *WSEventManager) OnClientEvent(event *WebsocketClientEvent) {
	m.eventMu.RLock()
	defer m.eventMu.RUnlock()

	onEvent := func(key string, subscriber *ClientEventSubscriber) bool {
		defer util.HandlePanicInModuleThen("events/OnClientEvent/clientNativePlayerEventSubscribers", func() {})
		subscriber.mu.RLock()
		defer subscriber.mu.RUnlock()
		if !subscriber.closed {
			select {
			case subscriber.Channel <- event:
			default:
				// Channel is blocked, skip sending
				m.Logger.Warn().Msg("ws: Client event channel is blocked, event dropped")
			}
		}
		return true
	}

	switch event.Type {
	case NativePlayerEventType:
		m.clientNativePlayerEventSubscribers.Range(onEvent)
	case VideoCoreEventType:
		m.clientVideoCoreEventSubscribers.Range(onEvent)
	case NakamaEventType:
		m.nakamaEventSubscribers.Range(onEvent)
	case PlaylistEvent:
		m.playlistEventSubscribers.Range(onEvent)
	default:
		m.clientEventSubscribers.Range(onEvent)
	}
}

func (m *WSEventManager) SubscribeToClientEvents(id string) *ClientEventSubscriber {
	subscriber := &ClientEventSubscriber{
		Channel: make(chan *WebsocketClientEvent, 900),
	}
	if old, ok := m.clientEventSubscribers.Get(id); ok {
		old.mu.Lock()
		if !old.closed {
			old.closed = true
			close(old.Channel)
		}
		old.mu.Unlock()
	}
	m.clientEventSubscribers.Set(id, subscriber)
	return subscriber
}

func (m *WSEventManager) SubscribeToClientNativePlayerEvents(id string) *ClientEventSubscriber {
	subscriber := &ClientEventSubscriber{
		Channel: make(chan *WebsocketClientEvent, 100),
	}
	if old, ok := m.clientNativePlayerEventSubscribers.Get(id); ok {
		old.mu.Lock()
		if !old.closed {
			old.closed = true
			close(old.Channel)
		}
		old.mu.Unlock()
	}
	m.clientNativePlayerEventSubscribers.Set(id, subscriber)
	return subscriber
}

func (m *WSEventManager) SubscribeToClientVideoCoreEvents(id string) *ClientEventSubscriber {
	subscriber := &ClientEventSubscriber{
		Channel: make(chan *WebsocketClientEvent, 100),
	}
	if old, ok := m.clientVideoCoreEventSubscribers.Get(id); ok {
		old.mu.Lock()
		if !old.closed {
			old.closed = true
			close(old.Channel)
		}
		old.mu.Unlock()
	}
	m.clientVideoCoreEventSubscribers.Set(id, subscriber)
	return subscriber
}

func (m *WSEventManager) SubscribeToClientNakamaEvents(id string) *ClientEventSubscriber {
	subscriber := &ClientEventSubscriber{
		Channel: make(chan *WebsocketClientEvent, 100),
	}
	if old, ok := m.nakamaEventSubscribers.Get(id); ok {
		old.mu.Lock()
		if !old.closed {
			old.closed = true
			close(old.Channel)
		}
		old.mu.Unlock()
	}
	m.nakamaEventSubscribers.Set(id, subscriber)
	return subscriber
}

func (m *WSEventManager) SubscribeToClientPlaylistEvents(id string) *ClientEventSubscriber {
	subscriber := &ClientEventSubscriber{
		Channel: make(chan *WebsocketClientEvent, 100),
	}
	if old, ok := m.playlistEventSubscribers.Get(id); ok {
		old.mu.Lock()
		if !old.closed {
			old.closed = true
			close(old.Channel)
		}
		old.mu.Unlock()
	}
	m.playlistEventSubscribers.Set(id, subscriber)
	return subscriber
}

func (m *WSEventManager) UnsubscribeFromClientEvents(id string) {
	m.eventMu.Lock()
	defer m.eventMu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			m.Logger.Warn().Msg("ws: Failed to unsubscribe from client events")
		}
	}()
	unsubscribeMap := func(subs *result.Map[string, *ClientEventSubscriber]) bool {
		subscriber, ok := subs.Get(id)
		if !ok {
			return false
		}
		subscriber.mu.Lock()
		if !subscriber.closed {
			subscriber.closed = true
			close(subscriber.Channel)
		}
		subscriber.mu.Unlock()
		subs.Delete(id)
		return true
	}

	if unsubscribeMap(m.clientEventSubscribers) {
		return
	}
	if unsubscribeMap(m.clientNativePlayerEventSubscribers) {
		return
	}
	if unsubscribeMap(m.clientVideoCoreEventSubscribers) {
		return
	}
	if unsubscribeMap(m.nakamaEventSubscribers) {
		return
	}
	_ = unsubscribeMap(m.playlistEventSubscribers)
}
