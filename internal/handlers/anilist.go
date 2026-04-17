package handlers

import (
	"errors"
	"fmt"
	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/platforms/shared_platform"
	"seanime/internal/util/result"
	"seanime/internal/enmasse"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleGetAnimeCollection
//
//	@summary returns the user's AniList anime collection.
//	@desc Calling GET will return the cached anime collection.
//	@desc The manga collection is also refreshed in the background, and upon completion, a WebSocket event is sent.
//	@desc Calling POST will refetch both the anime and manga collections.
//	@returns anilist.AnimeCollection
//	@route /api/v1/anilist/collection [GET,POST]
func (h *Handler) HandleGetAnimeCollection(c echo.Context) error {

	profileID := h.GetProfileID(c)
	bypassCache := c.Request().Method == "POST"

	if !bypassCache {
		// GET: return cached collection.
		// Profile users use the per-profile manager cache (5-min TTL + singleflight).
		// Admin uses the shared platform cache.
		if profileID > 0 {
			animeCollection, err := h.App.AnilistClientManager.GetAnimeCollection(profileID)
			if err != nil {
				return h.RespondWithError(c, err)
			}
			return h.RespondWithData(c, animeCollection)
		}
		animeCollection, err := h.App.GetAnimeCollection(false)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		return h.RespondWithData(c, animeCollection)
	}

	// POST: force-refresh.
	// For profile users: invalidate + synchronously re-fetch their own collection (so the
	// response has fresh data), AND kick off an async refresh of the planning-slut/admin
	// collection (which drives auto-downloader, scanner, etc.).
	// For admin: sync refresh of the shared collection as before.
	ctx := enmasse.WithUserInitiated(c.Request().Context())

	var animeCollection *anilist.AnimeCollection
	if profileID > 0 {
		// Invalidate the profile cache then fetch fresh.
		h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
		var err error
		animeCollection, err = h.App.AnilistClientManager.GetAnimeCollection(profileID)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		// Async refresh of the planning-slut/shared collection.
		go func() {
			_, _ = h.App.RefreshAnimeCollectionWithCtx(ctx)
			_, _ = h.App.RefreshMangaCollectionWithCtx(ctx)
		}()
	} else {
		var err error
		animeCollection, err = h.App.RefreshAnimeCollectionWithCtx(ctx)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		go func() {
			_, _ = h.App.RefreshMangaCollectionWithCtx(ctx)
		}()
	}

	// Evaluate collection-based achievements using the per-profile collection.
	if profileID > 0 {
		go func() {
			profileMangaCol, mangaErr := h.App.AnilistClientManager.GetMangaCollection(profileID)
			var mangaCol *anilist.MangaCollection
			if mangaErr == nil {
				mangaCol = profileMangaCol
			}
			stats := buildCollectionStats(animeCollection, mangaCol)
			h.App.AchievementEngine.EvaluateCollectionStats(profileID, stats)
		}()
	}

	return h.RespondWithData(c, animeCollection)
}

// HandleGetRawAnimeCollection
//
//	@summary returns the user's AniList anime collection without filtering out custom lists.
//	@desc Calling GET will return the cached anime collection.
//	@returns anilist.AnimeCollection
//	@route /api/v1/anilist/collection/raw [GET,POST]
func (h *Handler) HandleGetRawAnimeCollection(c echo.Context) error {

	bypassCache := c.Request().Method == "POST"

	// Get the user's anilist collection
	ctx := enmasse.WithUserInitiated(c.Request().Context())
	animeCollection, err := h.App.GetRawAnimeCollectionWithCtx(ctx, bypassCache)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, animeCollection)
}

