package handlers

import (
	"context"
	"errors"
	"fmt"
	"os"
	"seanime/internal/api/anilist"
	"seanime/internal/database/db_bridge"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/unmatched"
	"seanime/internal/util"
	"seanime/internal/util/result"
	"sort"
	"time"

	"github.com/labstack/echo/v4"
)

// torrentClientRepo returns the torrent client repository, or an error explaining that there
// isn't one yet.
//
// The repository is built when the settings are loaded, so it is nil for the whole window between
// the server accepting requests and that finishing — and it stays nil if the settings never load.
// Every method on it dereferences the receiver, so reaching for it unguarded is a nil-pointer
// panic in the request handler, which is what a download queued during that window used to hit.
func (h *Handler) torrentClientRepo() (*torrent_client.Repository, error) {
	if h.App.TorrentClientRepository == nil {
		return nil, errors.New("torrent client is not set up yet, verify your settings or try again in a moment")
	}
	return h.App.TorrentClientRepository, nil
}

// HandleGetActiveTorrentList
//
//	@summary returns all active torrents.
//	@desc This handler is used by the client to display the active torrents.
//
//	@route /api/v1/torrent-client/list [GET]
//	@returns []torrent_client.Torrent
func (h *Handler) HandleGetActiveTorrentList(c echo.Context) error {
	var category *string
	if v := c.QueryParam("category"); v != "" {
		category = &v
	}
	sort := c.QueryParam("sort")

	repo, err := h.torrentClientRepo()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Get torrent list
	res, err := repo.GetActiveTorrents(&torrent_client.GetListOptions{
		Category: category,
		Sort:     sort,
	})
	// If an error occurred, try to start the torrent client and get the list again
	// DEVNOTE: We try to get the list first because this route is called repeatedly by the client.
	if err != nil {
		ok := repo.Start()
		if !ok {
			return h.RespondWithError(c, errors.New("could not start torrent client, verify your settings"))
		}
		res, err = repo.GetActiveTorrents(&torrent_client.GetListOptions{
			Category: category,
			Sort:     sort,
		})
	}

	return h.RespondWithData(c, res)

}

// DownloadingMediaStatus is what the client needs in order to decide, for each anime, whether to
// show the "downloading" badge or the "in your library" one — never both.
type DownloadingMediaStatus struct {
	// Downloading holds AniList media IDs with a download still in flight.
	Downloading []int `json:"downloading"`
	// Finished holds media IDs whose download is over.
	//
	// The client deliberately keeps a downloading badge on screen once it has appeared, so this
	// is the only thing that takes one down promptly. Silence is not an answer: a media ID
	// missing from both lists means "nothing known", which must not be read as "finished".
	Finished []int `json:"finished"`
}

