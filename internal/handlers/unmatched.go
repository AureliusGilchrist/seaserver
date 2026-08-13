package handlers

import (
	"context"
	"os"
	"seanime/internal/api/anilist"
	"seanime/internal/database/db_bridge"
	"seanime/internal/library/anime"
	"seanime/internal/library/scanner"
	"seanime/internal/unmatched"
	"seanime/internal/util"
	"seanime/internal/util/limiter"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// matchMu serializes unmatched-match operations so concurrent matches
// don't race on the DB read-modify-write of local files.
var matchMu sync.Mutex

// injectMu guards the local-file DB read-modify-write in FinalizeUnmatchedMatch. That runs in a
// goroutine after matchMu has been released, so two matches finishing close together could
// otherwise read the same list and have the second save drop the first one's entries.
var injectMu sync.Mutex

// HandleGetUnmatchedTorrents
//
//	@summary returns all unmatched torrents.
//	@desc This handler returns all torrents in the unmatched directory that haven't been matched to an anime yet.
//	@route /api/v1/unmatched/torrents [GET]
//	@returns []*unmatched.UnmatchedTorrent
func (h *Handler) HandleGetUnmatchedTorrents(c echo.Context) error {
	torrents, err := h.App.UnmatchedRepository.GetUnmatchedTorrents()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, torrents)
}

