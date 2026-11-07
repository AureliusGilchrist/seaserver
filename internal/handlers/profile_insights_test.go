package handlers

import (
	"net/http"
	"net/http/httptest"
	"seanime/internal/core"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestRawCollectionsDoNotFallBackWhenProfileClientUnavailable(t *testing.T) {
	h := &Handler{App: &core.App{}}
	for name, handler := range map[string]echo.HandlerFunc{
		"anime": h.HandleGetRawAnimeCollection,
		"manga": h.HandleGetRawAnilistMangaCollection,
	} {
		t.Run(name, func(t *testing.T) {
			e := echo.New()
			rec := httptest.NewRecorder()
			c := e.NewContext(httptest.NewRequest(http.MethodGet, "/", nil), rec)
			c.Set("profileSession", &core.ProfileSessionPayload{ProfileID: 1})
			if err := handler(c); err != nil {
				t.Fatal(err)
			}
			if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), "profile AniList client is unavailable") {
				t.Fatalf("got status %d and body %s", rec.Code, rec.Body.String())
			}
		})
	}
}
