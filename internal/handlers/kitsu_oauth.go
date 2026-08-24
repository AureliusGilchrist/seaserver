package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"seanime/internal/api/kitsu"
	"seanime/internal/core"
	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// HandleStartKitsuOAuth
//
//	@summary returns the Kitsu OAuth URL plus PKCE verifier. Admin only.
//	@desc The client should follow the URL in a browser window, complete the flow, and POST the
//	@desc callback code to /api/v1/kitsu/oauth/callback.
//	@route /api/v1/kitsu/oauth/start [POST]
//	@returns map[string]interface{}
func (h *Handler) HandleStartKitsuOAuth(c echo.Context) error {
	verifier, challenge, err := generatePKCE()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	cfg := kitsu.DefaultOAuthConfig()

	// Generate a fresh "state" string every call so a stolen URL from a previous attempt cannot
	// be replayed against a different verifier.
	state, err := randomString(24)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	authURL := kitsu.BuildAuthorizeURL(cfg, state, challenge)

	return h.RespondWithData(c, map[string]interface{}{
		"url":          authURL,
		"state":        state,
		"verifier":     verifier,
		"clientId":     cfg.ClientID,
		"redirectUri":  cfg.RedirectURI,
	})
}

// HandleKitsuOAuthCallback
//
//	@summary exchanges an OAuth callback code for an access token. Admin only.
//	@desc Persists the resulting token into a KitsuAccount row keyed by the requesting profile.
//	@route /api/v1/kitsu/oauth/callback [POST]
//	@returns map[string]interface{}
func (h *Handler) HandleKitsuOAuthCallback(c echo.Context) error {
	type body struct {
		Code         string `json:"code"`
		Verifier     string `json:"verifier"`
		ProfileID    uint   `json:"profileId"`
		BoundToServer bool  `json:"boundToServer"` // when true, store token in KitsuPlanningSlut
		RedirectURI  string `json:"redirectUri,omitempty"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.Code == "" || b.Verifier == "" {
		return h.RespondWithError(c, errors.New("missing code or verifier"))
	}

	if !b.BoundToServer && b.ProfileID == 0 {
		return h.RespondWithError(c, errors.New("missing profile id"))
	}

	cfg := kitsu.DefaultOAuthConfig()
	if b.RedirectURI != "" {
		cfg.RedirectURI = b.RedirectURI
	}

	client := kitsu.NewClient(kitsu.ClientOptions{})
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	tok, err := client.ExchangeCode(ctx, cfg, b.Code, b.Verifier)
	if err != nil {
		return h.RespondWithError(c, errors.New("token exchange failed: "+err.Error()))
	}

	// Fetch viewer for username/uid.
	authed := kitsu.NewClient(kitsu.ClientOptions{Token: tok.AccessToken})
	viewer, err := authed.GetCurrentUser(ctx)
	if err != nil || viewer == nil || viewer.ID == "" {
		return h.RespondWithError(c, errors.New("could not fetch Kitsu user after exchange"))
	}
	username := viewer.Attributes.Slug
	if viewer.Attributes.Name != "" {
		username = viewer.Attributes.Name
	}

	if b.BoundToServer {
		if err := h.App.SaveKitsuPlanningSlutToken(tok.AccessToken, tok.RefreshToken, username, viewer.ID); err != nil {
			return h.RespondWithError(c, err)
		}
		return h.RespondWithData(c, map[string]interface{}{
			"username": username,
			"userId":   viewer.ID,
		})
	}

	row := &models.KitsuAccount{
		ProfileID:    b.ProfileID,
		Token:        tok.AccessToken,
		RefreshToken: tok.RefreshToken,
		Username:     username,
		UserID:       viewer.ID,
	}
	if _, err := h.App.KitsuClientManager.SaveProfileAccount(row); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, map[string]interface{}{
		"username": username,
		"userId":   viewer.ID,
		"profileId": b.ProfileID,
	})
}

// HandleDeleteKitsuAccount
//
//	@summary unlinks the requesting profile's Kitsu account.
//	@route /api/v1/kitsu/oauth/account [DELETE]
//	@returns handlers.Status
func (h *Handler) HandleDeleteKitsuAccount(c echo.Context) error {
	profileID := h.getProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, errors.New("profile id missing"))
	}

	if err := h.App.KitsuClientManager.DeleteProfileAccount(profileID); err != nil {
		return h.RespondWithError(c, err)
	}

	status := h.NewStatus(c)
	return h.RespondWithData(c, status)
}

// Helpers ------------------------------------------------------------------------------------

func generatePKCE() (verifier, challenge string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	verifier = base64.RawURLEncoding.EncodeToString(buf)

	// Kitsu uses S256 PKCE; the challenge is base64url(sha256(verifier)).
	sum := sha256Sum(verifier)
	challenge = base64.RawURLEncoding.EncodeToString(sum)
	return verifier, challenge, nil
}

func randomString(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// Suppress "imported and not used" if the only reference to core is the session payload.
// (kept here so future contributors don't get blind-folded on adding new endpoints)
var _ = (*core.ProfileSessionPayload)(nil)
