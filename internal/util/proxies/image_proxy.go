package util

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"seanime/internal/util"

	"github.com/imroc/req/v3"
	"github.com/labstack/echo/v4"
)

// ImageProxy fetches images (manga provider covers, mostly) for the client, which can't load them
// directly because the providers check the Referer.
//
// Each image is fetched from the provider once and kept on disk (CacheDir), and sent with headers
// that let the client keep it too. It used to be fetched from the provider on every view, and the
// cache headers it meant to send were never sent at all (they were set with echo's c.Set, which
// stores a value on the request context, not a response header), so every cover in a large manga
// library was downloaded again on every visit.
type ImageProxy struct {
	// CacheDir is where proxied images are kept. Empty disables the disk cache.
	CacheDir string
}

// One client for the process. Creating a req client per request used to leak a connection per
// image: a dropped client's idle HTTP/2 connections are never closed — their read loops just keep
// waiting for server frames — so every proxied image left a socket, a file descriptor and a
// goroutine behind until the server ran out.
var imageProxyClient = req.C().SetTimeout(60 * time.Second)

const (
	imageCacheMaxAge   = 30 * 24 * time.Hour // refetched after this
	imageCacheMaxBytes = 1 << 30             // 1 GB, least recently used pruned beyond it
	imageCachePruneGap = 200                 // writes between size checks
)

var (
	imageCacheWrites atomic.Int64
	imageCachePrune  sync.Mutex
)

// GetImage fetches an image's bytes. Used by the manga providers as well as the HTTP proxy.
func (ip *ImageProxy) GetImage(url string, headers map[string]string) ([]byte, error) {
	body, _, err := ip.fetch(url, headers)
	return body, err
}

func (ip *ImageProxy) fetch(url string, headers map[string]string) ([]byte, string, error) {
	request := imageProxyClient.NewRequest()
	for key, value := range headers {
		request.SetHeader(key, value)
	}

	resp, err := request.Get(url)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("upstream answered %d", resp.StatusCode)
	}
	return body, imageContentType(resp.Header.Get("Content-Type"), body), nil
}

// imageContentType is the upstream type when it names an image, else what the bytes look like.
func imageContentType(upstream string, body []byte) string {
	if strings.HasPrefix(strings.ToLower(upstream), "image/") {
		return upstream
	}
	if detected := http.DetectContentType(body); strings.HasPrefix(detected, "image/") {
		return detected
	}
	return "image/jpeg"
}

func (ip *ImageProxy) setHeaders(c echo.Context, contentType, etag string) {
	h := c.Response().Header()
	h.Set("Content-Type", contentType)
	h.Set("Cache-Control", "public, max-age=31536000, immutable")
	if etag != "" {
		h.Set("ETag", etag)
	}
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "GET")
	h.Set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
}

func (ip *ImageProxy) ProxyImage(c echo.Context) (err error) {
	defer util.HandlePanicInModuleWithError("util/ImageProxy", &err)

	url := c.QueryParam("url")
	headersJSON := c.QueryParam("headers")

	if url == "" || headersJSON == "" {
		return c.String(echo.ErrBadRequest.Code, "No URL provided")
	}

	headers := make(map[string]string)
	if err := json.Unmarshal([]byte(headersJSON), &headers); err != nil {
		return c.String(echo.ErrBadRequest.Code, "Error parsing headers JSON")
	}

	key := imageCacheKey(url)
	etag := `"` + key[:16] + `"`
	if match := c.Request().Header.Get("If-None-Match"); match != "" && match == etag {
		ip.setHeaders(c, "image/jpeg", etag)
		return c.NoContent(http.StatusNotModified)
	}

	if body, contentType, ok := ip.readCache(key); ok {
		ip.setHeaders(c, contentType, etag)
		return c.Blob(http.StatusOK, contentType, body)
	}

	body, contentType, err := ip.fetch(url, headers)
	if err != nil || len(body) == 0 {
		return c.String(echo.ErrInternalServerError.Code, "Error fetching image")
	}
	ip.writeCache(key, body, contentType)

	ip.setHeaders(c, contentType, etag)
	return c.Blob(http.StatusOK, contentType, body)
}

func imageCacheKey(url string) string {
	sum := sha256.Sum256([]byte(url))
	return hex.EncodeToString(sum[:])
}

func (ip *ImageProxy) paths(key string) (data, meta string) {
	dir := filepath.Join(ip.CacheDir, key[:2])
	return filepath.Join(dir, key), filepath.Join(dir, key+".type")
}

func (ip *ImageProxy) readCache(key string) ([]byte, string, bool) {
	if ip.CacheDir == "" {
		return nil, "", false
	}
	dataPath, metaPath := ip.paths(key)
	info, err := os.Stat(dataPath)
	if err != nil || time.Since(info.ModTime()) > imageCacheMaxAge {
		return nil, "", false
	}
	body, err := os.ReadFile(dataPath)
	if err != nil || len(body) == 0 {
		return nil, "", false
	}
	contentType := "image/jpeg"
	if t, err := os.ReadFile(metaPath); err == nil && len(t) > 0 {
		contentType = string(t)
	}
	// The image's own time is when it was fetched (the age check above); its .type file records
	// when it was last used, which is what pruning keeps.
	now := time.Now()
	_ = os.Chtimes(metaPath, now, now)
	return body, contentType, true
}

func (ip *ImageProxy) writeCache(key string, body []byte, contentType string) {
	if ip.CacheDir == "" {
		return
	}
	dataPath, metaPath := ip.paths(key)
	if err := os.MkdirAll(filepath.Dir(dataPath), 0o755); err != nil {
		return
	}
	tmp := dataPath + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return
	}
	_ = os.Remove(dataPath) // Windows won't rename over an existing file
	if err := os.Rename(tmp, dataPath); err != nil {
		_ = os.Remove(tmp)
		return
	}
	_ = os.WriteFile(metaPath, []byte(contentType), 0o644)

	if imageCacheWrites.Add(1)%imageCachePruneGap == 0 {
		go ip.prune()
	}
}

// prune removes the least recently used images once the cache is over imageCacheMaxBytes.
func (ip *ImageProxy) prune() {
	if !imageCachePrune.TryLock() {
		return
	}
	defer imageCachePrune.Unlock()

	type entry struct {
		path string
		size int64
		used time.Time
	}
	var entries []entry
	var total int64
	_ = filepath.WalkDir(ip.CacheDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || strings.HasSuffix(path, ".type") || strings.HasSuffix(path, ".tmp") {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		used := info.ModTime()
		if meta, err := os.Stat(path + ".type"); err == nil && meta.ModTime().After(used) {
			used = meta.ModTime()
		}
		entries = append(entries, entry{path: path, size: info.Size(), used: used})
		total += info.Size()
		return nil
	})
	if total <= imageCacheMaxBytes {
		return
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].used.Before(entries[j].used) })
	for _, e := range entries {
		if total <= imageCacheMaxBytes*9/10 {
			break
		}
		if os.Remove(e.path) == nil {
			_ = os.Remove(e.path + ".type")
			total -= e.size
		}
	}
}
