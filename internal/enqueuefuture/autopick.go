package enqueuefuture

import (
	"context"
	"net/http"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/library/anime"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrents/torrent"
)

// Auto-pick chooses one torrent per queued anime without anyone looking at the search results, for
// the review popup on the queue screen: it proposes, you strike out what is wrong, and only what is
// left gets downloaded.
//
// The rules, in the order they are applied:
//
//   - SeaDex only. The search is made live against the SeaDex provider, never the fallback, so a
//     pick is always a curated release.
//   - At least AutoPickMinSeeders seeders, read from the live search rather than a snapshot that
//     may be hours old.
//   - A TV show needs more than one file — a single-file pick for a series is almost always one
//     episode, not the season. A film, OVA or special may be one file.
//   - Dual Audio beats everything else; among equals, more files wins, then more seeders.

// AutoPickMinSeeders is the fewest seeders a pick may have.
const AutoPickMinSeeders = 2

// AutoPickMaxBatch caps how many anime one request may ask about.
const AutoPickMaxBatch = 40

// autoPickProvider is the only provider auto-pick searches.
const autoPickProvider = "seadex"

// autoPickConcurrency is how many anime are searched at once.
const autoPickConcurrency = 4

// AutoPick is the proposal for one anime.
type AutoPick struct {
	MediaID int    `json:"mediaId"`
	Title   string `json:"title"`
	// SearchedFor is what was looked for, as a person would read it.
	SearchedFor string `json:"searchedFor"`
	// Torrent is nil when nothing passed the rules; Reason says why.
	Torrent   *hibiketorrent.AnimeTorrent `json:"torrent,omitempty"`
	Files     int                         `json:"files"`
	DualAudio bool                        `json:"dualAudio"`
	Reason    string                      `json:"reason,omitempty"`
	// Media and ExistingDir are what the download needs: the anime to attach it to, and the folder
	// its files already live in when there are any. Empty ExistingDir means "library root + title".
	Media       *anilist.BaseAnime `json:"media,omitempty"`
	ExistingDir string             `json:"existingDir,omitempty"`
}

var dualAudioPattern = regexp.MustCompile(`(?i)dual[\s._-]*audio`)

// SettledReason says why an anime should not be auto-torrented any more — already matched,
// downloading, downloaded, skipped or ignored — or "" when it is still open. Read fresh each time:
// the auto torrent popup works from a list frozen when it opened, and the background adds run long
// after that, so either can reach an anime you have dealt with since.
func (r *Repository) SettledReason(mediaID int) string {
	if r.database == nil || mediaID <= 0 {
		return ""
	}
	state, _ := r.database.GetAnimeDownloadState(mediaID)
	status := ""
	if record, err := r.database.GetEnqueueFutureItem(mediaID); err == nil && record != nil {
		status = record.Status
	}
	return settledReason(state, status)
}

func settledReason(downloadState string, status string) string {
	switch downloadState {
	case "matched":
		return "Already matched into your library"
	case "downloading":
		return "Already downloading"
	case "downloaded":
		return "Already downloaded"
	}
	switch status {
	case db.EnqueueFutureStatusSkipped:
		return "You skipped this one"
	case db.EnqueueFutureStatusIgnored:
		return "You ignored this one"
	case db.EnqueueFutureStatusDownloaded:
		return "Already downloaded"
	}
	return ""
}

// IsDualAudio reports whether a release name advertises two audio tracks.
func IsDualAudio(name string) bool {
	return dualAudioPattern.MatchString(name)
}

// AutoPickTorrents proposes a torrent for each anime. The order of the result follows mediaIDs.
// client fetches .torrent files whose contents SeaDex did not record.
func (r *Repository) AutoPickTorrents(ctx context.Context, mediaIDs []int, client *http.Client) []*AutoPick {
	if len(mediaIDs) > AutoPickMaxBatch {
		mediaIDs = mediaIDs[:AutoPickMaxBatch]
	}

	out := make([]*AutoPick, len(mediaIDs))
	sem := make(chan struct{}, autoPickConcurrency)
	var wg sync.WaitGroup
	for i, id := range mediaIDs {
		wg.Add(1)
		go func(i, id int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			out[i] = r.autoPickOne(ctx, id, client)
		}(i, id)
	}
	wg.Wait()
	return out
}