// HandleGetUnmatchedTorrentContents
//
//	@summary returns the contents of a specific unmatched torrent.
//	@desc This handler returns the detailed file structure of a specific torrent.
//	@route /api/v1/unmatched/torrent/contents [POST]
//	@returns *unmatched.UnmatchedTorrent
func (h *Handler) HandleGetUnmatchedTorrentContents(c echo.Context) error {
	type body struct {
		Name string `json:"name"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Name == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "torrent name is required"))
	}

	torrent, err := h.App.UnmatchedRepository.GetTorrentContents(b.Name)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, torrent)
}

// HandleMatchUnmatchedTorrent
//
//	@summary matches selected files from an unmatched torrent to an anime.
//	@desc This handler moves selected files to the anime directory with proper naming.
//	@route /api/v1/unmatched/match [POST]
//	@returns *unmatched.MatchResult
func (h *Handler) HandleMatchUnmatchedTorrent(c echo.Context) error {
	// Serialize match operations so concurrent requests don't race on DB local files
	matchMu.Lock()
	defer matchMu.Unlock()

	var req unmatched.MatchRequest
	if err := c.Bind(&req); err != nil {
		return h.RespondWithError(c, err)
	}

	result, err := h.App.UnmatchedRepository.MatchAndMoveFiles(&req)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Everything after the move is async so the client gets an immediate response.
	// The scan is triggered INSIDE the goroutine, after DB injection, to avoid a
	// race where the scanner runs before the new local-file entries are persisted.
	//
	// Keyed on what actually moved, not on overall success: one file failing to move sets
	// Success false for the whole torrent, and skipping the finalize then would leave every
	// episode that *did* move sitting in the library with no database entry — invisible until
	// the next full rescan.
	if len(result.MovedFiles) > 0 {
		reqCopy := req
		resultCopy := *result
		go h.FinalizeUnmatchedMatch(reqCopy, resultCopy)
	}

	return h.RespondWithData(c, result)
}

// FinalizeUnmatchedMatch performs everything that follows a successful file move: it injects
// the moved files into the library database as hydrated, locked local files, adds the anime to
// the planning list, refreshes the unmatched view and re-pulls the AniList collection.
//
// Shared by the manual match endpoint and the automatic post-download match, so an auto-match
// produces exactly the same result as matching by hand. Safe to call in a goroutine.
func (h *Handler) FinalizeUnmatchedMatch(reqCopy unmatched.MatchRequest, resultCopy unmatched.MatchResult) {
	defer util.HandlePanicInModuleThen("handlers/FinalizeUnmatchedMatch", func() {})

	// Files that moved but were never injected are the worst possible outcome: they are in the
	// library on disk, absent from the library database, and nothing says so. The auto-match
	// path derives its anime ID from the stored metadata record after the match has already
	// run, so a lookup that comes back empty silently skips the injection for the whole
	// torrent — which reads as "it downloaded and matched but my library is empty".
	if len(resultCopy.MovedFiles) > 0 && reqCopy.AnimeID <= 0 {
		h.App.Logger.Error().
			Str("torrent", reqCopy.TorrentName).
			Int("movedFiles", len(resultCopy.MovedFiles)).
			Str("destination", resultCopy.Destination).
			Msg("unmatched: Files were moved into the library but no anime ID is known for them, so they cannot be recorded in the library database — they will only appear after a library scan")
	}

	// DB injection: inject moved files as locked local-file entries so the
	// "Resolve unmatched" step on the home page is never needed.
	if reqCopy.AnimeID > 0 && len(resultCopy.MovedFiles) > 0 {
		libraryPath := h.App.UnmatchedRepository.GetAnimeBasePath()
		newLFs := make([]*anime.LocalFile, 0, len(resultCopy.MovedFiles))
		for _, name := range resultCopy.MovedFiles {
			fullPath := resultCopy.Destination + "/" + name
			lf := anime.NewLocalFile(fullPath, libraryPath)
			lf.MediaId = reqCopy.AnimeID
			lf.Locked = false // Temporarily unlocked so hydrator processes it
			lf.Ignored = false
			lf.Metadata = &anime.LocalFileMetadata{
				Episode:      0,
				AniDBEpisode: "",
				Type:         anime.LocalFileTypeMain,
			}
			newLFs = append(newLFs, lf)
		}

		// Hydrate episode metadata — use a fresh context with a hard timeout
		// so a slow AniList response never stalls the goroutine indefinitely.
		hydrateCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		media, fetchErr := h.App.AnilistPlatformRef.Get().GetAnime(hydrateCtx, reqCopy.AnimeID)
		if fetchErr == nil && media != nil {
			normalizedMedia := anime.NewNormalizedMedia(media)
			fh := &scanner.FileHydrator{
				AllMedia:            []*anime.NormalizedMedia{normalizedMedia},
				LocalFiles:          newLFs,
				MetadataProviderRef: h.App.MetadataProviderRef,
				PlatformRef:         h.App.AnilistPlatformRef,
				CompleteAnimeCache:  anilist.NewCompleteAnimeCache(),
				AnilistRateLimiter:  limiter.NewAnilistLimiter(),
				Logger:              h.App.Logger,
			}
			fh.HydrateMetadata()
		} else {
			h.App.Logger.Warn().Err(fetchErr).Int("mediaId", reqCopy.AnimeID).
				Msg("unmatched: failed to fetch media for episode hydration, episodes will be 0")
		}

		// Lock all files after hydration
		for _, lf := range newLFs {
			lf.Locked = true
		}

		func() {
			injectMu.Lock()
			defer injectMu.Unlock()

			// Hydration runs for up to 30 seconds, and the match can be undone in that window.
			// Injecting a file the revert has already moved back would leave the library
			// pointing at a path that no longer exists, so anything gone by now is dropped.
			stillThere := make([]*anime.LocalFile, 0, len(newLFs))
			for _, lf := range newLFs {
				if _, statErr := os.Stat(lf.Path); statErr != nil {
					h.App.Logger.Debug().Str("path", lf.Path).
						Msg("unmatched: skipping DB injection for a file that is no longer there")
					continue
				}
				stillThere = append(stillThere, lf)
			}
			if len(stillThere) == 0 {
				return
			}
			newLFs = stillThere

			existingLFs, lfsId, lfsErr := db_bridge.GetLocalFiles(h.App.Database)
			if lfsErr != nil {
				h.App.Logger.Warn().Err(lfsErr).Msg("unmatched: failed to load local files for DB injection")
				return
			}
			merged := append(existingLFs, newLFs...)
			if _, saveErr := db_bridge.SaveLocalFiles(h.App.Database, lfsId, merged); saveErr != nil {
				h.App.Logger.Warn().Err(saveErr).Msg("unmatched: failed to save injected local files")
				return
			}
			h.App.Logger.Info().
				Int("count", len(newLFs)).
				Int("mediaId", reqCopy.AnimeID).
				Msg("unmatched: injected moved files into library DB")
		}()
	}

	// The files are in the library now, so say so.
	//
	// MatchAndMoveFiles records this itself, which covers every match that goes through it.
	// Repeated here because this handler is also reached by paths that assemble the result
	// themselves, and recording the same state twice is free — it is the same write.
	if reqCopy.AnimeID > 0 && len(resultCopy.MovedFiles) > 0 {
		h.App.UnmatchedRepository.MarkAnimeMatchedState(reqCopy.AnimeID)
	}

	// Auto-add to Planning list — but only when the anime isn't already on a list. Writing
	// over an existing entry would reset it to PLANNING and discard its progress.
	if reqCopy.AnimeID > 0 {
		added, addErr := h.addAnimeToPlanningIfAbsent(context.Background(), reqCopy.AnimeID)
		switch {
		case addErr != nil:
			h.App.Logger.Warn().Err(addErr).Int("mediaId", reqCopy.AnimeID).
				Msg("unmatched: failed to add anime to planning slut's PLANNING list")
		case added:
			h.App.Logger.Info().Int("mediaId", reqCopy.AnimeID).
				Msg("unmatched: added anime to planning slut's PLANNING list")
		default:
			h.App.Logger.Debug().Int("mediaId", reqCopy.AnimeID).
				Msg("unmatched: anime already tracked, left its list entry alone")
		}
	}

	// Trigger scan AFTER injection so the scanner doesn't overwrite fresh entries
	if reqCopy.TorrentName != "" {
		h.App.UnmatchedScanner.ClearCompletedTorrent(reqCopy.TorrentName)
	}
	h.App.UnmatchedRepository.InvalidateCache()

	h.scheduleAnimeCollectionRefresh()
}

// postMatchRefreshDelay is how long the coalesced post-match refresh waits for more matches before
// running. Long enough that working through a queue of torrents produces one refresh rather than
// one per torrent, short enough that a single match still lands promptly.
const postMatchRefreshDelay = 8 * time.Second

var (
	postMatchRefreshMu    sync.Mutex
	postMatchRefreshTimer *time.Timer
)

// scheduleAnimeCollectionRefresh queues the expensive tail of a match — the unmatched re-scan and
// the AniList collection refresh — and coalesces repeated calls into a single run.
//
// Running these inline per match is what made matching get progressively slower over a session:
// every match forced a full AniList collection refetch (rate limited, and slower the larger the
// collection gets) and a fresh scan of the whole staging directory, all while the next match was
// competing for the same disk and API budget.
func (h *Handler) scheduleAnimeCollectionRefresh() {
	postMatchRefreshMu.Lock()
	defer postMatchRefreshMu.Unlock()

	if postMatchRefreshTimer != nil {
		postMatchRefreshTimer.Reset(postMatchRefreshDelay)
		return
	}

	postMatchRefreshTimer = time.AfterFunc(postMatchRefreshDelay, func() {
		defer util.HandlePanicInModuleThen("handlers/scheduleAnimeCollectionRefresh", func() {})

		h.App.UnmatchedScanner.TriggerScan()

		if _, err := h.App.GetAnimeCollection(true); err != nil {
			h.App.Logger.Warn().Err(err).Msg("unmatched: failed to refresh anime collection after match")
		}
	})
}

// HandleUnmatchedFamilySearch
//
//	@summary fetches the full relation tree for an anime.
//	@desc Returns the root anime plus all related entries from AniList with relation types.
//	@route /api/v1/unmatched/family-search [POST]
//	@returns unmatchedFamilyResult
func (h *Handler) HandleUnmatchedFamilySearch(c echo.Context) error {
	type body struct {
		AnimeID int `json:"animeId"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.AnimeID <= 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "animeId is required"))
	}

	// Everything the picker needs to tell one entry from another at a glance.
	//
	// A franchise's tree is a list of near-identical titles — six Fate/Grand Order entries differing
	// by a subtitle — and picking the right one from titles alone means reading each of them
	// carefully. The cover, the year and the status are what make them distinguishable without
	// reading: you recognise the artwork of the one you downloaded.
	type familyEntry struct {
		ID           int    `json:"id"`
		Title        string `json:"title"`
		RelationType string `json:"relationType"` // "SEQUEL", "PREQUEL", "SIDE_STORY", "PARENT", "ALTERNATIVE", "SPIN_OFF", "SUMMARY", "CHARACTER", "OTHER", ""
		Format       string `json:"format"`       // "TV", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"
		ParentID     int    `json:"parentId"`     // ID of the parent entry in the tree (0 for root)
		Episodes     int    `json:"episodes"`     // 0 if unknown
		CoverImage   string `json:"coverImage,omitempty"`
		Status       string `json:"status,omitempty"`       // "FINISHED", "RELEASING", "NOT_YET_RELEASED", …
		Season       string `json:"season,omitempty"`       // "WINTER", "SPRING", "SUMMER", "FALL"
		SeasonYear   int    `json:"seasonYear,omitempty"`   // 0 if unknown
		MeanScore    int    `json:"meanScore,omitempty"`    // percentage, 0 if unknown
		EnglishTitle string `json:"englishTitle,omitempty"` // shown under the main title when it differs
	}

	type unmatchedFamilyResult struct {
		Root    familyEntry   `json:"root"`
		Entries []familyEntry `json:"entries"`
	}

	platform := h.App.AnilistPlatformRef.Get()
	ctx := context.Background()

	visited := make(map[int]bool)
	entries := make([]familyEntry, 0)

	type node struct {
		id       int
		parentID int
	}
	queue := []node{{id: b.AnimeID, parentID: 0}}

	var root familyEntry

	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if visited[cur.id] {
			continue
		}
		visited[cur.id] = true

		media, err := platform.GetAnimeWithRelations(ctx, cur.id)
		if err != nil || media == nil {
			continue
		}

		title := ""
		if media.GetTitle() != nil {
			if media.GetTitle().GetUserPreferred() != nil {
				title = *media.GetTitle().GetUserPreferred()
			} else if media.GetTitle().GetRomaji() != nil {
				title = *media.GetTitle().GetRomaji()
			}
		}

		format := ""
		if media.GetFormat() != nil {
			format = string(*media.GetFormat())
		}

		episodes := 0
		if media.GetEpisodes() != nil {
			episodes = *media.GetEpisodes()
		}

		entry := familyEntry{
			ID:           media.ID,
			Title:        title,
			Format:       format,
			ParentID:     cur.parentID,
			Episodes:     episodes,
			CoverImage:   coverImageOf(media.GetCoverImage()),
			Status:       stringOfStatus(media.GetStatus()),
			Season:       stringOfSeason(media.GetSeason()),
			SeasonYear:   intOf(media.GetSeasonYear()),
			MeanScore:    intOf(media.GetMeanScore()),
			EnglishTitle: englishTitleOf(media.GetTitle().GetEnglish(), title),
		}

		if media.ID == b.AnimeID {
			root = entry
		}
		entries = append(entries, entry)

		if media.Relations == nil {
			continue
		}
		for _, edge := range media.GetRelations().GetEdges() {
			if edge == nil || edge.Node == nil {
				continue
			}
			n := edge.GetNode()
			if n == nil || visited[n.ID] {
				continue
			}
			// Anime only. A franchise's relations cross media freely — the manga it was adapted
			// from, the light novel under that — and none of those can be matched to a download of
			// episodes. They would only be rows you cannot pick.
			if n.Type == nil || *n.Type != anilist.MediaTypeAnime {
				continue
			}
			relType := ""
			if edge.RelationType != nil {
				relType = string(*edge.RelationType)
			}

			childTitle := ""
			if n.GetTitle() != nil {
				if n.GetTitle().GetUserPreferred() != nil {
					childTitle = *n.GetTitle().GetUserPreferred()
				} else if n.GetTitle().GetRomaji() != nil {
					childTitle = *n.GetTitle().GetRomaji()
				}
			}

			childFormat := ""
			if n.Format != nil {
				childFormat = string(*n.Format)
			}

			childEpisodes := 0
			if n.GetEpisodes() != nil {
				childEpisodes = *n.GetEpisodes()
			}

			// Add child entry with relation info
			childEntry := familyEntry{
				ID:           n.ID,
				Title:        childTitle,
				RelationType: relType,
				Format:       childFormat,
				ParentID:     media.ID,
				Episodes:     childEpisodes,
				CoverImage:   coverImageOf(n.GetCoverImage()),
				Status:       stringOfStatus(n.GetStatus()),
				Season:       stringOfSeason(n.GetSeason()),
				SeasonYear:   intOf(n.GetSeasonYear()),
				MeanScore:    intOf(n.GetMeanScore()),
				EnglishTitle: englishTitleOf(n.GetTitle().GetEnglish(), childTitle),
			}
			entries = append(entries, childEntry)
			visited[n.ID] = true

			// Every edge is followed, not just the sequel/prequel spine.
			//
			// A franchise is not a line. The side stories, the specials, the alternative retellings
			// and the spin-offs all hang off it, and a download is as likely to be one of those as
			// a numbered season — more likely, when the numbered seasons are the ones you already
			// have. Walking only sequels and prequels left exactly the entries somebody is trying to
			// match out of the tree they are looking at.
			//
			// The walk stays bounded by `visited` and by the fact that anything that is not an anime
			// is dropped above, so it cannot wander off into a manga's own relations.
			queue = append(queue, node{id: n.ID, parentID: media.ID})
			visited[n.ID] = false // Allow re-visit to discover its relations
		}
	}

	return h.RespondWithData(c, unmatchedFamilyResult{
		Root:    root,
		Entries: entries,
	})
}

