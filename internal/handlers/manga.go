package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"
	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/extension"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/manga"
	chapter_downloader "seanime/internal/manga/downloader"
	manga_providers "seanime/internal/manga/providers"
	"seanime/internal/platforms/anilist_platform"
	"seanime/internal/platforms/shared_platform"
	"seanime/internal/util/result"
	"strconv"
	"strings"
	"sync"

	"github.com/labstack/echo/v4"
)

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var (
	baseMangaCache    = result.NewCache[int, *anilist.BaseManga]()
	mangaDetailsCache = result.NewCache[int, *anilist.MangaDetailsById_Media]()
	mangaHydrationMu  sync.RWMutex
	mangaHydration    = MangaHydrationStatus{Details: make([]MangaHydrationDetail, 0)}
)

const (
	syntheticMangaHydrationProvider    = "weebcentral"
	syntheticMangaLocalProvider        = "local"
	syntheticMangaHydrationConcurrency = 4
	hydrationDetailsLimit              = 100
)

type MangaHydrationDetail struct {
	Timestamp time.Time `json:"timestamp"`
	Source    string    `json:"source"`
	MediaID   int       `json:"mediaId"`
	Title     string    `json:"title"`
	Action    string    `json:"action"`
	Message   string    `json:"message,omitempty"`
}

type MangaHydrationStatus struct {
	IsRunning         bool                  `json:"isRunning"`
	CancelRequested   bool                  `json:"cancelRequested"`
	WasCancelled      bool                  `json:"wasCancelled"`
	Total             int                   `json:"total"`
	Processed         int                   `json:"processed"`
	AniListHydrated   int                   `json:"aniListHydrated"`
	SyntheticHydrated int                   `json:"syntheticHydrated"`
	Skipped           int                   `json:"skipped"`
	Failed            int                   `json:"failed"`
	Progress          float64               `json:"progress"`
	StartedAt         *time.Time            `json:"startedAt,omitempty"`
	FinishedAt        *time.Time            `json:"finishedAt,omitempty"`
	LastUpdatedAt     *time.Time            `json:"lastUpdatedAt,omitempty"`
	Details           []MangaHydrationDetail `json:"details"`
}