func (r *Repository) autoPickOne(ctx context.Context, mediaID int, client *http.Client) (pick *AutoPick) {
	pick = &AutoPick{MediaID: mediaID}
	defer func() {
		if rec := recover(); rec != nil {
			pick.Torrent = nil
			pick.Reason = "Something went wrong while searching"
		}
	}()

	item, err := r.GetItem(mediaID)
	if err != nil || item == nil {
		pick.Reason = "Not in the queue any more"
		return pick
	}
	pick.Title = item.Title
	if reason := settledReason(item.DownloadState, item.Status); reason != "" {
		pick.Reason = reason
		return pick
	}
	// Prepared rows carry their entry. Anything else in the queue — still waiting for the worker,
	// or prepared once and found nothing on the provider it tried — has its entry built here, the
	// same way preparation would, so the whole queue can be worked through and not only the part a
	// run has reached. Paced like preparation, since it is AniList requests.
	var entry *anime.Entry
	if item.Snapshot != nil && item.Snapshot.Entry != nil && item.Snapshot.Entry.Media != nil {
		entry = item.Snapshot.Entry
	} else {
		if err := r.pacer.wait(ctx); err != nil {
			pick.Reason = "Stopped before this one was looked up"
			return pick
		}
		built, err := r.buildEntry(ctx, mediaID)
		if err != nil {
			pick.Reason = "Could not load this anime: " + err.Error()
			return pick
		}
		entry = built
	}

	media := entry.Media
	pick.Media = media
	if pick.Title == "" {
		pick.Title = media.GetTitleSafe()
	}
	for i := len(entry.LocalFiles) - 1; i >= 0; i-- {
		if lf := entry.LocalFiles[i]; lf != nil && lf.Path != "" {
			pick.ExistingDir = filepath.Dir(lf.Path)
			break
		}
	}

	isShow := isTVShow(media)
	kind := "movie / special"
	if isShow {
		kind = "TV batch"
	}
	pick.SearchedFor = media.GetRomajiTitleSafe() + " · " + kind + " on SeaDex"

	r.mu.Lock()
	repo := r.torrentRepository
	r.mu.Unlock()
	if repo == nil {
		pick.Reason = "Torrent search is unavailable"
		return pick
	}
	if _, found := repo.GetAnimeProviderExtension(autoPickProvider); !found {
		pick.Reason = "SeaDex provider is not installed"
		return pick
	}

	params, err := r.searchParamsFor(entry, autoPickProvider)
	if err != nil {
		pick.Reason = err.Error()
		return pick
	}
	if !isShow {
		// A film has no batch; ask for whatever SeaDex has.
		params.Batch = false
	}

	data, err := repo.SearchAnime(ctx, torrent.AnimeSearchOptions{
		Provider:      params.Provider,
		Type:          torrent.AnimeSearchType(params.Type),
		Media:         media,
		Query:         params.Query,
		Batch:         params.Batch,
		EpisodeNumber: params.EpisodeNumber,
		BestReleases:  params.BestRelease,
		Resolution:    params.Resolution,
	})
	if err != nil {
		pick.Reason = "SeaDex search failed: " + err.Error()
		return pick
	}
	if data == nil || len(data.Torrents) == 0 {
		pick.Reason = "SeaDex has nothing for this"
		return pick
	}

	torrent.PopulateSeaDexContents(mediaID)

	type candidate struct {
		t     *hibiketorrent.AnimeTorrent
		files int
		dual  bool
	}
	var candidates []candidate
	seeded := 0
	for _, t := range data.Torrents {
		if t == nil || t.Seeders < AutoPickMinSeeders {
			continue
		}
		seeded++
		files := contentsFiles(t, client)
		if isShow {
			if files <= 1 {
				continue
			}
		} else if files < 1 {
			// Unknown contents for a film: one file is all it needs, so assume that.
			files = 1
		}
		candidates = append(candidates, candidate{t: t, files: files, dual: IsDualAudio(t.Name)})
	}

	if len(candidates) == 0 {
		switch {
		case seeded == 0:
			pick.Reason = "No SeaDex release has 2+ seeders"
		default:
			pick.Reason = "No seeded SeaDex release with more than one file"
		}
		return pick
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		if a.dual != b.dual {
			return a.dual
		}
		if a.files != b.files {
			return a.files > b.files
		}
		return a.t.Seeders > b.t.Seeders
	})

	best := candidates[0]
	pick.Torrent = best.t
	pick.Files = best.files
	pick.DualAudio = best.dual
	return pick
}

// contentsFiles reads a torrent's file count from the shared cache, fetching the .torrent when the
// cache has nothing. Zero means it could not be told.
func contentsFiles(t *hibiketorrent.AnimeTorrent, client *http.Client) int {
	key := torrent.TorrentContentsKey(t.InfoHash, t.DownloadUrl)
	if key == "" {
		return 0
	}
	if c, ok := torrent.ContentsCache.Get(key); ok && c != nil {
		return c.Files
	}
	if client == nil || strings.TrimSpace(t.DownloadUrl) == "" {
		return 0
	}
	c, ok := torrent.FetchTorrentContents(client, t.DownloadUrl)
	if !ok || c == nil {
		return 0
	}
	torrent.ContentsCache.SetT(key, c, torrent.ContentsTTL)
	return c.Files
}

// isTVShow reports whether an anime is a series rather than a one-off.
func isTVShow(media *anilist.BaseAnime) bool {
	if media == nil || media.Format == nil {
		return false
	}
	switch *media.Format {
	case anilist.MediaFormatTv, anilist.MediaFormatTvShort, anilist.MediaFormatOna:
		return media.Episodes == nil || *media.Episodes != 1
	}
	return false
}
