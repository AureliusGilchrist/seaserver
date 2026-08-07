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
	"sort"

	"github.com/labstack/echo/v4"
)

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

	// Get torrent list
	res, err := h.App.TorrentClientRepository.GetActiveTorrents(&torrent_client.GetListOptions{
		Category: category,
		Sort:     sort,
	})
	// If an error occurred, try to start the torrent client and get the list again
	// DEVNOTE: We try to get the list first because this route is called repeatedly by the client.
	if err != nil {
		ok := h.App.TorrentClientRepository.Start()
		if !ok {
			return h.RespondWithError(c, errors.New("could not start torrent client, verify your settings"))
		}
		res, err = h.App.TorrentClientRepository.GetActiveTorrents(&torrent_client.GetListOptions{
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

	// The durable source. Every download queued from a media page writes its sidecar into the
	// staging directory before the torrent is added, so the directory outlives any one thing the
	// torrent client happens to be reporting at the moment this route is polled.
	if entries, err := os.ReadDir(unmatched.UnmatchedBasePath); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			metadata := h.App.UnmatchedRepository.GetTorrentMetadata(entry.Name())
			if metadata == nil || metadata.AnimeID == 0 {
				continue
			}
			if h.stagingDownloadFinished(entry.Name()) {
				finished[metadata.AnimeID] = struct{}{}
			} else {
				downloading[metadata.AnimeID] = struct{}{}
			}
		}
	}

	// The live source, which also covers downloads writing somewhere other than the staging area.
	// Never start the torrent client for this route and never fail the request: this is polled,
	// and no reachable client simply means there is nothing more to add.
	if torrents, err := h.App.TorrentClientRepository.GetActiveTorrents(&torrent_client.GetListOptions{}); err == nil {
		for _, t := range torrents {
			if t == nil {
				continue
			}
			// Resolved by where the client is writing, falling back to the torrent's name. Name
			// alone only works while the client's name for the torrent matches the release title
			// the download was started from, and the two disagree often enough.
			metadata := h.App.UnmatchedRepository.MetadataForTorrent(t.Name, t.ContentPath)
			if metadata == nil || metadata.AnimeID == 0 {
				continue
			}
			// Finished: seeding, or fully downloaded but paused/stopped in the client.
			if t.Status == torrent_client.TorrentStatusSeeding || t.Progress >= 1 {
				finished[metadata.AnimeID] = struct{}{}
			} else {
				downloading[metadata.AnimeID] = struct{}{}
			}
		}
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
// Not knowing counts as still downloading. The badge is meant to stay up until something says the
// download is done, and "the torrent client has nothing to say about this one" is not that.
func (h *Handler) stagingDownloadFinished(dirName string) bool {
	if h.App.UnmatchedScanner == nil {
		return false
	}
	if h.App.UnmatchedScanner.IsMarkedCompleted(dirName) {
		return true
	}
	return h.App.UnmatchedScanner.CompletionStateFor(dirName) == unmatched.CompletionFinished
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

	switch b.Action {
	case "pause":
		err := h.App.TorrentClientRepository.PauseTorrents([]string{b.Hash})
		if err != nil {
			return h.RespondWithError(c, err)
		}
	case "resume":
		err := h.App.TorrentClientRepository.ResumeTorrents([]string{b.Hash})
		if err != nil {
			return h.RespondWithError(c, err)
		}
	case "remove":
		err := h.App.TorrentClientRepository.RemoveTorrents([]string{b.Hash})
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

	exists := h.App.TorrentClientRepository.TorrentExists(b.Torrent.InfoHash)

	if !exists {
		h.App.Logger.Info().Msgf("torrent client: Torrent %s does not exist, adding", b.Torrent.InfoHash)
		// Add the torrent
		err = h.App.TorrentClientRepository.AddMagnets([]string{magnet}, tempDir)
		if err != nil {
			return err
		}
	}

	h.App.Logger.Info().Msgf("torrent client: Getting files for %s", b.Torrent.InfoHash)
	files, err := h.App.TorrentClientRepository.GetFiles(b.Torrent.InfoHash)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if !exists {
		h.App.Logger.Info().Msgf("torrent client: Removing torrent %s", b.Torrent.InfoHash)
		_ = h.App.TorrentClientRepository.RemoveTorrents([]string{b.Torrent.InfoHash})
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
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if len(b.Torrents) == 0 {
		return h.RespondWithError(c, errors.New("no torrents provided"))
	}

	// try to start torrent client if it's not running
	ok := h.App.TorrentClientRepository.Start()
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
		if b.Media != nil {
			if err := h.App.UnmatchedRepository.SaveTorrentMetadataRecord(t.Name, queuedMetadata); err != nil {
				h.App.Logger.Error().Err(err).Str("torrent", t.Name).Msg("torrent client: Failed to save torrent metadata")
				return h.RespondWithError(c, fmt.Errorf("could not save anime metadata for %q, torrent not added: %w", t.Name, err))
			}
		}

		// Add torrent to client with unmatched destination
		err = h.App.TorrentClientRepository.AddMagnets([]string{magnet}, destination)
		if err != nil {
			return h.RespondWithError(c, err)
		}

		h.App.Logger.Info().Str("torrent", t.Name).Str("destination", destination).Bool("autoMatch", b.AutoMatch && b.Media != nil).Msg("torrent client: Added torrent to unmatched directory")
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

	// try to start torrent client if it's not running
	ok := h.App.TorrentClientRepository.Start()
	if !ok {
		return h.RespondWithError(c, errors.New("could not start torrent client, verify your settings"))
	}

	// try to add torrents to client, on error return error
	err = h.App.TorrentClientRepository.AddMagnets([]string{b.MagnetUrl}, rule.Destination)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if b.QueuedItemId > 0 {
		// the magnet was added successfully, remove the item from the queue
		err = h.App.Database.DeleteAutoDownloaderItem(b.QueuedItemId)
	}

	return h.RespondWithData(c, true)

}