// HandleGetAnilistMangaCollection
//
//	@summary returns the user's AniList manga collection.
//	@route /api/v1/manga/anilist/collection [GET]
//	@returns anilist.MangaCollection
func (h *Handler) HandleGetAnilistMangaCollection(c echo.Context) error {

	type body struct {
		BypassCache bool `json:"bypassCache"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)
	if profileID > 0 {
		// Profile user: use manager cache (5-min TTL + singleflight).
		// On bypassCache, invalidate first so the next Get fetches fresh.
		if b.BypassCache {
			h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
		}
		collection, err := h.App.AnilistClientManager.GetMangaCollection(profileID)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		return h.RespondWithData(c, collection)
	}

	collection, err := h.App.GetMangaCollection(b.BypassCache)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, collection)
}

// HandleGetRawAnilistMangaCollection
//
//	@summary returns the user's AniList manga collection.
//	@route /api/v1/manga/anilist/collection/raw [GET,POST]
//	@returns anilist.MangaCollection
func (h *Handler) HandleGetRawAnilistMangaCollection(c echo.Context) error {

	bypassCache := c.Request().Method == "POST"

	// Get the user's anilist collection
	mangaCollection, err := h.App.GetRawMangaCollection(bypassCache)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, mangaCollection)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleGetMangaCollection
//
//	@summary returns the user's main manga collection.
//	@desc This is an object that contains all the user's manga entries in a structured format.
//	@route /api/v1/manga/collection [GET]
//	@returns manga.Collection
func (h *Handler) HandleGetMangaCollection(c echo.Context) error {
	profileID := h.GetProfileID(c)

	// Catalogue = admin's manga collection (media metadata source, cached)
	catalogueMangaCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// For profile users with their own AniList: use their personal collection.
	// For admin or unlinked profiles: fall back to the catalogue.
	mangaCollection := catalogueMangaCollection
	if profileID > 0 {
		profileMangaCollection, ferr := h.App.AnilistClientManager.GetMangaCollection(profileID)
		if ferr == nil && profileMangaCollection != nil {
			mangaCollection = profileMangaCollection
		}
	}

	// Get media map from manga downloader (downloaded chapters)
	mediaMap := h.App.MangaDownloader.GetMediaMap()

	// Merge planning slut's manga collection as the base.
	// Only merge entries whose media ID matches a downloaded manga so they appear in the collection.
	var sharedOnlyMangaIDs map[int]struct{}
	if psMangaCollection, psErr := h.getPlanningSlutMangaCollectionCached(context.Background(), false); psErr == nil && psMangaCollection != nil {
		downloadedMediaIDs := make(map[int]struct{})
		for mID := range mediaMap {
			downloadedMediaIDs[mID] = struct{}{}
		}
		sharedOnlyMangaIDs = mergePlanningSlutMangaCollection(mangaCollection, psMangaCollection, downloadedMediaIDs)
	}

	// Build title lookup from saved download metadata for manga not in AniList collection
	metadataTitles := make(map[int]string)
	if allMeta, metaErr := h.App.Database.GetAllDownloadedMangaMetadata(); metaErr == nil {
		for _, m := range allMeta {
			if m.Title != "" {
				metadataTitles[m.MediaID] = m.Title
			}
		}
	}

	collection, err := manga.NewCollection(&manga.NewCollectionOptions{
		MangaCollection: mangaCollection,
		PlatformRef:     h.App.AnilistPlatformRef,
		MediaMap:        &mediaMap,
		MetadataTitles:  metadataTitles,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Hide list data for entries that only come from planning slut
	if len(sharedOnlyMangaIDs) > 0 {
		hideSharedOnlyMangaListData(collection, sharedOnlyMangaIDs)
	}

	return h.RespondWithData(c, collection)
}

// HandleGetMangaEntry
//
//	@summary returns a manga entry for the given AniList manga id.
//	@desc This is used by the manga media entry pages to get all the data about the anime. It includes metadata and AniList list data.
//	@route /api/v1/manga/entry/{id} [GET]
//	@param id - int - true - "AniList manga media ID"
//	@returns manga.Entry
func (h *Handler) HandleGetMangaEntry(c echo.Context) error {

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	animeCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	entry, err := manga.NewEntry(c.Request().Context(), &manga.NewEntryOptions{
		MediaId:         id,
		Logger:          h.App.Logger,
		FileCacher:      h.App.FileCacher,
		PlatformRef:     h.App.AnilistPlatformRef,
		MangaCollection: animeCollection,
		Database:        h.App.Database,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if entry != nil {
		baseMangaCache.SetT(entry.MediaId, entry.Media, 1*time.Hour)
	}

	return h.RespondWithData(c, entry)
}

// HandleGetMangaEntryDetails
//
//	@summary returns more details about an AniList manga entry.
//	@desc This fetches more fields omitted from the base queries.
//	@route /api/v1/manga/entry/{id}/details [GET]
//	@param id - int - true - "AniList manga media ID"
//	@returns anilist.MangaDetailsById_Media
func (h *Handler) HandleGetMangaEntryDetails(c echo.Context) error {

	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Handle synthetic manga (negative IDs)
	if id < 0 {
		syntheticManga, found := h.App.Database.GetSyntheticManga(id)
		if !found {
			return h.RespondWithError(c, errors.New("synthetic manga not found"))
		}
		// Return synthetic manga details in a compatible format
		details := createMangaDetailsFromSynthetic(syntheticManga)
		return h.RespondWithData(c, details)
	}

	if detailsMedia, found := mangaDetailsCache.Get(id); found {
		return h.RespondWithData(c, detailsMedia)
	}

	details, err := h.App.AnilistPlatformRef.Get().GetMangaDetails(c.Request().Context(), id)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	mangaDetailsCache.SetT(id, details, 1*time.Hour)

	return h.RespondWithData(c, details)
}

// createMangaDetailsFromSynthetic creates MangaDetailsById_Media from synthetic manga
// Note: MangaDetailsById_Media has limited fields, so we only populate what's available
func createMangaDetailsFromSynthetic(sm *models.SyntheticManga) *anilist.MangaDetailsById_Media {
	return &anilist.MangaDetailsById_Media{
		ID: sm.SyntheticID,
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleGetMangaLatestChapterNumbersMap
//
//	@summary returns the latest chapter number for all manga entries.
//	@route /api/v1/manga/latest-chapter-numbers [GET]
//	@returns map[int][]manga.MangaLatestChapterNumberItem
func (h *Handler) HandleGetMangaLatestChapterNumbersMap(c echo.Context) error {
	ret, err := h.App.MangaRepository.GetMangaLatestChapterNumbersMap()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, ret)
}

// HandleRefetchMangaChapterContainers
//
//	@summary refetches the chapter containers for all manga entries previously cached.
//	@route /api/v1/manga/refetch-chapter-containers [POST]
//	@returns bool
func (h *Handler) HandleRefetchMangaChapterContainers(c echo.Context) error {

	type body struct {
		SelectedProviderMap map[int]string `json:"selectedProviderMap"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	mangaCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	err = h.App.MangaRepository.RefreshChapterContainers(mangaCollection, b.SelectedProviderMap)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return nil
}

// HandleEmptyMangaEntryCache
//
//	@summary empties the cache for a manga entry.
//	@desc This will empty the cache for a manga entry (chapter lists and pages), allowing the client to fetch fresh data.
//	@desc HandleGetMangaEntryChapters should be called after this to fetch the new chapter list.
//	@desc Returns 'true' if the operation was successful.
//	@route /api/v1/manga/entry/cache [DELETE]
//	@returns bool
func (h *Handler) HandleEmptyMangaEntryCache(c echo.Context) error {

	type body struct {
		MediaId int `json:"mediaId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	err := h.App.MangaRepository.EmptyMangaCache(b.MediaId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleGetMangaEntryChapters
//
//	@summary returns the chapters for a manga entry based on the provider.
//	@route /api/v1/manga/chapters [POST]
//	@returns manga.ChapterContainer
func (h *Handler) HandleGetMangaEntryChapters(c echo.Context) error {

	type body struct {
		MediaId  int    `json:"mediaId"`
		Provider string `json:"provider"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	var titles []*string
	var year int

	// Handle synthetic manga (negative IDs)
	if b.MediaId < 0 {
		syntheticManga, found := h.App.Database.GetSyntheticManga(b.MediaId)
		if !found {
			return h.RespondWithError(c, errors.New("synthetic manga not found"))
		}
		titles = []*string{&syntheticManga.Title}
		year = 0
	} else {
		baseManga, found := baseMangaCache.Get(b.MediaId)
		if !found {
			var err error
			baseManga, err = h.App.AnilistPlatformRef.Get().GetManga(c.Request().Context(), b.MediaId)
			if err != nil {
				return h.RespondWithError(c, err)
			}
			titles = baseManga.GetAllTitles()
			baseMangaCache.SetT(b.MediaId, baseManga, 24*time.Hour)
		} else {
			titles = baseManga.GetAllTitles()
		}
		year = baseManga.GetStartYearSafe()
	}

	container, err := h.App.MangaRepository.GetMangaChapterContainer(&manga.GetMangaChapterContainerOptions{
		Provider: b.Provider,
		MediaId:  b.MediaId,
		Titles:   titles,
		Year:     year,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Get manga collection for merging downloaded chapters
	// Note: This may fail if AniList is down, but we still want to try merging with what we have
	mangaCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		h.App.Logger.Debug().Err(err).Msg("Failed to get manga collection for merging, will try without it")
		// Continue with nil collection - the merge function should handle this
	}

	// Merge downloaded chapters with provider chapters
	mergedContainer, err := h.App.MangaRepository.MergeDownloadedChaptersWithProviderAndCollection(container, b.MediaId, mangaCollection)
	if err != nil {
		// If merge fails, just return the original container
		h.App.Logger.Debug().Err(err).
			Int("mediaId", b.MediaId).
			Str("provider", b.Provider).
			Msg("Failed to merge downloaded chapters with provider chapters")
		return h.RespondWithData(c, container)
	}

	h.App.Logger.Debug().
		Int("mediaId", b.MediaId).
		Str("provider", b.Provider).
		Int("mergedChapters", len(mergedContainer.Chapters)).
		Msg("Successfully merged downloaded chapters with provider chapters")

	return h.RespondWithData(c, mergedContainer)
}

// HandleGetMangaEntryPages
//
//	@summary returns the pages for a manga entry based on the provider and chapter id.
//	@desc This will return the pages for a manga chapter.
//	@desc If the app is offline and the chapter is not downloaded, it will return an error.
//	@desc If the app is online and the chapter is not downloaded, it will return the pages from the provider.
//	@desc If the chapter is downloaded, it will return the appropriate struct.
//	@desc If 'double page' is requested, it will fetch image sizes and include the dimensions in the response.
//	@route /api/v1/manga/pages [POST]
//	@returns manga.PageContainer
func (h *Handler) HandleGetMangaEntryPages(c echo.Context) error {

	type body struct {
		MediaId    int    `json:"mediaId"`
		Provider   string `json:"provider"`
		ChapterId  string `json:"chapterId"`
		DoublePage bool   `json:"doublePage"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	container, err := h.App.MangaRepository.GetMangaPageContainer(b.Provider, b.MediaId, b.ChapterId, b.DoublePage, h.App.IsOfflineRef())
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Update reading history when pages are fetched (user is reading this chapter)
	profileDB := h.GetProfileDatabase(c)
	go func() {
		_ = profileDB.UpdateMangaReadingHistory(b.MediaId, b.ChapterId)
	}()

	return h.RespondWithData(c, container)
}

// HandleGetMangaEntryDownloadedChapters
//
//	@summary returns all download chapters for a manga entry,
//	@route /api/v1/manga/downloaded-chapters/{id} [GET]
//	@param id - int - true - "AniList manga media ID"
//	@returns []manga.ChapterContainer
func (h *Handler) HandleGetMangaEntryDownloadedChapters(c echo.Context) error {

	mId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	mangaCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	container, err := h.App.MangaRepository.GetDownloadedMangaChapterContainers(mId, mangaCollection)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, container)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var (
	anilistListMangaCache = result.NewCache[string, *anilist.ListManga]()
)

// HandleAnilistListManga
//
//	@summary returns a list of manga based on the search parameters.
//	@desc This is used by "Advanced Search" and search function.
//	@route /api/v1/manga/anilist/list [POST]
//	@returns anilist.ListManga
func (h *Handler) HandleAnilistListManga(c echo.Context) error {

	type body struct {
		Page                *int                   `json:"page,omitempty"`
		Search              *string                `json:"search,omitempty"`
		PerPage             *int                   `json:"perPage,omitempty"`
		Sort                []*anilist.MediaSort   `json:"sort,omitempty"`
		Status              []*anilist.MediaStatus `json:"status,omitempty"`
		Genres              []*string              `json:"genres,omitempty"`
		AverageScoreGreater *int                   `json:"averageScore_greater,omitempty"`
		Year                *int                   `json:"year,omitempty"`
		CountryOfOrigin     *string                `json:"countryOfOrigin,omitempty"`
		IsAdult             *bool                  `json:"isAdult,omitempty"`
		Format              *anilist.MediaFormat   `json:"format,omitempty"`
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

	cacheKey := anilist.ListMangaCacheKey(
		p.Page,
		p.Search,
		p.PerPage,
		p.Sort,
		p.Status,
		p.Genres,
		p.AverageScoreGreater,
		nil,
		p.Year,
		p.Format,
		p.CountryOfOrigin,
		&isAdult,
	)

	cached, ok := anilistListMangaCache.Get(cacheKey)
	if ok {
		return h.RespondWithData(c, cached)
	}

	ret, err := anilist.ListMangaM(
		shared_platform.NewCacheLayer(h.App.AnilistClientRef),
		p.Page,
		p.Search,
		p.PerPage,
		p.Sort,
		p.Status,
		p.Genres,
		p.AverageScoreGreater,
		p.Year,
		p.Format,
		p.CountryOfOrigin,
		&isAdult,
		h.App.Logger,
		h.App.GetUserAnilistToken(),
	)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if ret != nil {
		anilistListMangaCache.SetT(cacheKey, ret, time.Minute*10)
	}

	return h.RespondWithData(c, ret)
}

// HandleUpdateMangaProgress
//
//	@summary updates the progress of a manga entry.
//	@desc Note: MyAnimeList is not supported
//	@route /api/v1/manga/update-progress [POST]
//	@returns bool
func (h *Handler) HandleUpdateMangaProgress(c echo.Context) error {

	type body struct {
		MediaId       int `json:"mediaId"`
		MalId         int `json:"malId,omitempty"`
		ChapterNumber int `json:"chapterNumber"`
		TotalChapters int `json:"totalChapters"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Update the progress on AniList
	profileID := h.GetProfileID(c)

	// For profile users, use their own AniList client to avoid mutating the admin account.
	if profileID > 0 {
		profileClient := h.GetProfileAnilistClient(c)
		if !profileClient.IsAuthenticated() {
			return h.RespondWithError(c, errors.New("profile AniList account not authenticated"))
		}

		// Determine status based on progress
		status := anilist.MediaListStatusCurrent
		isCompleted := b.TotalChapters > 0 && b.ChapterNumber >= b.TotalChapters
		if isCompleted {
			status = anilist.MediaListStatusCompleted
		}

		now := time.Now()
		year, monthVal, day := now.Year(), int(now.Month()), now.Day()
		var startedAt, completedAt *anilist.FuzzyDateInput
		if b.ChapterNumber == 1 {
			startedAt = &anilist.FuzzyDateInput{Year: &year, Month: &monthVal, Day: &day}
		}
		if isCompleted {
			completedAt = &anilist.FuzzyDateInput{Year: &year, Month: &monthVal, Day: &day}
		}

		_, err := profileClient.UpdateMediaListEntry(
			c.Request().Context(),
			&b.MediaId,
			&status,
			nil, // scoreRaw
			&b.ChapterNumber,
			startedAt,
			completedAt,
		)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	} else {
		err := h.App.AnilistPlatformRef.Get().UpdateEntryProgress(
			c.Request().Context(),
			b.MediaId,
			b.ChapterNumber,
			&b.TotalChapters,
		)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	// Fire achievement events for chapter progress
	h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
		ProfileID: profileID,
		Trigger:   achievement.TriggerChapterProgress,
		MediaID:   b.MediaId,
		Metadata: map[string]interface{}{
			"chapter": b.ChapterNumber,
		},
	})

	// Record activity for stats heatmap/streaks
	go func() {
		pdb := h.GetProfileDatabase(c)
		if pdb != nil {
			_ = pdb.RecordMangaActivity(1)
			_ = pdb.RecordActivityEvent(models.ActivityEventMangaChapterRead, b.MediaId, map[string]interface{}{
				"chapter":       b.ChapterNumber,
				"totalChapters": b.TotalChapters,
			})
		}
	}()

	// Evaluate milestones after activity is recorded
	go func() {
		if h.App.MilestoneEngine != nil {
			h.App.MilestoneEngine.EvaluateProfile(profileID)
		}
	}()

	if b.TotalChapters > 0 && b.ChapterNumber >= b.TotalChapters {
		h.App.AchievementEngine.ProcessEvent(&achievement.AchievementEvent{
			ProfileID: profileID,
			Trigger:   achievement.TriggerMangaComplete,
			MediaID:   b.MediaId,
			Metadata: map[string]interface{}{
				"chapters": b.TotalChapters,
			},
		})
	}

	if profileID > 0 {
		h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
		go func() { _, _ = h.App.RefreshMangaCollection() }()
	} else {
		_, _ = h.App.RefreshMangaCollection()
	}

	return h.RespondWithData(c, true)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleMangaManualSearch
//
//	@summary returns search results for a manual search.
//	@desc Returns search results for a manual search.
//	@route /api/v1/manga/search [POST]
//	@returns []hibikemanga.SearchResult
func (h *Handler) HandleMangaManualSearch(c echo.Context) error {

	type body struct {
		Provider string `json:"provider"`
		Query    string `json:"query"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	ret, err := h.App.MangaRepository.ManualSearch(b.Provider, b.Query)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, ret)
}

// HandleMangaManualMapping
//
//	@summary manually maps a manga entry to a manga ID from the provider.
//	@desc This is used to manually map a manga entry to a manga ID from the provider.
//	@desc The client should re-fetch the chapter container after this.
//	@route /api/v1/manga/manual-mapping [POST]
//	@returns bool
func (h *Handler) HandleMangaManualMapping(c echo.Context) error {

	type body struct {
		Provider string `json:"provider"`
		MediaId  int    `json:"mediaId"`
		MangaId  string `json:"mangaId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	err := h.App.MangaRepository.ManualMapping(b.Provider, b.MediaId, b.MangaId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleGetMangaMapping
//
//	@summary returns the mapping for a manga entry.
//	@desc This is used to get the mapping for a manga entry.
//	@desc An empty string is returned if there's no manual mapping. If there is, the manga ID will be returned.
//	@route /api/v1/manga/get-mapping [POST]
//	@returns manga.MappingResponse
func (h *Handler) HandleGetMangaMapping(c echo.Context) error {

	type body struct {
		Provider string `json:"provider"`
		MediaId  int    `json:"mediaId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	mapping := h.App.MangaRepository.GetMapping(b.Provider, b.MediaId)
	return h.RespondWithData(c, mapping)
}

// HandleRemoveMangaMapping
//
//	@summary removes the mapping for a manga entry.
//	@desc This is used to remove the mapping for a manga entry.
//	@desc The client should re-fetch the chapter container after this.
//	@route /api/v1/manga/remove-mapping [POST]
//	@returns bool
func (h *Handler) HandleRemoveMangaMapping(c echo.Context) error {

	type body struct {
		Provider string `json:"provider"`
		MediaId  int    `json:"mediaId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	err := h.App.MangaRepository.RemoveMapping(b.Provider, b.MediaId)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// HandleSearchSyntheticManga
//
//	@summary searches for synthetic manga by title.
//	@desc Returns synthetic manga entries that match the search query.
//	@route /api/v1/manga/synthetic/search [POST]
//	@returns []*models.SyntheticManga
func (h *Handler) HandleSearchSyntheticManga(c echo.Context) error {
	type body struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Query == "" {
		return h.RespondWithData(c, []*models.SyntheticManga{})
	}

	results, err := h.App.Database.SearchSyntheticManga(b.Query, b.Limit)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, results)
}

// MangaReadingHistoryItem represents a reading history entry with full media details
type MangaReadingHistoryItem struct {
	MediaID           int                `json:"mediaId"`
	LastReadAt        string             `json:"lastReadAt"`
	LastChapterNumber string             `json:"lastChapterNumber"`
	IsSynthetic       bool               `json:"isSynthetic"`
	Media             *anilist.BaseManga `json:"media,omitempty"`
}

// HandleGetMangaReadingHistory
//
//	@summary returns all manga reading history with media details.
//	@desc Returns all manga (including synthetic) that have been read, sorted by last read time, with full media metadata.
//	@route /api/v1/manga/reading-history [GET]
//	@returns []MangaReadingHistoryItem
func (h *Handler) HandleGetMangaReadingHistory(c echo.Context) error {
	profileDB := h.GetProfileDatabase(c)
	history, err := profileDB.GetMangaReadingHistory(50)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Enrich with media details
	var enrichedHistory []MangaReadingHistoryItem
	for _, entry := range history {
		item := MangaReadingHistoryItem{
			MediaID:           entry.MediaID,
			LastReadAt:        entry.LastReadAt.Format(time.RFC3339),
			LastChapterNumber: entry.LastChapterNumber,
			IsSynthetic:       entry.IsSynthetic,
		}

		// Fetch media details
		if entry.IsSynthetic {
			// Get synthetic manga
			syntheticManga, found := profileDB.GetSyntheticManga(entry.MediaID)
			if found && syntheticManga != nil {
				// Convert synthetic manga to BaseManga format
				item.Media = &anilist.BaseManga{
					ID: syntheticManga.SyntheticID,
					Title: &anilist.BaseManga_Title{
						UserPreferred: &syntheticManga.Title,
						Romaji:        &syntheticManga.Title,
						English:       &syntheticManga.Title,
					},
					CoverImage: &anilist.BaseManga_CoverImage{
						Large:      &syntheticManga.CoverImage,
						ExtraLarge: &syntheticManga.CoverImage,
						Medium:     &syntheticManga.CoverImage,
					},
				}
			}
		} else {
			// Get AniList manga from collection
			mangaCollection, err := h.App.GetMangaCollection(false)
			if err == nil && mangaCollection != nil && mangaCollection.MediaListCollection != nil {
				// Find manga in collection
				for _, list := range mangaCollection.MediaListCollection.Lists {
					for _, entry := range list.Entries {
						if entry.Media != nil && entry.Media.ID == item.MediaID {
							item.Media = entry.Media
							break
						}
					}
					if item.Media != nil {
						break
					}
				}
			}
		}

		enrichedHistory = append(enrichedHistory, item)
	}

	return h.RespondWithData(c, enrichedHistory)
}

// HandleGetRecentlyReadSyntheticManga
//
//	@summary returns recently read synthetic manga with full details.
//	@desc Returns synthetic manga that have been read recently, with full metadata.
//	@route /api/v1/manga/synthetic/recently-read [GET]
//	@returns []*models.SyntheticManga
func (h *Handler) HandleGetRecentlyReadSyntheticManga(c echo.Context) error {
	// Get synthetic manga reading history
	history, err := h.App.Database.GetSyntheticMangaReadingHistory(20)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Fetch full synthetic manga details for each history entry
	var results []*models.SyntheticManga
	for _, entry := range history {
		manga, found := h.App.Database.GetSyntheticManga(entry.MediaID)
		if found && manga != nil {
			results = append(results, manga)
		}
	}

	return h.RespondWithData(c, results)
}

// HandleGetTrendingManga
//
//	@summary returns trending manga from AniList.
//	@desc Returns a list of trending manga.
//	@route /api/v1/manga/trending [GET]
//	@returns []*anilist.BaseManga
func (h *Handler) HandleGetTrendingManga(c echo.Context) error {
	anilistClient := anilist.NewAnilistClient("", h.App.Config.Anilist.ClientID)
	
	// Search for trending manga
	page := 1
	perPage := 20
	
	result, err := anilistClient.SearchBaseManga(c.Request().Context(), &page, &perPage, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	
	if err != nil {
		return h.RespondWithError(c, err)
	}
	
	if result == nil || result.Page == nil {
		return h.RespondWithData(c, []*anilist.BaseManga{})
	}
	
	return h.RespondWithData(c, result.Page.Media)
}

// HandleGetRecentlyReleasedManga
//
//	@summary returns recently released manga chapters.
//	@desc Returns manga that have recently released chapters from user's list.
//	@route /api/v1/manga/recently-released [GET]
//	@returns []*anilist.BaseManga
func (h *Handler) HandleGetRecentlyReleasedManga(c echo.Context) error {
	// Get user's manga collection
	mangaCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	
	var recentManga []*anilist.BaseManga
	
	// Get manga from current reading list
	if mangaCollection.MediaListCollection != nil {
		for _, list := range mangaCollection.MediaListCollection.Lists {
			if list.Status != nil && (*list.Status == anilist.MediaListStatusCurrent || *list.Status == anilist.MediaListStatusRepeating) {
				for _, entry := range list.Entries {
					if entry.Media != nil {
						recentManga = append(recentManga, entry.Media)
					}
				}
			}
		}
	}
	
	// Limit to 20 most recent
	if len(recentManga) > 20 {
		recentManga = recentManga[:20]
	}
	
	return h.RespondWithData(c, recentManga)
}

// HandleGetUpcomingMangaChapters
//
//	@summary returns upcoming manga chapters.
//	@desc Returns manga with upcoming chapters from user's library.
//	@route /api/v1/manga/upcoming-chapters [GET]
//	@returns []*anilist.BaseManga
func (h *Handler) HandleGetUpcomingMangaChapters(c echo.Context) error {
	// Get user's manga collection
	mangaCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	
	var upcomingManga []*anilist.BaseManga
	
	// Get manga that are currently releasing
	if mangaCollection.MediaListCollection != nil {
		for _, list := range mangaCollection.MediaListCollection.Lists {
			for _, entry := range list.Entries {
				if entry.Media != nil && entry.Media.Status != nil && *entry.Media.Status == anilist.MediaStatusReleasing {
					upcomingManga = append(upcomingManga, entry.Media)
				}
			}
		}
	}
	
	// Limit to 20
	if len(upcomingManga) > 20 {
		upcomingManga = upcomingManga[:20]
	}
	
	return h.RespondWithData(c, upcomingManga)
}

// HandleHydrateAllManga
//
//	@summary hydrates all manga entries with missing or empty media data.
//	@desc This forces fresh data fetch from AniList for all manga entries that have missing titles or metadata.
//	@route /api/v1/manga/hydrate-all [POST]
//	@returns manga.Collection
func (h *Handler) HandleHydrateAllManga(c echo.Context) error {
	current := getMangaHydrationStatusSnapshot()
	if current.IsRunning {
		return h.RespondWithData(c, true)
	}

	now := time.Now()
	setMangaHydrationStatus(MangaHydrationStatus{
		IsRunning:       true,
		CancelRequested: false,
		WasCancelled:    false,
		StartedAt:       &now,
		LastUpdatedAt:   &now,
		Details:         make([]MangaHydrationDetail, 0),
	})

	go h.runMangaHydrationJob()

	return h.RespondWithData(c, true)
}

// HandleCancelMangaHydration
//
//	@summary requests cancellation for manga metadata hydration.
//	@route /api/v1/manga/hydrate-all/cancel [POST]
//	@returns bool
func (h *Handler) HandleCancelMangaHydration(c echo.Context) error {
	updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
		if !s.IsRunning {
			return
		}
		now := time.Now()
		s.CancelRequested = true
		s.LastUpdatedAt = &now
		appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "system", Action: "cancelled", Message: "cancellation requested"})
	})

	return h.RespondWithData(c, true)
}

// HandleGetMangaHydrationStatus
//
//	@summary returns metadata hydration progress for manga.
//	@route /api/v1/manga/hydrate-all/status [GET]
//	@returns handlers.MangaHydrationStatus
func (h *Handler) HandleGetMangaHydrationStatus(c echo.Context) error {
	return h.RespondWithData(c, getMangaHydrationStatusSnapshot())
}

func (h *Handler) runMangaHydrationJob() {
	defer func() {
		if r := recover(); r != nil {
			updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
				now := time.Now()
				s.IsRunning = false
				s.Failed++
				s.FinishedAt = &now
				s.LastUpdatedAt = &now
				appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "system", Action: "failed", Message: "panic recovered during hydration"})
			})
		}
	}()

	mangaCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		failHydrationJob(err.Error())
		return
	}
	if mangaCollection == nil || mangaCollection.MediaListCollection == nil {
		failHydrationJob("manga collection is nil")
		return
	}

	mediaMap := h.App.MangaDownloader.GetMediaMap()
	h.ensureSyntheticEntriesFromDownloads(mediaMap)

	type aniItem struct {
		MediaID int
		Title   string
	}

	anilistToHydrate := make([]aniItem, 0)
	for _, list := range mangaCollection.MediaListCollection.Lists {
		for _, entry := range list.Entries {
			if entry.Media == nil {
				continue
			}
			if !needsAniListHydration(entry.Media) {
				continue
			}
			anilistToHydrate = append(anilistToHydrate, aniItem{MediaID: entry.Media.ID, Title: entry.Media.GetTitleSafe()})
		}
	}

	syntheticToHydrate := make([]*models.SyntheticManga, 0)
	syntheticManga, syntheticErr := h.App.Database.GetAllSyntheticManga()
	if syntheticErr == nil {
		for _, item := range syntheticManga {
			if !needsSyntheticHydration(item) {
				continue
			}
			syntheticToHydrate = append(syntheticToHydrate, item)
		}
	}

	updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
		now := time.Now()
		s.Total = len(anilistToHydrate) + len(syntheticToHydrate)
		s.LastUpdatedAt = &now
	})

	for _, item := range anilistToHydrate {
		if isMangaHydrationCancelled() {
			break
		}

		if h.App.AnilistPlatformRef.Get().GetAnilistClient() != nil {
			if anilistPlatform, ok := h.App.AnilistPlatformRef.Get().(*anilist_platform.AnilistPlatform); ok {
				anilistPlatform.GetHelper().ClearBaseMangaCache(item.MediaID)
			}
		}

		_, fetchErr := h.App.AnilistPlatformRef.Get().GetManga(context.Background(), item.MediaID)
		if fetchErr != nil {
			updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
				s.Processed++
				s.Failed++
				updateHydrationProgressLocked(s)
				now := time.Now()
				s.LastUpdatedAt = &now
				appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "anilist", MediaID: item.MediaID, Title: item.Title, Action: "failed", Message: fetchErr.Error()})
			})
			h.App.Logger.Warn().Err(fetchErr).Int("mediaId", item.MediaID).Msg("manga: failed to hydrate AniList manga")
			continue
		}

		updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
			s.Processed++
			s.AniListHydrated++
			updateHydrationProgressLocked(s)
			now := time.Now()
			s.LastUpdatedAt = &now
			appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "anilist", MediaID: item.MediaID, Title: item.Title, Action: "hydrated"})
		})
	}

	providerExtension, ok := extension.GetExtension[extension.MangaProviderExtension](h.App.ExtensionRepository.GetExtensionBank(), syntheticMangaHydrationProvider)
	if !ok {
		if len(syntheticToHydrate) > 0 {
			updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
				s.Processed += len(syntheticToHydrate)
				s.Failed += len(syntheticToHydrate)
				updateHydrationProgressLocked(s)
				now := time.Now()
				s.LastUpdatedAt = &now
				appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "synthetic", Action: "failed", Message: "weebcentral provider extension not found"})
			})
		}
	} else if !isMangaHydrationCancelled() {
		var wg sync.WaitGroup
		semaphore := make(chan struct{}, syntheticMangaHydrationConcurrency)

		for _, item := range syntheticToHydrate {
			if item == nil {
				continue
			}

			wg.Add(1)
			semaphore <- struct{}{}

			go func(sm *models.SyntheticManga) {
				defer wg.Done()
				defer func() { <-semaphore }()

				if isMangaHydrationCancelled() {
					return
				}

				providerKey := strings.ToLower(strings.TrimSpace(sm.Provider))
				updated := false

				searchResults, searchErr := providerExtension.GetProvider().Search(hibikemanga.SearchOptions{Query: sm.Title})
				if searchErr != nil {
					updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
						s.Processed++
						s.Failed++
						updateHydrationProgressLocked(s)
						now := time.Now()
						s.LastUpdatedAt = &now
						appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "synthetic", MediaID: sm.SyntheticID, Title: sm.Title, Action: "failed", Message: searchErr.Error()})
					})
					return
				}

				best := pickSyntheticMangaSearchResult(searchResults, sm)
				chapterLookupID := sm.ProviderID
				if best != nil {
					if best.Title != "" && best.Title != sm.Title {
						sm.Title = best.Title
						updated = true
					}
					if best.Image != "" && best.Image != sm.CoverImage {
						sm.CoverImage = best.Image
						updated = true
					}
					if providerKey == syntheticMangaHydrationProvider && sm.ProviderID == "" && best.ID != "" {
						sm.ProviderID = best.ID
						chapterLookupID = best.ID
						updated = true
					} else if providerKey == syntheticMangaLocalProvider && best.ID != "" {
						chapterLookupID = best.ID
					}
				}

				if chapterLookupID != "" {
					chapters, chapterErr := providerExtension.GetProvider().FindChapters(chapterLookupID)
					if chapterErr == nil {
						if len(chapters) != sm.Chapters {
							sm.Chapters = len(chapters)
							updated = true
						}
					}
				}

				if !updated {
					updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
						s.Processed++
						s.Skipped++
						updateHydrationProgressLocked(s)
						now := time.Now()
						s.LastUpdatedAt = &now
						appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "synthetic", MediaID: sm.SyntheticID, Title: sm.Title, Action: "skipped"})
					})
					return
				}

				if saveErr := h.App.Database.UpdateSyntheticManga(sm); saveErr != nil {
					updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
						s.Processed++
						s.Failed++
						updateHydrationProgressLocked(s)
						now := time.Now()
						s.LastUpdatedAt = &now
						appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "synthetic", MediaID: sm.SyntheticID, Title: sm.Title, Action: "failed", Message: saveErr.Error()})
					})
					return
				}

				updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
					s.Processed++
					s.SyntheticHydrated++
					updateHydrationProgressLocked(s)
					now := time.Now()
					s.LastUpdatedAt = &now
					appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "synthetic", MediaID: sm.SyntheticID, Title: sm.Title, Action: "hydrated"})
				})
			}(item)
		}

		wg.Wait()
	}

	_, _ = h.App.GetMangaCollection(true)

	updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
		now := time.Now()
		s.IsRunning = false
		s.WasCancelled = s.CancelRequested
		s.FinishedAt = &now
		s.LastUpdatedAt = &now
		updateHydrationProgressLocked(s)
		if s.WasCancelled {
			appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "system", Action: "cancelled", Message: "hydration cancelled"})
		}
	})

	status := getMangaHydrationStatusSnapshot()
	h.App.Logger.Info().
		Int("total", status.Total).
		Int("processed", status.Processed).
		Int("anilistHydrated", status.AniListHydrated).
		Int("syntheticHydrated", status.SyntheticHydrated).
		Int("skipped", status.Skipped).
		Int("failed", status.Failed).
		Msg("manga: metadata hydration job completed")
}

