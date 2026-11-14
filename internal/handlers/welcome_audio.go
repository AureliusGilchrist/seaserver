package handlers

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// welcomeAudioMaxBytes bounds an uploaded welcome song.
const welcomeAudioMaxBytes = 30 * 1024 * 1024

// audioExtension returns the extension for an audio type the welcome screen plays, or "" for any other.
func audioExtension(contentType, filename string) string {
	switch strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0])) {
	case "audio/mpeg", "audio/mp3":
		return ".mp3"
	case "audio/ogg", "application/ogg":
		return ".ogg"
	case "audio/opus":
		return ".opus"
	case "audio/wav", "audio/x-wav", "audio/wave":
		return ".wav"
	case "audio/flac", "audio/x-flac":
		return ".flac"
	case "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac":
		return ".m4a"
	case "audio/webm":
		return ".webm"
	}
	// Some systems send no type for these: go by the name.
	switch ext := strings.ToLower(filepath.Ext(filename)); ext {
	case ".mp3", ".ogg", ".opus", ".wav", ".flac", ".m4a", ".aac", ".webm":
		return ext
	}
	return ""
}

// HandleUploadWelcomeAudio
//
//	@summary upload a song for the welcome screen.
//	@desc Stores the file and returns its url and name; the welcome screen's settings keep the url.
//	@route /api/v1/welcome-audio/upload [POST]
func (h *Handler) HandleUploadWelcomeAudio(c echo.Context) error {
	file, err := c.FormFile("audio")
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "audio file required"))
	}
	if file.Size > welcomeAudioMaxBytes {
		return h.RespondWithError(c, echo.NewHTTPError(400, "the song must be under 30MB"))
	}
	ext := audioExtension(file.Header.Get("Content-Type"), file.Filename)
	if ext == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "file must be an mp3, ogg, opus, wav, flac, m4a or webm audio file"))
	}

	dir := filepath.Join(h.App.Config.Data.AppDataDir, "welcome-audio")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return h.RespondWithError(c, err)
	}
	name := fmt.Sprintf("p%d-%s%s", h.GetProfileID(c), uuid.New().String(), ext)

	src, err := file.Open()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer src.Close()
	dst, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	if _, err := io.Copy(dst, io.LimitReader(src, welcomeAudioMaxBytes)); err != nil {
		dst.Close()
		_ = os.Remove(filepath.Join(dir, name))
		return h.RespondWithError(c, err)
	}
	dst.Close()

	label := strings.TrimSuffix(filepath.Base(file.Filename), filepath.Ext(file.Filename))
	if len(label) > 120 {
		label = label[:120]
	}
	return h.RespondWithData(c, map[string]string{"url": "/welcome-audio/" + name, "name": label})
}
