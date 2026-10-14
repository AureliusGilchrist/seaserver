package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"seanime/internal/core"
	"seanime/internal/videocore"

	"github.com/labstack/echo/v4"
)

func TestDirectstreamSubtitleRefererCandidatesPreserveProviderRefererOrder(t *testing.T) {
	got := directstreamSubtitleRefererCandidates(
		map[string]string{
			"Origin":  "https://krussdomi.com",
			"Referer": "https://krussdomi.com/",
		},
		"https://subs.example/subtitle.vtt",
	)

	want := []string{
		"https://krussdomi.com/",
		"https://krussdomi.com",
		"",
		"https://subs.example/",
		"https://kickassanime.mx/",
		"https://kaa.mx/",
		"https://animetsu.net/",
		"https://megacloud.club/",
		"https://megacloud.tv/",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected referer candidates:\n got: %#v\nwant: %#v", got, want)
	}
}

func TestHandleDirectstreamConvertSubsRetriesUnconvertibleSuccess(t *testing.T) {
	var referers []string
	var origins []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		referers = append(referers, r.Header.Get("Referer"))
		origins = append(origins, r.Header.Get("Origin"))
		if r.Header.Get("Referer") == "https://embed.example/watch" {
			w.Header().Set("Content-Type", "text/html")
			_, _ = io.WriteString(w, "<html>hotlink check</html>")
			return
		}
		_, _ = io.WriteString(w, "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nCaption\n")
	}))
	defer upstream.Close()

	payload, err := json.Marshal(map[string]any{
		"url":     upstream.URL + "/subtitle.vtt",
		"content": "",
		"to":      "vtt",
		"headers": map[string]string{
			"Referer": "https://embed.example/watch",
			"Origin":  "https://cdn.example",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/directstream/subs/convert-subs", bytes.NewReader(payload))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	handler := &Handler{App: &core.App{VideoCore: &videocore.VideoCore{}}}
	if err := handler.HandleDirectstreamConvertSubs(c); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Caption") {
		t.Fatalf("expected converted subtitle in response, got %s", rec.Body.String())
	}
	if len(referers) < 2 || referers[0] != "https://embed.example/watch" || referers[1] != "https://cdn.example" {
		t.Fatalf("expected retries with provider referer then origin, got %#v", referers)
	}
	if origins[0] != "https://cdn.example" {
		t.Fatalf("expected original provider origin to be preserved on first request, got %#v", origins)
	}
}