func failHydrationJob(message string) {
	updateMangaHydrationStatus(func(s *MangaHydrationStatus) {
		now := time.Now()
		s.IsRunning = false
		s.Failed++
		s.FinishedAt = &now
		s.LastUpdatedAt = &now
		appendHydrationDetailLocked(s, MangaHydrationDetail{Timestamp: now, Source: "system", Action: "failed", Message: message})
	})
}

func needsAniListHydration(media *anilist.BaseManga) bool {
	if media == nil {
		return false
	}
	title := strings.TrimSpace(media.GetTitleSafe())
	if title == "" || strings.EqualFold(title, "unknown title") {
		return true
	}
	if media.GetDescription() == nil {
		return true
	}
	return false
}

func needsSyntheticHydration(sm *models.SyntheticManga) bool {
	if sm == nil {
		return false
	}
	providerKey := strings.ToLower(strings.TrimSpace(sm.Provider))
	if providerKey != syntheticMangaHydrationProvider && providerKey != syntheticMangaLocalProvider {
		return false
	}
	if strings.TrimSpace(sm.Title) == "" || strings.EqualFold(strings.TrimSpace(sm.Title), "synthetic manga") {
		return true
	}
	if strings.TrimSpace(sm.CoverImage) == "" {
		return true
	}
	if sm.Chapters <= 0 {
		return true
	}
	if providerKey == syntheticMangaHydrationProvider && strings.TrimSpace(sm.ProviderID) == "" {
		return true
	}
	return false
}

