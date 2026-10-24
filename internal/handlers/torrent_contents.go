package handlers

import (
	"net/http"
	"time"

	"seanime/internal/torrents/torrent"
	"seanime/internal/util"

	"github.com/labstack/echo/v4"
	"github.com/sourcegraph/conc/pool"
)

// TorrentContents names the shared type for the API surface: the counting and caching moved beside
// the torrent search, which now pre-answers SeaDex releases into the same cache this route reads.
type TorrentContents = torrent.TorrentContents

// HandleGetTorrentContents
//
//	@summary returns how many files and folders each torrent holds.
//	@desc Reads the .torrent file itself over HTTP and parses it — no torrent client involved, so
//	@desc nothing is added to a download queue to answer this. Torrents with no download URL (magnet
//	@desc only) are absent from the result rather than reported as zero — unless the search already
//	@desc answered them from the SeaDex list, whose releases are counted ahead of time.
//	@desc When mediaId is given, the SeaDex list is asked for that anime first, so a release the list
//	@desc has curated is answered from its own records even when the .torrent file cannot be fetched
//	@desc — no download URL, a tracker that is down, a server restarted since the search ran.
//	@route /api/v1/torrent/contents [POST]
//	@returns map[string]handlers.TorrentContents
func (h *Handler) HandleGetTorrentContents(c echo.Context) error {

	type body struct {
		Torrents []torrent.TorrentContentsRequestItem `json:"torrents"`
		MediaId  int                                  `json:"mediaId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	res := make(map[string]*TorrentContents, len(b.Torrents))
	if len(b.Torrents) == 0 {
		return h.RespondWithData(c, res)
	}

	// The list is one small GET and its answer covers every release it has curated, so it is asked
	// before anything else: releases it knows are then answered from the cache below without a
	// .torrent fetch, and ones it does not know fall through to the fetch as before. The ask is
	// cached per anime, so a screen polling this route for the same anime costs the list nothing
	// after the first.
	if b.MediaId > 0 {
		torrent.PopulateSeaDexContents(b.MediaId)
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
		key := torrent.TorrentContentsKey(t.InfoHash, t.DownloadUrl)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		if cached, ok := torrent.ContentsCache.Get(key); ok {
			if cached != nil {
				res[key] = cached
			}
			continue
		}
		// Nothing to fetch from: a magnet-only result cannot be read without joining the swarm,
		// which is exactly the cost this route exists to avoid. If the list above knew it, the cache
		// already answered; if it did not, there is genuinely nothing to say.
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
		}]().WithMaxGoroutines(torrent.TorrentContentsConcurrency)

		for _, item := range pending {
			p.Go(func() *struct {
				key      string
				contents *TorrentContents
			} {
				defer util.HandlePanicInModuleThen("handlers/HandleGetTorrentContents", func() {})

				contents, ok := torrent.FetchTorrentContents(client, item.url)
				if !ok {
					return nil
				}
				torrent.ContentsCache.SetT(item.key, contents, torrent.ContentsTTL)
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
