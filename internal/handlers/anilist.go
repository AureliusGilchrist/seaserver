package handlers

import (
	"context"
	"errors"
	"fmt"
	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/enmasse"
	"seanime/internal/platforms/shared_platform"
	"seanime/internal/util/result"
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

	// Evaluate collection-based achievements only for profiles that have already
	// recorded in-Seanime activity. This prevents a brand-new profile from
	// retroactively unlocking hundreds of achievements the moment they first
	// connect their AniList account.
	if profileID > 0 {
		go func() {
			pdb, dbErr := h.App.ProfileDatabaseManager.GetDatabase(profileID)
			if dbErr != nil {
				return
			}
			allLogs, logsErr := pdb.GetAllActivityLogs()
			if logsErr != nil || len(allLogs) == 0 {
				return // fresh profile — skip retroactive collection evaluation
			}
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
	pdbEdit := h.GetProfileDatabase(c)
	go func() {
		pdb := pdbEdit
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
		// Embed the title so the timeline can display it even if the media later
		// leaves the collection (avoids "Media #123" entries).
		if title := h.lookupMediaTitle(profileID, p.Type, *p.MediaId); title != "" {
			meta["title"] = title
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
			// Write the edit into the cached collection rather than dropping it.
			//
			// The client refetches the entry the moment this returns, so whatever is cached at that
			// instant is what the user sees. Dropping the cache meant the refetch fell through to
			// the copy on disk — which still held the old status — and the edit looked as though it
			// had been refused; when the fall-through reached a live fetch that failed, the entry
			// came back with no list data and the status went blank. Both are what "it updates it,
			// then goes blank and doesn't do it" looks like from the outside.
			//
			// A first-time addition has no cached entry to patch, so the media is fetched and one is
			// built. Without it the entry page comes back with no list data at all — and that page
			// shows its "add to list" button exactly while list data is missing, so the button sits
			// there spinning as though the addition never completed, on an addition that in fact
			// succeeded and said so.
			//
			// The media is looked up only when the patch reports it needs one — that is, only for a
			// genuine first-time addition.
			//
			// Fetching it up front cost every single save an AniList lookup on the way through, and
			// AniList lookups queue for a rate-limit slot: editing the status of a show already on
			// your list, which needs no media at all, sat there for up to a minute with the Save
			// button spinning. Editing an entry that exists is the overwhelmingly common case and
			// now costs nothing beyond the mutation itself.
			applied := h.App.AnilistClientManager.ApplyAnimeListEntryUpdate(profileID, *p.MediaId, nil, p.Status, p.Score, p.Progress, p.StartDate, p.EndDate)
			if !applied {
				if media, mediaErr := h.App.AnilistPlatformRef.Get().GetAnime(c.Request().Context(), *p.MediaId); mediaErr == nil {
					applied = h.App.AnilistClientManager.ApplyAnimeListEntryUpdate(profileID, *p.MediaId, media, p.Status, p.Score, p.Progress, p.StartDate, p.EndDate)
				}
			}

			if applied {
				// The profile's own collection, not the app-level one — that is the copy this
				// profile reads from, and the only one refreshing it puts back in step.
				h.App.AnilistClientManager.RefreshAnimeCollectionInBackground(profileID)
			} else {
				h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
				h.App.AnilistClientManager.RefreshAnimeCollectionInBackground(profileID)
			}
		} else {
			_, _ = h.App.RefreshAnimeCollection()
		}
	case "manga":
		// Patched into the cached collection rather than thrown away — the same treatment the anime
		// branch above has had for a while, and for the same reason.
		//
		// This used to invalidate and refresh in the background. The client refetches the entry the
		// instant this returns, so it read a collection that either had nothing in it yet or still
		// held the pre-edit values. Pressing "+" on a manga added it to the planning list on AniList,
		// correctly, and the card came back with no status and 0 chapters read — which is exactly
		// what "it's added but visibly I don't see it" is. Changing the status afterwards failed the
		// same way in reverse.
		//
		// The media is fetched only when the patch reports it needs one, which is only ever a
		// first-time addition. An edit to something already on the list costs nothing extra.
		applied := h.App.AnilistClientManager.ApplyMangaListEntryUpdate(profileID, *p.MediaId, nil, p.Status, p.Score, p.Progress, p.StartDate, p.EndDate)
		if !applied {
			if media, mediaErr := h.App.AnilistPlatformRef.Get().GetManga(c.Request().Context(), *p.MediaId); mediaErr == nil {
				applied = h.App.AnilistClientManager.ApplyMangaListEntryUpdate(profileID, *p.MediaId, media, p.Status, p.Score, p.Progress, p.StartDate, p.EndDate)
			}
		}

		if profileID > 0 {
			if !applied {
				h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
			}
			// Whatever AniList works out for itself — the entry id, dates it fills in — arrives
			// shortly after, and the replay above keeps the user's own values on top until it agrees.
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

// detailsCacheTTL bounds how long a cached copy of an anime's details may be served.
//
// This cache had no expiry at all. Once an anime's details had been fetched, that copy was the
// answer for the rest of the process's life: an episode count corrected on AniList, a format
// changed, a genre added, a series moving from "not yet released" to airing — none of it ever
// arrived, and the only way to see it was to restart the server. That is what "the metadata is
// stale" was.
//
// Short, because this is reference data about a show and the cost of being a minute behind is
// nothing, while the cost of being permanently behind is what brought us here.
const detailsCacheTTL = time.Minute

// detailsFetchTimeout bounds the live fetch, so freshness can never cost a held connection.
const detailsFetchTimeout = 5 * time.Second

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

	// Opening an entry page fetches the details live; prefetching reads the cache.
	//
	// "On the fly" is what the details of the page in front of you should be, and there is exactly
	// one request per page open, so it costs one AniList call at the moment somebody is looking.
	// Speculative prefetching is the opposite case — hundreds of requests for pages nobody has
	// asked for — and serving those from cache is what keeps this off the rate budget. The client
	// marks them; see BackgroundRequestHeader.
	background := c.Request().Header.Get(BackgroundRequestHeader) == "true"

	if background {
		if details, ok := detailsCache.Get(mId); ok {
			return h.RespondWithData(c, details)
		}
	}

	// Bounded, because a page open must not be able to hold a connection open indefinitely.
	//
	// A browser opens six connections to a host and no more. An unbounded live fetch here — which
	// queues for an AniList rate-limit slot — parks one of those six for as long as the queue is
	// deep, and a few entry pages is all it takes to park all of them. Everything else the app does
	// then waits in the browser without ever reaching the server: the symptom is a Save button
	// spinning on a request the server log never shows, because it never arrived.
	//
	// So freshness gets a few seconds, and past that the last copy is served. The fetch is not
	// wasted either — it lands in the cache and the next open gets it.
	fetchCtx, cancel := context.WithTimeout(c.Request().Context(), detailsFetchTimeout)
	defer cancel()

	details, err := h.App.AnilistPlatformRef.Get().GetAnimeDetails(fetchCtx, mId)
	if err != nil {
		// A live fetch that fails — a rate-limit slot, a timeout — falls back to the last copy
		// rather than failing the page. Stale details beat no details.
		if cached, ok := detailsCache.Get(mId); ok {
			return h.RespondWithData(c, cached)
		}
		return h.RespondWithError(c, err)
	}
	detailsCache.SetT(mId, details, detailsCacheTTL)

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

	// Record activity event for delete.
	// Look up the title BEFORE the collection refreshes below removes the entry.
	pdbDelete := h.GetProfileDatabase(c)
	deletedTitle := h.lookupMediaTitle(profileID, *p.Type, *p.MediaId)
	go func() {
		meta := map[string]interface{}{"type": *p.Type}
		if deletedTitle != "" {
			meta["title"] = deletedTitle
		}
		_ = pdbDelete.RecordActivityEvent(models.ActivityEventAnilistEntryDeleted, *p.MediaId, meta)
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

	p.Page = paginationDefault(p.Page, 1)
	p.PerPage = paginationDefault(p.PerPage, 20)

	isAdult := false
	if p.IsAdult != nil {
		isAdult = *p.IsAdult && h.App.Settings.GetAnilist().EnableAdultContent
	}

	// Scoped to the account: these results are fetched with that account's token, and the adult
	// filter above is decided per account too, so one profile's cached page must not be served to
	// another's.
	cacheKey := fmt.Sprintf("p%d-", h.GetProfileID(c)) + anilist.ListAnimeCacheKey(
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

	p.Page = paginationDefault(p.Page, 1)
	p.PerPage = paginationDefault(p.PerPage, 50)

	cacheKey := fmt.Sprintf("p%d-%v-%v-%v-%v-%v-%v-%v", h.GetProfileID(c),
		p.Page, p.Search, p.PerPage, p.AiringAtGreater, p.AiringAtLesser, p.NotYetAired, p.Sort)

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

	// Keyed by account, because this list is derived from that account's own collection: it is
	// "sequels to things *you* have watched that *you* do not have". Held under a single shared key,
	// the first profile to open Discover decided what every other profile saw there for the next
	// four hours — someone else's watch history, presented as your recommendations.
	profileID := int(h.GetProfileID(c))

	cached, ok := anilistMissedSequelsCache.Get(profileID)
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

	anilistMissedSequelsCache.SetT(profileID, ret, time.Hour*4)

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

// HandleGetAnilistAvailability
//
//	@summary reports whether AniList is answering requests.
//	@desc Used by the client to show one banner when AniList itself is down, instead of every screen
//	@desc failing separately with no explanation.
//	@route /api/v1/anilist/availability [GET]
//	@returns anilist.Availability
func (h *Handler) HandleGetAnilistAvailability(c echo.Context) error {
	return h.RespondWithData(c, anilist.GetAvailability())
}
