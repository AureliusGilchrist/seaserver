package handlers

import (
	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// HandleGetTrackPreferences
//
//	@summary Returns all per-media track preferences for the current profile.
//	@route /api/v1/mediastream/track-preferences [GET]
//	@returns map[string]models.TrackPreference
func (h *Handler) HandleGetTrackPreferences(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)
	if pdb == nil {
		return h.RespondWithData(c, map[string]interface{}{})
	}

	prefs, err := pdb.GetAllTrackPreferences()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Return as a map keyed by mediaId for easy client consumption
	result := make(map[string]models.TrackPreference, len(prefs))
	for _, p := range prefs {
		result[p.MediaID] = *p
	}
	return h.RespondWithData(c, result)
}

// HandleUpsertTrackPreference
//
//	@summary Creates or updates a per-media track preference.
//	@route /api/v1/mediastream/track-preferences [POST]
//	@returns bool
func (h *Handler) HandleUpsertTrackPreference(c echo.Context) error {
	type body struct {
		MediaID          string `json:"mediaId"`
		AudioLanguage    string `json:"audioLanguage,omitempty"`
		AudioCodecID     string `json:"audioCodecId,omitempty"`
		SubtitleLanguage string `json:"subtitleLanguage,omitempty"`
		SubtitleCodecID  string `json:"subtitleCodecId,omitempty"`
	}

	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}

	pdb := h.GetProfileDatabase(c)
	if pdb == nil {
		return h.RespondWithData(c, true)
	}

	err := pdb.UpsertTrackPreference(&models.TrackPreference{
		MediaID:          b.MediaID,
		AudioLanguage:    b.AudioLanguage,
		AudioCodecID:     b.AudioCodecID,
		SubtitleLanguage: b.SubtitleLanguage,
		SubtitleCodecID:  b.SubtitleCodecID,
	})
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}
