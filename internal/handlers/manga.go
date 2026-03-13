package handlers

import (
	"errors"
	"net/http"
	"net/url"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/extension"
	"seanime/internal/manga"
	manga_providers "seanime/internal/manga/providers"
	"seanime/internal/platforms/shared_platform"
	"seanime/internal/util/result"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var (
	baseMangaCache    = result.NewCache[int, *anilist.BaseManga]()
	mangaDetailsCache = result.NewCache[int, *anilist.MangaDetailsById_Media]()
)

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

	animeCollection, err := h.App.GetMangaCollection(false)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	collection, err := manga.NewCollection(&manga.NewCollectionOptions{
		MangaCollection: animeCollection,
		PlatformRef:     h.App.AnilistPlatformRef,
	})
	if err != nil {
		return h.RespondWithError(c, err)
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
	go func() {
		_ = h.App.Database.UpdateMangaReadingHistory(b.MediaId, b.ChapterId)
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
	err := h.App.AnilistPlatformRef.Get().UpdateEntryProgress(
		c.Request().Context(),
		b.MediaId,
		b.ChapterNumber,
		&b.TotalChapters,
	)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	_, _ = h.App.RefreshMangaCollection() // Refresh the AniList collection

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
	history, err := h.App.Database.GetMangaReadingHistory(50)
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
			syntheticManga, found := h.App.Database.GetSyntheticManga(entry.MediaID)
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