// HandleDeleteUnmatchedTorrent
//
//	@summary deletes an unmatched torrent directory.
//	@desc This handler removes a torrent directory from the unmatched folder.
//	@route /api/v1/unmatched/torrent/delete [POST]
//	@returns bool
func (h *Handler) HandleDeleteUnmatchedTorrent(c echo.Context) error {
	type body struct {
		Name string `json:"name"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Name == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "torrent name is required"))
	}

	err := h.App.UnmatchedRepository.DeleteTorrent(b.Name)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Drop the scanner's record of the torrent too. It is keyed by name, so leaving it behind
	// means re-downloading the same release later is skipped as "already completed" — never
	// marked done, never auto-matched.
	if h.App.UnmatchedScanner != nil {
		h.App.UnmatchedScanner.ClearCompletedTorrent(b.Name)
	}

	return h.RespondWithData(c, true)
}

// HandleGetUnmatchedDestination
//
//	@summary returns the destination path for a new torrent download.
//	@desc This handler returns the path where a torrent should be downloaded to.
//	@route /api/v1/unmatched/destination [POST]
//	@returns string
func (h *Handler) HandleGetUnmatchedDestination(c echo.Context) error {
	type body struct {
		TorrentName string `json:"torrentName"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	destination := h.App.UnmatchedRepository.GetUnmatchedDestination(b.TorrentName)
	return h.RespondWithData(c, destination)
}

// HandleGetUnmatchedScannerStatus
//
//	@summary returns the status of the unmatched scanner.
//	@desc This handler returns the scanner status including completed torrents.
//	@route /api/v1/unmatched/scanner/status [GET]
//	@returns *unmatched.ScannerStatus
func (h *Handler) HandleGetUnmatchedScannerStatus(c echo.Context) error {
	status := h.App.UnmatchedScanner.GetStatus()
	return h.RespondWithData(c, status)
}

// HandleClearCompletedTorrent
//
//	@summary clears a torrent from the completed list.
//	@desc This handler removes a torrent from the scanner's completed list.
//	@route /api/v1/unmatched/scanner/clear [POST]
//	@returns bool
func (h *Handler) HandleClearCompletedTorrent(c echo.Context) error {
	type body struct {
		TorrentName string `json:"torrentName"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	h.App.UnmatchedScanner.ClearCompletedTorrent(b.TorrentName)
	return h.RespondWithData(c, true)
}

// The family picker's little accessors.
//
// AniList sends almost everything as a pointer, and a tree row that has to guard six of them inline
// stops being readable. These turn "maybe there" into "a value or the zero one", which is what the
// row wants: an empty string renders as nothing, and nothing is the right answer for a field AniList
// does not know.

func coverImageOf(cover interface {
	GetExtraLarge() *string
	GetLarge() *string
	GetMedium() *string
}) string {
	if cover == nil {
		return ""
	}
	if v := cover.GetExtraLarge(); v != nil && *v != "" {
		return *v
	}
	if v := cover.GetLarge(); v != nil && *v != "" {
		return *v
	}
	if v := cover.GetMedium(); v != nil {
		return *v
	}
	return ""
}

func stringOfStatus(status *anilist.MediaStatus) string {
	if status == nil {
		return ""
	}
	return string(*status)
}

func stringOfSeason(season *anilist.MediaSeason) string {
	if season == nil {
		return ""
	}
	return string(*season)
}

func intOf(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}

// englishTitleOf returns the English title only when it says something the main title does not.
// Printing "Fate/Grand Order" under "Fate/Grand Order" is a line of noise on every row.
func englishTitleOf(english *string, mainTitle string) string {
	if english == nil || *english == "" || strings.EqualFold(*english, mainTitle) {
		return ""
	}
	return *english
}
