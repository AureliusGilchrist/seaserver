package util

import (
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"seanime/internal/connectivity"
	"seanime/internal/util"

	"github.com/labstack/echo/v4"
)

// Library artwork the client would otherwise load straight from the internet goes through here, so
// it keeps working when the internet doesn't. Hosts are listed rather than open, or this would be a
// way to make the server fetch any address for anyone who can reach it.
var cacheableImageHosts = []string{
	"anilist.co",
	"kitsu.io",
	"kitsu.app",
	"thetvdb.com",
	"tmdb.org",
	"myanimelist.net",
	"mangadex.org",
	"compsci88.com",
}

// IsCacheableImageURL reports whether a URL may go through the image cache.
func IsCacheableImageURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, allowed := range cacheableImageHosts {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return true
		}
	}
	return false
}

func (ip *ImageProxy) pinnedPath(key string) string {
	return filepath.Join(ip.CacheDir, pinnedDir, key[:2], key)
}

func (ip *ImageProxy) readPinned(key string) ([]byte, string, bool) {
	if ip.CacheDir == "" {
		return nil, "", false
	}
	path := ip.pinnedPath(key)
	body, err := os.ReadFile(path)
	if err != nil || len(body) == 0 {
		return nil, "", false
	}
	return body, imageContentType("", body), true
}

// IsPinned reports whether an image is already kept for offline use.
func (ip *ImageProxy) IsPinned(rawURL string) bool {
	if ip.CacheDir == "" {
		return false
	}
	_, err := os.Stat(ip.pinnedPath(imageCacheKey(rawURL)))
	return err == nil
}

// Pin downloads an image into the area pruning never touches, so library artwork can't be pushed out
// by whatever else was browsed.
func (ip *ImageProxy) Pin(rawURL string) error {
	if ip.CacheDir == "" || !IsCacheableImageURL(rawURL) {
		return errors.New("image can't be pinned")
	}
	if ip.IsPinned(rawURL) {
		return nil
	}

	key := imageCacheKey(rawURL)
	body, _, ok := ip.readCache(key, true)
	if !ok {
		imagePinSlots <- struct{}{}
		defer func() { <-imagePinSlots }()
		var err error
		if body, _, err = ip.fetch(rawURL, nil); err != nil {
			return err
		}
		if len(body) == 0 {
			return errors.New("empty image")
		}
	}

	path := ip.pinnedPath(key)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	_ = os.Remove(path) // Windows won't rename over an existing file
	return os.Rename(tmp, path)
}

// HandleCachedImage serves an image from the cache, fetching it first if the internet is there.
func (ip *ImageProxy) HandleCachedImage(c echo.Context) (err error) {
	defer util.HandlePanicInModuleWithError("util/ImageCache", &err)

	rawURL := c.QueryParam("url")
	if !IsCacheableImageURL(rawURL) {
		return c.NoContent(http.StatusForbidden)
	}

	key := imageCacheKey(rawURL)
	etag := `"` + key[:16] + `"`
	if match := c.Request().Header.Get("If-None-Match"); match != "" && match == etag {
		ip.setHeaders(c, "image/jpeg", etag)
		return c.NoContent(http.StatusNotModified)
	}

	send := func(body []byte, contentType string) error {
		ip.setHeaders(c, contentType, etag)
		return c.Blob(http.StatusOK, contentType, body)
	}

	if body, contentType, ok := ip.readPinned(key); ok {
		return send(body, contentType)
	}
	if body, contentType, ok := ip.readCache(key, connectivity.IsOffline()); ok {
		return send(body, contentType)
	}
	if connectivity.IsOffline() {
		return c.NoContent(http.StatusNotFound)
	}

	imageProxySlots <- struct{}{}
	defer func() { <-imageProxySlots }()
	if body, contentType, ok := ip.readCache(key, false); ok {
		return send(body, contentType)
	}

	body, contentType, err := ip.fetch(rawURL, nil)
	if err != nil || len(body) == 0 {
		// An old copy beats a broken image.
		if body, contentType, ok := ip.readCache(key, true); ok {
			return send(body, contentType)
		}
		return c.NoContent(http.StatusNotFound)
	}
	ip.writeCache(key, body, contentType)
	return send(body, contentType)
}
