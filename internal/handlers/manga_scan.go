package handlers

import (
	"context"
	"seanime/internal/api/anilist"
	"seanime/internal/events"
	"seanime/internal/manga"
	"sync"

	"github.com/labstack/echo/v4"
)

var (
	mangaScanResultMu    sync.RWMutex
	mangaScanResultCache *manga.MangaScanResult
	mangaScanRunning     bool
)

// HandleScanMangaDirectories
//
//	@summary triggers a scan of local manga directories and auto-matches folders to AniList.
//	@desc Scans the local source directory and download directory for manga folders,
//	@desc attempts to match each folder to an AniList entry using title similarity,
//	@desc and creates MangaMappings for confident matches or SyntheticManga for unmatched folders.
//	@route /api/v1/manga/scan [POST]
//	@returns bool
func (h *Handler) HandleScanMangaDirectories(c echo.Context) error {
	type body struct {
		ForceRematch bool `json:"forceRematch"`
		// ReviewMatches proposes the matches instead of applying them, for the user to accept or
		// dismiss through /api/v1/manga/scan/review.
		ReviewMatches bool `json:"reviewMatches"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	mangaScanResultMu.Lock()
	if mangaScanRunning {
		mangaScanResultMu.Unlock()
		return h.RespondWithError(c, echo.NewHTTPError(409, "Manga scan is already running"))
	}
	mangaScanRunning = true
	mangaScanResultMu.Unlock()

	localDir := ""
	downloadDir := ""

	if h.App.Settings != nil && h.App.Settings.Manga != nil {
		localDir = h.App.Settings.Manga.LocalSourceDirectory
	}
	if h.App.MangaRepository != nil {
		downloadDir = h.App.MangaRepository.GetDownloadDir()
	}

	if localDir == "" && downloadDir == "" {
		mangaScanResultMu.Lock()
		mangaScanRunning = false
		mangaScanResultMu.Unlock()
		return h.RespondWithError(c, echo.NewHTTPError(400, "No manga directories configured"))
	}

	// The scan is something the user pressed a button for and is watching a progress bar for, so its
	// AniList requests are marked as theirs: they go ahead of the prefetcher and the collection
	// walks rather than queueing behind them. See internal/api/anilist/priority.go.
	scanCtx := anilist.WithUserInitiated(context.Background())

	// Run scan asynchronously
	go func() {
		defer func() {
			mangaScanResultMu.Lock()
			mangaScanRunning = false
			mangaScanResultMu.Unlock()
		}()

		result, err := manga.ScanMangaDirectories(
			scanCtx,
			localDir,
			downloadDir,
			b.ForceRematch,
			b.ReviewMatches,
			h.App.MangaRepository.GetDatabase(),
			h.App.WSEventManager,
			h.App.Logger,
		)
		if err != nil {
			h.App.Logger.Error().Err(err).Msg("manga-scan: Scan failed")
			return
		}

		// The folders are only half the library. Everything downloaded through the app is filed
		// under an ID rather than a name, so it never appears in a folder scan at all — those are
		// the cards reading "Manga ID: 47353". This looks each of them up and writes what it finds.
		downloads := manga.ScanDownloadedSeries(
			scanCtx,
			h.App.MangaDownloader,
			b.ReviewMatches,
			h.App.WSEventManager,
			h.App.Logger,
		)
		result.DescribedCount = downloads.Described
		result.LinkedCount = downloads.Linked

		mangaScanResultMu.Lock()
		mangaScanResultCache = result
		mangaScanResultMu.Unlock()

		// The library reads its metadata from the database, so tell the open screens to re-read it.
		h.App.WSEventManager.SendEvent(events.RefreshedMangaDownloadData, nil)
		h.App.WSEventManager.SendEvent(events.MangaScanCompleted, nil)
	}()

	return h.RespondWithData(c, true)
}

// HandleGetMangaScanResult
//
//	@summary returns the cached result of the last manga directory scan.
//	@route /api/v1/manga/scan/result [GET]
//	@returns manga.MangaScanResult
func (h *Handler) HandleGetMangaScanResult(c echo.Context) error {
	mangaScanResultMu.RLock()
	defer mangaScanResultMu.RUnlock()

	if mangaScanResultCache == nil {
		return h.RespondWithData(c, &manga.MangaScanResult{
			ScannedFolders: []manga.MangaScanFolder{},
		})
	}

	return h.RespondWithData(c, mangaScanResultCache)
}

// HandleSuggestMangaScanMatches
//
//	@summary returns the AniList entries a folder name might refer to, best first.
//	@desc Searches AniList the same way the scan does — the whole name first, then the name with the
//	@desc release furniture removed, then each side of its separators, then its opening words, and
//	@desc finally the alternative titles the manga provider lists for it.
//	@desc Used by the Link dialog so a folder opens with candidates already found.
//	@route /api/v1/manga/scan/suggest [POST]
//	@returns []manga.MangaScanCandidate
func (h *Handler) HandleSuggestMangaScanMatches(c echo.Context) error {
	type body struct {
		Title string `json:"title"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Title == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "title is required"))
	}

	candidates, err := manga.SuggestMangaMatches(c.Request().Context(), b.Title, h.App.Logger)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, candidates)
}

