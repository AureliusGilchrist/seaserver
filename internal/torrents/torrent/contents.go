package torrent

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/util"
	"seanime/internal/util/result"

	"github.com/anacrolix/torrent/metainfo"
)

// How much a torrent actually holds, read from the .torrent file itself or — for releases the
// SeaDex list knows — from the list's own records. Keyed by info hash in ContentsCache, so any
// part of the application that learns a torrent's contents once can answer every later question
// about it, whoever asks.

type (
	// TorrentContents is how much a torrent actually holds.
	TorrentContents struct {
		// Files is every file in the torrent, including samples, subtitles and artwork — what the
		// torrent contains, not what a download would keep.
		Files int `json:"files"`
		// Folders counts directories at every level, deduplicated, the torrent's own top-level folder
		// among them. A single-file torrent has none.
		Folders int `json:"folders"`
	}

	// TorrentContentsRequestItem identifies one torrent to look inside.
	TorrentContentsRequestItem struct {
		InfoHash    string `json:"infoHash"`
		DownloadUrl string `json:"downloadUrl"`
	}
)

// ContentsCache is keyed by info hash, or by download URL for a torrent whose hash the provider did
// not give us.
//
// A torrent's contents are fixed for its lifetime — the info hash is a hash *of* them — so this only
// expires to keep the map from growing forever on a long-running server.
var ContentsCache = result.NewCache[string, *TorrentContents]()

const (
	ContentsTTL = 24 * time.Hour
	// torrentFileMaxBytes caps what is read from a .torrent, which is a few hundred KB even for a
	// season pack. Anything vastly larger is not a torrent file and must not be read into memory.
	torrentFileMaxBytes = 10 * 1024 * 1024
	// TorrentContentsConcurrency is how many .torrent files are fetched at once for one request.
	// Each is a small GET, but they go to one tracker's web server, which is somebody's site.
	TorrentContentsConcurrency = 5
)

// TorrentContentsKey is the identity a result is cached and returned under. The info hash names the
// contents exactly; a download URL is the fallback for providers that do not give one up front, and
// is what the client keys its own lookup by in that case.
func TorrentContentsKey(infoHash string, downloadURL string) string {
	if h := strings.TrimSpace(infoHash); h != "" {
		return strings.ToLower(h)
	}
	return strings.TrimSpace(downloadURL)
}

// FetchTorrentContents downloads a .torrent and counts what is inside it.
//
// Reports ok=false for anything that did not parse — an unreachable tracker, an HTML error page
// served with a 200, a login wall. The caller leaves those out of the response entirely rather than
// reporting zero, because "no files" and "could not tell" are different answers and only one of them
// should be shown to somebody choosing a release.
func FetchTorrentContents(client *http.Client, downloadURL string) (*TorrentContents, bool) {
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

	return CountTorrentContents(info), true
}

// CountTorrentContents counts what a parsed torrent holds.
func CountTorrentContents(info metainfo.Info) *TorrentContents {
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

// populateContentsFromSeaDex answers, ahead of time, what the file-count route will be asked about.
//
// The SeaDex list records every release it has curated together with its complete file list, and the
// file-count route can only read a torrent's contents by downloading the .torrent file — which needs
// a download URL a provider may not have supplied. A search knows the anime being searched, and the
// list is keyed by the same anime, so this is where the two meet: after a search, every listed
// release of that anime has its contents counted and put in the cache, so the modal shows how many
// files a release holds even when its .torrent file could not be read at all.
//
// Best-effort and quiet: the list being unreachable costs nothing but a skipped enrichment, and the
// searches themselves must not wait on it or fail because of it. The per-anime cache covers repeat
// searches, including the answer "this anime is not in the list at all".
func populateContentsFromSeaDex(mediaID int, torrents []*hibiketorrent.AnimeTorrent) {
	defer util.HandlePanicInModuleThen("torrents/torrent/populateContentsFromSeaDex", func() {})

	if mediaID <= 0 || len(torrents) == 0 {
		return
	}

	if counts, found := seaDexContentsCache.Get(mediaID); found {
		cacheSeaDexContents(counts)
		return
	}

	counts, err := fetchSeaDexContents(mediaID)
	if err != nil {
		// Not cached, so the next search tries again — a transient outage should not stick for
		// half an hour.
		return
	}

	// An empty answer is still an answer: the anime is simply not in the list.
	seaDexContentsCache.SetT(mediaID, counts, seaDexContentsTTL)
	cacheSeaDexContents(counts)
}

// cacheSeaDexContents puts counted contents into the shared cache under each release's info hash,
// where the file-count route will find them. Called again on every cache hit of the per-anime entry,
// which keeps a release's answer alive as long as the anime keeps being searched.
func cacheSeaDexContents(counts map[string]*TorrentContents) {
	for infoHash, contents := range counts {
		ContentsCache.SetT(infoHash, contents, ContentsTTL)
	}
}

const (
	seaDexContentsURL = "https://releases.moe/api/collections/entries/records"
	seaDexContentsTTL = 30 * time.Minute
	// A search spends most of its time on the providers themselves; the list is one small GET and
	// gets no more than this to answer it.
	seaDexContentsTimeout = 5 * time.Second
)

// Overridden by tests to point the fetch at a local fake of the list's API.
var seaDexContentsEndpoint = seaDexContentsURL

// seaDexContentsCache holds, per anime, the file counts of every release the list has for it — an
// empty map meaning "not in the list", which is the usual answer and must not cost a request a
// search. Bounded because the number of anime searched is unbounded and the entries expire.
var seaDexContentsCache = result.NewBoundedCache[int, map[string]*TorrentContents](100)

// The list's client goes out on the default transport, which the application points at whatever
// privacy proxy is in force — the same guarantee the file-count route's own client gives.

var seaDexHTTPClient = &http.Client{Timeout: seaDexContentsTimeout}

type seaDexResponse struct {
	Items []struct {
		Expand struct {
			Trs []struct {
				InfoHash string `json:"infoHash"`
				// Files is the release's file list. Only its length is needed, and only its length
				// is trusted: the field's inner shape has drifted between a bare name and a path,
				// so the entries are held raw rather than decoded into a structure that could
				// break when the list renames a field.
				Files []json.RawMessage `json:"files"`
			} `json:"trs"`
		} `json:"expand"`
	} `json:"items"`
}

func fetchSeaDexContents(mediaID int) (map[string]*TorrentContents, error) {
	filter := `alID="` + strconv.Itoa(mediaID) + `"`
	url := seaDexContentsEndpoint + "?page=1&perPage=1&skipTotal=1&expand=trs&filter=" + url.QueryEscape(filter)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := seaDexHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("seadex: unexpected status %d", resp.StatusCode)
	}

	var data seaDexResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	counts := make(map[string]*TorrentContents)
	for _, item := range data.Items {
		for _, tr := range item.Expand.Trs {
			infoHash := strings.ToLower(strings.TrimSpace(tr.InfoHash))
			// The list redacts the hash of some entries; those cannot be matched to a search result.
			if infoHash == "" || infoHash == "<redacted>" {
				continue
			}
			// The same release can appear more than once; the first record wins.
			if _, ok := counts[infoHash]; ok {
				continue
			}
			counts[infoHash] = &TorrentContents{Files: len(tr.Files)}
		}
	}
	return counts, nil
}
