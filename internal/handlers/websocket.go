package handlers

import (
	"net/http"
	"seanime/internal/core"
	"seanime/internal/events"
	"time"

	"github.com/goccy/go-json"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

// wsReadTimeout bounds how long the server waits for any message from a client before treating
// the connection as dead. The web client pings every 15s (≈every 60s when its tab is throttled in
// the background), so 120s gives ample margin while ensuring half-open connections — which would
// otherwise block ReadMessage until the OS TCP keepalive fires (potentially hours), leaking a
// goroutine each time — are reaped within ~2 minutes.
const wsReadTimeout = 120 * time.Second

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

// webSocketEventHandler creates a new websocket handler for real-time event communication
func (h *Handler) webSocketEventHandler(c echo.Context) error {
	// When a server password is set, require auth via query param
	if h.App.Config.Server.Password != "" {
		token := c.QueryParam("token")
		if token != h.App.ServerPasswordHash {
			return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		}
	}

	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// Get connection ID from query parameter
	id := c.QueryParam("id")
	if id == "" {
		id = "0"
	}

	// Extract profile ID from profile session token query param
	var profileID uint
	profileToken := c.QueryParam("profileToken")
	if profileToken != "" && h.App.ProfileManager != nil {
		payload, err := core.ValidateProfileSessionToken(h.App.ProfileManager.GetJWTSecret(), profileToken)
		if err == nil {
			profileID = payload.ProfileID
		}
	}

	// Add connection to manager
	h.App.WSEventManager.AddConn(id, profileID, ws)
	h.App.Logger.Debug().Str("id", id).Uint("profileID", profileID).Msg("ws: Client connected")

	// Reap half-open connections: require a message (the client pings periodically) within the
	// read timeout, otherwise ReadMessage returns and this goroutine exits instead of blocking
	// indefinitely on a dead socket.
	_ = ws.SetReadDeadline(time.Now().Add(wsReadTimeout))

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				h.App.Logger.Debug().Str("id", id).Msg("ws: Client disconnected")
			} else {
				h.App.Logger.Debug().Str("id", id).Msg("ws: Client disconnection")
			}
			h.App.WSEventManager.RemoveConnByConn(ws)
			break
		}
		// A message arrived (often a ping) — the connection is alive, extend the deadline.
		_ = ws.SetReadDeadline(time.Now().Add(wsReadTimeout))

		event, err := UnmarshalWebsocketClientEvent(msg)
		if err != nil {
			h.App.Logger.Error().Err(err).Msg("ws: Failed to unmarshal message sent from webview")
			continue
		}

		// Attach profile ID from the WS connection to the event
		event.ProfileID = profileID

		// Handle ping messages
		if event.Type == "ping" {
			timestamp := int64(0)
			if payload, ok := event.Payload.(map[string]interface{}); ok {
				if ts, ok := payload["timestamp"]; ok {
					if tsFloat, ok := ts.(float64); ok {
						timestamp = int64(tsFloat)
					} else if tsInt, ok := ts.(int64); ok {
						timestamp = tsInt
					}
				}
			}

			// Send pong response back to the same client
			h.App.WSEventManager.SendEventTo(event.ClientID, "pong", map[string]int64{"timestamp": timestamp})
			continue // Skip further processing for ping messages
		}

		// Handle main-tab-claim messages by broadcasting to all clients
		if event.Type == "main-tab-claim" {
			h.App.WSEventManager.SendEvent("main-tab-claim", event.Payload)
			continue
		}

		h.HandleClientEvents(event)

		// h.App.Logger.Debug().Msgf("ws: message received: %+v", msg)

		// // Echo the message back
		// if err = ws.WriteMessage(messageType, msg); err != nil {
		// 	h.App.Logger.Err(err).Msg("ws: Failed to send message")
		// 	break
		// }
	}

	return nil
}

func UnmarshalWebsocketClientEvent(msg []byte) (*events.WebsocketClientEvent, error) {
	var event events.WebsocketClientEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		return nil, err
	}
	return &event, nil
}
