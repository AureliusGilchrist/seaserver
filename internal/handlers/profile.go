package handlers

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"seanime/internal/core"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

// HandleGetProfiles
//
//	@summary list all profiles.
//	@returns []*core.ProfileSummary
//	@route /api/v1/profiles [GET]
func (h *Handler) HandleGetProfiles(c echo.Context) error {
	profiles, err := h.App.ProfileManager.GetAllProfiles()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	summaries := make([]*core.ProfileSummary, len(profiles))
	for i, p := range profiles {
		summaries[i] = p.ToSummary()
	}
	return h.RespondWithData(c, summaries)
}

// HandleGetCurrentProfile
//
//	@summary get the current active profile for this client.
//	@returns *core.ProfileSummary
//	@route /api/v1/profiles/current [GET]
func (h *Handler) HandleGetCurrentProfile(c echo.Context) error {
	session := c.Get("profileSession")
	if session == nil {
		return h.RespondWithData(c, nil)
	}

	payload := session.(*core.ProfileSessionPayload)
	profile, err := h.App.ProfileManager.GetProfile(payload.ProfileID)
	if err != nil {
		return h.RespondWithData(c, nil)
	}

	return h.RespondWithData(c, profile.ToSummary())
}

// HandleProfileLogin
//
//	@summary log in to a profile with PIN.
//	@returns map[string]interface{}
//	@route /api/v1/profiles/login [POST]
func (h *Handler) HandleProfileLogin(c echo.Context) error {
	type body struct {
		ProfileID uint   `json:"profileId"`
		PIN       string `json:"pin"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profile, err := h.App.ProfileManager.ValidatePIN(b.ProfileID, b.PIN)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(401, err.Error()))
	}

	// Get client ID from context (set by cookie middleware)
	clientID := ""
	if cid, ok := c.Get("Seanime-Client-Id").(string); ok {
		clientID = cid
	}

	// Create session token
	token, err := core.CreateProfileSessionToken(
		h.App.ProfileManager.GetJWTSecret(),
		profile.ID,
		profile.IsAdmin,
		clientID,
	)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, map[string]interface{}{
		"token":   token,
		"profile": profile.ToSummary(),
	})
}

// HandleProfileLogout
//
//	@summary log out of current profile.
//	@returns bool
//	@route /api/v1/profiles/logout [POST]
func (h *Handler) HandleProfileLogout(c echo.Context) error {
	// Client should clear its stored profile session token
	return h.RespondWithData(c, true)
}

// HandleCreateProfile
//
//	@summary create a new profile (admin only).
//	@returns *core.ProfileSummary
//	@route /api/v1/profiles [POST]
func (h *Handler) HandleCreateProfile(c echo.Context) error {
	type body struct {
		Name    string `json:"name"`
		PIN     string `json:"pin"`
		IsAdmin bool   `json:"isAdmin"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profile, err := h.App.ProfileManager.CreateProfile(b.Name, b.PIN, b.IsAdmin)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, profile.ToSummary())
}

