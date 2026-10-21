package handlers

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog"
	"seanime/internal/core"
)

// newMobileFrontendTestApp builds a Handler whose data dir is a throwaway directory.
func newMobileFrontendTestApp(t *testing.T) *Handler {
	t.Helper()
	dir := t.TempDir()
	logger := zerolog.New(io.Discard)
	cfg := &core.Config{}
	cfg.Data.AppDataDir = dir
	return &Handler{App: &core.App{Config: cfg, Logger: &logger}}
}

func publishMobileBundle(t *testing.T, h *Handler, zip []byte) (*httptest.ResponseRecorder, echo.Context) {
	t.Helper()

	body := &bytes.Buffer{}
	form := multipart.NewWriter(body)
	part, err := form.CreateFormFile("bundle", "bundle.zip")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(zip); err != nil {
		t.Fatal(err)
	}
	if err := form.WriteField("builtAt", "2026-10-21T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/mobile-frontend/publish", body)
	req.Header.Set(echo.HeaderContentType, form.FormDataContentType())
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.HandlePublishMobileFrontend(c); err != nil {
		t.Fatal(err)
	}
	return rec, c
}

func TestMobileFrontendPublishThenManifestThenBundle(t *testing.T) {
	h := newMobileFrontendTestApp(t)

	zip := []byte("fake-zip-bytes-for-testing")
	rec, _ := publishMobileBundle(t, h, zip)

	if rec.Code != 200 {
		t.Fatalf("publish status = %d, body = %s", rec.Code, rec.Body.String())
	}

	// The published version is the zip's sha256.
	sum := sha256.Sum256(zip)
	wantVersion := hex.EncodeToString(sum[:])

	dir := h.App.Config.Data.AppDataDir

	// The manifest names that version and lands atomically (no .uploading leftovers).
	manifestData, err := os.ReadFile(filepath.Join(dir, "mobile-frontend", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest MobileFrontendManifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Version != wantVersion {
		t.Fatalf("manifest version = %s, want %s", manifest.Version, wantVersion)
	}

	// GET manifest returns the same thing.
	e := echo.New()
	mrec := httptest.NewRecorder()
	mreq := httptest.NewRequest(http.MethodGet, "/api/v1/mobile-frontend/manifest", nil)
	mctx := e.NewContext(mreq, mrec)
	if err := h.HandleGetMobileFrontendManifest(mctx); err != nil {
		t.Fatal(err)
	}
	if mrec.Code != 200 {
		t.Fatalf("manifest status = %d", mrec.Code)
	}
	var fetchedManifest MobileFrontendManifest
	if err := json.Unmarshal(mrec.Body.Bytes(), &fetchedManifest); err != nil {
		t.Fatal(err)
	}
	if fetchedManifest.Version != wantVersion {
		t.Fatalf("fetched manifest version = %s, want %s", fetchedManifest.Version, wantVersion)
	}

	// GET bundle streams exactly the published bytes.
	brec := httptest.NewRecorder()
	breq := httptest.NewRequest(http.MethodGet, "/api/v1/mobile-frontend/bundle", nil)
	bctx := e.NewContext(breq, brec)
	if err := h.HandleGetMobileFrontendBundle(bctx); err != nil {
		t.Fatal(err)
	}
	if brec.Code != 200 {
		t.Fatalf("bundle status = %d", brec.Code)
	}
	got, err := io.ReadAll(brec.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, zip) {
		t.Fatalf("bundle bytes differ: got %d bytes", len(got))
	}
}

func TestMobileFrontendPublishRejectsIdenticalBundle(t *testing.T) {
	h := newMobileFrontendTestApp(t)
	zip := []byte("identical-bundle")

	rec, _ := publishMobileBundle(t, h, zip)
	if rec.Code != 200 {
		t.Fatalf("first publish status = %d", rec.Code)
	}

	rec, _ = publishMobileBundle(t, h, zip)
	if rec.Code != 200 {
		t.Fatalf("second publish status = %d", rec.Code)
	}
	var res struct {
		Unchanged bool `json:"unchanged"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if !res.Unchanged {
		t.Fatal("re-publishing an identical bundle should report unchanged")
	}
}

func TestMobileFrontendPublishRejectsEmptyBundle(t *testing.T) {
	h := newMobileFrontendTestApp(t)
	rec, _ := publishMobileBundle(t, h, nil)
	if rec.Code == 200 {
		t.Fatal("empty bundle should be rejected")
	}
}

func TestMobileFrontendBundleIs404WithoutManifest(t *testing.T) {
	h := newMobileFrontendTestApp(t)

	e := echo.New()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/mobile-frontend/bundle", nil)
	c := e.NewContext(req, rec)
	if err := h.HandleGetMobileFrontendBundle(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 404 {
		t.Fatalf("bundle status = %d, want 404", rec.Code)
	}
}
