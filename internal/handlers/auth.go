package handlers

import (
	"context"
	"errors"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/platforms/anilist_platform"
	"seanime/internal/platforms/simulated_platform"
	"seanime/internal/util"
	"time"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
)

// HandleLogin
//
//	@summary logs in the user by saving the JWT token in the database.
//	@desc This is called when the JWT token is obtained from AniList after logging in with redirection on the client.
//	@desc It also fetches the Viewer data from AniList and saves it in the database.
//	@desc It creates a new handlers.Status and refreshes App modules.
//	@desc When called by a non-admin profile, the token is stored in the profile's database
//	@desc and only that profile's cached AniList client is updated (global platform is untouched).
//	@route /api/v1/auth/login [POST]
//	@returns handlers.Status
func (h *Handler) HandleLogin(c echo.Context) error {

	type body struct {
		Token string `json:"token"`
	}

	var b body

	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)
	session := h.GetProfileSession(c)
	isAdmin := session == nil || session.IsAdmin

	// Create a temporary client to verify the token
	tempClient := anilist.NewAnilistClient(b.Token, h.App.AnilistCacheDir)

	// Get viewer data from AniList
	getViewer, err := tempClient.GetViewer(context.Background())
	if err != nil {
		h.App.Logger.Error().Msg("Could not authenticate to AniList")
		return h.RespondWithError(c, err)
	}

	if len(getViewer.Viewer.Name) == 0 {
		return h.RespondWithError(c, errors.New("could not find user"))
	}

	// Marshal viewer data
	bytes, err := json.Marshal(getViewer.Viewer)
	if err != nil {
		h.App.Logger.Err(err).Msg("auth: could not marshal viewer data")
	}

	// Determine which database to save the account to
	targetDB := h.GetProfileDatabase(c)

	// Save account data in database
	_, err = targetDB.UpsertAccount(&models.Account{
		BaseModel: models.BaseModel{
			ID:        1,
			UpdatedAt: time.Now(),
		},
		Username: getViewer.Viewer.Name,
		Token:    b.Token,
		Viewer:   bytes,
	})

	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Update the AniList client manager cache for this profile
	if h.App.AnilistClientManager != nil {
		h.App.AnilistClientManager.UpdateClient(profileID, b.Token)
	}

	// Update profile's AniList metadata in profiles.db
	if h.App.ProfileManager != nil && profileID > 0 {
		avatarURL := ""
		if getViewer.Viewer.Avatar != nil && getViewer.Viewer.Avatar.Large != nil {
			avatarURL = *getViewer.Viewer.Avatar.Large
		}
		bannerURL := ""
		if getViewer.Viewer.BannerImage != nil {
			bannerURL = *getViewer.Viewer.BannerImage
		}
		_, _ = h.App.ProfileManager.UpdateProfile(profileID, map[string]interface{}{
			"anilist_username": getViewer.Viewer.Name,
			"anilist_avatar":   avatarURL,
			"banner_image":     bannerURL,
		})
	}

	if isAdmin {
		// Admin login: update global client and platform (used by background subsystems)
		h.App.UpdateAnilistClientToken(b.Token)

		anilistPlatform := anilist_platform.NewAnilistPlatform(h.App.AnilistClientRef, h.App.ExtensionBankRef, h.App.Logger, h.App.Database)
		h.App.UpdatePlatform(anilistPlatform)

		h.App.InitOrRefreshAnilistData()
		h.App.InitOrRefreshModules()

		go func() {
			defer util.HandlePanicThen(func() {})
			h.App.InitOrRefreshTorrentstreamSettings()
			h.App.InitOrRefreshMediastreamSettings()
			h.App.InitOrRefreshDebridSettings()
		}()
	}

	h.App.Logger.Info().Uint("profileID", profileID).Bool("admin", isAdmin).Msg("app: Authenticated to AniList")

	// Create a new status
	status := h.NewStatus(c)

	// Return new status
	return h.RespondWithData(c, status)

}

// HandleLogout
//
//	@summary logs out the user by removing JWT token from the database.
//	@desc It removes JWT token and Viewer data from the database.
//	@desc It creates a new handlers.Status and refreshes App modules.
//	@desc When called by a non-admin profile, only that profile's token and client are removed.
//	@route /api/v1/auth/logout [POST]
//	@returns handlers.Status
func (h *Handler) HandleLogout(c echo.Context) error {

	profileID := h.GetProfileID(c)
	session := h.GetProfileSession(c)
	isAdmin := session == nil || session.IsAdmin

	// Clear token in the profile's database
	targetDB := h.GetProfileDatabase(c)

	_, err := targetDB.UpsertAccount(&models.Account{
		BaseModel: models.BaseModel{
			ID:        1,
			UpdatedAt: time.Now(),
		},
		Username: "",
		Token:    "",
		Viewer:   nil,
	})

	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Remove cached client for this profile
	if h.App.AnilistClientManager != nil {
		h.App.AnilistClientManager.RemoveClient(profileID)
	}

	// Clear profile's AniList metadata in profiles.db
	if h.App.ProfileManager != nil && profileID > 0 {
		_, _ = h.App.ProfileManager.UpdateProfile(profileID, map[string]interface{}{
			"anilist_username": "",
			"anilist_avatar":   "",
		})
	}

	if isAdmin {
		// Admin logout: update global client and platform
		h.App.UpdateAnilistClientToken("")

		simulatedPlatform, err := simulated_platform.NewSimulatedPlatform(h.App.LocalManager, h.App.AnilistClientRef, h.App.ExtensionBankRef, h.App.Logger, h.App.Database)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		h.App.UpdatePlatform(simulatedPlatform)

		h.App.InitOrRefreshModules()
		h.App.InitOrRefreshAnilistData()
	}

	h.App.Logger.Info().Uint("profileID", profileID).Bool("admin", isAdmin).Msg("app: Logged out of AniList")

	status := h.NewStatus(c)

	return h.RespondWithData(c, status)
}
