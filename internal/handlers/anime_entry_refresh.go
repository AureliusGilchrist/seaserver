package handlers

import (
	"errors"
	"seanime/internal/library/anime"
	"seanime/internal/platforms/anilist_platform"

	"github.com/labstack/echo/v4"
)

// HandleRefreshAnimeEntryStats
//
//	@summary rebuilds everything the server knows about one anime entry.
//	@desc Deep cleans every cache keyed to the media ID (episode metadata, AniList media
//	@desc objects in memory/disk/SQLite, episode collections, online streaming episode lists,
//	@desc filler data, missing-episode summary) and then refetches the AniList collection, so
//	@desc the entry's library stats — file counts, progress, episode counts, status — are
//	@desc rebuilt from source. User data is left untouched.
//	@route /api/v1/library/anime-entry/refresh-stats [POST]
//	@returns bool
func (h *Handler) HandleRefreshAnimeEntryStats(c echo.Context) error {
	type body struct {
		MediaId int `json:"mediaId"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.MediaId == 0 {
		return h.RespondWithError(c, errors.New("mediaId is required"))
	}

	h.deepCleanAnimeEntry(b.MediaId, h.GetProfileID(c))

	// Refetch the collection itself: the entry's list data (progress, status, score) and the
	// counts derived from it come from there, not from the caches cleared above.
	if _, err := h.App.RefreshAnimeCollection(); err != nil {
		h.App.Logger.Warn().Err(err).Int("mediaId", b.MediaId).Msg("handlers: Failed to refresh the anime collection during entry refresh")
	}

	return h.RespondWithData(c, true)
}

// deepCleanAnimeEntry throws away every cached, derived or stale piece of data the server holds
// for one anime, so the next request rebuilds all of it from source.
//
// "Reset metadata" used to clear three caches, which left the entry looking unchanged whenever
// the stale copy lived somewhere else — the disk/SQLite AniList caches, the episode collection,
// the online-streaming episode lists or the missing-episode summary. Anything keyed by media ID
// that the server can rebuild on its own belongs here; user data (list progress, overrides,
// watch history, favourites) deliberately does not.
func (h *Handler) deepCleanAnimeEntry(mediaId int, profileID uint) {
	if mediaId == 0 {
		return
	}

	// Episode metadata (Animap/AniZip), in-memory and on disk.
	if h.App.MetadataProviderRef != nil && h.App.MetadataProviderRef.IsPresent() {
		h.App.MetadataProviderRef.Get().ClearCacheForMedia(mediaId)
	}

	// Cached AniList media objects (episode count, status, nextAiringEpisode, relations),
	// across the in-memory, file and SQLite caches.
	if h.App.AnilistPlatformRef != nil && h.App.AnilistPlatformRef.IsPresent() {
		if anilistPlatform, ok := h.App.AnilistPlatformRef.Get().(*anilist_platform.AnilistPlatform); ok {
			anilistPlatform.ClearMediaCache(mediaId)
		}
	}

	// Built episode lists (both the metadata-derived one and the local-files one).
	anime.ClearEpisodeCollectionCacheForMedia(mediaId)

	// Online streaming episode lists for every provider.
	if h.App.OnlinestreamRepository != nil {
		if err := h.App.OnlinestreamRepository.EmptyCache(mediaId); err != nil {
			h.App.Logger.Debug().Err(err).Int("mediaId", mediaId).Msg("handlers: Failed to empty onlinestream cache during deep refresh")
		}
	}

	// Filler data, so it is re-scraped on the next load.
	if h.App.FillerManager != nil {
		if err := h.App.FillerManager.RemoveFillerData(mediaId); err != nil {
			h.App.Logger.Debug().Err(err).Int("mediaId", mediaId).Msg("handlers: Failed to remove filler data during deep refresh")
		}
	}

	// The library-wide missing episode summary is derived from all of the above.
	missingEpisodesCache = nil

	// The user's collection entry can also be stale (progress, status, episode count).
	if profileID > 0 && h.App.AnilistClientManager != nil {
		h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
	}

	h.App.Logger.Info().Int("mediaId", mediaId).Msg("handlers: Deep refreshed anime entry")
}
