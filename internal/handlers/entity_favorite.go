package handlers

import (
	"github.com/labstack/echo/v4"
)

// HandleGetCharacterFavorites
//
//	@summary get the list of favorited character IDs.
//	@desc Returns an array of character IDs that are favorited for the current profile.
//	@returns []int
//	@route /api/v1/character/favorites [GET]
func (h *Handler) HandleGetCharacterFavorites(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)
	ids, err := pdb.GetCharacterFavoriteIDs()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, ids)
}

// HandleToggleCharacterFavorite
//
//	@summary toggle a character as favorite (add/remove).
//	@desc Adds the character to favorites if not present, removes it if already favorited.
//	@returns bool
//	@route /api/v1/character/favorites/toggle [POST]
func (h *Handler) HandleToggleCharacterFavorite(c echo.Context) error {
	type body struct {
		CharacterID int `json:"characterId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.CharacterID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "characterId is required"))
	}

	pdb := h.GetProfileDatabase(c)
	isFavorited, err := pdb.ToggleCharacterFavorite(b.CharacterID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, isFavorited)
}

// HandleGetStaffFavorites
//
//	@summary get the list of favorited staff IDs.
//	@desc Returns an array of staff IDs that are favorited for the current profile.
//	@returns []int
//	@route /api/v1/staff/favorites [GET]
func (h *Handler) HandleGetStaffFavorites(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)
	ids, err := pdb.GetStaffFavoriteIDs()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, ids)
}

// HandleToggleStaffFavorite
//
//	@summary toggle a staff member as favorite (add/remove).
//	@desc Adds the staff to favorites if not present, removes it if already favorited.
//	@returns bool
//	@route /api/v1/staff/favorites/toggle [POST]
func (h *Handler) HandleToggleStaffFavorite(c echo.Context) error {
	type body struct {
		StaffID int `json:"staffId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.StaffID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "staffId is required"))
	}

	pdb := h.GetProfileDatabase(c)
	isFavorited, err := pdb.ToggleStaffFavorite(b.StaffID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, isFavorited)
}

// HandleGetStudioFavorites
//
//	@summary get the list of favorited studio IDs.
//	@desc Returns an array of studio IDs that are favorited for the current profile.
//	@returns []int
//	@route /api/v1/studio/favorites [GET]
func (h *Handler) HandleGetStudioFavorites(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)
	ids, err := pdb.GetStudioFavoriteIDs()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, ids)
}

// HandleToggleStudioFavorite
//
//	@summary toggle a studio as favorite (add/remove).
//	@desc Adds the studio to favorites if not present, removes it if already favorited.
//	@returns bool
//	@route /api/v1/studio/favorites/toggle [POST]
func (h *Handler) HandleToggleStudioFavorite(c echo.Context) error {
	type body struct {
		StudioID int `json:"studioId"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.StudioID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "studioId is required"))
	}

	pdb := h.GetProfileDatabase(c)
	isFavorited, err := pdb.ToggleStudioFavorite(b.StudioID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, isFavorited)
}