// HandleEditAnilistListEntry
//
//	@summary updates the user's list entry on Anilist.
//	@desc This is used to edit an entry on AniList.
//	@desc The "type" field is used to determine if the entry is an anime or manga and refreshes the collection accordingly.
//	@desc The client should refetch collection-dependent queries after this mutation.
//	@returns true
//	@route /api/v1/anilist/list-entry [POST]
func (h *Handler) HandleEditAnilistListEntry(c echo.Context) error {

	type body struct {
		MediaId   *int                     `json:"mediaId"`
		Status    *anilist.MediaListStatus `json:"status"`
		Score     *int                     `json:"score"`
		Progress  *int                     `json:"progress"`
		StartDate *anilist.FuzzyDateInput  `json:"startedAt"`
		EndDate   *anilist.FuzzyDateInput  `json:"completedAt"`
		Type      string                   `json:"type"`
	}

	p := new(body)
	if err := c.Bind(p); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)

	// For profile users, use their own AniList client to avoid mutating the admin account.
	if profileID > 0 {
		profileClient := h.GetProfileAnilistClient(c)
		if !profileClient.IsAuthenticated() {
			return h.RespondWithError(c, errors.New("profile AniList account not authenticated"))
		}
		_, err := profileClient.UpdateMediaListEntry(
			c.Request().Context(),
			p.MediaId,
			p.Status,
			p.Score,
			p.Progress,
			p.StartDate,
			p.EndDate,
		)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	} else {
		err := h.App.AnilistPlatformRef.Get().UpdateEntry(
			c.Request().Context(),
			*p.MediaId,
			p.Status,
			p.Score,
			p.Progress,
			p.StartDate,
			p.EndDate,
		)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	// Record activity event
	go func() {
		pdb := h.GetProfileDatabase(c)
		meta := map[string]interface{}{"type": p.Type}
		if p.Status != nil {
			meta["status"] = string(*p.Status)
		}
		if p.Score != nil {
			meta["score"] = *p.Score
		}
		if p.Progress != nil {
			meta["progress"] = *p.Progress
		}
		_ = pdb.RecordActivityEvent(models.ActivityEventAnilistEntryEdited, *p.MediaId, meta)
	}()

	// Fire achievement events for score/status changes
	if p.Score != nil && *p.Score > 0 {
		go h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
			ProfileID: profileID,
			Trigger:   achievement.TriggerRatingChange,
			MediaID:   *p.MediaId,
			Metadata: map[string]interface{}{
				"score": *p.Score,
			},
		})
	}
	if p.Status != nil {
		go h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
			ProfileID: profileID,
			Trigger:   achievement.TriggerStatusChange,
			MediaID:   *p.MediaId,
			Metadata: map[string]interface{}{
				"status": string(*p.Status),
			},
		})
	}

	switch p.Type {
	case "anime":
		if profileID > 0 {
			h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
			go func() { _, _ = h.App.RefreshAnimeCollection() }()
		} else {
			_, _ = h.App.RefreshAnimeCollection()
		}
	case "manga":
		if profileID > 0 {
			h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
			go func() { _, _ = h.App.RefreshMangaCollection() }()
		} else {
			_, _ = h.App.RefreshMangaCollection()
		}
	default:
		if profileID > 0 {
			h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
			h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
			go func() { _, _ = h.App.RefreshAnimeCollection() }()
			go func() { _, _ = h.App.RefreshMangaCollection() }()
		} else {
			_, _ = h.App.RefreshAnimeCollection()
			_, _ = h.App.RefreshMangaCollection()
		}
	}

	return h.RespondWithData(c, true)
}

//----------------------------------------------------------------------------------------------------------------------------------------------------

var (
	detailsCache = result.NewCache[int, *anilist.AnimeDetailsById_Media]()
)

// HandleGetAnilistAnimeDetails
//
//	@summary returns more details about an AniList anime entry.
//	@desc This fetches more fields omitted from the base queries.
//	@param id - int - true - "The AniList anime ID"
//	@returns anilist.AnimeDetailsById_Media
//	@route /api/v1/anilist/media-details/{id} [GET]
func (h *Handler) HandleGetAnilistAnimeDetails(c echo.Context) error {

	mId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if details, ok := detailsCache.Get(mId); ok {
		return h.RespondWithData(c, details)
	}
	details, err := h.App.AnilistPlatformRef.Get().GetAnimeDetails(c.Request().Context(), mId)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	detailsCache.Set(mId, details)

	return h.RespondWithData(c, details)
}

//----------------------------------------------------------------------------------------------------------------------------------------------------

var studioDetailsMap = result.NewMap[int, *anilist.StudioDetails]()
var staffDetailsMap = result.NewMap[int, *anilist.StaffDetails]()