// HandleResolveMangaScanReview
//
//	@summary applies the decisions made about a scan's proposed matches.
//	@desc Accepting a proposal links the folder to the AniList entry and removes the local series it
//	@desc was standing in as. Dismissing one leaves the folder exactly as it is.
//	@desc The media ID may be any of the candidates the scan offered for that folder, not only the
//	@desc one it proposed.
//	@route /api/v1/manga/scan/review [POST]
//	@returns manga.MangaScanReviewResult
func (h *Handler) HandleResolveMangaScanReview(c echo.Context) error {
	type body struct {
		Decisions []manga.MangaScanReviewDecision `json:"decisions"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	if len(b.Decisions) == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "decisions are required"))
	}

	// The candidate the scan offered is what the card will show, so it travels with the decision and
	// is taken from the server's own result rather than from the request — a title and a cover the
	// caller made up would be stored as if the series had said them itself.
	mangaScanResultMu.RLock()
	if mangaScanResultCache != nil {
		byFolder := make(map[string]manga.MangaScanFolder, len(mangaScanResultCache.ScannedFolders))
		for _, folder := range mangaScanResultCache.ScannedFolders {
			byFolder[folder.FolderName] = folder
		}
		for i, decision := range b.Decisions {
			b.Decisions[i].Title = ""
			b.Decisions[i].CoverImage = ""
			for _, candidate := range byFolder[decision.FolderName].Candidates {
				if candidate.MediaID == decision.MediaID {
					b.Decisions[i].Title = candidate.Title
					b.Decisions[i].CoverImage = candidate.CoverImage
					break
				}
			}
		}
	}
	mangaScanResultMu.RUnlock()

	result := manga.ApplyMangaScanReview(h.App.MangaRepository.GetDatabase(), b.Decisions)

	// Fold the decisions into the cached scan result, so the review page reflects them without
	// having to scan again — which would be a fresh run of AniList searches to learn what the user
	// just told us.
	decided := make(map[string]manga.MangaScanReviewDecision, len(b.Decisions))
	for _, decision := range b.Decisions {
		decided[decision.FolderName] = decision
	}

	mangaScanResultMu.Lock()
	if mangaScanResultCache != nil {
		for i, folder := range mangaScanResultCache.ScannedFolders {
			decision, ok := decided[folder.FolderName]
			if !ok || folder.Status != manga.ScanStatusPendingReview {
				continue
			}

			mangaScanResultCache.PendingReviewCount--
			mangaScanResultCache.ScannedFolders[i].Candidates = nil

			if decision.Accept && decision.MediaID > 0 {
				mangaScanResultCache.ScannedFolders[i].Status = manga.ScanStatusMatched
				mangaScanResultCache.ScannedFolders[i].MatchedMediaID = decision.MediaID
				mangaScanResultCache.ScannedFolders[i].IsSynthetic = false
				// The title and cover already on the row belong to whichever candidate was chosen.
				for _, candidate := range folder.Candidates {
					if candidate.MediaID == decision.MediaID {
						mangaScanResultCache.ScannedFolders[i].MatchedTitle = candidate.Title
						mangaScanResultCache.ScannedFolders[i].MatchedImage = candidate.CoverImage
						mangaScanResultCache.ScannedFolders[i].Confidence = candidate.Confidence
						break
					}
				}
				mangaScanResultCache.MatchedCount++
			} else {
				mangaScanResultCache.ScannedFolders[i].Status = manga.ScanStatusUnmatched
				mangaScanResultCache.ScannedFolders[i].MatchedTitle = ""
				mangaScanResultCache.ScannedFolders[i].MatchedImage = ""
				mangaScanResultCache.ScannedFolders[i].Confidence = 0
				mangaScanResultCache.ScannedFolders[i].IsSynthetic = true
				// Back to being its own series — the row points at the local entry again, not at
				// the AniList one that was proposed and turned down.
				mangaScanResultCache.ScannedFolders[i].MatchedMediaID = 0
				if synthetic, found := h.App.MangaRepository.GetDatabase().
					GetSyntheticMangaByProviderID("local", folder.FolderName); found && synthetic != nil {
					mangaScanResultCache.ScannedFolders[i].MatchedMediaID = synthetic.SyntheticID
				}
				mangaScanResultCache.UnmatchedCount++
			}
		}
	}
	mangaScanResultMu.Unlock()

	return h.RespondWithData(c, result)
}

// HandleMangaScanManualLink
//
//	@summary manually links an unmatched manga folder to an AniList manga ID.
//	@desc Creates a MangaMapping for the folder and removes any existing SyntheticManga entry.
//	@route /api/v1/manga/scan/link [POST]
//	@returns bool
func (h *Handler) HandleMangaScanManualLink(c echo.Context) error {
	type body struct {
		FolderName string `json:"folderName"`
		MediaID    int    `json:"mediaId"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.FolderName == "" || b.MediaID <= 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "folderName and mediaId are required"))
	}

	db := h.App.MangaRepository.GetDatabase()

	// Check if a synthetic entry exists for this folder and remove it
	existing, found := db.GetSyntheticMangaByProviderID("local", b.FolderName)
	if found && existing != nil {
		_ = db.DeleteSyntheticManga(existing.SyntheticID)
	}

	// Create the mapping
	err := db.InsertMangaMapping("local", b.MediaID, b.FolderName)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Update the cached scan result if available
	mangaScanResultMu.Lock()
	if mangaScanResultCache != nil {
		for i, f := range mangaScanResultCache.ScannedFolders {
			if f.FolderName == b.FolderName {
				mangaScanResultCache.ScannedFolders[i].Status = "matched"
				mangaScanResultCache.ScannedFolders[i].MatchedMediaID = b.MediaID
				mangaScanResultCache.ScannedFolders[i].IsSynthetic = false
				mangaScanResultCache.ScannedFolders[i].Confidence = 1.0
				mangaScanResultCache.UnmatchedCount--
				mangaScanResultCache.MatchedCount++
				break
			}
		}
	}
	mangaScanResultMu.Unlock()

	return h.RespondWithData(c, true)
}