// HandleGetDownloadingMediaIds
//
//	@summary returns which AniList media have a download in flight, and which have just finished.
//	@desc Read from the staging directories on disk — each holds the metadata sidecar naming the
//	@desc anime its download is for — so the answer is the same across page reloads, server
//	@desc restarts and a torrent client that is momentarily unreachable. That is what lets the
//	@desc "Downloading" badge stay up for the whole download instead of blinking in and out.
//	@route /api/v1/torrent-client/downloading-media [GET]
//	@returns handlers.DownloadingMediaStatus
func (h *Handler) HandleGetDownloadingMediaIds(c echo.Context) error {

	downloading := make(map[int]struct{})
	finished := make(map[int]struct{})

	// Anime the torrent client is, right now, actively pulling. Kept apart from `downloading` because
	// it is the only first-hand evidence in this handler — everything else is inferred from what is
	// lying in the staging area, and leftovers there outlive the download they came from.
	clientIsPulling := make(map[int]struct{})

	// What the torrent client says, keyed by the staging directory each torrent is writing into.
	// Asked once for the whole request — this route is polled, and it must never start the client
	// or fail: no reachable client simply means the disk has to answer on its own below.
	clientSaysFinished := make(map[string]bool)
	if repo := h.App.TorrentClientRepository; repo != nil {
		if torrents, err := repo.GetActiveTorrents(&torrent_client.GetListOptions{}); err == nil {
			for _, t := range torrents {
				if t == nil {
					continue
				}
				// Finished: seeding, or fully downloaded but paused/stopped in the client.
				isFinished := t.Status == torrent_client.TorrentStatusSeeding || t.Progress >= 1

				if dir, ok := unmatched.StagingDirForTorrent(t.Name, t.ContentPath); ok {
					// A directory fed by two torrents is downloading until both are done.
					if wasFinished, seen := clientSaysFinished[dir]; !seen || wasFinished {
						clientSaysFinished[dir] = isFinished
					}
				}

				// Covers downloads writing somewhere other than the staging area. Resolved by
				// where the client is writing, falling back to the torrent's name — name alone
				// only works while the client's name matches the release title the download was
				// started from, and the two disagree often enough.
				metadata := h.App.UnmatchedRepository.MetadataForTorrent(t.Name, t.ContentPath)
				if metadata == nil || metadata.AnimeID == 0 {
					continue
				}
				if isFinished {
					finished[metadata.AnimeID] = struct{}{}
				} else {
					downloading[metadata.AnimeID] = struct{}{}
					clientIsPulling[metadata.AnimeID] = struct{}{}
				}
			}
		}
	}

	// The durable source. Every download queued from a media page writes its record before the
	// torrent is added, so the staging directory outlives whatever the torrent client happens to
	// be reporting at the moment this route is polled.
	if entries, err := os.ReadDir(unmatched.UnmatchedBasePath); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			metadata := h.App.UnmatchedRepository.GetTorrentMetadata(entry.Name())
			if metadata == nil || metadata.AnimeID == 0 {
				continue
			}
			if h.stagingDownloadFinished(entry.Name(), clientSaysFinished) {
				finished[metadata.AnimeID] = struct{}{}
			} else {
				downloading[metadata.AnimeID] = struct{}{}
			}
		}
	}

	// Anything already in the library is downloaded, whatever the staging area still says.
	//
	// This is the rule the two loops above cannot express, because both reason about downloads rather
	// than about the library. A dealt-with anime kept reading as "downloading" in two ways: a partial
	// match keeps its staging directory (video files are still in it) but deletes the sidecar, so the
	// directory survives as evidence of a download that has already been dealt with, and with the
	// torrent long gone from the client there is nothing left to call it finished by. A full match
	// removes the directory, which only makes the anime stop being *mentioned* — and silence is not
	// "finished", so the badge waited out several polls, or ten minutes for a download the server
	// never confirmed.
	//
	// Files on disk settle both cases and every older one with them: an anime whose episodes are in
	// the library is not something you are waiting for, no matter what was left behind in staging
	// months ago. Recent matches are included because a match can land between two polls of the
	// library, and the answer must not flicker in that gap.
	//
	// The exception is the torrent client actively pulling for that anime right now: a second season
	// coming down while the first is on disk is a real download, and first-hand evidence from the
	// client beats an inference from the library.
	settled := unmatched.RecentlyMatchedAnime()
	for animeID := range h.animeWithLocalFiles() {
		settled[animeID] = struct{}{}
	}
	for animeID := range settled {
		if _, pulling := clientIsPulling[animeID]; pulling {
			continue
		}
		delete(downloading, animeID)
		finished[animeID] = struct{}{}
	}

	res := DownloadingMediaStatus{
		Downloading: make([]int, 0, len(downloading)),
		Finished:    make([]int, 0, len(finished)),
	}
	for id := range downloading {
		res.Downloading = append(res.Downloading, id)
	}
	for id := range finished {
		// One torrent finishing says nothing while another for the same anime is still going.
		if _, ok := downloading[id]; ok {
			continue
		}
		res.Finished = append(res.Finished, id)
	}
	// Sorted so a poll that changed nothing looks like it changed nothing.
	sort.Ints(res.Downloading)
	sort.Ints(res.Finished)

	return h.RespondWithData(c, res)
}

// stagingDownloadFinished reports whether the download writing into a staging directory is over.
//
// The torrent client is the authority whenever it can account for the directory. When it cannot —
// unreachable, or the torrent removed the moment it completed — the answer is whatever the
// auto-match scanner has already concluded from watching the directory itself, which is the same
// evidence it acts on when it decides a download is ready to be matched.
//
// Failing both, the download counts as still running. The badge is meant to stay up until
// something says otherwise, and "nobody has anything to say about this one" is not that.
// animeWithLocalFilesCache holds the answer for a few polls at a time.
//
// This route is polled every ten seconds by every open client, and the local file list is one row
// holding the whole library as JSON — a thousand-odd files' worth of parsing to answer a question
// whose answer changes only when a scan or a match runs. Short enough that a match shows up almost
// at once, and matches mark themselves anyway (see unmatched.MarkAnimeMatched), so the cache is
// never what a freshly finished download is waiting on.
var animeWithLocalFilesCache = result.NewCache[int, map[int]struct{}]()

