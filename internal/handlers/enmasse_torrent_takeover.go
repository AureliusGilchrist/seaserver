package handlers

import (
	"encoding/json"
	"os"
	"path/filepath"
	"seanime/internal/core"
	"seanime/internal/enmasse"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/util"
	"sort"
	"sync"
	"time"

	"github.com/samber/lo"
)

// Torrent takeover: a series still downloading as a torrent is downloaded online instead. Its
// torrents are paused while the online download runs, removed together with their files once
// the library has the episodes, and resumed if the online download does not get there.

const takeoverCheckInterval = 2 * time.Minute

type torrentTakeover struct {
	MediaId int       `json:"mediaId"`
	Hashes  []string  `json:"hashes"`
	Names   []string  `json:"names"`
	Since   time.Time `json:"since"`
}

type torrentTakeovers struct {
	app  *core.App
	h    *Handler
	path string

	mu    sync.Mutex
	items map[int]*torrentTakeover

	// The torrent list for HasTorrent, kept a minute: it is asked once per series.
	cacheMu   sync.Mutex
	cacheAt   time.Time
	cacheList map[int][]*torrent_client.Torrent
}

// HasTorrent reports whether an anime has a torrent still downloading.
func (t *torrentTakeovers) HasTorrent(mediaId int) bool {
	t.cacheMu.Lock()
	defer t.cacheMu.Unlock()
	if t.cacheList == nil || time.Since(t.cacheAt) > time.Minute {
		t.cacheList = t.unfinished()
		t.cacheAt = time.Now()
	}
	return len(t.cacheList[mediaId]) > 0
}

func newTorrentTakeovers(app *core.App, h *Handler) *torrentTakeovers {
	t := &torrentTakeovers{
		app:   app,
		h:     h,
		path:  filepath.Join(app.Config.Data.AppDataDir, "enmasse-torrent-takeovers.json"),
		items: make(map[int]*torrentTakeover),
	}
	if b, err := os.ReadFile(t.path); err == nil {
		var list []*torrentTakeover
		if json.Unmarshal(b, &list) == nil {
			for _, it := range list {
				if it != nil && it.MediaId > 0 {
					t.items[it.MediaId] = it
				}
			}
		}
	}
	go t.watch()
	return t
}

func (t *torrentTakeovers) client() *torrent_client.Repository {
	if t.app.TorrentClientRepositoryRef == nil {
		return nil
	}
	return t.app.TorrentClientRepositoryRef.Get()
}

// unfinished maps each anime to its torrents that are not done downloading. The anime comes from
// the record kept when the torrent was queued (the Unmatched download metadata).
func (t *torrentTakeovers) unfinished() map[int][]*torrent_client.Torrent {
	out := make(map[int][]*torrent_client.Torrent)
	c := t.client()
	if c == nil || t.app.UnmatchedRepository == nil {
		return out
	}
	torrents, err := c.GetList(&torrent_client.GetListOptions{})
	if err != nil {
		return out
	}
	for _, tor := range torrents {
		if tor == nil || tor.Progress >= 1 || tor.Status == torrent_client.TorrentStatusSeeding {
			continue
		}
		meta := t.app.UnmatchedRepository.GetTorrentMetadata(tor.Name)
		if meta == nil || meta.AnimeID <= 0 {
			continue
		}
		out[meta.AnimeID] = append(out[meta.AnimeID], tor)
	}
	return out
}

// TorrentSeries lists the anime with unfinished torrents, for the en masse downloader to try first.
func (t *torrentTakeovers) TorrentSeries() []enmasse.TorrentSeries {
	byMedia := t.unfinished()
	out := make([]enmasse.TorrentSeries, 0, len(byMedia))
	for mediaId, list := range byMedia {
		title := ""
		if meta := t.app.UnmatchedRepository.GetTorrentMetadata(list[0].Name); meta != nil {
			title = meta.AnimeTitleRomaji
		}
		if title == "" {
			title = list[0].Name
		}
		out = append(out, enmasse.TorrentSeries{MediaId: mediaId, Title: title})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MediaId < out[j].MediaId })
	return out
}

