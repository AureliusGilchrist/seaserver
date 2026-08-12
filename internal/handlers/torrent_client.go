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
	"sync"
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

// DownloadingMediaStatus is what the client needs in order to decide which of the three download
// badges an anime gets — downloading, downloaded, or matched — and it is the only thing that
// decides. A media ID appears in at most one of these lists, so a card can never show two.
//
// All three are read from the same durable records, so all three survive a server restart, a
// torrent client that has forgotten the torrent, and a staging folder a match has already deleted.
// They are also read from the shared database rather than a profile's own, which is what makes the
// badges the same on every account: what is downloading is a fact about the machine, not about who
// happens to be signed in.
type DownloadingMediaStatus struct {
	// Downloading holds AniList media IDs with a download still in flight.
	Downloading []int `json:"downloading"`
	// Finished holds media IDs whose download is over and whose files are still sitting in the
	// staging area, waiting to be matched into the library.
	//
	// The client deliberately keeps a downloading badge on screen once it has appeared, so this
	// is the only thing that takes one down promptly. Silence is not an answer: a media ID
	// missing from every list means "nothing known", which must not be read as "finished".
	Finished []int `json:"finished"`
	// Matched holds media IDs whose download was filed into the library, by the auto-matcher or by
	// hand. This one is permanent: nothing later retracts it, and it is what the orange badge is
	// drawn from on every account.
	Matched []int `json:"matched"`
}

