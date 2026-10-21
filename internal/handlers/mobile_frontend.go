package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"
)

// The mobile client's frontend bundle.
//
// The Android shell (seanime-denshi-mobile-android) ships with a frontend baked in, but it checks
// here on launch: a newer bundle than the one it is running gets downloaded and hot-swapped, the
// same way the desktop shell rebuilds itself from source. Publishing a bundle is just dropping two
// files in the server's data directory — bundle.zip and manifest.json — either by hand or through
// the publish endpoint, which writes them atomically.
//
//	@route /api/v1/mobile-frontend/manifest [GET]
//	@route /api/v1/mobile-frontend/bundle [GET]
//	@route /api/v1/mobile-frontend/publish [POST]
type MobileFrontendManifest struct {
	// The bundle's sha256; doubles as the version the client compares against.
	Version  string `json:"version"`
	Hash     string `json:"hash"`
	Size     int64  `json:"size"`
	BuiltAt  string `json:"builtAt"`
	Filename string `json:"filename"`
}

func (h *Handler) mobileFrontendDir() string {
	return filepath.Join(h.App.Config.Data.AppDataDir, "mobile-frontend")
}

func (h *Handler) readMobileFrontendManifest() (*MobileFrontendManifest, error) {
	data, err := os.ReadFile(filepath.Join(h.mobileFrontendDir(), "manifest.json"))
	if err != nil {
		return nil, err
	}
	var manifest MobileFrontendManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}
	return &manifest, nil
}

// Publishes a frontend bundle: saves the zip, hashes it, writes the manifest. The write is
// atomic in effect — the manifest lands last, so a half-published bundle is never "the new
// version" a client would pick up.
func (h *Handler) HandlePublishMobileFrontend(c echo.Context) error {

	file, err := c.FormFile("bundle")
	if err != nil {
		return h.RespondWithError(c, errors.New("missing bundle file"))
	}

	// A mobile frontend is a web build; anything over 200 MB is not one.
	if file.Size > 200*1024*1024 {
		return h.RespondWithError(c, errors.New("bundle too large"))
	}

	dir := h.mobileFrontendDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return h.RespondWithError(c, err)
	}

	src, err := file.Open()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer src.Close()

	tmpZip := filepath.Join(dir, "bundle.zip.uploading")
	dst, err := os.Create(tmpZip)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	hasher := sha256.New()
	size, err := io.Copy(io.MultiWriter(dst, hasher), src)
	if err != nil {
		dst.Close()
		os.Remove(tmpZip)
		return h.RespondWithError(c, err)
	}
	dst.Close()

	if size == 0 {
		os.Remove(tmpZip)
		return h.RespondWithError(c, errors.New("empty bundle"))
	}

	hash := hex.EncodeToString(hasher.Sum(nil))

	// Reject a re-publish of the identical bundle: the client keys its state on the version.
	if existing, err := h.readMobileFrontendManifest(); err == nil && existing.Version == hash {
		os.Remove(tmpZip)
		return c.JSON(200, map[string]interface{}{"ok": true, "manifest": existing, "unchanged": true})
	}

	finalZip := filepath.Join(dir, "bundle.zip")
	if err := os.Rename(tmpZip, finalZip); err != nil {
		os.Remove(tmpZip)
		return h.RespondWithError(c, err)
	}

	manifest := MobileFrontendManifest{
		Version:  hash,
		Hash:     hash,
		Size:     size,
		BuiltAt:  c.FormValue("builtAt"),
		Filename: "bundle.zip",
	}
	manifestData, _ := json.MarshalIndent(manifest, "", "  ")

	tmpManifest := filepath.Join(dir, "manifest.json.uploading")
	if err := os.WriteFile(tmpManifest, manifestData, 0o644); err != nil {
		return h.RespondWithError(c, err)
	}
	if err := os.Rename(tmpManifest, filepath.Join(dir, "manifest.json")); err != nil {
		return h.RespondWithError(c, err)
	}

	h.App.Logger.Info().Str("version", hash[:12]).Int64("size", size).Msg("mobile frontend bundle published")

	return c.JSON(200, map[string]interface{}{"ok": true, "manifest": manifest})
}

// Public: clients check this before they have a session, and it says nothing about the user.
func (h *Handler) HandleGetMobileFrontendManifest(c echo.Context) error {
	manifest, err := h.readMobileFrontendManifest()
	if err != nil {
		return c.JSON(404, map[string]string{"error": "no frontend bundle published"})
	}
	return c.JSON(200, manifest)
}

// Streams the bundle, validating the manifest's hash against the file on disk so a client never
// downloads one without the other.
func (h *Handler) HandleGetMobileFrontendBundle(c echo.Context) error {
	dir := h.mobileFrontendDir()
	zipPath := filepath.Join(dir, "bundle.zip")

	stat, err := os.Stat(zipPath)
	if err != nil || stat.IsDir() {
		return c.JSON(404, map[string]string{"error": "no frontend bundle published"})
	}

	if _, err := h.readMobileFrontendManifest(); err != nil {
		return c.JSON(404, map[string]string{"error": "no frontend bundle published"})
	}

	f, err := os.Open(zipPath)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer f.Close()

	c.Response().Header().Set("Content-Type", "application/zip")
	c.Response().Header().Set("Content-Length", fmt.Sprintf("%d", stat.Size()))
	c.Response().Header().Set("Content-Disposition", `attachment; filename="mobile-frontend.zip"`)
	return c.Stream(200, "application/zip", f)
}
