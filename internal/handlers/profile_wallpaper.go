package handlers

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleSetProfileWallpaper
//
//	@summary set the profile wallpaper image and its effect settings.
//	@desc Stored globally so every viewer sees the wallpaper on this profile. An empty url clears it.
//	@returns core.ProfileSummary
//	@route /api/v1/profile/wallpaper [PATCH]
func (h *Handler) HandleSetProfileWallpaper(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}
	if h.App.ProfileManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	type body struct {
		URL     string `json:"url"`
		Effects string `json:"effects"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	if len(b.URL) > 2048 || len(b.Effects) > 4096 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "wallpaper settings too large"))
	}
	lower := strings.ToLower(strings.TrimSpace(b.URL))
	if lower != "" && !strings.HasPrefix(lower, "/") && !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid wallpaper url"))
	}

	profile, err := h.App.ProfileManager.UpdateProfile(profileID, map[string]interface{}{
		"wallpaper_url":     strings.TrimSpace(b.URL),
		"wallpaper_effects": b.Effects,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, profile.ToSummary())
}

// HandleUploadProfileWallpaper
//
//	@summary upload a custom wallpaper for the current profile.
//	@returns core.ProfileSummary
//	@route /api/v1/profile/wallpaper/upload [POST]
func (h *Handler) HandleUploadProfileWallpaper(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}
	if h.App.ProfileManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Profiles not active"))
	}

	file, err := c.FormFile("wallpaper")
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "wallpaper file required"))
	}
	if file.Size > 10*1024*1024 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "wallpaper must be under 10MB"))
	}

	ct := file.Header.Get("Content-Type")
	ext := ""
	switch ct {
	case "image/png":
		ext = ".png"
	case "image/jpeg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	default:
		return h.RespondWithError(c, echo.NewHTTPError(400, "file must be a png, jpeg, gif or webp image"))
	}

	dir := filepath.Join(h.App.ProfileManager.GetProfileDir(profileID), "avatars")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return h.RespondWithError(c, err)
	}

	// Drop any previous wallpaper so a changed extension doesn't leave an orphan behind.
	for _, old := range []string{".png", ".jpg", ".gif", ".webp"} {
		_ = os.Remove(filepath.Join(dir, "wallpaper"+old))
	}

	src, err := file.Open()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer src.Close()

	dst, err := os.Create(filepath.Join(dir, "wallpaper"+ext))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer dst.Close()
	if _, err := io.Copy(dst, src); err != nil {
		return h.RespondWithError(c, err)
	}

	// The query string busts caches when the same filename is re-uploaded.
	url := fmt.Sprintf("/api/v1/profiles/%d/avatar/wallpaper%s?v=%d", profileID, ext, time.Now().Unix())
	profile, err := h.App.ProfileManager.UpdateProfile(profileID, map[string]interface{}{
		"wallpaper_url": url,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, profile.ToSummary())
}