// HandleGetDownloadingMediaIds
//
//	@summary returns which AniList media have a download in flight, and which have just finished.
//	@desc Read from the state recorded against each download in the database — written when it was
//	@desc queued and stamped again as it finished and as it was matched — so the answer is the same
//	@desc across page reloads, server restarts, a torrent client that has forgotten the torrent, and
//	@desc a staging folder a match has already deleted. That is what lets the "Downloading" badge
//	@desc stay up for the whole download instead of blinking in and out.
//	@route /api/v1/torrent-client/downloading-media [GET]
//	@returns handlers.DownloadingMediaStatus
func (h *Handler) HandleGetDownloadingMediaIds(c echo.Context) error {

	downloading := make(map[int]struct{})
	finished := make(map[int]struct{})
	// Anime whose download has been filed into the library. Never retracted below — once a download
	// has been matched that is the end of its story, and the orange badge it draws is permanent.
	matched := make(map[int]struct{})

	// Anime the torrent client is, right now, actively pulling. Kept apart from `downloading` because
	// it is the only first-hand evidence in this handler — everything else is inferred from what is
	// lying in the staging area, and leftovers there outlive the download they came from.
	clientIsPulling := make(map[int]struct{})

	// Staging directories the client has just reported as fully downloaded, collected here and
	// reconciled against what is on record once the records have been read.
	clientFinishedDirs := make([]string, 0)
	// The anime behind those torrents, likewise held until the records can be consulted.
	clientFinishedAnime := make([]unmatched.DownloadState, 0)

	// What the torrent client says, keyed by the staging directory each torrent is writing into.
	// Asked once for the whole request — this route is polled, and it must never start the client
	// or fail: no reachable client simply means the disk has to answer on its own below.
	clientSaysFinished := make(map[string]bool)
	// Every download the client can account for, by the name its record is keyed under. Used below to
	// tell a download the client has merely forgotten from one that never existed.
	clientKnows := make(map[string]struct{})
	// Whether the torrent client answered at all this time round.
	//
	// Everything that *retires* a badge below reasons from the client's silence — no torrent under
	// this name, so the download must be over — and silence from a client that is not running says
	// nothing of the kind. Without this, stopping the torrent client for a minute was enough to have
	// a download in full flight written off, and its badge gone for good.
	clientAnswered := false
	if repo := h.App.TorrentClientRepository; repo != nil {
		if torrents, err := repo.GetActiveTorrents(&torrent_client.GetListOptions{}); err == nil {
			clientAnswered = true
			for _, t := range torrents {
				if t == nil {
					continue
				}
				// Finished: seeding, or fully downloaded but paused/stopped in the client.
				isFinished := t.Status == torrent_client.TorrentStatusSeeding || t.Progress >= 1

				clientKnows[unmatched.MetadataKey(t.Name)] = struct{}{}
				if dir, ok := unmatched.StagingDirForTorrent(t.Name, t.ContentPath); ok {
					clientKnows[dir] = struct{}{}
					// A directory fed by two torrents is downloading until both are done.
					if wasFinished, seen := clientSaysFinished[dir]; !seen || wasFinished {
						clientSaysFinished[dir] = isFinished
					}
					if isFinished {
						// Recorded, not merely noted: this is the moment "the files are all here"
						// becomes true, and the client will stop saying so the moment it drops the
						// torrent. Written only on the transition — see below.
						clientFinishedDirs = append(clientFinishedDirs, dir)
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
					// Held back rather than answered here, because a torrent left seeding after its
					// files were filed into the library is still "finished" to the client and is not
					// something the user is waiting on. What the record says decides — see below.
					clientFinishedAnime = append(clientFinishedAnime, unmatched.DownloadState{
						TorrentName: unmatched.MetadataKey(t.Name),
						AnimeID:     metadata.AnimeID,
					})
				} else {
					downloading[metadata.AnimeID] = struct{}{}
					clientIsPulling[metadata.AnimeID] = struct{}{}
				}
			}
		}
	}

	// Which staging directories are still on disk. Only legacy rows need this — see below — but it
	// is one read either way, so it is done once here rather than per row.
	stagingDirs := make(map[string]struct{})
	if entries, err := os.ReadDir(unmatched.UnmatchedBasePath); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				stagingDirs[entry.Name()] = struct{}{}
			}
		}
	}

	// The durable source, and the answer this route is really built on.
	//
	// Every download writes a row when it is queued, and that row is stamped again when the scanner
	// accepts the files as complete and when a match files them into the library. So each of the
	// three things the badge has to say is *recorded at the moment it becomes true*, by the code
	// that knows it, rather than reconstructed afterwards from evidence that does not last:
	// qBittorrent forgets a torrent as soon as it stops seeding it, and matching deletes the staging
	// folder outright. Both of those are why every earlier version of this badge went out on its own
	// while the download was still very much a thing the user was waiting for.
	//
	// A row in the matched state contributes to neither list on purpose. That anime is in the
	// library now, and the library badge — orange, drawn in the same corner of the same card — is
	// what says so. The three states read as one progression, and a card shows exactly one of them.
	records := h.App.UnmatchedRepository.DownloadStates()

	// Anime whose state is on record. The inference at the bottom leaves these alone: a recorded
	// state is first-hand, written by the code that watched it happen, and guessing over the top of
	// it is what the record exists to stop.
	onRecord := make(map[int]struct{})
	// The furthest-back state recorded for an anime across all of its downloads, so that one season
	// still coming down is not overruled by another that has already been filed away.
	recordedForAnime := make(map[int]string)
	legacy := make([]unmatched.DownloadState, 0)
	// Rows that claim to be downloading with nothing whatsoever left to back them up, kept for the
	// reaper below.
	orphaned := make([]unmatched.DownloadState, 0)

	for _, state := range records {
		if state.AnimeID <= 0 {
			continue
		}
		if downloadStateRank(state.State) > downloadStateRank(recordedForAnime[state.AnimeID]) {
			recordedForAnime[state.AnimeID] = state.State
		}
		switch state.State {
		case unmatched.DownloadStateDownloading:
			onRecord[state.AnimeID] = struct{}{}
			downloading[state.AnimeID] = struct{}{}
			_, onDisk := stagingDirs[state.TorrentName]
			_, known := clientKnows[state.TorrentName]
			if !onDisk && !known {
				orphaned = append(orphaned, state)
			}
		case unmatched.DownloadStateFinished:
			onRecord[state.AnimeID] = struct{}{}
			// "Downloaded" means the files are here and waiting on you, so it is the one state that
			// is checked against something still existing. A finished download whose staging folder
			// has been emptied out from underneath the app — moved by hand, deleted, tidied away —
			// is not something you can go and match, and a badge inviting you to would be pointing
			// at nothing.
			//
			// Either the folder or a torrent the client still knows is enough, and a client that
			// never answered is not evidence of anything: its silence leaves the badge exactly
			// where it is.
			_, onDisk := stagingDirs[state.TorrentName]
			_, known := clientKnows[state.TorrentName]
			if onDisk || known || !clientAnswered {
				finished[state.AnimeID] = struct{}{}
			}
		case unmatched.DownloadStateMatched:
			onRecord[state.AnimeID] = struct{}{}
			matched[state.AnimeID] = struct{}{}
		default:
			// Written before the state column existed. Nothing was recorded for these, so they are
			// answered the old way — from what is left in the staging area — which is exactly as
			// good as it ever was, and no worse.
			legacy = append(legacy, state)
		}
	}

	for _, state := range legacy {
		if _, onDisk := stagingDirs[state.TorrentName]; !onDisk {
			// No record and no files: there is nothing left to call this a download at all.
			continue
		}
		if h.stagingDownloadFinished(state.TorrentName, clientSaysFinished) {
			finished[state.AnimeID] = struct{}{}
		} else {
			downloading[state.AnimeID] = struct{}{}
		}
	}

	// The client has just reported a download complete that is still on record as downloading. Write
	// it down while there is something to write down: this is the last moment the fact exists
	// anywhere, and the scanner — which normally records it — only sees downloads that land in the
	// staging area with files it can watch settle.
	//
	// Only on the transition, so a poll every ten seconds from every open client is still no writes
	// at all once a download has been accounted for.
	recordedState := make(map[string]string, len(records))
	for _, state := range records {
		recordedState[state.TorrentName] = state.State
	}
	for _, dir := range clientFinishedDirs {
		if recordedState[dir] != unmatched.DownloadStateDownloading {
			continue
		}
		h.App.UnmatchedRepository.MarkDownloadState(dir, unmatched.DownloadStateFinished)
	}

	// And now the client's finished torrents can be answered for. One that is on record as matched is
	// left out: a torrent goes on seeding long after its files were filed into the library, and
	// saying "Downloaded, waiting on you" about an anime already on your shelf is exactly the lie
	// this route is meant to stop telling.
	for _, state := range clientFinishedAnime {
		if recordedForAnime[state.AnimeID] == unmatched.DownloadStateMatched {
			continue
		}
		finished[state.AnimeID] = struct{}{}
	}

	// Anything just matched is done, whatever else still says otherwise.
	//
	// A match records its own state, so this is only for the gap: the moment between a match
	// finishing and this route being polled with a stale cached view of the library, and any match
	// path that does not go through the repository. The exception is the torrent client actively
	// pulling for that anime right now — a second season coming down while the first is on disk is a
	// real download, and first-hand evidence from the client beats anything inferred.
	for animeID := range unmatched.RecentlyMatchedAnime() {
		if _, pulling := clientIsPulling[animeID]; pulling {
			continue
		}
		delete(downloading, animeID)
		delete(finished, animeID)
		matched[animeID] = struct{}{}
	}

	// The reaper, for downloads that ended without anybody recording it.
	//
	// A row saying "downloading" with no staging directory, no torrent the client has heard of, and
	// the anime's episodes sitting in the library is not a download — it is the residue of one that
	// was matched by a version of the server that predates this column, or dealt with outside the
	// app entirely. Left alone it would hold a purple badge up forever, which is the failure mode
	// this whole mechanism exists to avoid, only pointing the other way.
	//
	// Stamped rather than merely ignored, so the row stops being reconsidered on every poll — which
	// is also why it is only run when the client has answered. Stamping is irreversible, and "the
	// client has never heard of this torrent" is indistinguishable from "the client is not running"
	// unless you know which one you are looking at.
	if len(orphaned) > 0 && clientAnswered {
		inLibrary := h.animeWithLocalFiles()
		for _, state := range orphaned {
			if _, pulling := clientIsPulling[state.AnimeID]; pulling {
				continue
			}
			if _, have := inLibrary[state.AnimeID]; !have {
				continue
			}
			h.App.UnmatchedRepository.MarkDownloadState(state.TorrentName, unmatched.DownloadStateMatched)
			delete(downloading, state.AnimeID)
			matched[state.AnimeID] = struct{}{}
		}
	}

	// Legacy rows keep the old rule: an anime whose episodes are already in the library is a download
	// that ended in the library, whatever was left behind in staging months ago. Applied only where
	// nothing was recorded, because that is the only place there is nothing better to go on.
	//
	// Stamped as matched rather than merely set aside, so the row stops being reasoned about on every
	// poll and starts carrying the state it has plainly been in all along.
	if len(legacy) > 0 && clientAnswered {
		inLibrary := h.animeWithLocalFiles()
		for _, state := range legacy {
			if _, ok := onRecord[state.AnimeID]; ok {
				continue
			}
			if _, pulling := clientIsPulling[state.AnimeID]; pulling {
				continue
			}
			if _, have := inLibrary[state.AnimeID]; !have {
				continue
			}
			h.App.UnmatchedRepository.MarkDownloadState(state.TorrentName, unmatched.DownloadStateMatched)
			delete(downloading, state.AnimeID)
			delete(finished, state.AnimeID)
			matched[state.AnimeID] = struct{}{}
		}
	}

	res := DownloadingMediaStatus{
		Downloading: make([]int, 0, len(downloading)),
		Finished:    make([]int, 0, len(finished)),
		Matched:     make([]int, 0, len(matched)),
	}
	// One anime, one badge. The order is the order the states happen in, and the earliest one still
	// true wins: a show with one season coming down and another already filed away is a show that is
	// still coming down, because that is the fact that decides what you do next.
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
	for id := range matched {
		if _, ok := downloading[id]; ok {
			continue
		}
		if _, ok := finished[id]; ok {
			continue
		}
		res.Matched = append(res.Matched, id)
	}
	// Sorted so a poll that changed nothing looks like it changed nothing.
	sort.Ints(res.Downloading)
	sort.Ints(res.Finished)
	sort.Ints(res.Matched)

	// Logged when the answer changes, and only then.
	//
	// A missing badge has two completely different causes that look identical from the outside —
	// the client never asked, or the server answered "nothing" — and no way to tell them apart
	// from a log where this route says nothing either way. With this, silence in the log while
	// badges are missing means the client is not asking; a line showing empty lists means the
	// server is, and the record count next to it says whether there was anything to answer from.
	//
	// On change only, because this is polled every ten seconds by every open client and a line
	// each would bury everything else. A steady state prints once.
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
			Int("records", len(records)).
			Bool("clientAnswered", clientAnswered).
			Msg("torrent client: Download badge state changed")
	}

	return h.RespondWithData(c, res)
}

// The last answer this route gave, so it can log when that changes rather than on every poll.
var (
	lastDownloadingAnswerMu sync.Mutex
	lastDownloadingAnswer   string
)

// downloadStateRank orders the states by how much of the user's attention they still deserve, so
// that an anime with several downloads is described by the least finished of them. Two seasons of
// one show, one filed away and one still coming down, is a show that is still coming down.
func downloadStateRank(state string) int {
	switch state {
	case unmatched.DownloadStateDownloading:
		return 3
	case unmatched.DownloadStateFinished:
		return 2
	case unmatched.DownloadStateMatched:
		return 1
	default:
		return 0
	}
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