const animeWithLocalFilesTTL = 30 * time.Second

// animeWithLocalFiles returns every anime with at least one non-ignored file in the library.
//
// Ignored files do not count: an anime you have deliberately pushed out of the library is not one
// you have. An error reading the library returns nothing, which leaves the download state to the
// staging area alone — the same answer as before this existed.
func (h *Handler) animeWithLocalFiles() map[int]struct{} {
	if cached, ok := animeWithLocalFilesCache.Get(1); ok {
		return cached
	}

	ids := make(map[int]struct{})
	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		h.App.Logger.Debug().Err(err).Msg("torrent client: Could not read local files for download state")
		return ids
	}
	for _, lf := range lfs {
		if lf == nil || lf.MediaId <= 0 || lf.Ignored {
			continue
		}
		ids[lf.MediaId] = struct{}{}
	}

	animeWithLocalFilesCache.SetT(1, ids, animeWithLocalFilesTTL)
	return ids
}

func (h *Handler) stagingDownloadFinished(dirName string, clientSaysFinished map[string]bool) bool {
	if isFinished, ok := clientSaysFinished[dirName]; ok {
		return isFinished
	}
	if h.App.UnmatchedScanner == nil {
		return false
	}
	return h.App.UnmatchedScanner.IsMarkedCompleted(dirName)
}

