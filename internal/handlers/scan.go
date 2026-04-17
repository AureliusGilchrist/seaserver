package handlers

import (
	"errors"
	"seanime/internal/achievement"
	"seanime/internal/database/db_bridge"
	"seanime/internal/database/models"
	"seanime/internal/library/scanner"
	"seanime/internal/library/summary"

	"github.com/labstack/echo/v4"
)

// HandleScanLocalFiles
//
//	@summary scans the user's library.
//	@desc This will scan the user's library.
//	@desc The response is ignored, the client should re-fetch the library after this.
//	@route /api/v1/library/scan [POST]
//	@returns []anime.LocalFile
func (h *Handler) HandleScanLocalFiles(c echo.Context) error {

	type body struct {
		Enhanced         bool `json:"enhanced"`
		SkipLockedFiles  bool `json:"skipLockedFiles"`
		SkipIgnoredFiles bool `json:"skipIgnoredFiles"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Retrieve the user's library path
	libraryPath, err := h.App.Database.GetLibraryPathFromSettings()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	additionalLibraryPaths, err := h.App.Database.GetAdditionalLibraryPathsFromSettings()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Get the latest local files
	existingLfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Get the latest shelved local files
	existingShelvedLfs, err := db_bridge.GetShelvedLocalFiles(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// +---------------------+
	// |       Scanner       |
	// +---------------------+

	// Create scan summary logger
	scanSummaryLogger := summary.NewScanSummaryLogger()

	// Create a new scan logger
	scanLogger, err := scanner.NewScanLogger(h.App.Config.Logs.Dir)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	defer scanLogger.Done()

	// Create a new scanner
	sc := scanner.Scanner{
		DirPath:              libraryPath,
		OtherDirPaths:        additionalLibraryPaths,
		Enhanced:             b.Enhanced,
		PlatformRef:          h.App.AnilistPlatformRef,
		Logger:               h.App.Logger,
		WSEventManager:       h.App.WSEventManager,
		ExistingLocalFiles:   existingLfs,
		SkipLockedFiles:      true, // Always skip locked files to protect manual matches
		SkipIgnoredFiles:     b.SkipIgnoredFiles,
		ScanSummaryLogger:    scanSummaryLogger,
		ScanLogger:           scanLogger,
		MetadataProviderRef:  h.App.MetadataProviderRef,
		MatchingAlgorithm:    h.App.Settings.GetLibrary().ScannerMatchingAlgorithm,
		MatchingThreshold:    h.App.Settings.GetLibrary().ScannerMatchingThreshold,
		WithShelving:         true,
		ExistingShelvedFiles: existingShelvedLfs,
	}

	// Scan the library
	allLfs, err := sc.Scan(c.Request().Context())
	if err != nil {
		if errors.Is(err, scanner.ErrNoLocalFiles) {
			return h.RespondWithData(c, []interface{}{})
		} else {
			return h.RespondWithError(c, err)
		}
	}

	// Race condition guard: re-read current DB state to preserve any manual matches
	// made while this scan was running. Locked files in DB always take priority.
	db_bridge.ClearLocalFilesCache()
	freshDbLfs, _, _ := db_bridge.GetLocalFiles(h.App.Database)
	if len(freshDbLfs) > 0 {
		// Build a lookup of scan results by normalized path
		scanResultPaths := make(map[string]int, len(allLfs))
		for i, lf := range allLfs {
			scanResultPaths[lf.GetNormalizedPath()] = i
		}
		// For each locked file in the fresh DB state, ensure it survives in scan results
		for _, dbLf := range freshDbLfs {
			if dbLf.IsLocked() && dbLf.MediaId != 0 {
				npath := dbLf.GetNormalizedPath()
				if idx, exists := scanResultPaths[npath]; exists {
					// Replace scan result with the locked DB version
					allLfs[idx] = dbLf
				} else {
					// Locked file wasn't in scan — add it back
					allLfs = append(allLfs, dbLf)
				}
			}
		}
	}

	// Insert the local files
	lfs, err := db_bridge.InsertLocalFiles(h.App.Database, allLfs)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Save the shelved local files
	err = db_bridge.SaveShelvedLocalFiles(h.App.Database, sc.GetShelvedLocalFiles())
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Save the scan summary
	_ = db_bridge.InsertScanSummary(h.App.Database, scanSummaryLogger.GenerateSummary())

	go h.App.AutoDownloader.CleanUpDownloadedItems()

	// Fire achievement event for library scan completion
	go h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
		ProfileID: h.GetProfileID(c),
		Trigger:   achievement.TriggerPlatformEvent,
		Metadata: map[string]interface{}{
			"action":     "library_scan",
			"file_count": len(lfs),
		},
	})

	// Record granular activity event
	go func() {
		pdb := h.GetProfileDatabase(c)
		if pdb != nil {
			_ = pdb.RecordActivityEvent(models.ActivityEventLibraryScanned, 0, map[string]interface{}{
				"fileCount": len(lfs),
			})
		}
	}()

	return h.RespondWithData(c, lfs)

}
