package handlers

import (
	"encoding/json"
	"errors"
	"seanime/internal/watchparty"

	"github.com/labstack/echo/v4"
)

// HandleWatchPartyStatus
//
//	@summary returns every open same-server watch party room.
//	@desc Any device connected to this server can read this to discover and join a room.
//	@route /api/v1/watchparty/status [GET]
//	@returns []watchparty.Session
func (h *Handler) HandleWatchPartyStatus(c echo.Context) error {
	return h.RespondWithData(c, h.App.WatchPartyManager.Status())
}

// HandleWatchPartyCreate
//
//	@summary creates a same-server watch party room.
//	@desc Opens a new room with this device holding the remote.
//	@desc The profile's seat in any other room is given up first.
//	@route /api/v1/watchparty/create [POST]
//	@returns watchparty.Session
func (h *Handler) HandleWatchPartyCreate(c echo.Context) error {
	type body struct {
		ClientId string               `json:"clientId"`
		Name     string               `json:"name"`
		Settings *watchparty.Settings `json:"settings"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	session, err := h.App.WatchPartyManager.Create(h.GetProfileID(c), b.ClientId, b.Name, b.Settings)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, session)
}

// HandleWatchPartyJoin
//
//	@summary joins a same-server watch party room.
//	@desc Seats this device in the room. A profile has one seat across all rooms: joining from
//	@desc another device moves the seat, and joining another room leaves the previous one.
//	@route /api/v1/watchparty/join [POST]
//	@returns watchparty.Session
func (h *Handler) HandleWatchPartyJoin(c echo.Context) error {
	type body struct {
		ClientId  string `json:"clientId"`
		SessionId string `json:"sessionId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	session, err := h.App.WatchPartyManager.Join(h.GetProfileID(c), b.ClientId, b.SessionId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, session)
}

// HandleWatchPartyLeave
//
//	@summary leaves the watch party.
//	@desc Gives up this device's seat. If it held the remote, the remote passes on.
//	@route /api/v1/watchparty/leave [POST]
//	@returns bool
func (h *Handler) HandleWatchPartyLeave(c echo.Context) error {
	type body struct {
		ClientId string `json:"clientId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	err := h.App.WatchPartyManager.Leave(h.GetProfileID(c), b.ClientId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleWatchPartyStop
//
//	@summary closes the watch party room for everyone.
//	@desc Only the remote holder can close the room.
//	@route /api/v1/watchparty/stop [POST]
//	@returns bool
func (h *Handler) HandleWatchPartyStop(c echo.Context) error {
	type body struct {
		ClientId string `json:"clientId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	err := h.App.WatchPartyManager.Stop(h.GetProfileID(c), b.ClientId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleWatchPartyPassRemote
//
//	@summary hands the remote to another participant.
//	@desc Only the current remote holder can pass it. Whoever holds the remote controls what
//	@desc the whole room watches.
//	@route /api/v1/watchparty/remote/pass [POST]
//	@returns watchparty.Session
func (h *Handler) HandleWatchPartyPassRemote(c echo.Context) error {
	type body struct {
		ClientId   string `json:"clientId"`
		ToClientId string `json:"toClientId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" || b.ToClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	session, err := h.App.WatchPartyManager.PassRemote(h.GetProfileID(c), b.ClientId, b.ToClientId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, session)
}

// HandleWatchPartyRequestRemote
//
//	@summary asks the remote holder for the remote.
//	@desc Posts the request into the room's chat.
//	@route /api/v1/watchparty/remote/request [POST]
//	@returns bool
func (h *Handler) HandleWatchPartyRequestRemote(c echo.Context) error {
	type body struct {
		ClientId string `json:"clientId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	if err := h.App.WatchPartyManager.RequestRemote(h.GetProfileID(c), b.ClientId); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleWatchPartySendChat
//
//	@summary sends a chat message to this device's watch party room.
//	@route /api/v1/watchparty/chat/send [POST]
//	@returns watchparty.ChatMessage
func (h *Handler) HandleWatchPartySendChat(c echo.Context) error {
	type body struct {
		ClientId string `json:"clientId"`
		Text     string `json:"text"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	msg, err := h.App.WatchPartyManager.SendChat(h.GetProfileID(c), b.ClientId, b.Text)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, msg)
}

// HandleWatchPartyChatHistory
//
//	@summary returns the chat history of this device's watch party room.
//	@route /api/v1/watchparty/chat/history [POST]
//	@returns []watchparty.ChatMessage
func (h *Handler) HandleWatchPartyChatHistory(c echo.Context) error {
	type body struct {
		ClientId string `json:"clientId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	return h.RespondWithData(c, h.App.WatchPartyManager.ChatHistory(b.ClientId))
}

// HandleWatchPartyHistory
//
//	@summary returns the episodes a profile watched in watch parties, and with whom.
//	@desc profileId 0 means the calling profile. Newest first.
//	@route /api/v1/watchparty/history [POST]
//	@returns []watchparty.HistoryItem
func (h *Handler) HandleWatchPartyHistory(c echo.Context) error {
	type body struct {
		ProfileId uint `json:"profileId"`
		Limit     int  `json:"limit"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := b.ProfileId
	if profileID == 0 {
		profileID = h.GetProfileID(c)
	}
	if profileID == 0 || h.App.ProfileDatabaseManager == nil {
		return h.RespondWithData(c, []watchparty.HistoryItem{})
	}

	pdb, err := h.App.ProfileDatabaseManager.GetDatabase(profileID)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	rows, err := pdb.GetWatchPartyHistory(b.Limit)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	out := make([]watchparty.HistoryItem, 0, len(rows))
	for _, r := range rows {
		item := watchparty.HistoryItem{
			ID:             r.ID,
			SessionID:      r.SessionID,
			RoomName:       r.RoomName,
			MediaID:        r.MediaID,
			MediaTitle:     r.MediaTitle,
			MediaImage:     r.MediaImage,
			EpisodeNumber:  r.EpisodeNumber,
			WatchedSeconds: r.WatchedSeconds,
			WasHost:        r.WasHost,
			Companions:     []watchparty.HistoryCompanion{},
			WatchedAt:      r.WatchedAt,
		}
		_ = json.Unmarshal([]byte(r.Companions), &item.Companions)
		out = append(out, item)
	}
	return h.RespondWithData(c, out)
}
