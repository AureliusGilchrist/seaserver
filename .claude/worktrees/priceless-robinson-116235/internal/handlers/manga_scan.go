package handlers

import (
	"context"
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

	// Run scan asynchronously
	go func() {
		defer func() {
			mangaScanResultMu.Lock()
			mangaScanRunning = false
			mangaScanResultMu.Unlock()
		}()

		result, err := manga.ScanMangaDirectories(
			context.Background(),
			localDir,
			downloadDir,
			b.ForceRematch,
			h.App.MangaRepository.GetDatabase(),
			h.App.WSEventManager,
			h.App.Logger,
		)
		if err != nil {
			h.App.Logger.Error().Err(err).Msg("manga-scan: Scan failed")
			return
		}

		mangaScanResultMu.Lock()
		mangaScanResultCache = result
		mangaScanResultMu.Unlock()
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
