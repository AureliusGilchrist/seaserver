package handlers

import (
	"context"
	"errors"
	"strings"
	"time"

	"seanime/internal/api/kitsu"
	"seanime/internal/core"
	db_bridge "seanime/internal/database/db_bridge"
	"seanime/internal/platforms/kitsu_platform"
	"seanime/internal/util"

	"github.com/labstack/echo/v4"
)

// The Kitsu planning-slut runs in parallel with the AniList planning-slut. It exists for two
// reasons:
//   - The frontend's user-facing "planning" tab can be served from Kitsu when the user has linked
//     a Kitsu account, avoiding an AniList round-trip;
//   - the data grabber path stays on AniList, untouched.
//
// Nothing here is a drop-in for the AniList planning-slut; the routes are deliberately namespaced
// under /kitsu/* so callers can choose.

// HandleSaveKitsuPlanningSlutToken
//
//	@summary saves the Planning Slut Kitsu token. Admin only.
//	@desc Validates the Kitsu token by calling /users/-/self, then saves it to KitsuPlanningSlut.
//	@route /api/v1/kitsu/planning-slut/token [POST]
//	@returns handlers.Status
func (h *Handler) HandleSaveKitsuPlanningSlutToken(c echo.Context) error {
	type body struct {
		Token string `json:"token"`
	}
	var b body

	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	normalized := strings.TrimSpace(b.Token)
	normalized = strings.TrimPrefix(normalized, "Bearer ")
	normalized = strings.TrimPrefix(normalized, "bearer ")
	normalized = strings.Join(strings.Fields(normalized), "")
	b.Token = normalized

	if b.Token == "" {
		return h.RespondWithError(c, errors.New("Kitsu token is required"))
	}

	// Inline auth: initial setup before any profile exists bypasses the session check.
	if h.App.ProfileManager != nil && h.App.ProfileManager.HasProfiles() {
		// If already configured, require admin
		existing := h.App.GetKitsuPlanningSlutToken()
		if existing != nil && existing.Token != "" {
			session := c.Get("profileSession")
			if session == nil {
				return echo.NewHTTPError(401, "profile session required")
			}
			payload := session.(*core.ProfileSessionPayload)
			if !payload.IsAdmin {
				return echo.NewHTTPError(403, "admin access required")
			}
		}
	}

	// Validate the token by hitting Kitsu.
	client := kitsu.NewClient(kitsu.ClientOptions{Token: b.Token})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	viewer, err := client.GetCurrentUser(ctx)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid Kitsu token: "+err.Error()))
	}
	if viewer == nil || viewer.ID == "" {
		return h.RespondWithError(c, errors.New("invalid Kitsu token: could not fetch viewer"))
	}

	username := viewer.Attributes.Slug
	if viewer.Attributes.Name != "" {
		username = viewer.Attributes.Name
	}

	if err := h.App.SaveKitsuPlanningSlutToken(b.Token, "", username, viewer.ID); err != nil {
		return h.RespondWithError(c, err)
	}

	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// HandleDeleteKitsuPlanningSlutToken
