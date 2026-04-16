package handlers

import (
	"errors"
	"seanime/internal/api/anilist"
	"seanime/internal/customsource"
	"seanime/internal/database/db_bridge"
	"seanime/internal/library/anime"
	"seanime/internal/platforms/anilist_platform"
	"seanime/internal/torrentstream"
	"seanime/internal/util"
	"seanime/internal/util/result"
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

	var animeCollection *anilist.AnimeCollection
	var err error

	if profileID > 0 {
		// Non-admin profile: use the manager cache (5-min TTL + singleflight).
		// Multiple concurrent page loads for the same profile collapse into one
		// AniList request instead of each firing their own.
		animeCollection, err = h.App.AnilistClientManager.GetAnimeCollection(profileID)
		if err != nil || animeCollection == nil {
			return h.RespondWithData(c, &anime.LibraryCollection{})
		}
	} else {
		// Admin profile: use global platform (with caching)
		animeCollection, err = h.App.GetAnimeCollection(false)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	if animeCollection == nil {
		return h.RespondWithData(c, &anime.LibraryCollection{})
	}

	// For non-admin profiles: fetch the catalogue (admin/planning-slut) collection so local-file-only
	// items can always be shown even when the profile hasn't personally tracked them.
	var catalogueCollection *anilist.AnimeCollection
	if profileID > 0 {
		catalogueCollection, _ = h.App.GetAnimeCollection(false)
	}

	originalAnimeCollection := animeCollection

	var lfs []*anime.LocalFile
	// If using Nakama's library, fetch it
	nakamaLibrary, fromNakama := h.App.NakamaManager.GetHostAnimeLibrary(c.Request().Context())
	if fromNakama {
		// Save the original anime collection to restore it later
		originalAnimeCollection = animeCollection.Copy()
		lfs = nakamaLibrary.LocalFiles

		// Store all media from the user's collection
		userMediaIds := make(map[int]struct{})
		userCustomSourceMedia := make(map[string]map[int]struct{})
		for _, list := range animeCollection.MediaListCollection.GetLists() {
			for _, entry := range list.GetEntries() {
				mId := entry.GetMedia().GetID()
				userMediaIds[mId] = struct{}{}

				// Add all user custom source media to a map
				// This will be used to avoid duplicates
				if customsource.IsExtensionId(mId) {
					_, localId := customsource.ExtractExtensionData(mId)
					extensionId, ok := customsource.GetCustomSourceExtensionIdFromSiteUrl(entry.GetMedia().GetSiteURL())
					if !ok {
						// couldn't figure out the extension, skip it
						continue
					}
					if _, ok := userCustomSourceMedia[extensionId]; !ok {
						userCustomSourceMedia[extensionId] = make(map[int]struct{})
					}
					userCustomSourceMedia[extensionId][localId] = struct{}{}
				}
			}
		}

		// Store all custom source media from the Nakama host
		nakamaCustomSourceMediaIds := make(map[int]struct{})
		for _, lf := range lfs {
			if lf.MediaId > 0 {
				if customsource.IsExtensionId(lf.MediaId) {
					nakamaCustomSourceMediaIds[lf.MediaId] = struct{}{}
				}
			}
		}

		// Find media entries that are missing from the user's collection
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

		// Add missing AniList entries to the user's collection as "Planning"
		for _, list := range nakamaLibrary.AnimeCollection.MediaListCollection.GetLists() {
			for _, entry := range list.GetEntries() {
				mId := entry.GetMedia().GetID()
				if _, ok := userMissingAnilistMediaIds[mId]; ok {
					// create a new entry with blank list data
					newEntry := &anilist.AnimeListEntry{
						ID:     entry.GetID(),
						Media:  entry.GetMedia(),
						Status: &[]anilist.MediaListStatus{anilist.MediaListStatusPlanning}[0],
					}
					animeCollection.MediaListCollection.AddEntryToList(newEntry, anilist.MediaListStatusPlanning)
				}
				// Check if the media from a custom source
				if _, ok := nakamaCustomSourceMediaIds[mId]; ok {
					nakamaCustomSourceMedia[mId] = entry
				}
			}
		}

		// Add missing custom source entries to the user's collection as "Planning"
		// We'll find the equivalent
		if len(nakamaCustomSourceMedia) > 0 {
			// Go through all custom source media,
			// For each one, find the extension and replace the generated ID
			for mId, entry := range nakamaCustomSourceMedia {
				//extensionIdentifier, localId := customsource.ExtractExtensionData(mId)
				extensionId, ok := customsource.GetCustomSourceExtensionIdFromSiteUrl(entry.GetMedia().GetSiteURL())
				if !ok {
					// couldn't figure out the extension, skip it
					continue
				}

				_, localId := customsource.ExtractExtensionData(mId)

				// Find the same extension, if it's not installed, skip it
				customSource, ok := h.App.ExtensionRepository.GetCustomSourceExtensionByID(extensionId)
				if !ok {
					continue
				}

				// Generate a new ID for the custom source media
				newId := customsource.GenerateMediaId(customSource.GetExtensionIdentifier(), localId)
				entry.GetMedia().ID = newId

				// Add the entry if the user doesn't already have it
				if _, ok := userCustomSourceMedia[extensionId][localId]; !ok {
					newEntry := &anilist.AnimeListEntry{
						ID:     entry.GetID(),
						Media:  entry.GetMedia(),
						Status: &[]anilist.MediaListStatus{anilist.MediaListStatusPlanning}[0],
					}
					animeCollection.MediaListCollection.AddEntryToList(newEntry, anilist.MediaListStatusPlanning)
				}

				// Update the local files
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

	// For profile users: inject local-file-only items from the catalogue so all local files always show.
	// Their EntryListData (planning-slut status/score) is then nulled via hideSharedOnlyAnimeListData.
	sharedOnlyMediaIds := make(map[int]struct{})
	if !fromNakama && profileID > 0 && catalogueCollection != nil {
		localMediaIds := make(map[int]struct{})
		for _, lf := range lfs {
			if lf.MediaId > 0 {
				localMediaIds[lf.MediaId] = struct{}{}
			}
		}
		userTrackedIds := make(map[int]struct{})
		if animeCollection != nil && animeCollection.MediaListCollection != nil {
			for _, list := range animeCollection.MediaListCollection.GetLists() {
				for _, entry := range list.GetEntries() {
					if m := entry.GetMedia(); m != nil {
						userTrackedIds[m.GetID()] = struct{}{}
					}
				}
			}
		}
		localOnlyIds := make(map[int]struct{})
		for id := range localMediaIds {
			if _, tracked := userTrackedIds[id]; !tracked {
				localOnlyIds[id] = struct{}{}
			}
		}
		if len(localOnlyIds) > 0 {
			sharedOnlyMediaIds = mergePlanningSlutAnimeCollection(animeCollection, catalogueCollection, localOnlyIds)
		}
	}

	libraryCollection, err := anime.NewLibraryCollection(c.Request().Context(), &anime.NewLibraryCollectionOptions{
		AnimeCollection:     animeCollection,
		PlatformRef:         h.App.AnilistPlatformRef,
		LocalFiles:          lfs,
		MetadataProviderRef: h.App.MetadataProviderRef,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}
	hideSharedOnlyAnimeListData(libraryCollection, sharedOnlyMediaIds)

	// Restore the original anime collection if it was modified
	if fromNakama {
		*animeCollection = *originalAnimeCollection
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

	// Add non-added media entries to AniList collection
	if err := h.App.AnilistPlatformRef.Get().AddMediaToCollection(c.Request().Context(), b.MediaIds); err != nil {
		return h.RespondWithError(c, errors.New("error: Anilist responded with an error, this is most likely a rate limit issue"))
	}

	// Bypass the cache and refresh the collection
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
