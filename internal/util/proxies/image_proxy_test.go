package util

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestImageProxyCachesAndSendsHeaders(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\n" + "rest-of-image")
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/octet-stream") // providers lie; the bytes don't
		_, _ = w.Write(png)
	}))
	defer upstream.Close()

	ip := &ImageProxy{CacheDir: t.TempDir()}
	e := echo.New()
	get := func(ifNoneMatch string) *httptest.ResponseRecorder {
		q := url.Values{"url": {upstream.URL + "/cover.png"}, "headers": {`{"Referer":"x"}`}}
		req := httptest.NewRequest(http.MethodGet, "/api/v1/image-proxy?"+q.Encode(), nil)
		if ifNoneMatch != "" {
			req.Header.Set("If-None-Match", ifNoneMatch)
		}
		rec := httptest.NewRecorder()
		if err := ip.ProxyImage(e.NewContext(req, rec)); err != nil {
			t.Fatal(err)
		}
		return rec
	}

	first := get("")
	if first.Code != http.StatusOK || first.Body.String() != string(png) {
		t.Fatalf("first response = %d %q", first.Code, first.Body.String())
	}
	if cc := first.Header().Get("Cache-Control"); cc == "" {
		t.Error("no Cache-Control header was sent")
	}
	if ct := first.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", ct)
	}

	second := get("")
	if second.Code != http.StatusOK || second.Body.String() != string(png) {
		t.Fatalf("cached response = %d %q", second.Code, second.Body.String())
	}
	if hits.Load() != 1 {
		t.Errorf("upstream fetched %d times, want once", hits.Load())
	}

	if third := get(first.Header().Get("ETag")); third.Code != http.StatusNotModified {
		t.Errorf("matching ETag answered %d, want 304", third.Code)
	}
}

func TestImageProxyDoesNotCacheFailures(t *testing.T) {
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "nope", http.StatusForbidden)
	}))
	defer upstream.Close()
	ip := &ImageProxy{CacheDir: t.TempDir()}
	e := echo.New()
	for i := 0; i < 2; i++ {
		q := url.Values{"url": {upstream.URL}, "headers": {`{}`}}
		rec := httptest.NewRecorder()
		_ = ip.ProxyImage(e.NewContext(httptest.NewRequest(http.MethodGet, "/?"+q.Encode(), nil), rec))
		if rec.Code == http.StatusOK {
			t.Fatal("a failed fetch was served as an image")
		}
	}
	if hits.Load() != 2 {
		t.Errorf("a failure was cached: upstream asked %d times, want 2", hits.Load())
	}
}