// HandleTorrentClientAction
//
//	@summary performs an action on a torrent.
//	@desc This handler is used to pause, resume or remove a torrent.
//	@route /api/v1/torrent-client/action [POST]
//	@returns bool
func (h *Handler) HandleTorrentClientAction(c echo.Context) error {

	type body struct {
		Hash   string `json:"hash"`
		Action string `json:"action"`
		Dir    string `json:"dir"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Hash == "" || b.Action == "" {
		return h.RespondWithError(c, errors.New("missing arguments"))
	}

	repo, err := h.torrentClientRepo()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	switch b.Action {
	case "pause":
		err := repo.PauseTorrents([]string{b.Hash})
		if err != nil {
			return h.RespondWithError(c, err)
		}
	case "resume":
		err := repo.ResumeTorrents([]string{b.Hash})
		if err != nil {
			return h.RespondWithError(c, err)
		}
	case "remove":
		err := repo.RemoveTorrents([]string{b.Hash})
		if err != nil {
			return h.RespondWithError(c, err)
		}
	case "open":
		if b.Dir == "" {
			return h.RespondWithError(c, errors.New("directory not found"))
		}
		OpenDirInExplorer(b.Dir)
	}

	return h.RespondWithData(c, true)

}

// HandleTorrentClientGetFiles
//
//	@summary gets the files of a torrent.
//	@desc This handler is used to get the files of a torrent.
//	@route /api/v1/torrent-client/get-files [POST]
//	@returns []string
func (h *Handler) HandleTorrentClientGetFiles(c echo.Context) error {

	type body struct {
		Torrent  *hibiketorrent.AnimeTorrent `json:"torrent"`
		Provider string                      `json:"provider"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Torrent == nil || b.Torrent.InfoHash == "" {
		return h.RespondWithError(c, errors.New("missing arguments"))
	}

	tempDir, err := os.MkdirTemp("", "torrent-")
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer os.RemoveAll(tempDir)

	// Get the torrent's provider extension
	providerExtension, ok := h.App.TorrentRepository.GetAnimeProviderExtension(b.Provider)
	if !ok {
		return h.RespondWithError(c, errors.New("provider extension not found for torrent"))
	}
	// Get the magnet
	magnet, err := providerExtension.GetProvider().GetTorrentMagnetLink(b.Torrent)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	repo, err := h.torrentClientRepo()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	exists := repo.TorrentExists(b.Torrent.InfoHash)

	if !exists {
		h.App.Logger.Info().Msgf("torrent client: Torrent %s does not exist, adding", b.Torrent.InfoHash)
		// Add the torrent
		err = repo.AddMagnets([]string{magnet}, tempDir)
		if err != nil {
			return err
		}
	}

	h.App.Logger.Info().Msgf("torrent client: Getting files for %s", b.Torrent.InfoHash)
	files, err := repo.GetFiles(b.Torrent.InfoHash)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if !exists {
		h.App.Logger.Info().Msgf("torrent client: Removing torrent %s", b.Torrent.InfoHash)
		_ = repo.RemoveTorrents([]string{b.Torrent.InfoHash})
	}

	return h.RespondWithData(c, files)
}

// HandleTorrentClientDownload
//
//	@summary adds torrents to the torrent client.
//	@desc It fetches the magnets from the provided URLs and adds them to the torrent client.
//	@desc All torrents are downloaded to /zroot/torrents/Anime/Unmatched/$TorrentName for manual matching.
//	@route /api/v1/torrent-client/download [POST]
//	@returns bool
func (h *Handler) HandleTorrentClientDownload(c echo.Context) error {

	type body struct {
		Torrents    []hibiketorrent.AnimeTorrent `json:"torrents"`
		Destination string                       `json:"destination"` // Ignored - always uses unmatched path
		SmartSelect struct {
			Enabled               bool  `json:"enabled"`
			MissingEpisodeNumbers []int `json:"missingEpisodeNumbers"`
		} `json:"smartSelect"`
		Deselect struct {
			Enabled bool  `json:"enabled"`
			Indices []int `json:"indices"`
		} `json:"deselect,omitempty"`
		Media *anilist.BaseAnime `json:"media"`
		// AutoMatch matches the torrent to Media automatically once it finishes downloading,
		// instead of leaving it in the Unmatched screen for manual matching.
		AutoMatch bool `json:"autoMatch,omitempty"`
		// AutoMatchByTorrent overrides AutoMatch for individual torrents, keyed by the torrent's
		// link. A request may mix the two: whatever is not named here takes AutoMatch.
		//
		// Per torrent because the choice is per torrent. One batch may hold a release you trust
		// enough to file itself and another you want to look at first, and forcing one answer for
		// the whole selection meant either reviewing what needed no review or auto-filing what did.
		AutoMatchByTorrent map[string]bool `json:"autoMatchByTorrent,omitempty"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if len(b.Torrents) == 0 {
		return h.RespondWithError(c, errors.New("no torrents provided"))
	}

	repo, err := h.torrentClientRepo()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// try to start torrent client if it's not running
	ok := repo.Start()
	if !ok {
		return h.RespondWithError(c, errors.New("could not contact torrent client, verify your settings or make sure it's running"))
	}

	// Everything known about what is being downloaded, worked out once for the whole request: the
	// media page has already told us exactly which anime this is, so the episode metadata is
	// fetched here rather than in the middle of a match. Every torrent in the request is for this
	// same anime, so this is a single call however many torrents were selected.
	var queuedMetadata unmatched.TorrentMetadata
	if b.Media != nil {
		queuedMetadata = unmatched.TorrentMetadata{
			AnimeID:   b.Media.ID,
			AutoMatch: b.AutoMatch,
		}
		if b.Media.Title != nil {
			if b.Media.Title.Romaji != nil {
				queuedMetadata.AnimeTitleRomaji = *b.Media.Title.Romaji
			}
			if b.Media.Title.Native != nil {
				queuedMetadata.AnimeTitleNative = *b.Media.Title.Native
			}
		}
		if b.Media.Format != nil {
			queuedMetadata.AnimeFormat = string(*b.Media.Format)
		}
		if b.Media.StartDate != nil && b.Media.StartDate.Year != nil {
			queuedMetadata.AnimeStartYear = *b.Media.StartDate.Year
		}
		// AniList's count for this exact entry — recorded so the Unmatched screen doesn't have to
		// fall back to the Animap map, which also counts specials and sibling seasons.
		if b.Media.Episodes != nil {
			queuedMetadata.AnimeExpectedEpisodes = *b.Media.Episodes
		}

		// The episode titles. Fetched now, so naming the files later is pure string work.
		h.App.UnmatchedRepository.EnrichMetadata(&queuedMetadata)
	}

	// OVERRIDE: Always download to unmatched directory
	// Each torrent goes to /zroot/torrents/Anime/Unmatched/$TorrentName
	for _, t := range b.Torrents {
		// Get the unmatched destination for this torrent
		destination := h.App.UnmatchedRepository.GetUnmatchedDestination(t.Name)

		// Get the torrent's provider extension
		providerExtension, ok := h.App.TorrentRepository.GetAnimeProviderExtension(t.Provider)
		if !ok {
			return h.RespondWithError(c, errors.New("provider extension not found for torrent"))
		}

		// Get the torrent magnet link
		magnet, err := providerExtension.GetProvider().GetTorrentMagnetLink(&t)
		if err != nil {
			return h.RespondWithError(c, err)
		}

		// Save anime metadata BEFORE queueing the download.
		//
		// This record is the ONLY thing linking the download back to its anime — the Unmatched
		// screen has no other way to recover it. If this write fails and the torrent is added
		// anyway, the download lands with nothing attached and has to be matched by hand. That
		// failure used to be logged as a warning and swallowed, which let it go unnoticed across
		// many downloads.
		// This torrent's own answer, falling back to the one given for the batch.
		autoMatch := b.AutoMatch
		if override, ok := b.AutoMatchByTorrent[t.Link]; ok {
			autoMatch = override
		}

		if b.Media != nil {
			metadata := queuedMetadata
			metadata.AutoMatch = autoMatch
			if err := h.App.UnmatchedRepository.SaveTorrentMetadataRecord(t.Name, metadata); err != nil {
				h.App.Logger.Error().Err(err).Str("torrent", t.Name).Msg("torrent client: Failed to save torrent metadata")
				return h.RespondWithError(c, fmt.Errorf("could not save anime metadata for %q, torrent not added: %w", t.Name, err))
			}
		}

		// Add torrent to client with unmatched destination
		err = repo.AddMagnets([]string{magnet}, destination)
		if err != nil {
			return h.RespondWithError(c, err)
		}

		h.App.Logger.Info().Str("torrent", t.Name).Str("destination", destination).Bool("autoMatch", autoMatch && b.Media != nil).Msg("torrent client: Added torrent to unmatched directory")
	}

	// NOTE: We do NOT add the media to the collection automatically anymore
	// The user must manually match the torrent after it finishes downloading

	// Downloading a series by hand means it belongs in the shared library, so add it to the
	// shared (planning slut) planning list. Anything already on the main account is left
	// alone: the user's own list is the authority for those and must not be duplicated.
	if b.Media != nil {
		h.addManualDownloadToPlanning(b.Media.ID)
	}

	return h.RespondWithData(c, true)

}

// addManualDownloadToPlanning adds a manually downloaded series to the shared (planning slut)
// planning list, unless the main account already tracks it.
//
// Runs in the background: AniList is rate limited to one write per second and the download has
// already been queued, so a slow or failing list update must not hold up (or fail) the request.
func (h *Handler) addManualDownloadToPlanning(mediaID int) {
	if mediaID <= 0 {
		return
	}

	go func() {
		defer util.HandlePanicInModuleThen("handlers/addManualDownloadToPlanning", func() {})

		added, err := h.addAnimeToPlanningIfAbsent(context.Background(), mediaID)
		if err != nil {
			h.App.Logger.Warn().Err(err).Int("mediaId", mediaID).Msg("torrent client: Failed to add manually downloaded media to planning")
			return
		}
		if !added {
			h.App.Logger.Debug().Int("mediaId", mediaID).Msg("torrent client: Media already tracked, not adding to planning")
			return
		}

		invalidatePlanningSlutCollectionCaches()
		h.App.Logger.Info().Int("mediaId", mediaID).Msg("torrent client: Added manually downloaded media to planning")
	}()
}

// HandleTorrentClientAddMagnetFromRule
//
//	@summary adds magnets to the torrent client based on the AutoDownloader item.
//	@desc This is used to download torrents that were queued by the AutoDownloader.
//	@desc The item will be removed from the queue if the magnet was added successfully.
//	@desc The AutoDownloader items should be re-fetched after this.
//	@route /api/v1/torrent-client/rule-magnet [POST]
//	@returns bool
func (h *Handler) HandleTorrentClientAddMagnetFromRule(c echo.Context) error {

	type body struct {
		MagnetUrl    string `json:"magnetUrl"`
		RuleId       uint   `json:"ruleId"`
		QueuedItemId uint   `json:"queuedItemId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.MagnetUrl == "" || b.RuleId == 0 {
		return h.RespondWithError(c, errors.New("missing parameters"))
	}

	// Get rule from database
	rule, err := db_bridge.GetAutoDownloaderRule(h.App.Database, b.RuleId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	repo, err := h.torrentClientRepo()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// try to start torrent client if it's not running
	ok := repo.Start()
	if !ok {
		return h.RespondWithError(c, errors.New("could not start torrent client, verify your settings"))
	}

	// try to add torrents to client, on error return error
	err = repo.AddMagnets([]string{b.MagnetUrl}, rule.Destination)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if b.QueuedItemId > 0 {
		// the magnet was added successfully, remove the item from the queue
		err = h.App.Database.DeleteAutoDownloaderItem(b.QueuedItemId)
	}

	return h.RespondWithData(c, true)

}
