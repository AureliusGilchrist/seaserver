package handlers

import (
	"context"
	"errors"
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/customsource"
	"seanime/internal/database/db_bridge"
	"seanime/internal/library/anime"
	"seanime/internal/platforms/anilist_platform"
	"seanime/internal/torrentstream"
	"seanime/internal/util"
	"seanime/internal/util/result"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleGetLibraryCollection
//
//	@summary returns the main local anime collection.
//	@desc This creates a new LibraryCollection struct and returns it.
//	@desc This is used to get the main anime collection of the user.
//	@desc It uses the cached Anilist anime collection for the GET method.
//	@desc It refreshes the AniList anime collection if the POST method is used.
//	@route /api/v1/library/collection [GET,POST]
//	@returns anime.LibraryCollection
func (h *Handler) HandleGetLibraryCollection(c echo.Context) error {

	profileID := h.GetProfileID(c)

	// Light mode: return only the profile's AniList lists (no local files, no planning slut).
	// The frontend fetches this first for instant rendering, then fetches full data lazily.
	if c.QueryParam("light") == "true" {
		var animeCollection *anilist.AnimeCollection
		var err error
		if profileID > 0 {
			animeCollection, err = h.App.AnilistClientManager.GetAnimeCollection(profileID)
			if err != nil || animeCollection == nil {
				return h.RespondWithData(c, &anime.LibraryCollection{})
			}
		} else {
			animeCollection, err = h.App.GetAnimeCollection(false)
			if err != nil {
				return h.RespondWithError(c, err)
			}
		}

		// NOTE: Light mode intentionally does NOT merge planning slut's collection.
		// Light mode has no local files to filter by, so merging would surface
		// every entry from the planning slut as unwanted planning list entries.
		// The planning slut merge only happens in full mode where local files
		// provide the filter.
		lc := anime.NewLightLibraryCollection(animeCollection)

		if lc.Stats != nil {
			lc.Stats.TotalSize = util.Bytes(h.App.TotalLibrarySize)
		}
		return h.RespondWithData(c, lc)
	}

	var animeCollection *anilist.AnimeCollection
	var err error

	if profileID > 0 {
		animeCollection, err = h.App.AnilistClientManager.GetAnimeCollection(profileID)
		if err != nil || animeCollection == nil {
			return h.RespondWithData(c, &anime.LibraryCollection{})
		}
	} else {
		animeCollection, err = h.App.GetAnimeCollection(false)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	if animeCollection == nil {
		return h.RespondWithData(c, &anime.LibraryCollection{})
	}

	// Copy the anime collection so that PS and Nakama mutations don't corrupt
	// the AnilistClientManager's cached pointer.
	animeCollection = animeCollection.Copy()

	var lfs []*anime.LocalFile
	// If using Nakama's library, fetch it
	nakamaLibrary, fromNakama := h.App.NakamaManager.GetHostAnimeLibrary(c.Request().Context())
	if fromNakama {
		lfs = nakamaLibrary.LocalFiles

		userMediaIds := make(map[int]struct{})
		userCustomSourceMedia := make(map[string]map[int]struct{})
		for _, list := range animeCollection.MediaListCollection.GetLists() {
			for _, entry := range list.GetEntries() {
				mId := entry.GetMedia().GetID()
				userMediaIds[mId] = struct{}{}

				if customsource.IsExtensionId(mId) {
					_, localId := customsource.ExtractExtensionData(mId)
					extensionId, ok := customsource.GetCustomSourceExtensionIdFromSiteUrl(entry.GetMedia().GetSiteURL())
					if !ok {
						continue
					}
					if _, ok := userCustomSourceMedia[extensionId]; !ok {
						userCustomSourceMedia[extensionId] = make(map[int]struct{})
					}
					userCustomSourceMedia[extensionId][localId] = struct{}{}
				}
			}
		}

		nakamaCustomSourceMediaIds := make(map[int]struct{})
		for _, lf := range lfs {
			if lf.MediaId > 0 {
				if customsource.IsExtensionId(lf.MediaId) {
					nakamaCustomSourceMediaIds[lf.MediaId] = struct{}{}
				}
			}
		}

		userMissingAnilistMediaIds := make(map[int]struct{})
		for _, lf := range lfs {
			if lf.MediaId > 0 {
				if customsource.IsExtensionId(lf.MediaId) {
					continue
				}
				if _, ok := userMediaIds[lf.MediaId]; !ok {
					userMissingAnilistMediaIds[lf.MediaId] = struct{}{}
				}
			}
		}

		nakamaCustomSourceMedia := make(map[int]*anilist.AnimeListEntry)

		for _, list := range nakamaLibrary.AnimeCollection.MediaListCollection.GetLists() {
			for _, entry := range list.GetEntries() {
				mId := entry.GetMedia().GetID()
				if _, ok := userMissingAnilistMediaIds[mId]; ok {
					newEntry := &anilist.AnimeListEntry{
						ID:     entry.GetID(),
						Media:  entry.GetMedia(),
						Status: &[]anilist.MediaListStatus{anilist.MediaListStatusPlanning}[0],
					}
					animeCollection.MediaListCollection.AddEntryToList(newEntry, anilist.MediaListStatusPlanning)
				}
				if _, ok := nakamaCustomSourceMediaIds[mId]; ok {
					nakamaCustomSourceMedia[mId] = entry
				}
			}
		}

		if len(nakamaCustomSourceMedia) > 0 {
			for mId, entry := range nakamaCustomSourceMedia {
				extensionId, ok := customsource.GetCustomSourceExtensionIdFromSiteUrl(entry.GetMedia().GetSiteURL())
				if !ok {
					continue
				}

				_, localId := customsource.ExtractExtensionData(mId)

				customSource, ok := h.App.ExtensionRepository.GetCustomSourceExtensionByID(extensionId)
				if !ok {
					continue
				}

				newId := customsource.GenerateMediaId(customSource.GetExtensionIdentifier(), localId)
				entry.GetMedia().ID = newId

				if _, ok := userCustomSourceMedia[extensionId][localId]; !ok {
					newEntry := &anilist.AnimeListEntry{
						ID:     entry.GetID(),
						Media:  entry.GetMedia(),
						Status: &[]anilist.MediaListStatus{anilist.MediaListStatusPlanning}[0],
					}
					animeCollection.MediaListCollection.AddEntryToList(newEntry, anilist.MediaListStatusPlanning)
				}

				for _, lf := range lfs {
					if lf.MediaId == mId {
						lf.MediaId = newId
						break
					}
				}
			}
		}

	} else {
		lfs, _, err = db_bridge.GetLocalFiles(h.App.Database)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	// Merge planning slut's collection as the base.
	// Only merge entries whose media ID matches a local file so metadata (title, images) is available.
	var sharedOnlyAnimeIDs map[int]struct{}
	if psCollection, psErr := h.getPlanningSlutAnimeCollectionCached(context.Background(), false); psErr == nil && psCollection != nil {
		localFileMediaIDs := make(map[int]struct{})
		for _, lf := range lfs {
			if lf.MediaId > 0 {
				localFileMediaIDs[lf.MediaId] = struct{}{}
			}
		}
		sharedOnlyAnimeIDs = mergePlanningSlutAnimeCollection(animeCollection, psCollection, localFileMediaIDs)
	}

	// Use a background context so that browser refresh/navigation doesn't cancel
	// in-flight AniList API requests (which would cause "context canceled" errors).
	libraryCollection, err := anime.NewLibraryCollection(context.Background(), &anime.NewLibraryCollectionOptions{
		AnimeCollection:     animeCollection,
		PlatformRef:         h.App.AnilistPlatformRef,
		LocalFiles:          lfs,
		MetadataProviderRef: h.App.MetadataProviderRef,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Move PS-only entries from PLANNING into the LOCAL list so they appear
	// as local files with metadata, not as planning list entries.
	if len(sharedOnlyAnimeIDs) > 0 {
		relocatePlanningSlutEntriesToLocal(libraryCollection, sharedOnlyAnimeIDs)
	}



	if !fromNakama {
		if (h.App.SecondarySettings.Torrentstream != nil && h.App.SecondarySettings.Torrentstream.Enabled && h.App.SecondarySettings.Torrentstream.IncludeInLibrary) ||
			(h.App.Settings.GetLibrary() != nil && h.App.Settings.GetLibrary().EnableOnlinestream && h.App.Settings.GetLibrary().IncludeOnlineStreamingInLibrary) ||
			(h.App.SecondarySettings.Debrid != nil && h.App.SecondarySettings.Debrid.Enabled && h.App.SecondarySettings.Debrid.IncludeDebridStreamInLibrary) {
			h.App.TorrentstreamRepository.HydrateStreamCollection(&torrentstream.HydrateStreamCollectionOptions{
				AnimeCollection:     animeCollection,
				LibraryCollection:   libraryCollection,
				MetadataProviderRef: h.App.MetadataProviderRef,
			})
		}
	}

	// Add and remove necessary metadata when hydrating from Nakama
	if fromNakama {
		for _, ep := range libraryCollection.ContinueWatchingList {
			ep.IsNakamaEpisode = true
		}
		for _, list := range libraryCollection.Lists {
			for _, entry := range list.Entries {
				if entry.EntryLibraryData == nil {
					continue
				}
				entry.NakamaEntryLibraryData = &anime.NakamaEntryLibraryData{
					UnwatchedCount: entry.EntryLibraryData.UnwatchedCount,
					MainFileCount:  entry.EntryLibraryData.MainFileCount,
				}
				entry.EntryLibraryData = nil
			}
		}
	}

	// Hydrate total library size
	if libraryCollection != nil && libraryCollection.Stats != nil {
		libraryCollection.Stats.TotalSize = util.Bytes(h.App.TotalLibrarySize)
	}

	return h.RespondWithData(c, libraryCollection)
}

//----------------------------------------------------------------------------------------------------------------------------------------------------

var animeScheduleCache = result.NewCache[int, []*anime.ScheduleItem]()

// HandleGetAnimeCollectionSchedule
//
//	@summary returns anime collection schedule
//	@desc This is used by the "Schedule" page to display the anime schedule.
//	@route /api/v1/library/schedule [GET]
//	@returns []anime.ScheduleItem
func (h *Handler) HandleGetAnimeCollectionSchedule(c echo.Context) error {

	// Invalidate the cache when the Anilist collection is refreshed
	h.App.AddOnRefreshAnilistCollectionFunc("HandleGetAnimeCollectionSchedule", func() {
		animeScheduleCache.Clear()
	})

	if ret, ok := animeScheduleCache.Get(1); ok {
		return h.RespondWithData(c, ret)
	}

	animeSchedule, err := h.App.AnilistPlatformRef.Get().GetAnimeAiringSchedule(c.Request().Context())
	if err != nil {
		return h.RespondWithError(c, err)
	}

	animeCollection, err := h.App.GetAnimeCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	ret := anime.GetScheduleItems(animeSchedule, animeCollection)

	animeScheduleCache.SetT(1, ret, 1*time.Hour)

	return h.RespondWithData(c, ret)
}

// HandleAddUnknownMedia
//
//	@summary adds the given media to the user's AniList planning collections
//	@desc Since media not found in the user's AniList collection are not displayed in the library, this route is used to add them.
//	@desc The response is ignored in the frontend, the client should just refetch the entire library collection.
//	@route /api/v1/library/unknown-media [POST]
//	@returns anilist.AnimeCollection
func (h *Handler) HandleAddUnknownMedia(c echo.Context) error {

	type body struct {
		MediaIds []int `json:"mediaIds"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Add non-added media entries to planning slut's AniList collection (the shared base)
	if err := h.addMediaToPlanningSlutBatch(c.Request().Context(), b.MediaIds); err != nil {
		return h.RespondWithError(c, errors.New("error: Anilist responded with an error, this is most likely a rate limit issue"))
	}

	// Invalidate planning slut collection cache so the newly added entries are visible
	invalidatePlanningSlutCollectionCaches()

	// Bypass the cache and refresh the admin collection
	animeCollection, err := h.App.GetAnimeCollection(true)
	if err != nil {
		return h.RespondWithError(c, errors.New("error: Anilist responded with an error, wait one minute before refreshing"))
	}

	// IMPORTANT: Force hydration of the newly added media with original AniList names
	// This ensures that media not in the user's collection gets properly hydrated
	for _, mediaId := range b.MediaIds {
		// Clear any cached media to force fresh fetch from AniList
		if h.App.AnilistPlatformRef.Get().GetAnilistClient() != nil {
			// Clear the cache first to ensure fresh data
			// Access the helper through type assertion to AnilistPlatform
			if anilistPlatform, ok := h.App.AnilistPlatformRef.Get().(*anilist_platform.AnilistPlatform); ok {
				anilistPlatform.GetHelper().ClearBaseAnimeCache(mediaId)
			}
			
			// Force fetch fresh media data from AniList to ensure original names are hydrated
			_, err := h.App.AnilistPlatformRef.Get().GetAnime(c.Request().Context(), mediaId)
			if err != nil {
				h.App.Logger.Warn().Err(err).Int("mediaId", mediaId).Msg("Failed to hydrate media after adding to collection")
			}
		}
	}

	// Force another collection refresh to pick up the hydrated media
	animeCollection, err = h.App.GetAnimeCollection(true)
	if err != nil {
		return h.RespondWithError(c, errors.New("error: Anilist responded with an error, wait one minute before refreshing"))
	}

	return h.RespondWithData(c, animeCollection)

}

//----------------------------------------------------------------------------------------------------------------------
// Anime metadata hydration
//----------------------------------------------------------------------------------------------------------------------

type AnimeHydrationDetail struct {
	Timestamp time.Time `json:"timestamp"`
	MediaID   int       `json:"mediaId"`
	Title     string    `json:"title"`
	Action    string    `json:"action"`
	Message   string    `json:"message,omitempty"`
}

type AnimeHydrationStatus struct {
	IsRunning       bool                   `json:"isRunning"`
	CancelRequested bool                   `json:"cancelRequested"`
	WasCancelled    bool                   `json:"wasCancelled"`
	Total           int                    `json:"total"`
	Processed       int                    `json:"processed"`
	Hydrated        int                    `json:"hydrated"`
	Skipped         int                    `json:"skipped"`
	Failed          int                    `json:"failed"`
	Progress        float64                `json:"progress"`
	StartedAt       *time.Time             `json:"startedAt,omitempty"`
	FinishedAt      *time.Time             `json:"finishedAt,omitempty"`
	LastUpdatedAt   *time.Time             `json:"lastUpdatedAt,omitempty"`
	Details         []AnimeHydrationDetail `json:"details"`
}

var (
	animeHydrationMu sync.RWMutex
	animeHydration   = AnimeHydrationStatus{Details: make([]AnimeHydrationDetail, 0)}
)

func setAnimeHydrationStatus(status AnimeHydrationStatus) {
	animeHydrationMu.Lock()
	defer animeHydrationMu.Unlock()
	if status.Details == nil {
		status.Details = make([]AnimeHydrationDetail, 0)
	}
	animeHydration = status
}

func updateAnimeHydrationStatus(update func(*AnimeHydrationStatus)) {
	animeHydrationMu.Lock()
	defer animeHydrationMu.Unlock()
	update(&animeHydration)
}

func getAnimeHydrationStatusSnapshot() AnimeHydrationStatus {
	animeHydrationMu.RLock()
	defer animeHydrationMu.RUnlock()
	copyDetails := make([]AnimeHydrationDetail, len(animeHydration.Details))
	copy(copyDetails, animeHydration.Details)
	ret := animeHydration
	ret.Details = copyDetails
	return ret
}

func isAnimeHydrationCancelled() bool {
	animeHydrationMu.RLock()
	defer animeHydrationMu.RUnlock()
	return animeHydration.CancelRequested
}

func appendAnimeHydrationDetail(status *AnimeHydrationStatus, detail AnimeHydrationDetail) {
	status.Details = append(status.Details, detail)
	if len(status.Details) > 100 {
		status.Details = status.Details[len(status.Details)-100:]
	}
}

func updateAnimeHydrationProgress(status *AnimeHydrationStatus) {
	if status.Total <= 0 {
		status.Progress = 0
		return
	}
	status.Progress = (float64(status.Processed) / float64(status.Total)) * 100
	if status.Progress > 100 {
		status.Progress = 100
	}
}

// HandleHydrateAllAnime
//
//	@summary hydrates all anime entries by re-fetching metadata from AniList for every unique media ID in local files.
//	@route /api/v1/library/hydrate-all [POST]
//	@returns bool
func (h *Handler) HandleHydrateAllAnime(c echo.Context) error {
	current := getAnimeHydrationStatusSnapshot()
	if current.IsRunning {
		return h.RespondWithData(c, true)
	}

	now := time.Now()
	setAnimeHydrationStatus(AnimeHydrationStatus{
		IsRunning:     true,
		StartedAt:     &now,
		LastUpdatedAt: &now,
		Details:       make([]AnimeHydrationDetail, 0),
	})

	go h.runAnimeHydrationJob()

	return h.RespondWithData(c, true)
}

// HandleCancelAnimeHydration
//
//	@summary requests cancellation for anime metadata hydration.
//	@route /api/v1/library/hydrate-all/cancel [POST]
//	@returns bool
func (h *Handler) HandleCancelAnimeHydration(c echo.Context) error {
	updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
		if !s.IsRunning {
			return
		}
		now := time.Now()
		s.CancelRequested = true
		s.LastUpdatedAt = &now
		appendAnimeHydrationDetail(s, AnimeHydrationDetail{Timestamp: now, Action: "cancelled", Message: "cancellation requested"})
	})
	return h.RespondWithData(c, true)
}

// HandleGetAnimeHydrationStatus
//
//	@summary returns metadata hydration progress for anime.
//	@route /api/v1/library/hydrate-all/status [GET]
//	@returns handlers.AnimeHydrationStatus
func (h *Handler) HandleGetAnimeHydrationStatus(c echo.Context) error {
	return h.RespondWithData(c, getAnimeHydrationStatusSnapshot())
}

func (h *Handler) runAnimeHydrationJob() {
	defer func() {
		if r := recover(); r != nil {
			updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
				now := time.Now()
				s.IsRunning = false
				s.Failed++
				s.FinishedAt = &now
				s.LastUpdatedAt = &now
				appendAnimeHydrationDetail(s, AnimeHydrationDetail{Timestamp: now, Action: "failed", Message: "panic recovered during hydration"})
			})
		}
	}()

	// Get local files from DB — NOT from any planning slut or AniList collection
	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
			now := time.Now()
			s.IsRunning = false
			s.Failed++
			s.FinishedAt = &now
			s.LastUpdatedAt = &now
			appendAnimeHydrationDetail(s, AnimeHydrationDetail{Timestamp: now, Action: "failed", Message: err.Error()})
		})
		return
	}

	// Collect unique media IDs from local files
	seen := make(map[int]struct{})
	var mediaIDs []int
	for _, lf := range lfs {
		if lf.MediaId <= 0 {
			continue
		}
		if _, ok := seen[lf.MediaId]; ok {
			continue
		}
		seen[lf.MediaId] = struct{}{}
		mediaIDs = append(mediaIDs, lf.MediaId)
	}

	updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
		now := time.Now()
		s.Total = len(mediaIDs)
		s.LastUpdatedAt = &now
	})

	for _, mID := range mediaIDs {
		if isAnimeHydrationCancelled() {
			updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
				now := time.Now()
				s.IsRunning = false
				s.WasCancelled = true
				s.FinishedAt = &now
				s.LastUpdatedAt = &now
				appendAnimeHydrationDetail(s, AnimeHydrationDetail{Timestamp: now, Action: "cancelled", Message: "hydration cancelled"})
			})
			return
		}

		// Use cache-first: GetAnime returns cached data if available,
		// otherwise fetches fresh from AniList.
		media, fetchErr := h.App.AnilistPlatformRef.Get().GetAnime(context.Background(), mID)
		if fetchErr != nil {
			updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
				s.Processed++
				s.Failed++
				updateAnimeHydrationProgress(s)
				now := time.Now()
				s.LastUpdatedAt = &now
				appendAnimeHydrationDetail(s, AnimeHydrationDetail{Timestamp: now, MediaID: mID, Action: "failed", Message: fetchErr.Error()})
			})
			h.App.Logger.Warn().Err(fetchErr).Int("mediaId", mID).Msg("anime: failed to hydrate AniList anime")
			continue
		}

		title := ""
		if media != nil {
			title = media.GetTitleSafe()
		}

		updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
			s.Processed++
			s.Hydrated++
			updateAnimeHydrationProgress(s)
			now := time.Now()
			s.LastUpdatedAt = &now
			appendAnimeHydrationDetail(s, AnimeHydrationDetail{Timestamp: now, MediaID: mID, Title: title, Action: "hydrated"})
		})
	}

	// After hydrating metadata, add any media IDs that aren't already in the planning
	// slut's AniList collection to its planning list so they persist across refreshes.
	animeCollection, collErr := h.getPlanningSlutAnimeCollectionCached(context.Background(), true)
	if collErr == nil && animeCollection != nil {
		collectionMediaIds := make(map[int]struct{})
		for _, list := range animeCollection.GetMediaListCollection().GetLists() {
			for _, entry := range list.GetEntries() {
				collectionMediaIds[entry.GetMedia().GetID()] = struct{}{}
			}
		}

		var missingIDs []int
		for _, mID := range mediaIDs {
			if _, ok := collectionMediaIds[mID]; !ok {
				missingIDs = append(missingIDs, mID)
			}
		}

		if len(missingIDs) > 0 {
			updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
				now := time.Now()
				s.LastUpdatedAt = &now
				appendAnimeHydrationDetail(s, AnimeHydrationDetail{
					Timestamp: now,
					Action:    "hydrated",
					Message:   fmt.Sprintf("adding %d entries to AniList planning list", len(missingIDs)),
				})
			})

			if addErr := h.addMediaToPlanningSlutBatch(context.Background(), missingIDs); addErr != nil {
				h.App.Logger.Warn().Err(addErr).Msg("anime: failed to add hydrated media to planning slut collection")
			}
		}
	}

	// Invalidate planning slut collection caches so the newly added entries are picked up
	invalidatePlanningSlutCollectionCaches()

	updateAnimeHydrationStatus(func(s *AnimeHydrationStatus) {
		now := time.Now()
		s.IsRunning = false
		s.FinishedAt = &now
		s.LastUpdatedAt = &now
		appendAnimeHydrationDetail(s, AnimeHydrationDetail{Timestamp: now, Action: "completed", Message: "hydration finished"})
	})
}