func (h *Handler) ensureSyntheticEntriesFromDownloads(mediaMap map[int]manga.ProviderDownloadMap) {
	if len(mediaMap) == 0 || h.App.Database == nil {
		return
	}

	titleByMediaID := h.getSeriesTitlesByMediaID()

	for mediaID, downloadData := range mediaMap {
		if mediaID >= 0 {
			continue
		}
		if _, found := h.App.Database.GetSyntheticManga(mediaID); found {
			continue
		}

		provider := syntheticMangaLocalProvider
		for providerName := range downloadData {
			provider = strings.TrimSpace(providerName)
			if provider != "" {
				break
			}
		}
		if provider == "" {
			provider = syntheticMangaLocalProvider
		}

		title := strings.TrimSpace(titleByMediaID[mediaID])
		if title == "" {
			title = "Manga " + strconv.Itoa(mediaID)
		}

		chapterCount := countProviderDownloadMapChapters(downloadData)

		synthetic := &models.SyntheticManga{
			SyntheticID: mediaID,
			Title:       title,
			Provider:    provider,
			ProviderID:  "",
			Status:      "RELEASING",
			Chapters:    chapterCount,
		}

		if err := h.App.Database.InsertSyntheticManga(synthetic); err != nil {
			h.App.Logger.Warn().Err(err).Int("mediaId", mediaID).Msg("manga: failed to insert synthetic manga from download map")
			continue
		}

		h.App.Logger.Info().
			Int("mediaId", mediaID).
			Str("title", title).
			Str("provider", provider).
			Int("chapters", chapterCount).
			Msg("manga: created synthetic metadata seed from downloaded chapters")
	}
}

