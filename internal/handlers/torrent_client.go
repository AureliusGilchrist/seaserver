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
	"sync"

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

// DownloadingMediaStatus is what the client needs in order to decide which of the three download
// badges an anime gets — downloading, downloaded, or matched. A media ID appears in at most one of
// these lists, so a card can never show two.
type DownloadingMediaStatus struct {
	// Downloading holds AniList media IDs with a download in flight.
	Downloading []int `json:"downloading"`
	// Finished holds media IDs whose download is done and is waiting to be matched into the
	// library. Named for the field the client has always read; the badge calls it "Downloaded".
	Finished []int `json:"finished"`
	// Matched holds media IDs whose download was filed into the library, by hand or automatically.
	Matched []int `json:"matched"`
}

// HandleGetDownloadingMediaIds
//
//	@summary returns the download badge state of every anime that has one.
//	@desc Read straight from the state recorded against each anime — written when a download was
//	@desc queued, when it finished, and when it was matched — with nothing inferred and nothing
//	@desc reconciled. The answer is identical across page reloads, server restarts, a torrent client
//	@desc that has forgotten the torrent, and a staging folder a match has already deleted.
//	@route /api/v1/torrent-client/downloading-media [GET]
//	@returns handlers.DownloadingMediaStatus
func (h *Handler) HandleGetDownloadingMediaIds(c echo.Context) error {

	// One read, and it is the entire answer.
	//
	// What used to be here reconstructed all three states on every poll, from the torrent client's
	// current list, the contents of the staging directory, per-torrent database rows, and the
	// library's file list — then wrote its conclusions back. Every input was transient and every
	// conclusion was permanent, which is a combination that cannot be made to work: a torrent
	// client that was briefly unreachable had downloads in full flight recorded as finished with,
	// and downloads whose folders had been tidied away stayed "downloading" forever. It reported a
	// hundred and thirty-one anime as downloading on a library that was downloading none.
	//
	// Now the states are recorded where they happen and read back as they were written. There is
	// no reconciliation left to get wrong.
	states := h.App.UnmatchedRepository.AnimeDownloadStates()

	res := DownloadingMediaStatus{
		Downloading: make([]int, 0),
		Finished:    make([]int, 0),
		Matched:     make([]int, 0),
	}

	for _, state := range states {
		switch state.State {
		case unmatched.DownloadStateDownloading:
			res.Downloading = append(res.Downloading, state.MediaID)
		case unmatched.DownloadStateDownloaded:
			res.Finished = append(res.Finished, state.MediaID)
		case unmatched.DownloadStateMatched:
			res.Matched = append(res.Matched, state.MediaID)
		}
	}

	// Sorted so a poll that changed nothing looks like it changed nothing.
	sort.Ints(res.Downloading)
	sort.Ints(res.Finished)
	sort.Ints(res.Matched)

	// Logged when the answer changes, and only then.
	//
	// A missing badge has two causes that look identical from outside — the client never asked, or
	// the server answered nothing — and no way to tell them apart from a log where this route says
	// nothing either way. Silence here while badges are missing means the client is not asking.
	answer := fmt.Sprintf("%v|%v|%v", res.Downloading, res.Finished, res.Matched)
	lastDownloadingAnswerMu.Lock()
	changed := lastDownloadingAnswer != answer
	lastDownloadingAnswer = answer
	lastDownloadingAnswerMu.Unlock()
	if changed {
		h.App.Logger.Debug().
			Ints("downloading", res.Downloading).
			Ints("finished", res.Finished).
			Ints("matched", res.Matched).
			Msg("torrent client: Download badge state changed")
	}

	return h.RespondWithData(c, res)
}

// The last answer this route gave, so it can log when that changes rather than on every poll.
var (
	lastDownloadingAnswerMu sync.Mutex
	lastDownloadingAnswer   string
)

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

		// The badge goes up here, at the moment the download exists, and stays up until something
		// says it has moved on. Written after the torrent is accepted so a failed add leaves no
		// badge behind, and written unconditionally so downloading another season of something
		// already in the library says "downloading" again — which is what the card is being asked.
		if b.Media != nil {
			h.App.UnmatchedRepository.MarkAnimeDownloading(b.Media.ID)
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