// TakeOver pauses the anime's unfinished torrents and remembers them until the online download
// of the series settles.
func (t *torrentTakeovers) TakeOver(mediaId int) {
	list := t.unfinished()[mediaId]
	if len(list) == 0 {
		return
	}
	hashes := make([]string, 0, len(list))
	names := make([]string, 0, len(list))
	for _, tor := range list {
		hashes = append(hashes, tor.Hash)
		names = append(names, tor.Name)
	}
	if c := t.client(); c != nil {
		if err := c.PauseTorrents(hashes); err != nil {
			t.app.Logger.Warn().Err(err).Int("mediaId", mediaId).Msg("enmasse-anime: Could not pause the torrents the online download replaces")
		}
	}

	t.mu.Lock()
	if prev, ok := t.items[mediaId]; ok {
		hashes = lo.Uniq(append(prev.Hashes, hashes...))
		names = lo.Uniq(append(prev.Names, names...))
	}
	t.items[mediaId] = &torrentTakeover{MediaId: mediaId, Hashes: hashes, Names: names, Since: time.Now()}
	t.mu.Unlock()
	t.save()

	t.app.Logger.Info().Int("mediaId", mediaId).Strs("torrents", names).
		Msg("enmasse-anime: Paused the torrents; the online download replaces them")
}

func (t *torrentTakeovers) save() {
	t.mu.Lock()
	list := make([]*torrentTakeover, 0, len(t.items))
	for _, it := range t.items {
		list = append(list, it)
	}
	t.mu.Unlock()
	b, err := json.Marshal(list)
	if err != nil {
		return
	}
	if err := os.WriteFile(t.path, b, 0o644); err != nil {
		t.app.Logger.Warn().Err(err).Msg("enmasse-anime: Could not save the torrent takeovers")
	}
}

func (t *torrentTakeovers) watch() {
	defer util.HandlePanicInModuleThen("handlers/torrentTakeovers.watch", func() {})
	tick := time.NewTicker(takeoverCheckInterval)
	defer tick.Stop()
	for range tick.C {
		t.check()
	}
}

// check settles every takeover whose online download is done: remove the torrents when the
// library has the series, resume them when it does not.
func (t *torrentTakeovers) check() {
	m := t.app.OnlinestreamDownloader
	c := t.client()
	if m == nil || c == nil {
		return
	}

	t.mu.Lock()
	pending := make([]*torrentTakeover, 0, len(t.items))
	for _, it := range t.items {
		pending = append(pending, it)
	}
	t.mu.Unlock()

	changed := false
	for _, it := range pending {
		active, failed := m.SeriesState(it.MediaId)
		if active > 0 {
			continue
		}
		haveEpisodes := len(t.h.libraryEpisodeFiles(it.MediaId)) > 0
		if failed == 0 && haveEpisodes {
			if err := c.RemoveTorrents(it.Hashes); err != nil {
				t.app.Logger.Warn().Err(err).Int("mediaId", it.MediaId).Msg("enmasse-anime: Could not remove the replaced torrents; will try again")
				continue
			}
			t.app.Logger.Info().Int("mediaId", it.MediaId).Strs("torrents", it.Names).
				Msg("enmasse-anime: The online download finished; removed the torrents and their files")
			if t.app.UnmatchedRepository != nil {
				t.app.UnmatchedRepository.InvalidateCache()
			}
		} else {
			if err := c.ResumeTorrents(it.Hashes); err != nil {
				t.app.Logger.Warn().Err(err).Int("mediaId", it.MediaId).Msg("enmasse-anime: Could not resume the torrents; will try again")
				continue
			}
			t.app.Logger.Info().Int("mediaId", it.MediaId).Int("failedEpisodes", failed).Strs("torrents", it.Names).
				Msg("enmasse-anime: The online download did not finish the series; resumed the torrents")
		}
		t.mu.Lock()
		delete(t.items, it.MediaId)
		t.mu.Unlock()
		changed = true
	}
	if changed {
		t.save()
	}
}