func (h *Handler) getSeriesTitlesByMediaID() map[int]string {
	titles := make(map[int]string)
	if h.App.MangaRepository == nil {
		return titles
	}

	downloadDir := strings.TrimSpace(h.App.MangaRepository.GetDownloadDir())
	if downloadDir == "" {
		return titles
	}

	entries, err := os.ReadDir(downloadDir)
	if err != nil {
		return titles
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		seriesDir := filepath.Join(downloadDir, entry.Name())
		registry, loadErr := chapter_downloader.LoadSeriesRegistry(seriesDir, h.App.Logger)
		if loadErr != nil || registry == nil || registry.MediaId == 0 {
			continue
		}

		if strings.TrimSpace(entry.Name()) != "" {
			titles[registry.MediaId] = entry.Name()
		}
	}

	return titles
}

func countProviderDownloadMapChapters(downloadData manga.ProviderDownloadMap) int {
	total := 0
	for _, chapters := range downloadData {
		total += len(chapters)
	}
	return total
}

func setMangaHydrationStatus(status MangaHydrationStatus) {
	mangaHydrationMu.Lock()
	defer mangaHydrationMu.Unlock()
	if status.Details == nil {
		status.Details = make([]MangaHydrationDetail, 0)
	}
	mangaHydration = status
}