// HandleGetAnilistStudioDetails
//
//	@summary returns details about a studio.
//	@desc This fetches media produced by the studio.
//	@param id - int - true - "The AniList studio ID"
//	@returns anilist.StudioDetails
//	@route /api/v1/anilist/studio-details/{id} [GET]
func (h *Handler) HandleGetAnilistStudioDetails(c echo.Context) error {

	mId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if details, ok := studioDetailsMap.Get(mId); ok {
		return h.RespondWithData(c, details)
	}
	details, err := h.App.AnilistPlatformRef.Get().GetStudioDetails(c.Request().Context(), mId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	go func() {
		if details != nil {
			studioDetailsMap.Set(mId, details)
		}
	}()

	return h.RespondWithData(c, details)
}

//----------------------------------------------------------------------------------------------------------------------------------------------------

// HandleGetAnilistStaffDetails
//
//	@summary returns details about a staff member.
//	@desc This fetches media associated with the staff member.
//	@param id - int - true - "The AniList staff ID"
//	@returns anilist.StaffDetails
//	@route /api/v1/anilist/staff-details/{id} [GET]
func (h *Handler) HandleGetAnilistStaffDetails(c echo.Context) error {

	mId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if details, ok := staffDetailsMap.Get(mId); ok {
		return h.RespondWithData(c, details)
	}
	details, err := h.App.AnilistPlatformRef.Get().GetStaffDetails(c.Request().Context(), mId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	go func() {
		if details != nil {
			staffDetailsMap.Set(mId, details)
		}
	}()

	return h.RespondWithData(c, details)
}

//----------------------------------------------------------------------------------------------------------------------------------------------------

// HandleDeleteAnilistListEntry
//
//	@summary deletes an entry from the user's AniList list.
//	@desc This is used to delete an entry on AniList.
//	@desc The "type" field is used to determine if the entry is an anime or manga and refreshes the collection accordingly.
//	@desc The client should refetch collection-dependent queries after this mutation.
//	@route /api/v1/anilist/list-entry [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteAnilistListEntry(c echo.Context) error {

	type body struct {
		MediaId *int    `json:"mediaId"`
		Type    *string `json:"type"`
	}

	p := new(body)
	if err := c.Bind(p); err != nil {
		return h.RespondWithError(c, err)
	}

	if p.Type == nil || p.MediaId == nil {
		return h.RespondWithError(c, errors.New("missing parameters"))
	}

	profileID := h.GetProfileID(c)

	// For profile users, use their own AniList client
	if profileID > 0 {
		profileClient := h.GetProfileAnilistClient(c)
		if !profileClient.IsAuthenticated() {
			return h.RespondWithError(c, errors.New("profile AniList account not authenticated"))
		}

		var listEntryID int
		// Fetch the profile's collection to find the entry ID
		viewerName := h.App.AnilistClientManager.GetUsername(profileID)
		switch *p.Type {
		case "anime":
			col, err := profileClient.AnimeCollection(c.Request().Context(), &viewerName)
			if err != nil {
				return h.RespondWithError(c, err)
			}
			found := false
			if col != nil && col.MediaListCollection != nil {
				for _, list := range col.MediaListCollection.Lists {
					if list.Entries != nil {
						for _, entry := range list.Entries {
							if entry.GetMedia().GetID() == *p.MediaId {
								listEntryID = entry.ID
								found = true
								break
							}
						}
					}
					if found {
						break
					}
				}
			}
			if !found {
				return h.RespondWithError(c, errors.New("list entry not found in profile collection"))
			}
		case "manga":
			col, err := profileClient.MangaCollection(c.Request().Context(), &viewerName)
			if err != nil {
				return h.RespondWithError(c, err)
			}
			found := false
			if col != nil && col.MediaListCollection != nil {
				for _, list := range col.MediaListCollection.Lists {
					if list.Entries != nil {
						for _, entry := range list.Entries {
							if entry.GetMedia().GetID() == *p.MediaId {
								listEntryID = entry.ID
								found = true
								break
							}
						}
					}
					if found {
						break
					}
				}
			}
			if !found {
				return h.RespondWithError(c, errors.New("list entry not found in profile collection"))
			}
		}

		_, err := profileClient.DeleteEntry(c.Request().Context(), &listEntryID)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	} else {
		var listEntryID int

		switch *p.Type {
		case "anime":
			animeCollection, err := h.App.GetAnimeCollection(false)
			if err != nil {
				return h.RespondWithError(c, err)
			}
			listEntry, found := animeCollection.GetListEntryFromAnimeId(*p.MediaId)
			if !found {
				return h.RespondWithError(c, errors.New("list entry not found"))
			}
			listEntryID = listEntry.ID
		case "manga":
			mangaCollection, err := h.App.GetMangaCollection(false)
			if err != nil {
				return h.RespondWithError(c, err)
			}
			listEntry, found := mangaCollection.GetListEntryFromMangaId(*p.MediaId)
			if !found {
				return h.RespondWithError(c, errors.New("list entry not found"))
			}
			listEntryID = listEntry.ID
		}

		err := h.App.AnilistPlatformRef.Get().DeleteEntry(c.Request().Context(), *p.MediaId, listEntryID)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	// Record activity event for delete
	go func() {
		pdb := h.GetProfileDatabase(c)
		_ = pdb.RecordActivityEvent(models.ActivityEventAnilistEntryDeleted, *p.MediaId, map[string]interface{}{"type": *p.Type})
	}()

	switch *p.Type {
	case "anime":
		if profileID > 0 {
			h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
			go func() { _, _ = h.App.RefreshAnimeCollection() }()
		} else {
			_, _ = h.App.RefreshAnimeCollection()
		}
	case "manga":
		if profileID > 0 {
			h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
			go func() { _, _ = h.App.RefreshMangaCollection() }()
		} else {
			_, _ = h.App.RefreshMangaCollection()
		}
	}

	return h.RespondWithData(c, true)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var (
	anilistListAnimeCache       = result.NewCache[string, *anilist.ListAnime]()
	anilistListRecentAnimeCache = result.NewCache[string, *anilist.ListRecentAnime]() // holds 1 value
)

// HandleAnilistListAnime
//
//	@summary returns a list of anime based on the search parameters.
//	@desc This is used by the "Discover" and "Advanced Search".
//	@route /api/v1/anilist/list-anime [POST]
//	@returns anilist.ListAnime
func (h *Handler) HandleAnilistListAnime(c echo.Context) error {

	type body struct {
		Page                *int                   `json:"page,omitempty"`
		Search              *string                `json:"search,omitempty"`
		PerPage             *int                   `json:"perPage,omitempty"`
		Sort                []*anilist.MediaSort   `json:"sort,omitempty"`
		Status              []*anilist.MediaStatus `json:"status,omitempty"`
		Genres              []*string              `json:"genres,omitempty"`
		AverageScoreGreater *int                   `json:"averageScore_greater,omitempty"`
		Season              *anilist.MediaSeason   `json:"season,omitempty"`
		SeasonYear          *int                   `json:"seasonYear,omitempty"`
		Format              *anilist.MediaFormat   `json:"format,omitempty"`
		IsAdult             *bool                  `json:"isAdult,omitempty"`
		CountryOfOrigin     *string                `json:"countryOfOrigin,omitempty"`
	}

	p := new(body)
	if err := c.Bind(p); err != nil {
		return h.RespondWithError(c, err)
	}

	if p.Page == nil || p.PerPage == nil {
		*p.Page = 1
		*p.PerPage = 20
	}

	isAdult := false
	if p.IsAdult != nil {
		isAdult = *p.IsAdult && h.App.Settings.GetAnilist().EnableAdultContent
	}

	cacheKey := anilist.ListAnimeCacheKey(
		p.Page,
		p.Search,
		p.PerPage,
		p.Sort,
		p.Status,
		p.Genres,
		p.AverageScoreGreater,
		p.Season,
		p.SeasonYear,
		p.Format,
		&isAdult,
		p.CountryOfOrigin,
	)

	cached, ok := anilistListAnimeCache.Get(cacheKey)
	if ok {
		return h.RespondWithData(c, cached)
	}

	ret, err := anilist.ListAnimeM(
		shared_platform.NewCacheLayer(h.App.AnilistClientRef),
		p.Page,
		p.Search,
		p.PerPage,
		p.Sort,
		p.Status,
		p.Genres,
		p.AverageScoreGreater,
		p.Season,
		p.SeasonYear,
		p.Format,
		&isAdult,
		p.CountryOfOrigin,
		h.App.Logger,
		h.App.GetUserAnilistToken(),
	)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if ret != nil {
		anilistListAnimeCache.SetT(cacheKey, ret, time.Minute*10)
	}

	return h.RespondWithData(c, ret)
}

// HandleAnilistListRecentAiringAnime
//
//	@summary returns a list of recently aired anime.
//	@desc This is used by the "Schedule" page to display recently aired anime.
//	@route /api/v1/anilist/list-recent-anime [POST]
//	@returns anilist.ListRecentAnime
func (h *Handler) HandleAnilistListRecentAiringAnime(c echo.Context) error {

	type body struct {
		Page            *int                  `json:"page,omitempty"`
		Search          *string               `json:"search,omitempty"`
		PerPage         *int                  `json:"perPage,omitempty"`
		AiringAtGreater *int                  `json:"airingAt_greater,omitempty"`
		AiringAtLesser  *int                  `json:"airingAt_lesser,omitempty"`
		NotYetAired     *bool                 `json:"notYetAired,omitempty"`
		Sort            []*anilist.AiringSort `json:"sort,omitempty"`
	}

	p := new(body)
	if err := c.Bind(p); err != nil {
		return h.RespondWithError(c, err)
	}

	if p.Page == nil || p.PerPage == nil {
		*p.Page = 1
		*p.PerPage = 50
	}

	cacheKey := fmt.Sprintf("%v-%v-%v-%v-%v-%v-%v", p.Page, p.Search, p.PerPage, p.AiringAtGreater, p.AiringAtLesser, p.NotYetAired, p.Sort)

	cached, ok := anilistListRecentAnimeCache.Get(cacheKey)
	if ok {
		return h.RespondWithData(c, cached)
	}

	ret, err := anilist.ListRecentAiringAnimeM(
		shared_platform.NewCacheLayer(h.App.AnilistClientRef),
		p.Page,
		p.Search,
		p.PerPage,
		p.AiringAtGreater,
		p.AiringAtLesser,
		p.NotYetAired,
		p.Sort,
		h.App.Logger,
		h.App.GetUserAnilistToken(),
	)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	anilistListRecentAnimeCache.SetT(cacheKey, ret, time.Hour*1)

	return h.RespondWithData(c, ret)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var anilistMissedSequelsCache = result.NewCache[int, []*anilist.BaseAnime]()

// HandleAnilistListMissedSequels
//
//	@summary returns a list of sequels not in the user's list.
//	@desc This is used by the "Discover" page to display sequels the user may have missed.
//	@route /api/v1/anilist/list-missed-sequels [GET]
//	@returns []anilist.BaseAnime
func (h *Handler) HandleAnilistListMissedSequels(c echo.Context) error {

	cached, ok := anilistMissedSequelsCache.Get(1)
	if ok {
		return h.RespondWithData(c, cached)
	}

	// Get complete anime collection
	animeCollection, err := h.App.AnilistPlatformRef.Get().GetAnimeCollectionWithRelations(c.Request().Context())
	if err != nil {
		return h.RespondWithError(c, err)
	}

	ret, err := anilist.ListMissedSequels(
		shared_platform.NewCacheLayer(h.App.AnilistClientRef),
		animeCollection,
		h.App.Logger,
		h.App.GetUserAnilistToken(),
	)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	anilistMissedSequelsCache.SetT(1, ret, time.Hour*4)

	return h.RespondWithData(c, ret)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var anilistStatsCache = result.NewCache[int, *anilist.Stats]()

// HandleGetAniListStats
//
//	@summary returns the anilist stats.
//	@desc This returns the AniList stats for the user.
//	@route /api/v1/anilist/stats [GET]
//	@returns anilist.Stats
func (h *Handler) HandleGetAniListStats(c echo.Context) error {
	profileID := h.GetProfileID(c)
	cacheKey := 0
	if profileID > 0 {
		cacheKey = int(profileID)
	}

	if cached, ok := anilistStatsCache.Get(cacheKey); ok {
		return h.RespondWithData(c, cached)
	}

	var viewerStats *anilist.ViewerStats
	var statsErr error

	// Prefer the per-profile AniList client so each profile uses its own token.
	if profileID > 0 {
		profileClient := h.GetProfileAnilistClient(c)
		if profileClient.IsAuthenticated() {
			viewerStats, statsErr = profileClient.ViewerStats(c.Request().Context())
		}
	}

	// Fall back to the global platform (shared account or simulated).
	if viewerStats == nil {
		viewerStats, statsErr = h.App.AnilistPlatformRef.Get().GetViewerStats(c.Request().Context())
	}

	if statsErr != nil {
		return h.RespondWithError(c, statsErr)
	}

	ret, err := anilist.GetStats(
		c.Request().Context(),
		viewerStats,
	)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	anilistStatsCache.SetT(cacheKey, ret, time.Hour*1)

	return h.RespondWithData(c, ret)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleGetAnilistCacheLayerStatus
//
//	@summary returns the status of the AniList cache layer.
//	@desc This returns the status of the AniList cache layer.
//	@route /api/v1/anilist/cache-layer/status [GET]
//	@returns bool
func (h *Handler) HandleGetAnilistCacheLayerStatus(c echo.Context) error {
	return h.RespondWithData(c, shared_platform.IsWorking.Load())
}

// HandleToggleAnilistCacheLayerStatus
//
//	@summary toggles the status of the AniList cache layer.
//	@desc This toggles the status of the AniList cache layer.
//	@route /api/v1/anilist/cache-layer/status [POST]
//	@returns bool
func (h *Handler) HandleToggleAnilistCacheLayerStatus(c echo.Context) error {
	shared_platform.IsWorking.Store(!shared_platform.IsWorking.Load())
	return h.RespondWithData(c, shared_platform.IsWorking.Load())
}
