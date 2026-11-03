package handlers

import (
	"seanime/internal/privacy"

	"github.com/labstack/echo/v4"
)

// HandleGetPrivacySettings
//
//	@summary get privacy settings.
//	@desc This returns the privacy settings and DNSCrypt status.
//	@returns privacy.PrivacyStatus
//	@route /api/v1/privacy/settings [GET]
func (h *Handler) HandleGetPrivacySettings(c echo.Context) error {
	dbSettings, _ := h.App.Database.GetPrivacySettings()

	status := privacy.PrivacyStatus{
		KnownProviders: privacy.KnownProviders(),
	}

	if dbSettings != nil && dbSettings.ID != 0 {
		status.Settings = *privacy.SettingsFromModel(dbSettings)
	} else {
		status.Settings = *privacy.DefaultSettings()
	}

	// Get DNSCrypt status
	if h.App.PrivacyManager != nil {
		pm := h.App.PrivacyManager
		status.DNSCrypt = pm.GetDNSCryptStatus()
		status.ActiveDoHProvider = pm.GetActiveDoHProvider()
	}

	return h.RespondWithData(c, status)
}

// HandleSavePrivacySettings
//
//	@summary save privacy settings.
//	@desc This saves the privacy settings and applies them immediately.
//	@returns privacy.PrivacyStatus
//	@route /api/v1/privacy/settings [PATCH]
func (h *Handler) HandleSavePrivacySettings(c echo.Context) error {
	type body struct {
		Settings privacy.Settings `json:"settings"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	// Validate: unknown enum values fall back to defaults, non-HTTPS DoH URLs are dropped
	b.Settings.Normalize()

	if _, err := h.App.Database.UpsertPrivacySettings(b.Settings.ToModel()); err != nil {
		return h.RespondWithError(c, err)
	}

	// Apply settings to the privacy manager immediately
	if h.App.PrivacyManager != nil {
		h.App.PrivacyManager.UpdateSettings(&b.Settings)
	}

	// Return updated status
	return h.HandleGetPrivacySettings(c)
}

// HandleTestPrivacyConnection
//
//	@summary test the privacy layers.
//	@desc This tests the currently configured privacy layers and returns results.
//	@returns privacy.ConnectionTestResult
//	@route /api/v1/privacy/test [POST]
func (h *Handler) HandleTestPrivacyConnection(c echo.Context) error {
	if h.App.PrivacyManager == nil {
		return h.RespondWithData(c, privacy.ConnectionTestResult{
			DoHWorking:      false,
			Socks5Working:   false,
			DNSCryptRunning: false,
		})
	}

	result := h.App.PrivacyManager.TestConnection()
	return h.RespondWithData(c, result)
}

// HandleInstallDNSCrypt
//
//	@summary install dnscrypt-proxy.
//	@desc This attempts to install dnscrypt-proxy via dnf.
//	@returns bool
//	@route /api/v1/privacy/dnscrypt/install [POST]
func (h *Handler) HandleInstallDNSCrypt(c echo.Context) error {
	if h.App.PrivacyManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "privacy manager not initialized"))
	}

	err := h.App.PrivacyManager.InstallDNSCrypt()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}