func updateMangaHydrationStatus(update func(*MangaHydrationStatus)) {
	mangaHydrationMu.Lock()
	defer mangaHydrationMu.Unlock()
	update(&mangaHydration)
}

func getMangaHydrationStatusSnapshot() MangaHydrationStatus {
	mangaHydrationMu.RLock()
	defer mangaHydrationMu.RUnlock()
	copyDetails := make([]MangaHydrationDetail, len(mangaHydration.Details))
	copy(copyDetails, mangaHydration.Details)
	ret := mangaHydration
	ret.Details = copyDetails
	return ret
}

func isMangaHydrationCancelled() bool {
	mangaHydrationMu.RLock()
	defer mangaHydrationMu.RUnlock()
	return mangaHydration.CancelRequested
}

func appendHydrationDetailLocked(status *MangaHydrationStatus, detail MangaHydrationDetail) {
	status.Details = append(status.Details, detail)
	if len(status.Details) > hydrationDetailsLimit {
		status.Details = status.Details[len(status.Details)-hydrationDetailsLimit:]
	}
}

func updateHydrationProgressLocked(status *MangaHydrationStatus) {
	if status.Total <= 0 {
		status.Progress = 0
		return
	}
	status.Progress = (float64(status.Processed) / float64(status.Total)) * 100
	if status.Progress > 100 {
		status.Progress = 100
	}
}

