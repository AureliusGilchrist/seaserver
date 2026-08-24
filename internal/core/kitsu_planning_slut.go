package core

import (
	"context"

	"seanime/internal/api/kitsu"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/platforms/kitsu_platform"
)

// KitsuPlanningSlut cache mirrors the AniList planning-slut cache but for the Kitsu account. It
// stores the already-fetched library entries along with the per-profile token-bind so concurrent
// goroutines share one set of results rather than re-fetching the same library 20 times.
//
// TTL is short (a few minutes) because the goal of the cache is to absorb render-side bursts, not
// to insulate the system from Kitsu entirely. The user can force-refresh via the API.
//
// Currently a placeholder — the real library cache lives inside the *kitsu.Client.Connection
// cache and is invalidated by ClearCache calls. kept here so the file mirrors the AniList layout.
var _ kitsu.LibraryEntry

// GetKitsuPlanningSlut returns the shared Kitsu account bound as a planning-slut, or nil when
// the server admin hasn't yet linked one. The platform wrapper is platform-agnostic from the
// caller's point of view — both AniList and Kitsu flows look like the same struct.
func (a *App) GetKitsuPlanningSlut() *kitsu_platform.KitsuPlatform {
	if a.KitsuClientManager == nil {
		return nil
	}
	return a.KitsuClientManager.GetPlanningSlut()
}

// GetKitsuPlanningSlutToken deserialises the shared token row from the database. The convention
// is the same as the AniList side: a single-row token table is read on every get, so the admin's
// most recent save is what flows down to the runtime.
func (a *App) GetKitsuPlanningSlutToken() *models.KitsuPlanningSlut {
	if a.Database == nil {
		return nil
	}
	row, _ := a.Database.GetKitsuPlanningSlut()
	if row == nil {
		return nil
	}
	return row
}

// RefreshKitsuPlanningSlutLibrary pulls the planning-slut library down. Returns the list of
// library entries currently bound to the shared account. Empty list with no error indicates the
// account is set up but has nothing planned (or has not been authorised yet).
func (a *App) RefreshKitsuPlanningSlutLibrary(ctx context.Context) ([]kitsu_platform.LibraryEntry, error) {
	p := a.GetKitsuPlanningSlut()
	if p == nil {
		return nil, ErrKitsuPlanningSlutNotConfigured
	}
	rows, err := p.GetAnimeCollection(ctx, false)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// SaveKitsuPlanningSlutToken persists an admin-supplied token and rebuilds the in-memory
// platform. The wider effect is two WebSocket events: a successful save wakes up any consumers
// currently waiting for the planning-slut to come online; a delete wakes them up to announce it
// is gone.
func (a *App) SaveKitsuPlanningSlutToken(token, refreshToken, username, userID string) error {
	if a.KitsuClientManager == nil {
		a.InitKitsuClientManager()
	}
	row := &models.KitsuPlanningSlut{
		Token:        token,
		RefreshToken: refreshToken,
		Username:     username,
		UserID:       userID,
	}
	if _, err := a.KitsuClientManager.SavePlanningSlut(row); err != nil {
		return err
	}
	a.WSEventManager.SendEvent(events.KitsuPlanningSlutTokenUpdated, "")
	return nil
}

// DeleteKitsuPlanningSlutToken clears the shared account. Mirrors Save but with path reversal:
// the row is dropped, the in-memory pointer is dropped, and a WebSocket event carries the news.
func (a *App) DeleteKitsuPlanningSlutToken() error {
	if a.KitsuClientManager == nil {
		return nil
	}
	if err := a.KitsuClientManager.DeletePlanningSlut(); err != nil {
		return err
	}
	a.WSEventManager.SendEvent(events.KitsuPlanningSlutTokenDeleted, "")
	return nil
}

// GetKitsuPlanningSlutViewer returns the OAuth viewer's profile record. Used by the settings UI
// to render the connected username.
func (a *App) GetKitsuPlanningSlutViewer(ctx context.Context) (*kitsu_platform.Viewer, error) {
	if a.KitsuClientManager == nil || !a.KitsuClientManager.HasPlanningSlut() {
		return nil, ErrKitsuPlanningSlutNotConfigured
	}
	return a.KitsuClientManager.GetPlanningSlut().GetViewer(ctx)
}

// ErrKitsuPlanningSlutNotConfigured is sentinel-bounce for handlers that need to distinguish
// "no token configured" from generic Kitsu failures.
var ErrKitsuPlanningSlutNotConfigured = &kitsuPlanningSlutError{message: "Kitsu planning-slut token is not configured"}

// kitsuPlanningSlutError is a typed error that supports equality checks via .Error().
type kitsuPlanningSlutError struct{ message string }

func (e *kitsuPlanningSlutError) Error() string { return e.message }

// InitKitsuClientManager is called from the wiring step during App construction. It allocates the
// shared client manager and hydrates the planning-slut account if one exists in the database.
func (a *App) InitKitsuClientManager() {
	if a.KitsuClientManager != nil {
		return
	}
	m := kitsu_platform.NewKitsuClientManager()
	a.KitsuClientManager = m
	_, _ = m.LoadPlanningSlut()
}
