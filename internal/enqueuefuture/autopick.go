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
	"seanime/internal/database/db_bridge"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/library/anime"
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
	// Flag is a warning about the pick, for the review list: set when the anime is a special or an
	// OVA but no release that looks like the special on its own passed the rules, so the pick is
	// most likely the whole series it belongs to.
	Flag string `json:"flag,omitempty"`
	// Media and ExistingDir are what the download needs: the anime to attach it to, and the folder
	// its files already live in when there are any. Empty ExistingDir means "library root + title".
	Media       *anilist.BaseAnime `json:"media,omitempty"`
	ExistingDir string             `json:"existingDir,omitempty"`
	// Source is where the pick came from: "seadex" (empty in older picks) or "animetosho".
	Source string `json:"source,omitempty"`
}

var dualAudioPattern = regexp.MustCompile(`(?i)dual[\s._-]*audio`)

// specialNamePattern matches the words a release uses for specials and OVAs.
var specialNamePattern = regexp.MustCompile(`(?i)(^|[^a-z0-9])(specials?|sps?|sp\d{1,2}|ovas?|oads?|oavs?|extras?|bonus|omake|picture[\s._-]*drama)([^a-z0-9]|$)`)

// isSpecialEntry reports whether an anime is a special or an OVA rather than a series or a film.
func isSpecialEntry(media *anilist.BaseAnime) bool {
	if media == nil || media.Format == nil {
		return false
	}
	switch *media.Format {
	case anilist.MediaFormatSpecial, anilist.MediaFormatOva:
		return true
	}
	return false
}

// looksLikeSpecialRelease reports whether a release is plausibly the special itself, rather than the
// series it hangs off. SeaDex files a special under its own entry but often answers with the
// series' batch, which carries the special inside it.
//
// Either the name says so, or the release is about the special's size: no more files than its
// episodes plus a few for subtitles and extras. A series batch has a file per episode of the
// series, far past that. A release whose contents are unknown is judged on its name alone.
func looksLikeSpecialRelease(name string, files int, episodes int) bool {
	if specialNamePattern.MatchString(name) {
		return true
	}
	if episodes <= 0 {
		episodes = 1
	}
	return files > 0 && files <= episodes+3
}

// SettledReason says why an anime should not be auto-torrented any more — already matched,
// downloading, downloaded, skipped or ignored — or "" when it is still open. Read fresh each time:
// the auto torrent popup works from a list frozen when it opened, and the background adds run long
// after that, so either can reach an anime you have dealt with since.
func (r *Repository) SettledReason(mediaID int) string {
	return r.settledReasonFor(mediaID, false)
}

