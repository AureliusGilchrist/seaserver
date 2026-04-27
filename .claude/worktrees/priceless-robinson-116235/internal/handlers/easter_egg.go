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
// These must match the frontend EASTER_EGG_DEFINITIONS.
var validEasterEggs = map[string]int{
	// Konami
	"konami-code": 100,

	// Type sequences
	"type-seanime":      60,
	"type-yare-yare":    80,
	"type-plus-ultra":   80,
	"type-dattebayo":    80,
	"type-gomu-gomu":    80,
	"type-nani":         40,
	"type-omae-wa":      90,
	"type-isekai":       55,
	"type-naruto":       50,
	"type-ichigo":       55,
	"type-luffy":        55,
	"type-goku":         60,
	"type-vegeta":       60,
	"type-sukuna":       90,
	"type-gojo":        100,
	"type-levi":         70,
	"type-eren":         70,
	"type-tanjiro":      65,
	"type-zenitsu":      65,
	"type-inosuke":      60,
	"type-deku":         65,
	"type-bakugo":       65,
	"type-edward":       70,
	"type-alphonse":     70,
	"type-gon":          65,
	"type-killua":       70,
	"type-light":        85,
	"type-ryuk":         80,
	"type-asta":         65,
	"type-yuno":         65,
	"type-natsu":        60,
	"type-erza":         70,
	"type-gray":         60,
	"type-kirito":       60,
	"type-asuna":        60,
	"type-mob":          75,
	"type-saitama":     100,
	"type-senku":        75,
	"type-spike":        70,
	"type-gintoki":      75,
	"type-onepunch":     80,
	"type-fullcowl":     70,
	"type-bankai":       90,
	"type-kamehameha":   90,
	"type-rasengan":     80,
	"type-shannaro":     60,
	"type-byakugan":     75,
	"type-rinnengan":    95,
	"type-zanpakuto":    70,
	"type-hollowmask":   80,
	"type-haki":         85,
	"type-onepiece":     95,
	"type-freedomsong":  75,
	"type-akatsuki":     70,
	"type-jutsu":        55,
	"type-nen":          75,
	"type-transmute":    75,
	"type-requiem":      85,
	"type-zawarudo":     90,
	"type-diomuda":      80,
	"type-oraoraora":    80,
	"type-chuunibyou":   60,
	"type-waifu":        50,
	"type-husbando":     50,
	"type-nakama":       70,
	"type-korosensei":   70,
	"type-geass":        90,
	"type-anime":        30,
	"type-manga":        30,
	"type-otaku":        40,
	"type-kawaii":       35,
	"type-sugoi":        35,
	"type-senpai":       45,
	"type-desu":         35,
	"type-konnichiwa":   30,
	"type-ohayou":       25,
	"type-arigatou":     25,
	"type-samurai":      65,
	"type-shinobi":      65,
	"type-sakura":       40,
	"type-ramen":        35,
	"type-shonen":       45,
	"type-seinen":       45,
	"type-shoujo":       45,
	"type-josei":        45,
	"type-mecha":        55,
	"type-ova":          35,
	"type-kimetsu":      65,
	"type-jojo":         80,
	"type-pokemon":      50,
	"type-digimon":      50,
	"type-evangelion":   85,
	"type-ayanami":      70,
	"type-asuka":        70,
	"type-haruhi":       65,
	"type-clannad":      75,
	"type-steins":       85,
	"type-rezero":       80,
	"type-emilia":       65,
	"type-rem":          70,
	"type-overlord":     75,
	"type-rimuru":       65,
	"type-konosuba":     65,
	"type-naofumi":      65,
	"type-noragami":     70,
	"type-vinland":      80,
	"type-berserk":      90,
	"type-vagabond":     80,
	"type-frieren":      75,
	"type-dandadan":     65,
	"type-chainsaw":     85,
	"type-anya":         65,
	"type-bocchi":       65,
	"type-haikyuu":      70,
	"type-toradora":     65,
	"type-kaguya":       65,
	"type-violet":       80,
	"type-chihiro":      75,
	"type-kiki":         65,
	"type-fma":          70,
	"type-ymir":         75,
	"type-mikasa":       65,
	"type-historia":     65,
	"type-hunter":       60,
	"type-phantom":      80,

	// Click counts
	"click-logo-10":    50,
	"click-logo-30":    75,
	"click-logo-100":  120,
	"avatar-click-10":  60,
	"avatar-click-50":  90,

	// Dates
	"new-year-visit":        200,
	"valentines-visit":       80,
	"white-day":              80,
	"april-fools":            60,
	"star-wars-day":          50,
	"tanabata":               90,
	"midsummer":              60,
	"obon":                   70,
	"halloween-visit":       120,
	"christmas-eve":         100,
	"christmas-visit":       150,
	"new-years-eve":         100,
	"birthday-naruto":        80,
	"birthday-luffy":         80,
	"birthday-goku":          80,
	"birthday-ichigo":        80,
	"birthday-levi":          80,
	"birthday-tanjiro":       80,
	"birthday-light":         80,
	"birthday-gojo":          90,
	"birthday-rem":           75,
	"birthday-anya":          75,
	"birthday-edward":        75,
	"birthday-deku":          75,
	"birthday-mikasa":        75,
	"anniversary-naruto":    100,
	"anniversary-bleach":    100,
	"anniversary-fma":       100,
	"anniversary-aot":       100,
	"anniversary-onepiece":  100,
	"anniversary-dbz":       100,
	"anniversary-dn":        100,

	// Time of day
	"midnight-visit":    50,
	"deep-night-2am":    55,
	"deep-night-3am":    60,
	"deep-night-4am":    65,
	"early-morning-6am": 35,
	"monday-morning":    20,
	"lunch-break":       30,
	"friday-night":      30,
	"saturday-morning":  40,
	"sunday-night":      35,
	"midnight-30":       40,

	// Scroll / idle
	"scroll-to-bottom": 30,
	"idle-5min":         25,
	"long-session":      50,
	"ultra-session":     80,

	// Page visits
	"page-character":      20,
	"page-staff":          20,
	"page-studio":         20,
	"page-manga":          15,
	"page-discover":       15,
	"page-schedule":       15,
	"page-community":      20,
	"page-settings":       10,
	"page-torrent":        25,
	"page-debrid":         25,
	"page-extensions":     20,
	"page-onlinestream":   20,
	"page-profile-me":     10,
	"page-profile-user":   25,
	"page-nakama":         30,
	"page-playlist":       15,
	"page-mediastream":    20,
	"page-achievement":    15,
	"page-privacy":        20,
	"page-troubleshooter": 25,

	// Manual
	"theme-changed-5":        50,
	"theme-changed-10":       70,
	"theme-changed-20":       80,
	"search-empty":           25,
	"dark-mode-toggle":       20,
	"watched-all-episodes":   75,
	"manga-binge":            75,
	"achievement-unlock-10":  80,
	"profile-complete":       60,
	"secret-path":           150,
	"first-download":         40,
	"first-stream":           40,
	"first-watched":          30,
	"first-manga-read":       30,
	"added-to-list":          20,
	"completed-series":       50,
	"watched-movie":          40,
	"wrote-review":           45,
	"joined-watch-party":     60,
	"hosted-watch-party":     80,
	"used-plugin":            30,
	"customized-cursor":      25,
	"equipped-title":         25,
	"sent-community-message": 30,
	"added-to-favorites":     20,
	"bulk-favorites":         40,
	"torrent-streamed":       50,
	"debrid-used":            45,
	"autodownloader-setup":   55,
	"score-updated":          20,

	// Milestones — anime count
	"anime-count-1":     20,
	"anime-count-5":     25,
	"anime-count-10":    30,
	"anime-count-25":    40,
	"anime-count-50":    55,
	"anime-count-100":   80,
	"anime-count-200":  100,
	"anime-count-300":  120,
	"anime-count-500":  150,
	"anime-count-750":  180,
	"anime-count-1000": 250,

	// Milestones — manga count
	"manga-count-1":     20,
	"manga-count-5":     25,
	"manga-count-10":    30,
	"manga-count-25":    40,
	"manga-count-50":    55,
	"manga-count-100":   80,
	"manga-count-200":  100,
	"manga-count-500":  150,
	"manga-count-1000": 250,

	// Milestones — episodes watched
	"episodes-10":    20,
	"episodes-50":    30,
	"episodes-100":   45,
	"episodes-500":   80,
	"episodes-1000": 120,
	"episodes-5000": 200,
	"episodes-10000":300,

	// Milestones — chapters read
	"chapters-10":    20,
	"chapters-50":    30,
	"chapters-100":   45,
	"chapters-500":   75,
	"chapters-1000": 100,
	"chapters-5000": 200,

	// Milestones — level
	"level-5":   30,
	"level-10":  40,
	"level-15":  50,
	"level-20":  60,
	"level-25":  70,
	"level-30":  80,
	"level-40":  90,
	"level-50": 100,
	"level-60": 110,
	"level-75": 120,
	"level-100":200,

	// Milestones — total XP
	"xp-1000":   30,
	"xp-5000":   50,
	"xp-10000":  80,
	"xp-50000": 120,
	"xp-100000":200,

	// Milestones — achievements
	"ach-5":   40,
	"ach-10":  60,
	"ach-20":  80,
	"ach-50": 120,

	// Milestones — eggs found
	"eggs-5":   30,
	"eggs-10":  50,
	"eggs-25":  75,
	"eggs-50": 100,
	"eggs-100":150,
	"eggs-200":200,

	// Milestones — cursors unlocked
	"cursors-5":  30,
	"cursors-10": 50,
	"cursors-20": 75,

	// Feature discovery
	"feature-first-extension":  40,
	"feature-first-custom-src": 40,
	"feature-discord-rpc":      30,
	"feature-doh-enabled":      35,
	"feature-playlist-created": 35,
	"feature-scan-library":     25,
	"feature-manga-reader":     25,
	"feature-nakama-chat":      40,
	"feature-auto-update":      30,
	"feature-theme-music":      25,
	"feature-particle-fx":      25,
	"feature-shortcuts":        20,
	"feature-seacommand":       25,
	"feature-schedule-check":   15,
}
