package handlers

import (
	"errors"
	"fmt"
	"seanime/internal/core"
	"seanime/internal/database/models"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleCreateAdminAnnouncement
//
//	@summary creates a new admin announcement. Admin only.
//	@route /api/v1/admin/announcements [POST]
//	@returns models.AdminAnnouncement
func (h *Handler) HandleCreateAdminAnnouncement(c echo.Context) error {

	type body struct {
		Message       string `json:"message"`
		DurationHours int    `json:"durationHours"` // how many hours until auto-expiry
	}
	var b body

	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if strings.TrimSpace(b.Message) == "" {
		return h.RespondWithError(c, errors.New("message is required"))
	}
	if b.DurationHours <= 0 {
		return h.RespondWithError(c, errors.New("duration must be greater than 0"))
	}

	// Get admin profile ID
	var createdBy uint
	session := c.Get("profileSession")
	if session != nil {
		payload := session.(*core.ProfileSessionPayload)
		createdBy = payload.ProfileID
	}

	announcement := &models.AdminAnnouncement{
		Message:   strings.TrimSpace(b.Message),
		CreatedBy: createdBy,
		ExpiresAt: time.Now().Add(time.Duration(b.DurationHours) * time.Hour),
		Dismissed: "",
	}

	err := h.App.Database.Gorm().Create(announcement).Error
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, announcement)
}

// HandleGetActiveAdminAnnouncements
//
//	@summary returns all active (non-expired) admin announcements for the current profile.
//	@route /api/v1/admin/announcements [GET]
//	@returns []models.AdminAnnouncement
func (h *Handler) HandleGetActiveAdminAnnouncements(c echo.Context) error {

	var announcements []models.AdminAnnouncement
	err := h.App.Database.Gorm().
		Where("expires_at > ?", time.Now()).
		Order("id DESC").
		Find(&announcements).Error
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Filter out dismissed announcements for the current profile
	var profileID uint
	session := c.Get("profileSession")
	if session != nil {
		payload := session.(*core.ProfileSessionPayload)
		profileID = payload.ProfileID
	}

	if profileID > 0 {
		pidStr := strconv.FormatUint(uint64(profileID), 10)
		var visible []models.AdminAnnouncement
		for _, a := range announcements {
			if !isDismissedBy(a.Dismissed, pidStr) {
				visible = append(visible, a)
			}
		}
		announcements = visible
	}

	if announcements == nil {
		announcements = []models.AdminAnnouncement{}
	}

	return h.RespondWithData(c, announcements)
}

// HandleDismissAdminAnnouncement
//
//	@summary dismisses an admin announcement for the current profile.
//	@route /api/v1/admin/announcements/:id/dismiss [POST]
//	@returns bool
func (h *Handler) HandleDismissAdminAnnouncement(c echo.Context) error {

	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid announcement id"))
	}

	var profileID uint
	session := c.Get("profileSession")
	if session != nil {
		payload := session.(*core.ProfileSessionPayload)
		profileID = payload.ProfileID
	}

	if profileID == 0 {
		return h.RespondWithError(c, errors.New("no active profile"))
	}

	var announcement models.AdminAnnouncement
	err = h.App.Database.Gorm().First(&announcement, id).Error
	if err != nil {
		return h.RespondWithError(c, err)
	}

	pidStr := strconv.FormatUint(uint64(profileID), 10)
	if !isDismissedBy(announcement.Dismissed, pidStr) {
		if announcement.Dismissed == "" {
			announcement.Dismissed = pidStr
		} else {
			announcement.Dismissed = fmt.Sprintf("%s,%s", announcement.Dismissed, pidStr)
		}
		h.App.Database.Gorm().Model(&announcement).Update("dismissed", announcement.Dismissed)
	}

	return h.RespondWithData(c, true)
}

// HandleDeleteAdminAnnouncement
//
//	@summary deletes an admin announcement. Admin only.
//	@route /api/v1/admin/announcements/:id [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteAdminAnnouncement(c echo.Context) error {

	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid announcement id"))
	}

	err = h.App.Database.Gorm().Delete(&models.AdminAnnouncement{}, id).Error
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleGetAllAdminAnnouncements
//
//	@summary returns all admin announcements (including expired). Admin only.
//	@route /api/v1/admin/announcements/all [GET]
//	@returns []models.AdminAnnouncement
func (h *Handler) HandleGetAllAdminAnnouncements(c echo.Context) error {

	var announcements []models.AdminAnnouncement
	err := h.App.Database.Gorm().Order("id DESC").Find(&announcements).Error
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if announcements == nil {
		announcements = []models.AdminAnnouncement{}
	}

	return h.RespondWithData(c, announcements)
}

func isDismissedBy(dismissed string, profileID string) bool {
	if dismissed == "" {
		return false
	}
	for _, id := range strings.Split(dismissed, ",") {
		if strings.TrimSpace(id) == profileID {
			return true
		}
	}
	return false
}
