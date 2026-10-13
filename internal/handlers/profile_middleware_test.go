package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"seanime/internal/core"

	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog"
)

func TestProfileSessionMiddlewareRejectsSessionsFromPreviousServerRun(t *testing.T) {
	logger := zerolog.Nop()
	dataDir := t.TempDir()

	firstRun, err := core.NewProfileManager(dataDir, &logger)
	if err != nil {
		t.Fatalf("create first profile manager: %v", err)
	}
	oldToken, err := core.CreateProfileSessionToken(firstRun.GetJWTSecret(), firstRun.GetSessionEpoch(), 7, true, "client-1")
	if err != nil {
		t.Fatalf("create first-run session: %v", err)
	}
	oldEpoch := firstRun.GetSessionEpoch()
	if err := firstRun.Close(); err != nil {
		t.Fatalf("close first profile manager: %v", err)
	}

	restartedRun, err := core.NewProfileManager(dataDir, &logger)
	if err != nil {
		t.Fatalf("create restarted profile manager: %v", err)
	}
	defer func() {
		if err := restartedRun.Close(); err != nil {
			t.Errorf("close restarted profile manager: %v", err)
		}
	}()
	if restartedRun.GetSessionEpoch() == oldEpoch {
		t.Fatal("server restart reused the previous session epoch")
	}

	h := &Handler{App: &core.App{ProfileManager: restartedRun}}
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	req.Header.Set("X-Seanime-Profile-Token", oldToken)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	handlerCalled := false

	err = h.ProfileSessionMiddleware(func(c echo.Context) error {
		handlerCalled = true
		if c.Get("profileSession") != nil {
			t.Error("previous-run session was attached to the request")
		}
		return c.NoContent(http.StatusOK)
	})(c)
	if err != nil {
		t.Fatalf("run profile session middleware: %v", err)
	}
	if !handlerCalled {
		t.Fatal("status handler did not run after the session was rejected")
	}
	if got := rec.Header().Get("X-Seanime-Profile-Expired"); got != "true" {
		t.Errorf("expired-session response header = %q, want %q", got, "true")
	}
}
