package handlers

import (
	"strconv"

	"github.com/labstack/echo/v4"
)

type NotificationsResponse struct {
	Notifications []interface{} `json:"notifications"`
	TotalCount    int64         `json:"totalCount"`
	UnreadCount   int64         `json:"unreadCount"`
}

// HandleGetNotifications
//
//	@summary get paginated notifications for the current profile.
//	@desc Returns a paginated list of notifications with total and unread counts.
//	@returns handlers.NotificationsResponse
//	@route /api/v1/notifications [GET]
func (h *Handler) HandleGetNotifications(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}

	pdb := h.GetProfileDatabase(c)

	notifications, totalCount, err := pdb.GetNotifications(page, limit)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	unreadCount, err := pdb.GetUnreadNotificationCount()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Convert to interface slice for JSON serialization even when empty
	items := make([]interface{}, len(notifications))
	for i, n := range notifications {
		items[i] = n
	}

	return h.RespondWithData(c, NotificationsResponse{
		Notifications: items,
		TotalCount:    totalCount,
		UnreadCount:   unreadCount,
	})
}

// HandleGetUnreadNotificationCount
//
//	@summary get the unread notification count for the current profile.
//	@desc Returns the number of unread notifications.
//	@returns int64
//	@route /api/v1/notifications/unread-count [GET]
func (h *Handler) HandleGetUnreadNotificationCount(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)

	count, err := pdb.GetUnreadNotificationCount()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, count)
}

// HandleMarkNotificationRead
//
//	@summary mark a single notification as read.
//	@desc Marks the notification with the given ID as read.
//	@returns bool
//	@route /api/v1/notifications/:id/read [POST]
func (h *Handler) HandleMarkNotificationRead(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid notification ID"))
	}

	pdb := h.GetProfileDatabase(c)

	if err := pdb.MarkNotificationRead(uint(id)); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleMarkAllNotificationsRead
//
//	@summary mark all notifications as read.
//	@desc Marks all notifications for the current profile as read.
//	@returns bool
//	@route /api/v1/notifications/read-all [POST]
func (h *Handler) HandleMarkAllNotificationsRead(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)

	if err := pdb.MarkAllNotificationsRead(); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleDeleteNotification
//
//	@summary delete a notification.
//	@desc Deletes the notification with the given ID.
//	@returns bool
//	@route /api/v1/notifications/:id [DELETE]
func (h *Handler) HandleDeleteNotification(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid notification ID"))
	}

	pdb := h.GetProfileDatabase(c)

	if err := pdb.DeleteNotification(uint(id)); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}
