package handlers

import (
	"fmt"
	"sync"

	"github.com/labstack/echo/v4"
)

// easterEggDiscoveries is a server-side deduplication guard per profile.
// The canonical source of truth is the client's localStorage, but we also
// guard server-side to prevent duplicate XP farming.
var easterEggDiscoveries sync.Map // key: "profileID:eggID"

type DiscoverEasterEggRequest struct {
	EggID string `json:"eggId"`
}

type DiscoverEasterEggResponse struct {
	Granted   bool `json:"granted"`
	NewLevel  int  `json:"newLevel"`
	LeveledUp bool `json:"leveledUp"`
	TotalXP   int  `json:"totalXP"`
	XPGranted int  `json:"xpGranted"`
}

// HandleDiscoverEasterEgg
//
//	@summary grants XP for discovering an easter egg.
//	@desc Idempotent — each egg can only grant XP once per profile per server session.
//	@returns DiscoverEasterEggResponse
//	@route /api/v1/profile/easter-egg [POST]
func (h *Handler) HandleDiscoverEasterEgg(c echo.Context) error {
	database := h.GetProfileDatabase(c)
	profileID := h.GetProfileID(c)

	req := new(DiscoverEasterEggRequest)
	if err := c.Bind(req); err != nil {
		return h.RespondWithError(c, err)
	}

	// Validate egg ID and XP amount — must match a known egg
	xp, valid := validEasterEggs[req.EggID]
	if !valid {
		return h.RespondWithError(c, echo.NewHTTPError(400, "unknown easter egg"))
	}

	// Per-profile deduplication key
	dedupeKey := fmt.Sprintf("%d:%s", profileID, req.EggID)
	if _, alreadyGranted := easterEggDiscoveries.LoadOrStore(dedupeKey, true); alreadyGranted {
		progress, _ := database.GetLevelProgress()
		return h.RespondWithData(c, &DiscoverEasterEggResponse{
			Granted: false,
			TotalXP: progress.TotalXP,
		})
	}

	newLevel, leveledUp, err := database.AddXP(xp)
	if err != nil {
		easterEggDiscoveries.Delete(dedupeKey)
		return h.RespondWithError(c, err)
	}

	progress, _ := database.GetLevelProgress()

	return h.RespondWithData(c, &DiscoverEasterEggResponse{
		Granted:   true,
		NewLevel:  newLevel,
		LeveledUp: leveledUp,
		TotalXP:   progress.TotalXP,
		XPGranted: xp,
	})
}

// validEasterEggs maps egg IDs to XP awards.
// These must match the frontend egg definitions.
var validEasterEggs = map[string]int{
	"konami-code":           100,
	"click-logo-10":          50,
	"click-logo-30":          75,
	"idle-5min":              25,
	"midnight-visit":         50,
	"new-year-visit":        200,
	"friday-night":           30,
	"monday-morning":         20,
	"type-seanime":           60,
	"type-yare-yare":         80,
	"type-plus-ultra":        80,
	"type-dattebayo":         80,
	"type-gomu-gomu":         80,
	"triple-click-nav":       40,
	"scroll-to-bottom":       30,
	"theme-changed-5":        50,
	"level-up-toast-click":   30,
	"search-empty":           25,
	"404-page":               40,
	"avatar-click-10":        60,
	"sidebar-toggle-20":      50,
	"dark-mode-toggle":       20,
	"watched-all-episodes":   75,
	"manga-binge":            75,
	"anime-100":             100,
	"manga-100":             100,
	"achievement-unlock-10":  80,
	"profile-complete":       60,
	"long-session":           50,
	"secret-path":           150,
}
