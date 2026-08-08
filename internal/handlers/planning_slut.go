package handlers

import (
	"context"
	"errors"
	"seanime/internal/api/anilist"
	"seanime/internal/core"
	"seanime/internal/database/db"
	"seanime/internal/database/db_bridge"
	"seanime/internal/util"
	"seanime/internal/util/limiter"
	"seanime/internal/util/result"
	libanime "seanime/internal/library/anime"
	libmanga "seanime/internal/manga"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/samber/lo"
)

var (
	planningSlutAnimeCollectionCache = result.NewCache[int, *anilist.AnimeCollection]()
	planningSlutMangaCollectionCache = result.NewCache[int, *anilist.MangaCollection]()
)

// HandleSavePlanningSlutToken
//
//	@summary saves the Planning Slut AniList token. Admin only.
//	@desc Validates the token by calling AniList GetViewer, then saves it to library settings.
//	@route /api/v1/planning-slut/token [POST]
//	@returns handlers.Status
func (h *Handler) HandleSavePlanningSlutToken(c echo.Context) error {

	type body struct {
		Token string `json:"token"`
	}
	var b body

	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	// Normalize pasted tokens (multi-line, spaces, or optional "Bearer " prefix)
	normalized := strings.TrimSpace(b.Token)
	normalized = strings.TrimPrefix(normalized, "Bearer ")
	normalized = strings.TrimPrefix(normalized, "bearer ")
	normalized = strings.Join(strings.Fields(normalized), "")
	b.Token = normalized

	if b.Token == "" {
		return h.RespondWithError(c, errors.New("token is required"))
	}

	// Inline auth: allow unauthenticated access only during initial setup
	// (no profiles exist yet OR planning slut token not yet set).
	// Once configured, require an admin profile session.
	if h.App.ProfileManager != nil && h.App.ProfileManager.HasProfiles() {
		// Profiles exist — check if token is already configured
		existingSettings, _ := h.App.Database.GetSettings()
		alreadyConfigured := existingSettings != nil &&
			existingSettings.Library != nil &&
			existingSettings.Library.PlanningSlutToken != ""

		if alreadyConfigured {
			// Changing an existing token requires admin
			session := c.Get("profileSession")
			if session == nil {
				return echo.NewHTTPError(401, "profile session required")
			}
			payload := session.(*core.ProfileSessionPayload)
			if !payload.IsAdmin {
				return echo.NewHTTPError(403, "admin access required")
			}
		}
		// Not yet configured = initial setup, allow through without session
	}

	// Validate the token by calling AniList
	client := anilist.NewAnilistClient(b.Token, h.App.AnilistCacheDir)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	viewer, err := client.GetViewer(ctx)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid AniList token: "+err.Error()))
	}
	if viewer == nil || viewer.Viewer == nil {
		return h.RespondWithError(c, errors.New("invalid AniList token: could not fetch viewer"))
	}

	// Save the token to library settings
	settings, err := h.App.Database.GetSettings()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if settings.Library == nil {
		return h.RespondWithError(c, errors.New("library settings not initialized"))
	}

	settings.Library.PlanningSlutToken = b.Token
	_, err = h.App.Database.UpsertSettings(settings)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Invalidate CurrSettings cache so Status picks it up
	db.CurrSettings = nil

	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// HandleDeletePlanningSlutToken