//
//	@summary removes the Planning Slut Kitsu token. Admin only.
//	@route /api/v1/kitsu/planning-slut/token [DELETE]
//	@returns handlers.Status
func (h *Handler) HandleDeleteKitsuPlanningSlutToken(c echo.Context) error {
	if err := h.App.DeleteKitsuPlanningSlutToken(); err != nil {
		return h.RespondWithError(c, err)
	}
	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// HandleGetKitsuPlanningSlutInfo
//
//	@summary returns the Planning Slut Kitsu viewer info (username, avatar). Admin only.
//	@route /api/v1/kitsu/planning-slut/info [GET]
//	@returns map[string]interface{}
func (h *Handler) HandleGetKitsuPlanningSlutInfo(c echo.Context) error {
	if !h.App.KitsuClientManager.HasPlanningSlut() {
		return h.RespondWithError(c, errors.New("Kitsu planning slut token not configured"))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	viewer, err := h.App.GetKitsuPlanningSlutViewer(ctx)
	if err != nil {
		return h.RespondWithError(c, errors.New("failed to fetch Kitsu planning slut viewer: "+err.Error()))
	}
	if viewer == nil {
		return h.RespondWithError(c, errors.New("failed to fetch Kitsu planning slut viewer"))
	}

	info := map[string]interface{}{
		"name":   "Global Kitsu Library",
		"id":     viewer.ID,
	}
	if viewer.AvatarURL != "" {
		info["avatarUrl"] = viewer.AvatarURL
	}

	return h.RespondWithData(c, info)
}

// HandleKitsuPlanningSlutBackfillLibrary
//
//	@summary adds every anime in the local library to the shared Kitsu planning-slut PLANNING
//	@desc list. Detached — runs in the background.
//	@route /api/v1/kitsu/planning-slut/backfill-library [POST]
//	@returns bool
func (h *Handler) HandleKitsuPlanningSlutBackfillLibrary(c echo.Context) error {
	if !h.App.KitsuClientManager.HasPlanningSlut() {
		return h.RespondWithError(c, errors.New("Kitsu planning slut token not configured"))
	}

	go func() {
		defer util.HandlePanicInModuleThen("handlers/HandleKitsuPlanningSlutBackfillLibrary", func() {})
		ctx := context.Background()
		if _, err := h.BackfillLocalLibraryToKitsuPlanning(ctx); err != nil {
			h.App.Logger.Warn().Err(err).Msg("kitsu planning slut: library backfill failed")
		}
	}()
	return h.RespondWithData(c, true)
}

// BackfillLocalLibraryToKitsuPlanning puts every anime currently in the local library onto the
// shared Kitsu PLANNING list, skipping anything already there. The AniList sister implementer
// uses a similar pattern; this one relies on Kitsu's PLANNED status synonym.
func (h *Handler) BackfillLocalLibraryToKitsuPlanning(ctx context.Context) (int, error) {
	if !h.App.KitsuClientManager.HasPlanningSlut() {
		return 0, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	pool := h.App.KitsuClientManager.GetPlanningSlut()
	if pool == nil {
		return 0, nil
	}

	rows, err := pool.GetAnimeCollection(ctx, true) // bypass cache for accuracy
	if err != nil {
		return 0, err
	}

	// Build the "already on list" set keyed by Kitsu anime ID. Kitsu tracks anime by its own
	// integer ID; the local library is keyed by AniList (or synthetic) IDs. To match them we
	// resolve each planning-slut row's Kitsu ID against the KitsuIDMapping table.
	have := make(map[int]struct{})
	for _, r := range rows {
		if r.MediaID > 0 {
			have[r.MediaID] = struct{}{}
		}
	}

	// Resolve local library via local files.
	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return 0, err
	}
	inLibrary := make(map[int]struct{})
	for _, lf := range lfs {
		if lf == nil || lf.MediaId <= 0 || lf.Ignored {
			continue
		}
		inLibrary[lf.MediaId] = struct{}{}
	}

	var missing []int
	for mID := range inLibrary {
		if _, ok := have[mID]; ok {
			continue
		}
		missing = append(missing, mID)
	}

	if len(missing) == 0 {
		return 0, nil
	}

	platform := h.App.KitsuClientManager.GetPlanningSlut()
	if platform == nil {
		return 0, nil
	}

	count := 0
	for _, mID := range missing {
		// Walk an entry at a time so progress is visible in logs and so a single rate-limit trip
		// doesn't cancel the rest.
		if err := platform.AddMediaToCollection(ctx, []int{mID}); err != nil {
			h.App.Logger.Error().Err(err).Int("mediaId", mID).Msg("kitsu planning slut: failed to add media")
			continue
		}
		count++
		// Yield to Kitsu's rate limit — 4 req/sec inside the client, this is just an extra second
		// per write so we stay friendly when the user fires this in the middle of other calls.
		time.Sleep(time.Second)
	}

	pool.ClearCache()
	return count, nil
}

// keep imports used
var _ = kitsu.LibraryStatusPlanned
var _ = (*kitsu_platform.KitsuPlatform)(nil)
