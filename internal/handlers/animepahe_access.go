package handlers

import (
	"path/filepath"
	"sync"
	"time"

	"seanime/internal/core"
	"seanime/internal/enmasse"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	onlinestream_providers "seanime/internal/onlinestream/providers"

	"github.com/labstack/echo/v4"
)

// AnimePahe is behind Cloudflare's human check. The user passes it in a browser and the
// clearance is saved here (see onlinestream_providers.AnimePaheClearance).

type AnimePaheAccess struct {
	Unlocked  bool       `json:"unlocked"`
	SavedAt   *time.Time `json:"savedAt,omitempty"`
	UserAgent string     `json:"userAgent,omitempty"`
	// Working is the result of the last check (nil when it has not been checked).
	Working   *bool      `json:"working,omitempty"`
	Error     string     `json:"error,omitempty"`
	CheckedAt *time.Time `json:"checkedAt,omitempty"`
}

var (
	animepaheCheckMu sync.Mutex
	animepaheCheck   struct {
		working *bool
		err     string
		at      *time.Time
	}
)

func loadAnimePaheClearance(app *core.App) {
	onlinestream_providers.SetAnimePaheClearanceFile(filepath.Join(app.Config.Data.AppDataDir, "animepahe-clearance.json"))
}

func animepaheAccessState() *AnimePaheAccess {
	st := &AnimePaheAccess{}
	if c := onlinestream_providers.GetAnimePaheClearance(); c != nil {
		st.Unlocked = true
		saved := c.SavedAt
		st.SavedAt = &saved
		st.UserAgent = c.UserAgent
	}
	animepaheCheckMu.Lock()
	st.Working, st.Error, st.CheckedAt = animepaheCheck.working, animepaheCheck.err, animepaheCheck.at
	animepaheCheckMu.Unlock()
	return st
}

// checkAnimePahe runs one search to see whether AnimePahe answers.
func (h *Handler) checkAnimePahe() {
	ok := false
	msg := ""
	p, err := h.onlineProvider(onlinestream_providers.AnimePaheProvider)
	if err == nil {
		_, err = p.Search(hibikeonlinestream.SearchOptions{Query: "naruto"})
	}
	if err == nil {
		ok = true
		enmasse.ClearProviderBlock(onlinestream_providers.AnimePaheProvider)
	} else {
		msg = err.Error()
	}
	now := time.Now()
	animepaheCheckMu.Lock()
	animepaheCheck.working, animepaheCheck.err, animepaheCheck.at = &ok, msg, &now
	animepaheCheckMu.Unlock()
}

// HandleGetAnimePaheAccess
//
//	@summary whether AnimePahe has been unlocked (its Cloudflare check passed) and still answers.
//	@route /api/v1/onlinestream/animepahe/access [GET]
func (h *Handler) HandleGetAnimePaheAccess(c echo.Context) error {
	if c.QueryParam("check") == "true" {
		h.checkAnimePahe()
	}
	return h.RespondWithData(c, animepaheAccessState())
}

// HandleSetAnimePaheAccess
//
//	@summary saves the clearance a browser earned on AnimePahe, then checks that it works.
//	@route /api/v1/onlinestream/animepahe/access [POST]
func (h *Handler) HandleSetAnimePaheAccess(c echo.Context) error {
	var b struct {
		Cookie    string `json:"cookie"`
		UserAgent string `json:"userAgent"`
	}
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if onlinestream_providers.NormalizeAnimePaheCookie(b.Cookie) == "" {
		return h.RespondWithError(c, echo.NewHTTPError(400, "the cookie is empty"))
	}
	if err := onlinestream_providers.SetAnimePaheClearance(&onlinestream_providers.AnimePaheClearance{Cookie: b.Cookie, UserAgent: b.UserAgent}); err != nil {
		return h.RespondWithError(c, err)
	}
	h.checkAnimePahe()
	return h.RespondWithData(c, animepaheAccessState())
}

// HandleDeleteAnimePaheAccess
//
//	@summary forgets the saved AnimePahe clearance.
//	@route /api/v1/onlinestream/animepahe/access [DELETE]
func (h *Handler) HandleDeleteAnimePaheAccess(c echo.Context) error {
	if err := onlinestream_providers.SetAnimePaheClearance(nil); err != nil {
		return h.RespondWithError(c, err)
	}
	animepaheCheckMu.Lock()
	animepaheCheck.working, animepaheCheck.err, animepaheCheck.at = nil, "", nil
	animepaheCheckMu.Unlock()
	return h.RespondWithData(c, animepaheAccessState())
}
