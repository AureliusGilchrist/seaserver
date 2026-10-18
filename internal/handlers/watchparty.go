package handlers

import (
	"errors"
	"seanime/internal/watchparty"

	"github.com/labstack/echo/v4"
)

// HandleWatchPartyStatus
//
//	@summary returns the active same-server watch party session.
//	@desc Returns the current watch party session, or null if none is active.
//	@desc Any device connected to this server can read this to discover and join a session.
//	@route /api/v1/watchparty/status [GET]
//	@returns watchparty.Session
func (h *Handler) HandleWatchPartyStatus(c echo.Context) error {
	return h.RespondWithData(c, h.App.WatchPartyManager.Status())
}

// HandleWatchPartyCreate
//
//	@summary creates a same-server watch party.
//	@desc Starts a new watch party session with this device as the source.
//	@desc Other devices connected to this server (under their own profiles) can then join it.
//	@route /api/v1/watchparty/create [POST]
//	@returns watchparty.Session
func (h *Handler) HandleWatchPartyCreate(c echo.Context) error {
	type body struct {
		ClientId string               `json:"clientId"`
		Settings *watchparty.Settings `json:"settings"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.ClientId == "" {
		return h.RespondWithError(c, errors.New("missing clientId"))
	}

	session, err := h.App.WatchPartyManager.Create(h.GetProfileID(c), b.ClientId, b.Settings)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, session)
}

// HandleWatchPartyJoin
//
//	@summary joins the active same-server watch party.
//	@desc Adds this device to the active watch party session.
//	@desc If the source is playing something, the client starts the same episode and follows it.
//	@route /api/v1/watchparty/join [POST]
//	@returns watchparty.Session
func (h *Handler) HandleWatchPartyJoin(c echo.Context) error {
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

	session, err := h.App.WatchPartyManager.Join(h.GetProfileID(c), b.ClientId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, session)
}

// HandleWatchPartyLeave
//
//	@summary leaves the watch party.
//	@desc Removes this device from the active watch party session.
//	@desc If the source leaves, the first remaining participant becomes the source.
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
//	@summary stops the watch party for everyone.
//	@desc Ends the active watch party session. Only the source can stop it.
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