func pickSyntheticMangaSearchResult(results []*hibikemanga.SearchResult, sm *models.SyntheticManga) *hibikemanga.SearchResult {
	if len(results) == 0 {
		return nil
	}

	if sm != nil && sm.ProviderID != "" {
		for _, item := range results {
			if item != nil && item.ID == sm.ProviderID {
				return item
			}
		}
	}

	if sm != nil && sm.Title != "" {
		for _, item := range results {
			if item != nil && strings.EqualFold(item.Title, sm.Title) {
				return item
			}
		}
	}

	for _, item := range results {
		if item != nil && item.Image != "" {
			return item
		}
	}

	for _, item := range results {
		if item != nil {
			return item
		}
	}

	return nil
}

// HandleGetMangaMissedSequels
//
//	@summary returns manga sequels not in collection.
//	@desc Returns sequels of manga in user's collection that aren't added.
//	@route /api/v1/manga/missed-sequels [GET]
//	@returns []*anilist.BaseManga
func (h *Handler) HandleGetMangaMissedSequels(c echo.Context) error {
	// For now, return empty list since BaseManga doesn't have Relations field
	// This would require fetching full details for each manga which is expensive
	return h.RespondWithData(c, []*anilist.BaseManga{})
}

// HandleGetLocalMangaPage
//
//	@summary returns a local manga page.
//	@route /api/v1/manga/local-page/{path} [GET]
//	@returns manga.PageContainer
func (h *Handler) HandleGetLocalMangaPage(c echo.Context) error {

	path := c.Param("path")
	path, err := url.PathUnescape(path)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	path = strings.TrimPrefix(path, manga_providers.LocalServePath)

	providerExtension, ok := extension.GetExtension[extension.MangaProviderExtension](h.App.ExtensionRepository.GetExtensionBank(), manga_providers.LocalProvider)
	if !ok {
		return h.RespondWithError(c, errors.New("manga: Local provider not found"))
	}

	localProvider, ok := providerExtension.GetProvider().(*manga_providers.Local)
	if !ok {
		return h.RespondWithError(c, errors.New("manga: Local provider not found"))
	}

	reader, err := localProvider.ReadPage(path)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return c.Stream(http.StatusOK, "image/jpeg", reader)
}
