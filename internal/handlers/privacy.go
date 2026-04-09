package handlers

import (
	"seanime/internal/database/models"
	"seanime/internal/privacy"
	"strings"

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

	status := privacy.PrivacyStatus{}

	if dbSettings != nil && dbSettings.ID != 0 {
		providers := []string{}
		if dbSettings.DoHProviders != "" {
			for _, p := range strings.Split(dbSettings.DoHProviders, ",") {
				p = strings.TrimSpace(p)
				if p != "" {
					providers = append(providers, p)
				}
			}
		}
		status.Settings = privacy.Settings{
			DoHEnabled:      dbSettings.DoHEnabled,
			DoHProviders:    providers,
			Socks5Enabled:   dbSettings.Socks5Enabled,
			Socks5Address:   dbSettings.Socks5Address,
			Socks5Port:      dbSettings.Socks5Port,
			DNSCryptEnabled: dbSettings.DNSCryptEnabled,
			FailMode:        dbSettings.FailMode,
		}
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

	// Validate
	if b.Settings.FailMode == "" {
		b.Settings.FailMode = "open"
	}
	if b.Settings.FailMode != "open" && b.Settings.FailMode != "closed" {
		b.Settings.FailMode = "open"
	}

	// Save to database
	dbSettings := &models.PrivacySettings{
		DoHEnabled:      b.Settings.DoHEnabled,
		DoHProviders:    strings.Join(b.Settings.DoHProviders, ","),
		Socks5Enabled:   b.Settings.Socks5Enabled,
		Socks5Address:   b.Settings.Socks5Address,
		Socks5Port:      b.Settings.Socks5Port,
		DNSCryptEnabled: b.Settings.DNSCryptEnabled,
		FailMode:        b.Settings.FailMode,
	}
	dbSettings.ID = 1

	saved, err := h.App.Database.UpsertPrivacySettings(dbSettings)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	_ = saved

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