// settledReasonFor is SettledReason, optionally ignoring a "downloading" badge — the one auto
// torrent puts up itself the moment you confirm a pick, which must not then read to its own adder
// as "already downloading".
func (r *Repository) settledReasonFor(mediaID int, ignoreDownloading bool) string {
	if r.database == nil || mediaID <= 0 {
		return ""
	}
	state, _ := r.database.GetAnimeDownloadState(mediaID)
	if ignoreDownloading && state == "downloading" {
		state = ""
	}
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

// autoPickLookupsPerMinute is how many unprepared anime auto-pick looks up on AniList a minute: the
// share of the background budget the queue's own run leaves free. One request each — see
// autoPickOne — so this is requests and anime alike.
var autoPickLookupsPerMinute = max(1, int(float64(anilist.BackgroundRequestsPerMinute)*(1-walkShareOfBackground)))

// AutoPickTorrents proposes a torrent for each anime. The order of the result follows mediaIDs.
// client fetches .torrent files whose contents SeaDex did not record. onPicked, when set, is called
// as each anime is done, with how many are done so far.
func (r *Repository) AutoPickTorrents(ctx context.Context, mediaIDs []int, client *http.Client, onPicked ...func(done int)) []*AutoPick {
	if len(mediaIDs) > AutoPickMaxBatch {
		mediaIDs = mediaIDs[:AutoPickMaxBatch]
	}

	out := make([]*AutoPick, len(mediaIDs))
	sem := make(chan struct{}, autoPickConcurrency)
	var wg sync.WaitGroup
	var doneMu sync.Mutex
	done := 0
	for i, id := range mediaIDs {
		wg.Add(1)
		go func(i, id int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			out[i] = r.autoPickOne(ctx, id, client)
			doneMu.Lock()
			done++
			n := done
			for _, fn := range onPicked {
				if fn != nil {
					fn(n)
				}
			}
			doneMu.Unlock()
		}(i, id)
	}
	wg.Wait()
	return out
}

func (r *Repository) autoPickOne(ctx context.Context, mediaID int, client *http.Client) (pick *AutoPick) {
	pick = &AutoPick{MediaID: mediaID}
	// A cancelled search stops here rather than making every remaining request first.
	if ctx.Err() != nil {
		pick.Reason = "Search was stopped"
		return pick
	}
	defer func() {
		if rec := recover(); rec != nil {
			pick.Torrent = nil
			pick.Reason = "Something went wrong while searching"
		}
	}()

	item, _ := r.GetItem(mediaID)
	if item == nil {
		// Not in the Enqueue Future queue (the anime en masse downloader asks about anything):
		// looked up on its own below.
		item = &Item{MediaID: mediaID}
	}
	pick.Title = item.Title
	if reason := settledReason(item.DownloadState, item.Status); reason != "" {
		pick.Reason = reason
		return pick
	}
	// Prepared rows carry their entry. Anything else in the queue — still waiting for the worker, or
	// prepared once and found nothing on the provider it tried — is looked up here with a single
	// AniList request for the anime itself, which is all a SeaDex search needs. A full entry, as
	// preparation builds, costs three and runs at a third of the speed. Paced on its own share of
	// the background budget, so it neither waits behind the queue's own run nor starves it.
	var entry *anime.Entry
	if item.Snapshot != nil && item.Snapshot.Entry != nil && item.Snapshot.Entry.Media != nil {
		entry = item.Snapshot.Entry
	} else {
		built, reason := r.lightEntry(ctx, mediaID)
		if built == nil {
			pick.Reason = reason
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
	isSpecial := isSpecialEntry(media)
	kind := "movie"
	switch {
	case isShow:
		kind = "TV batch"
	case isSpecial:
		kind = "special / OVA"
	}
	episodes := 0
	if media.Episodes != nil {
		episodes = *media.Episodes
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
		t       *hibiketorrent.AnimeTorrent
		files   int
		dual    bool
		special bool
	}
	var candidates []candidate
	seeded := 0
	for _, t := range data.Torrents {
		if t == nil || t.Seeders < AutoPickMinSeeders {
			continue
		}
		seeded++
		files := contentsFiles(t, client)
		// Kept as counted, before a film's unknown count is taken as one: the special check below
		// must tell "one file" from "could not tell".
		counted := files
		if isShow {
			if files <= 1 {
				continue
			}
		} else if files < 1 {
			// Unknown contents for a film: one file is all it needs, so assume that.
			files = 1
		}
		c := candidate{t: t, files: files, dual: IsDualAudio(t.Name)}
		if isSpecial {
			c.special = looksLikeSpecialRelease(t.Name, counted, episodes)
		}
		candidates = append(candidates, c)
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
		// For a special, the release that is the special beats everything — the most files
		// would otherwise always be the series batch it sits inside.
		if isSpecial && a.special != b.special {
			return a.special
		}
		if a.dual != b.dual {
			return a.dual
		}
		// Most files wins for a series. Not for a special: among releases of the special itself,
		// more files is no better.
		if !isSpecial && a.files != b.files {
			return a.files > b.files
		}
		return a.t.Seeders > b.t.Seeders
	})

	best := candidates[0]
	pick.Torrent = best.t
	pick.Files = best.files
	pick.DualAudio = best.dual
	if isSpecial && !best.special {
		pick.Flag = "This is a special, but no SeaDex release looks like the special on its own — this is probably the whole series. Check it before downloading."
	}
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

// lightEntry is the least an auto-pick needs for an anime the queue has not prepared: the anime from
// AniList and whatever of it is already in the library. Returns why not when it cannot be had.
func (r *Repository) lightEntry(ctx context.Context, mediaID int) (*anime.Entry, string) {
	if err := r.autoPickPacer.wait(ctx); err != nil {
		return nil, "Search was stopped"
	}
	platform := r.platformRef.Get()
	if platform == nil {
		return nil, "AniList is unavailable"
	}
	media, err := platform.GetAnime(ctx, mediaID)
	if err != nil {
		return nil, "Could not load this anime: " + err.Error()
	}
	if media == nil {
		return nil, "AniList returned nothing for this anime"
	}
	entry := &anime.Entry{MediaId: mediaID, Media: media}
	if localFiles, _, err := db_bridge.GetLocalFiles(r.database); err == nil {
		entry.LocalFiles = anime.GetLocalFilesFromMediaId(localFiles, mediaID)
	}
	return entry, ""
}