// HandleUpdateProfile
//
//	@summary update a profile.
//	@returns *core.ProfileSummary
//	@route /api/v1/profiles/:id [PATCH]
func (h *Handler) HandleUpdateProfile(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid profile ID"))
	}

	type body struct {
		Name    *string `json:"name,omitempty"`
		IsAdmin *bool   `json:"isAdmin,omitempty"`
		PIN     *string `json:"pin,omitempty"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Check permissions: non-admin can only edit their own profile (name only)
	session := c.Get("profileSession")
	if session != nil {
		payload := session.(*core.ProfileSessionPayload)
		if !payload.IsAdmin && payload.ProfileID != uint(id) {
			return h.RespondWithError(c, echo.NewHTTPError(403, "cannot edit another user's profile"))
		}
		if !payload.IsAdmin && b.IsAdmin != nil {
			return h.RespondWithError(c, echo.NewHTTPError(403, "only admins can change admin status"))
		}
	}

	// Handle PIN update separately (has its own validation)
	if b.PIN != nil {
		if err := h.App.ProfileManager.UpdateProfilePIN(uint(id), *b.PIN); err != nil {
			return h.RespondWithError(c, err)
		}
	}

	// Build updates map
	updates := map[string]interface{}{}
	if b.Name != nil {
		updates["name"] = *b.Name
	}
	if b.IsAdmin != nil {
		updates["is_admin"] = *b.IsAdmin
	}

	if len(updates) > 0 {
		profile, err := h.App.ProfileManager.UpdateProfile(uint(id), updates)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		return h.RespondWithData(c, profile.ToSummary())
	}

	// If only PIN was changed, fetch and return updated profile
	profile, err := h.App.ProfileManager.GetProfile(uint(id))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, profile.ToSummary())
}

// HandleDeleteProfile
//
//	@summary delete a profile (admin only).
//	@returns bool
//	@route /api/v1/profiles/:id [DELETE]
func (h *Handler) HandleDeleteProfile(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid profile ID"))
	}

	if err := h.App.ProfileManager.DeleteProfile(uint(id)); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleUploadProfileAvatar
//
//	@summary upload a custom avatar for a profile.
//	@returns *core.ProfileSummary
//	@route /api/v1/profiles/:id/avatar [POST]
func (h *Handler) HandleUploadProfileAvatar(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid profile ID"))
	}

	// Check permissions
	session := c.Get("profileSession")
	if session != nil {
		payload := session.(*core.ProfileSessionPayload)
		if !payload.IsAdmin && payload.ProfileID != uint(id) {
			return h.RespondWithError(c, echo.NewHTTPError(403, "cannot change another user's avatar"))
		}
	}

	file, err := c.FormFile("avatar")
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "avatar file required"))
	}

	// Validate file size (max 5MB)
	if file.Size > 5*1024*1024 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "avatar must be under 5MB"))
	}

	// Validate content type
	ct := file.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "image/") {
		return h.RespondWithError(c, echo.NewHTTPError(400, "file must be an image"))
	}

	// Determine file extension
	ext := ".jpg"
	switch ct {
	case "image/png":
		ext = ".png"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	}

	// Save the file
	profileDir := h.App.ProfileManager.GetProfileDir(uint(id))
	avatarDir := filepath.Join(profileDir, "avatars")
	if err := os.MkdirAll(avatarDir, 0700); err != nil {
		return h.RespondWithError(c, err)
	}

	avatarFilename := fmt.Sprintf("avatar%s", ext)
	avatarPath := filepath.Join(avatarDir, avatarFilename)

	src, err := file.Open()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer src.Close()

	dst, err := os.Create(avatarPath)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return h.RespondWithError(c, err)
	}

	// Update profile with avatar path (relative for serving)
	relativePath := fmt.Sprintf("/api/v1/profiles/%d/avatar/%s", id, avatarFilename)
	profile, err := h.App.ProfileManager.UpdateProfile(uint(id), map[string]interface{}{
		"avatar_path": relativePath,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, profile.ToSummary())
}

// HandleServeProfileAvatar
//
//	@summary serve a profile's avatar image.
//	@route /api/v1/profiles/:id/avatar/:filename [GET]
func (h *Handler) HandleServeProfileAvatar(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return echo.NewHTTPError(400, "invalid profile ID")
	}

	filename := c.Param("filename")
	// Sanitize filename to prevent path traversal
	filename = filepath.Base(filename)
	if filename == "." || filename == ".." || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return echo.NewHTTPError(400, "invalid filename")
	}

	avatarPath := filepath.Join(h.App.ProfileManager.GetProfileDir(uint(id)), "avatars", filename)
	return c.File(avatarPath)
}

// HandleGetAllowedLibraryPaths
//
//	@summary get admin-defined allowed library paths.
//	@returns []string
//	@route /api/v1/profiles/library-paths [GET]
func (h *Handler) HandleGetAllowedLibraryPaths(c echo.Context) error {
	paths, err := h.App.ProfileManager.GetAllowedLibraryPaths()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, paths)
}

// HandleSetAllowedLibraryPaths
//
//	@summary set allowed library paths (admin only).
//	@returns bool
//	@route /api/v1/profiles/library-paths [POST]
func (h *Handler) HandleSetAllowedLibraryPaths(c echo.Context) error {
	type body struct {
		Paths []string `json:"paths"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if err := h.App.ProfileManager.SetAllowedLibraryPaths(b.Paths); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleGetMigrationStatus
//
//	@summary get the migration status.
//	@returns core.MigrationStatus
//	@route /api/v1/profiles/migration/status [GET]
func (h *Handler) HandleGetMigrationStatus(c echo.Context) error {
	if h.App.ProfileMigrator == nil {
		return h.RespondWithData(c, core.MigrationStatus{NeedsMigration: false, Complete: true})
	}

	needsMigration := h.App.ProfileMigrator.NeedsMigration()
	if !needsMigration {
		return h.RespondWithData(c, core.MigrationStatus{NeedsMigration: false, Complete: true})
	}

	return h.RespondWithData(c, h.App.ProfileMigrator.GetStatus())
}

// HandleRunMigration
//
//	@summary run the single-user to multi-profile migration.
//	@returns core.MigrationStatus
//	@route /api/v1/profiles/migration/run [POST]
func (h *Handler) HandleRunMigration(c echo.Context) error {
	type body struct {
		ProfileName string `json:"profileName"`
		PIN         string `json:"pin"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.ProfileName == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "profile name required"))
	}

	if err := h.App.ProfileMigrator.RunMigration(h.App.ProfileManager, b.ProfileName, b.PIN); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, h.App.ProfileMigrator.GetStatus())
}

// HandleSkipMigration
//
//	@summary skip migration (fresh install).
//	@returns bool
//	@route /api/v1/profiles/migration/skip [POST]
func (h *Handler) HandleSkipMigration(c echo.Context) error {
	if err := h.App.ProfileMigrator.SkipMigration(); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, true)
}