//
//	@summary removes the Planning Slut AniList token. Admin only.
//	@route /api/v1/planning-slut/token [DELETE]
//	@returns handlers.Status
func (h *Handler) HandleDeletePlanningSlutToken(c echo.Context) error {

	settings, err := h.App.Database.GetSettings()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if settings.Library != nil {
		settings.Library.PlanningSlutToken = ""
		_, err = h.App.Database.UpsertSettings(settings)
		if err != nil {
			return h.RespondWithError(c, err)
		}
	}

	db.CurrSettings = nil

	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// HandleGetPlanningSlutInfo
//
//	@summary returns the Planning Slut viewer info (username, avatar). Admin only.
//	@route /api/v1/planning-slut/info [GET]
//	@returns map[string]interface{}
func (h *Handler) HandleGetPlanningSlutInfo(c echo.Context) error {

	settings, err := h.App.Database.GetSettings()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	if settings.Library == nil || settings.Library.PlanningSlutToken == "" {
		return h.RespondWithError(c, errors.New("planning slut token not configured"))
	}

	client := anilist.NewAnilistClient(settings.Library.PlanningSlutToken, h.App.AnilistCacheDir)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	viewer, err := client.GetViewer(ctx)
	if err != nil {
		return h.RespondWithError(c, errors.New("failed to fetch planning slut viewer: "+err.Error()))
	}
	if viewer == nil || viewer.Viewer == nil {
		return h.RespondWithError(c, errors.New("failed to fetch planning slut viewer"))
	}

	info := map[string]interface{}{
		"name":     "Global Library",
	}
	if viewer.Viewer.Avatar != nil {
		info["avatar"] = viewer.Viewer.Avatar.Large
	}

	return h.RespondWithData(c, info)
}

// The token and client live on App now, because the shared account is not a handler concern: the
// Enqueue Future worker reads the same collection, and it has no handler to ask.

// HandlePlanningSlutBackfillLibrary
//
//	@summary adds every anime in the local library to the shared PLANNING list. Admin only.
//	@desc Runs in the background — anything already on a list is left alone. Returns immediately.
//	@route /api/v1/planning-slut/backfill-library [POST]
//	@returns bool
func (h *Handler) HandlePlanningSlutBackfillLibrary(c echo.Context) error {
	if h.getPlanningSlutToken() == "" {
		return h.RespondWithError(c, errors.New("no shared account is configured"))
	}

	// Detached from the request: writes are one a second, so a full library is minutes of work and
	// nothing about it needs the caller to wait.
	go func() {
		defer util.HandlePanicInModuleThen("handlers/HandlePlanningSlutBackfillLibrary", func() {})
		if _, err := h.BackfillLocalLibraryToPlanning(context.Background()); err != nil {
			h.App.Logger.Warn().Err(err).Msg("planning slut: Library backfill failed")
		}
	}()

	return h.RespondWithData(c, true)
}

func (h *Handler) getPlanningSlutToken() string {
	return h.App.GetPlanningSlutToken()
}

func (h *Handler) getPlanningSlutClient() (*anilist.AnilistClientImpl, error) {
	return h.App.GetPlanningSlutClient()
}

func (h *Handler) getPlanningSlutAnimeCollection(ctx context.Context) (*anilist.AnimeCollection, error) {
	client, err := h.getPlanningSlutClient()
	if err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	viewerName, err := h.getPlanningSlutViewerName(ctx, client)
	if err != nil {
		return nil, err
	}

	return client.AnimeCollection(ctx, &viewerName)
}

func (h *Handler) getPlanningSlutMangaCollection(ctx context.Context) (*anilist.MangaCollection, error) {
	client, err := h.getPlanningSlutClient()
	if err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	viewerName, err := h.getPlanningSlutViewerName(ctx, client)
	if err != nil {
		return nil, err
	}

	return client.MangaCollection(ctx, &viewerName)
}

func (h *Handler) getPlanningSlutViewerName(ctx context.Context, client *anilist.AnilistClientImpl) (string, error) {
	if client == nil {
		return "", errors.New("planning slut client is nil")
	}

	viewer, err := client.GetViewer(ctx)
	if err != nil {
		return "", err
	}
	if viewer == nil || viewer.Viewer == nil {
		return "", errors.New("failed to fetch planning slut viewer")
	}

	name := strings.TrimSpace(viewer.Viewer.Name)
	if name == "" {
		return "", errors.New("planning slut viewer name is empty")
	}

	return name, nil
}

func (h *Handler) addAnimeToPlanningSlutPlanning(ctx context.Context, mediaID int) error {
	client, err := h.getPlanningSlutClient()
	if err != nil {
		return err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	status := anilist.MediaListStatusPlanning
	_, err = client.UpdateMediaListEntry(ctx, &mediaID, &status, nil, nil, nil, nil)
	return err
}

// planningSlutAddedAnime records the media this process has already put on the shared PLANNING
// list. Without it, matching several torrents of the same series would issue one rate-limited
// AniList write per match — the collection caches only refresh every five minutes, so the
// collection lookups alone cannot see an entry added moments earlier.
var planningSlutAddedAnime = result.NewCache[int, struct{}]()

// animeIsAlreadyTracked reports whether an anime is already on a list and therefore must not be
// (re-)added to the shared PLANNING list.
//
// Deliberately does not fetch anything: it consults the user's own collection, whatever shared
// collection is already cached, and what this process has added. Fetching the shared collection
// here would put an AniList round-trip in front of every single match.
func (h *Handler) animeIsAlreadyTracked(mediaID int) bool {
	if _, ok := planningSlutAddedAnime.Get(mediaID); ok {
		return true
	}

	// The user's own list is the authority for anything on it.
	if collection, err := h.App.GetAnimeCollection(false); err == nil && collection != nil {
		if _, found := collection.GetListEntryFromAnimeId(mediaID); found {
			return true
		}
	}

	if collection, ok := planningSlutAnimeCollectionCache.Get(1); ok && collection != nil {
		if _, found := collection.GetListEntryFromAnimeId(mediaID); found {
			return true
		}
	}

	return false
}

// addAnimeToPlanningIfAbsent puts an anime on the shared (planning slut) PLANNING list only when it
// isn't already on a list, and reports whether it actually wrote anything.
//
// UpdateMediaListEntry is a blind write: running it for an entry the account already tracks moves
// that entry back to PLANNING and discards the status and progress it carried. Checking first also
// keeps repeat matches of one series from burning a rate-limited AniList write each time.
func (h *Handler) addAnimeToPlanningIfAbsent(ctx context.Context, mediaID int) (bool, error) {
	if mediaID <= 0 {
		return false, nil
	}
	if h.animeIsAlreadyTracked(mediaID) {
		return false, nil
	}

	if err := h.addAnimeToPlanningSlutPlanning(ctx, mediaID); err != nil {
		return false, err
	}

	// The shared collection is cached for minutes at a time and is now what Enqueue Future filters
	// against. Leaving it stale means a run keeps queueing the anime that was just matched, as
	// "not in the library".
	h.App.InvalidatePlanningSlutAnimeCollection()
	planningSlutAnimeCollectionCache.Delete(1)

	planningSlutAddedAnime.SetT(mediaID, struct{}{}, 6*time.Hour)
	return true, nil
}

// BackfillLocalLibraryToPlanning puts everything already in the local library onto the shared
// (planning slut) PLANNING list.
//
// Matching adds an anime as it happens, so in principle this has nothing to do — but "in principle"
// covers only the matches made since that was true. Anything matched before it existed, matched while
// the token was unset, or matched during an AniList outage is on disk and on no list at all, and
// nothing goes back for it. That is what this is: the catch-up pass, so the shared account describes
// the whole library rather than the part of it that happened to be matched on a good day.
//
// Returns how many anime it actually wrote. Safe to run repeatedly — anything already on a list, on
// the user's own account or on the shared one, is left exactly as it is, because a blind write would
// reset a watched series to PLANNING and discard its progress.
func (h *Handler) BackfillLocalLibraryToPlanning(ctx context.Context) (int, error) {
	if h.getPlanningSlutToken() == "" {
		return 0, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return 0, err
	}

	// Distinct anime with files on disk. Ignored files are still files you have, but an anime whose
	// every file is ignored is one you have deliberately pushed out of the library, so it is not
	// something to go and put on a list.
	inLibrary := make(map[int]struct{})
	for _, lf := range lfs {
		if lf == nil || lf.MediaId <= 0 || lf.Ignored {
			continue
		}
		inLibrary[lf.MediaId] = struct{}{}
	}
	if len(inLibrary) == 0 {
		return 0, nil
	}

	// One fresh read of the shared account, rather than the five-minute cache: this decides whether
	// each of potentially hundreds of anime gets written, and being wrong costs a series its status.
	shared, err := h.getPlanningSlutAnimeCollectionCached(ctx, true)
	if err != nil {
		return 0, err
	}

	missing := make([]int, 0)
	for mediaID := range inLibrary {
		if shared != nil {
			if _, found := shared.GetListEntryFromAnimeId(mediaID); found {
				continue
			}
		}
		// animeIsAlreadyTracked also covers the user's own list and what this process has written.
		if h.animeIsAlreadyTracked(mediaID) {
			continue
		}
		missing = append(missing, mediaID)
	}

	if len(missing) == 0 {
		h.App.Logger.Debug().Int("inLibrary", len(inLibrary)).
			Msg("planning slut: Local library is already fully tracked")
		return 0, nil
	}

	h.App.Logger.Info().Int("count", len(missing)).Int("inLibrary", len(inLibrary)).
		Msg("planning slut: Adding local library anime missing from the shared PLANNING list")

	// Rate limited to one write a second by addMediaToPlanningSlutBatch, so a few hundred entries is
	// a few minutes of background work rather than a burst AniList will reject.
	if err := h.addMediaToPlanningSlutBatch(ctx, missing); err != nil {
		return 0, err
	}

	for _, mediaID := range missing {
		planningSlutAddedAnime.SetT(mediaID, struct{}{}, 6*time.Hour)
	}
	h.App.InvalidatePlanningSlutAnimeCollection()
	invalidatePlanningSlutCollectionCaches()
	h.scheduleAnimeCollectionRefresh()

	h.App.Logger.Info().Int("count", len(missing)).
		Msg("planning slut: Finished adding local library anime to the shared PLANNING list")

	return len(missing), nil
}

// getPlanningSlutAnimeCollectionCached returns the planning slut's anime collection,
// using a 5-minute in-memory cache to avoid hammering AniList on every page load.
func (h *Handler) getPlanningSlutAnimeCollectionCached(ctx context.Context, bypassCache bool) (*anilist.AnimeCollection, error) {
	if !bypassCache {
		if cached, ok := planningSlutAnimeCollectionCache.Get(1); ok {
			return cached, nil
		}
	}
	col, err := h.getPlanningSlutAnimeCollection(ctx)
	if err != nil {
		return nil, err
	}
	planningSlutAnimeCollectionCache.SetT(1, col, 5*time.Minute)
	return col, nil
}

// getPlanningSlutMangaCollectionCached returns the planning slut's manga collection,
// using a 5-minute in-memory cache.
func (h *Handler) getPlanningSlutMangaCollectionCached(ctx context.Context, bypassCache bool) (*anilist.MangaCollection, error) {
	if !bypassCache {
		if cached, ok := planningSlutMangaCollectionCache.Get(1); ok {
			return cached, nil
		}
	}
	col, err := h.getPlanningSlutMangaCollection(ctx)
	if err != nil {
		return nil, err
	}
	planningSlutMangaCollectionCache.SetT(1, col, 5*time.Minute)
	return col, nil
}

// invalidatePlanningSlutCollectionCaches clears both anime and manga caches
// so the next request fetches fresh data from AniList.
func invalidatePlanningSlutCollectionCaches() {
	planningSlutAnimeCollectionCache.Clear()
	planningSlutMangaCollectionCache.Clear()
}

// addMediaToPlanningSlutBatch adds multiple media IDs to the planning slut's
// AniList PLANNING list with rate limiting (1 req/sec).
func (h *Handler) addMediaToPlanningSlutBatch(ctx context.Context, mediaIDs []int) error {
	if len(mediaIDs) == 0 {
		return nil
	}
	client, err := h.getPlanningSlutClient()
	if err != nil {
		return err
	}
	if ctx == nil {
		ctx = context.Background()
	}

	rateLimiter := limiter.NewLimiter(1*time.Second, 1)
	status := anilist.MediaListStatusPlanning

	wg := sync.WaitGroup{}
	for _, _id := range mediaIDs {
		wg.Add(1)
		go func(id int) {
			rateLimiter.Wait()
			defer wg.Done()
			_, err := client.UpdateMediaListEntry(ctx, &id, &status, lo.ToPtr(0), lo.ToPtr(0), nil, nil)
			if err != nil {
				h.App.Logger.Error().Err(err).Int("mediaId", id).Msg("planning slut: failed to add media to planning list")
			}
		}(_id)
	}
	wg.Wait()
	return nil
}

func mergePlanningSlutAnimeCollection(target *anilist.AnimeCollection, shared *anilist.AnimeCollection, mediaIDs map[int]struct{}) map[int]struct{} {
	added := make(map[int]struct{})
	if target == nil || shared == nil || len(mediaIDs) == 0 {
		return added
	}
	if target.MediaListCollection == nil {
		target.MediaListCollection = &anilist.AnimeCollection_MediaListCollection{}
	}

	status := anilist.MediaListStatusPlanning
	for _, list := range shared.GetMediaListCollection().GetLists() {
		for _, entry := range list.GetEntries() {
			media := entry.GetMedia()
			if media == nil {
				continue
			}
			if _, ok := mediaIDs[media.GetID()]; !ok {
				continue
			}
			if _, exists := target.GetListEntryFromAnimeId(media.GetID()); exists {
				continue
			}

			target.MediaListCollection.AddEntryToList(&anilist.AnimeListEntry{
				ID:          entry.GetID(),
				Score:       entry.GetScore(),
				Progress:    entry.GetProgress(),
				Status:      &status,
				Repeat:      entry.GetRepeat(),
				StartedAt:   entry.GetStartedAt(),
				CompletedAt: entry.GetCompletedAt(),
				Media:       media,
			}, status)
			added[media.GetID()] = struct{}{}
		}
	}

	return added
}

func hideSharedOnlyAnimeListData(collection *libanime.LibraryCollection, mediaIDs map[int]struct{}) {
	if collection == nil || len(mediaIDs) == 0 {
		return
	}

	for _, list := range collection.Lists {
		for _, entry := range list.Entries {
			if _, ok := mediaIDs[entry.MediaId]; ok {
				entry.EntryListData = nil
			}
		}
	}
}

// relocatePlanningSlutEntriesToLocal moves entries that exist ONLY because of
// the planning slut merge out of the PLANNING list and into the LOCAL list.
// This keeps the PS metadata (title, images) while showing them as local files.
func relocatePlanningSlutEntriesToLocal(collection *libanime.LibraryCollection, mediaIDs map[int]struct{}) {
	if collection == nil || len(mediaIDs) == 0 {
		return
	}

	// Collect entries to relocate and strip them from PLANNING
	var relocated []*libanime.LibraryCollectionEntry
	for _, list := range collection.Lists {
		if list.Status != anilist.MediaListStatusPlanning {
			continue
		}
		filtered := make([]*libanime.LibraryCollectionEntry, 0, len(list.Entries))
		for _, entry := range list.Entries {
			if _, isShared := mediaIDs[entry.MediaId]; isShared {
				entry.EntryListData = nil
				relocated = append(relocated, entry)
				continue
			}
			filtered = append(filtered, entry)
		}
		list.Entries = filtered
	}

	if len(relocated) == 0 {
		return
	}

	// Find or create the LOCAL list
	var localList *libanime.LibraryCollectionList
	for _, list := range collection.Lists {
		if list.Status == libanime.MediaListStatusLocal {
			localList = list
			break
		}
	}
	if localList == nil {
		localList = &libanime.LibraryCollectionList{
			Type:    libanime.MediaListStatusLocal,
			Status:  libanime.MediaListStatusLocal,
			Entries: make([]*libanime.LibraryCollectionEntry, 0),
		}
		collection.Lists = append([]*libanime.LibraryCollectionList{localList}, collection.Lists...)
	}

	localList.Entries = append(localList.Entries, relocated...)
}

// stripSharedOnlyFromMangaPlanningList is the manga equivalent.
func stripSharedOnlyFromMangaPlanningList(collection *libmanga.Collection, mediaIDs map[int]struct{}) {
	if collection == nil || len(mediaIDs) == 0 {
		return
	}

	for _, list := range collection.Lists {
		if list.Status != anilist.MediaListStatusPlanning {
			continue
		}
		filtered := make([]*libmanga.CollectionEntry, 0, len(list.Entries))
		for _, entry := range list.Entries {
			if _, isShared := mediaIDs[entry.MediaId]; isShared {
				continue
			}
			filtered = append(filtered, entry)
		}
		list.Entries = filtered
	}
}

func mergePlanningSlutMangaCollection(target *anilist.MangaCollection, shared *anilist.MangaCollection, mediaIDs map[int]struct{}) map[int]struct{} {
	added := make(map[int]struct{})
	if target == nil || shared == nil || len(mediaIDs) == 0 {
		return added
	}
	if target.MediaListCollection == nil {
		target.MediaListCollection = &anilist.MangaCollection_MediaListCollection{}
	}

	status := anilist.MediaListStatusPlanning
	for _, list := range shared.GetMediaListCollection().GetLists() {
		for _, entry := range list.GetEntries() {
			media := entry.GetMedia()
			if media == nil {
				continue
			}
			if _, ok := mediaIDs[media.GetID()]; !ok {
				continue
			}
			if mangaCollectionHasMedia(target, media.GetID()) {
				continue
			}

			addMangaCollectionEntryToList(target.MediaListCollection, &anilist.MangaCollection_MediaListCollection_Lists_Entries{
				ID:          entry.GetID(),
				Score:       entry.GetScore(),
				Progress:    entry.GetProgress(),
				Status:      &status,
				Repeat:      entry.GetRepeat(),
				StartedAt:   entry.GetStartedAt(),
				CompletedAt: entry.GetCompletedAt(),
				Media:       media,
			}, status)
			added[media.GetID()] = struct{}{}
		}
	}

	return added
}

func mangaCollectionHasMedia(collection *anilist.MangaCollection, mediaID int) bool {
	if collection == nil || collection.MediaListCollection == nil {
		return false
	}

	for _, list := range collection.MediaListCollection.Lists {
		for _, entry := range list.GetEntries() {
			if media := entry.GetMedia(); media != nil && media.GetID() == mediaID {
				return true
			}
		}
	}

	return false
}

func addMangaCollectionEntryToList(collection *anilist.MangaCollection_MediaListCollection, entry *anilist.MangaCollection_MediaListCollection_Lists_Entries, status anilist.MediaListStatus) {
	if collection == nil || entry == nil {
		return
	}
	if collection.Lists == nil {
		collection.Lists = make([]*anilist.MangaCollection_MediaListCollection_Lists, 0)
	}

	for _, list := range collection.Lists {
		if list.Status != nil && *list.Status == status {
			if list.Entries == nil {
				list.Entries = make([]*anilist.MangaCollection_MediaListCollection_Lists_Entries, 0)
			}
			list.Entries = append(list.Entries, entry)
			return
		}
	}

	collection.Lists = append(collection.Lists, &anilist.MangaCollection_MediaListCollection_Lists{
		Status:  &status,
		Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{entry},
	})
}

func hideSharedOnlyMangaListData(collection *libmanga.Collection, mediaIDs map[int]struct{}) {
	if collection == nil || len(mediaIDs) == 0 {
		return
	}

	for _, list := range collection.Lists {
		for _, entry := range list.Entries {
			if _, ok := mediaIDs[entry.MediaId]; ok {
				entry.EntryListData = nil
			}
		}
	}
}
