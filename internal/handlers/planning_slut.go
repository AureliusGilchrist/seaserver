package handlers

import (
	"context"
	"errors"
	"seanime/internal/api/anilist"
	"seanime/internal/core"
	"seanime/internal/database/db"
	libanime "seanime/internal/library/anime"
	libmanga "seanime/internal/manga"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
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
		"name":     viewer.Viewer.Name,
	}
	if viewer.Viewer.Avatar != nil {
		info["avatar"] = viewer.Viewer.Avatar.Large
	}

	return h.RespondWithData(c, info)
}

func (h *Handler) getPlanningSlutToken() string {
	settings, err := h.App.Database.GetSettings()
	if err != nil || settings == nil || settings.Library == nil {
		return ""
	}

	return strings.TrimSpace(settings.Library.PlanningSlutToken)
}

func (h *Handler) getPlanningSlutClient() (*anilist.AnilistClientImpl, error) {
	token := h.getPlanningSlutToken()
	if token == "" {
		return nil, errors.New("planning slut token not configured")
	}

	return anilist.NewAnilistClient(token, h.App.AnilistCacheDir), nil
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
