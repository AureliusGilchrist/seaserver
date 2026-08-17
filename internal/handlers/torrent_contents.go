package handlers

import (
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"seanime/internal/util"
	"seanime/internal/util/result"

	"github.com/anacrolix/torrent/metainfo"
	"github.com/labstack/echo/v4"
	"github.com/sourcegraph/conc/pool"
)

// TorrentContents is how much a torrent actually holds.
type TorrentContents struct {
	// Files is every file in the torrent, including samples, subtitles and artwork — what the
	// torrent contains, not what a download would keep.
	Files int `json:"files"`
	// Folders counts directories at every level, deduplicated, the torrent's own top-level folder
	// among them. A single-file torrent has none.
	Folders int `json:"folders"`
}

// torrentContentsCache is keyed by info hash, or by download URL for a torrent whose hash the
// provider did not give us.
//
// A torrent's contents are fixed for its lifetime — the info hash is a hash *of* them — so this only
// expires to keep the map from growing forever on a long-running server.
var torrentContentsCache = result.NewCache[string, *TorrentContents]()

const (
	torrentContentsTTL = 24 * time.Hour
	// torrentFileMaxBytes caps what is read from a .torrent, which is a few hundred KB even for a
	// season pack. Anything vastly larger is not a torrent file and must not be read into memory.
	torrentFileMaxBytes = 10 * 1024 * 1024
	// torrentContentsConcurrency is how many .torrent files are fetched at once for one request.
	// Each is a small GET, but they go to one tracker's web server, which is somebody's site.
	torrentContentsConcurrency = 5
)

// TorrentContentsRequestItem identifies one torrent to look inside.
//
// Named rather than declared inside the handler so the generated client has a type to refer to: an
// anonymous struct there produced a TypeScript definition citing a name that does not exist.
type TorrentContentsRequestItem struct {
	InfoHash    string `json:"infoHash"`
	DownloadUrl string `json:"downloadUrl"`
}

// HandleGetTorrentContents
//
//	@summary returns how many files and folders each torrent holds.
//	@desc Reads the .torrent file itself over HTTP and parses it — no torrent client involved, so
//	@desc nothing is added to a download queue to answer this. Torrents with no download URL (magnet
//	@desc only) are absent from the result rather than reported as zero.
//	@route /api/v1/torrent/contents [POST]
//	@returns map[string]handlers.TorrentContents
func (h *Handler) HandleGetTorrentContents(c echo.Context) error {

	type body struct {
		Torrents []TorrentContentsRequestItem `json:"torrents"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	res := make(map[string]*TorrentContents, len(b.Torrents))
	if len(b.Torrents) == 0 {
		return h.RespondWithData(c, res)
	}

	// Answer from the cache first, and only go to the network for what is left. A search re-run with
	// a different filter is the same torrents again.
	type todo struct {
		key string
		url string
	}
	pending := make([]todo, 0, len(b.Torrents))
	seen := make(map[string]struct{}, len(b.Torrents))
	for _, t := range b.Torrents {
		key := torrentContentsKey(t.InfoHash, t.DownloadUrl)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		if cached, ok := torrentContentsCache.Get(key); ok {
			if cached != nil {
				res[key] = cached
			}
			continue
		}
		// Nothing to fetch from: a magnet-only result cannot be read without joining the swarm,
		// which is exactly the cost this route exists to avoid.
		if t.DownloadUrl == "" {
			continue
		}
		pending = append(pending, todo{key: key, url: t.DownloadUrl})
	}

	if len(pending) > 0 {
		client := h.torrentContentsHTTPClient()

		p := pool.NewWithResults[*struct {
			key      string
			contents *TorrentContents
		}]().WithMaxGoroutines(torrentContentsConcurrency)

		for _, item := range pending {
			p.Go(func() *struct {
				key      string
				contents *TorrentContents
			} {
				defer util.HandlePanicInModuleThen("handlers/HandleGetTorrentContents", func() {})

				contents, ok := fetchTorrentContents(client, item.url)
				if !ok {
					return nil
				}
				torrentContentsCache.SetT(item.key, contents, torrentContentsTTL)
				return &struct {
					key      string
					contents *TorrentContents
				}{key: item.key, contents: contents}
			})
		}

		for _, r := range p.Wait() {
			if r != nil && r.contents != nil {
				res[r.key] = r.contents
			}
		}
	}

	return h.RespondWithData(c, res)
}

// torrentContentsHTTPClient returns a client routed through the configured privacy layers.
//
// A .torrent fetch is a request to a tracker's web server, indistinguishable from browsing it. Going
// out on a bare http.Client would put that request outside the SOCKS5 proxy every other outbound
// request in this application goes through — which is the whole point of having one.
func (h *Handler) torrentContentsHTTPClient() *http.Client {
	if h.App.PrivacyManager != nil {
		return h.App.PrivacyManager.NewHTTPClient(20 * time.Second)
	}
	// No manager means privacy is not configured at all. ApplyGlobalTransport has already pointed
	// http.DefaultTransport at whatever is in force, so a default client still honours it.
	return &http.Client{Timeout: 20 * time.Second}
}

// torrentContentsKey is the identity a result is cached and returned under. The info hash names the
// contents exactly; a download URL is the fallback for providers that do not give one up front, and
// is what the client keys its own lookup by in that case.
func torrentContentsKey(infoHash string, downloadURL string) string {
	if h := strings.TrimSpace(infoHash); h != "" {
		return strings.ToLower(h)
	}
	return strings.TrimSpace(downloadURL)
}

// fetchTorrentContents downloads a .torrent and counts what is inside it.
//
// Reports ok=false for anything that did not parse — an unreachable tracker, an HTML error page
// served with a 200, a login wall. The caller leaves those out of the response entirely rather than
// reporting zero, because "no files" and "could not tell" are different answers and only one of them
// should be shown to somebody choosing a release.
func fetchTorrentContents(client *http.Client, downloadURL string) (*TorrentContents, bool) {
	resp, err := client.Get(downloadURL)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, false
	}

	mi, err := metainfo.Load(io.LimitReader(resp.Body, torrentFileMaxBytes))
	if err != nil {
		return nil, false
	}
	info, err := mi.UnmarshalInfo()
	if err != nil {
		return nil, false
	}

	return countTorrentContents(info), true
}

// countTorrentContents counts what a parsed torrent holds.
func countTorrentContents(info metainfo.Info) *TorrentContents {
	// A single-file torrent has no file list and no folders — just the one name.
	if len(info.Files) == 0 {
		return &TorrentContents{Files: 1, Folders: 0}
	}

	folders := make(map[string]struct{})
	for _, f := range info.Files {
		// Every path segment but the last is a directory on the way to the file. Joined rather than
		// counted per segment so that "Show/Season 1" and "Show/Season 2" count as three folders and
		// not four, and so the same directory reached by two files counts once.
		for i := 1; i < len(f.Path); i++ {
			folders[path.Join(f.Path[:i]...)] = struct{}{}
		}
	}

	// The torrent's own top-level folder. It is not part of any file's Path — that is relative to it
	// — but it is unquestionably a folder the download creates.
	if info.BestName() != "" {
		folders["."] = struct{}{}
	}

	return &TorrentContents{Files: len(info.Files), Folders: len(folders)}
}
