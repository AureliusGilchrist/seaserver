package util

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
)

func TestOnlyKnownImageHostsAreCacheable(t *testing.T) {
	for rawURL, want := range map[string]bool{
		"https://s4.anilist.co/file/a.jpg":      true,
		"https://artworks.thetvdb.com/a.jpg":    true,
		"https://uploads.mangadex.org/a.jpg":    true,
		"https://notanilist.co/a.jpg":           false,
		"http://169.254.169.254/latest":         false,
		"http://localhost:43211/api/v1/status":  false,
		"file:///etc/passwd":                    false,
		"https://anilist.co.evil.example/a.jpg": false,
	} {
		if got := IsCacheableImageURL(rawURL); got != want {
			t.Errorf("%s: got %v, want %v", rawURL, got, want)
		}
	}
}

func serveCached(ip *ImageProxy, rawURL string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/image-cache?url="+url.QueryEscape(rawURL), nil)
	_ = ip.HandleCachedImage(echo.New().NewContext(req, rec))
	return rec
}

func TestCacheRefusesOtherHosts(t *testing.T) {
	ip := &ImageProxy{CacheDir: t.TempDir()}
	if rec := serveCached(ip, "http://169.254.169.254/latest"); rec.Code != http.StatusForbidden {
		t.Fatalf("got %d", rec.Code)
	}
}

func TestPinnedImagesSurviveAgeAndPruning(t *testing.T) {
	ip := &ImageProxy{CacheDir: t.TempDir()}
	rawURL := "https://s4.anilist.co/file/cover.png"
	key := imageCacheKey(rawURL)
	png := []byte("\x89PNG\r\n\x1a\nbody")

	ip.writeCache(key, png, "image/png")
	if err := ip.Pin(rawURL); err != nil {
		t.Fatal(err)
	}
	dataPath, _ := ip.paths(key)
	if err := os.Remove(dataPath); err != nil {
		t.Fatal(err)
	}
	ip.prune()

	rec := serveCached(ip, rawURL)
	if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("got %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
}

func TestExpiredImagesAreKeptAsAFallback(t *testing.T) {
	ip := &ImageProxy{CacheDir: t.TempDir()}
	key := imageCacheKey("https://s4.anilist.co/file/old.png")
	ip.writeCache(key, []byte("image"), "image/png")
	dataPath, _ := ip.paths(key)
	old := time.Now().Add(-2 * imageCacheMaxAge)
	if err := os.Chtimes(dataPath, old, old); err != nil {
		t.Fatal(err)
	}

	if _, _, ok := ip.readCache(key, false); ok {
		t.Fatal("an expired image should not count as fresh")
	}
	if _, _, ok := ip.readCache(key, true); !ok {
		t.Fatal("an expired image should still be available as a fallback")
	}
}
