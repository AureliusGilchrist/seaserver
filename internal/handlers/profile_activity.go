package handlers

import (
	"seanime/internal/profileactivity"

	"github.com/labstack/echo/v4"
)

// HandleGetProfilesActivity
//
//	@summary returns what every profile on this server is doing right now.
//	@desc Online is derived from live websocket connections. Watching activity comes from
//	@desc VideoCore's per-client playback states (mapped back to profiles through the
//	@desc websocket registry). Reading activity is what manga clients reported.
//	@returns profileactivity.List
//	@route /api/v1/profiles/activity [GET]
func (h *Handler) HandleGetProfilesActivity(c echo.Context) error {
	list := profileactivity.List{Items: []profileactivity.Item{}}

	profiles, err := h.App.ProfileManager.GetAllProfiles()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	online := h.App.WSEventManager.ProfileIdsOnline()

	// Watching: playback per profile from VideoCore's per-client states.
	watching := make(map[uint]profileactivity.Item)
	for _, snap := range h.App.VideoCore.GetPlaybackStateSnapshots() {
		profileID, ok := h.App.WSEventManager.ProfileIdForClient(snap.ClientId)
		if !ok {
			continue
		}
		info := snap.PlaybackInfo
		item := profileactivity.Item{
			Kind:          profileactivity.KindWatching,
			MediaTitle:    info.Media.GetPreferredTitle(),
			EpisodeNumber: info.Episode.EpisodeNumber,
		}
		if snap.Status != nil && snap.Status.Duration > 0 {
			item.ProgressPercent = (snap.Status.CurrentTime / snap.Status.Duration) * 100
		}
		watching[profileID] = item
	}

	for _, p := range profiles {
		_, isOnline := online[p.ID]
		item := profileactivity.Item{
			ProfileID: p.ID,
			Username:  p.Name,
			IsOnline:  isOnline,
			Kind:      profileactivity.KindIdle,
		}
		if w, ok := watching[p.ID]; ok {
			item.Kind = w.Kind
			item.MediaTitle = w.MediaTitle
			item.EpisodeNumber = w.EpisodeNumber
			item.ProgressPercent = w.ProgressPercent
		} else if r, ok := h.App.ProfileActivityManager.Reading(p.ID); ok {
			item.Kind = r.Kind
			item.MediaTitle = r.MediaTitle
			item.ChapterNumber = r.ChapterNumber
			item.ProgressPercent = r.ProgressPercent
		}
		list.Items = append(list.Items, item)
	}

	return h.RespondWithData(c, list)
}

// HandleSetProfileActivity
//
//	@summary reports this profile's client-side activity (manga reading).
//	@desc The manga reader calls this when a chapter is opened and with an empty title
//	@desc when reading stops. Only reading activity is client-reported; watching is
//	@desc derived from VideoCore server-side.
//	@returns bool
//	@route /api/v1/profiles/activity [POST]
func (h *Handler) HandleSetProfileActivity(c echo.Context) error {
	type body struct {
		MediaTitle      string  `json:"mediaTitle"`
		ChapterNumber   int     `json:"chapterNumber"`
		ProgressPercent float64 `json:"progressPercent"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)
	h.App.ProfileActivityManager.SetReading(profileID, b.MediaTitle, b.ChapterNumber, b.ProgressPercent)
	return h.RespondWithData(c, true)
}
