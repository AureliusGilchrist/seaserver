package handlers

import (
	"encoding/json"
	"strconv"
	"strings"

	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// A profile's todo list: what they mean to watch or read, in the order they arranged, shown on their
// profile for others to see.
//
// It starts blank, and every entry on it was put there deliberately from an anime's own page — so
// there is no automatic filling and nothing to turn off; the list is exactly as long as its owner
// made it.

// toWatchEntry is one row of the list, as the screen draws it: the snapshot taken when it was added,
// plus the media type and id, which together are the row's identity.
//
// The snapshot carries everything a row shows, because a list of thousands rendered a row at a time
// must not ask AniList for each one — and a list that shows what was true when it was added does not
// change under the person reading it.
type toWatchEntry struct {
	AnimeID     int      `json:"animeId,omitempty"`
	MediaID     int      `json:"mediaId"`
	MediaType   string   `json:"mediaType"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	CoverImage  string   `json:"coverImage,omitempty"`
	BannerImage string   `json:"bannerImage,omitempty"`
	Format      string   `json:"format,omitempty"`
	Episodes    int      `json:"episodes,omitempty"`
	Chapters    int      `json:"chapters,omitempty"`
	Volumes     int      `json:"volumes,omitempty"`
	Duration    int      `json:"duration,omitempty"`
	Season      string   `json:"season,omitempty"`
	SeasonYear  int      `json:"seasonYear,omitempty"`
	Status      string   `json:"status,omitempty"`
	MeanScore   int      `json:"meanScore,omitempty"`
	Genres      []string `json:"genres,omitempty"`
	Studio      string   `json:"studio,omitempty"`
}

func decodeToWatchEntry(item *models.ToWatchItem) toWatchEntry {
	mediaType := normalizeToWatchMediaType(item.MediaType)
	entry := toWatchEntry{MediaID: item.AnimeID, MediaType: mediaType}
	if mediaType == "ANIME" {
		entry.AnimeID = item.AnimeID
	}
	if len(item.Value) > 0 {
		_ = json.Unmarshal(item.Value, &entry)
		entry.MediaID = item.AnimeID
		entry.MediaType = mediaType
		entry.AnimeID = 0
		if mediaType == "ANIME" {
			entry.AnimeID = item.AnimeID
		}
	}
	return entry
}

func normalizeToWatchMediaType(mediaType string) string {
	if strings.EqualFold(strings.TrimSpace(mediaType), "MANGA") {
		return "MANGA"
	}
	return "ANIME"
}

// HandleGetToWatch
//
//	@summary returns the authenticated profile's todo list.
//	@desc Returns every entry in the list, in the order they arranged. Starts blank; entries are
//	@desc added from an anime's own page.
//	@route /api/v1/profile/to-watch [GET]
//	@returns []toWatchEntry
func (h *Handler) HandleGetToWatch(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}

	return h.respondWithToWatch(c, profileID)
}

// HandleGetToWatchForUser
//
//	@summary returns a profile's todo list.
//	@desc The same list, by profile — this is what a public profile shows, so whoever is looking can
//	@desc see what that person means to watch next.
//	@route /api/v1/profile/to-watch/user/:profileId [GET]
//	@returns []toWatchEntry
func (h *Handler) HandleGetToWatchForUser(c echo.Context) error {
	pid, err := strconv.ParseUint(c.Param("profileId"), 10, 64)
	if err != nil || pid == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Invalid profile ID"))
	}

	return h.respondWithToWatch(c, uint(pid))
}

func (h *Handler) respondWithToWatch(c echo.Context, profileID uint) error {
	items, err := h.App.Database.GetToWatchItems(profileID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	entries := make([]toWatchEntry, 0, len(items))
	for _, item := range items {
		entries = append(entries, decodeToWatchEntry(item))
	}

	return h.RespondWithData(c, entries)
}

// HandleAddToWatch
//
//	@summary adds anime or manga to the end of the authenticated profile's todo list.
//	@desc The entry is added with a snapshot of the media taken from the body, so the list renders
//	@desc without asking AniList for every row. Adding the same media twice is refused — the list is
//	@desc a running order, and the same anime twice in it is the same entry.
//	@route /api/v1/profile/to-watch/add [POST]
//	@returns []toWatchEntry
func (h *Handler) HandleAddToWatch(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}

	type body struct {
		MediaID     int      `json:"mediaId"`
		AnimeID     int      `json:"animeId"`
		MediaType   string   `json:"mediaType"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		CoverImage  string   `json:"coverImage"`
		BannerImage string   `json:"bannerImage"`
		Format      string   `json:"format"`
		Episodes    int      `json:"episodes"`
		Chapters    int      `json:"chapters"`
		Volumes     int      `json:"volumes"`
		Duration    int      `json:"duration"`
		Season      string   `json:"season"`
		SeasonYear  int      `json:"seasonYear"`
		Status      string   `json:"status"`
		MeanScore   int      `json:"meanScore"`
		Genres      []string `json:"genres"`
		Studio      string   `json:"studio"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	mediaID := b.MediaID
	if mediaID == 0 {
		mediaID = b.AnimeID
	}
	if mediaID <= 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaId is required"))
	}
	mediaType := normalizeToWatchMediaType(b.MediaType)
	if b.MediaType != "" && mediaType == "ANIME" && !strings.EqualFold(strings.TrimSpace(b.MediaType), "ANIME") {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaType must be ANIME or MANGA"))
	}

	// How many are already on the list, so this one goes at the end. A list is allowed to be as
	// long as its owner wants — thousands is a list — so there is no cap to reach.
	count, err := h.App.Database.CountToWatchItems(profileID)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	entry := toWatchEntry{
		MediaID:     mediaID,
		MediaType:   mediaType,
		Title:       b.Title,
		Description: b.Description,
		CoverImage:  b.CoverImage,
		BannerImage: b.BannerImage,
		Format:      b.Format,
		Episodes:    b.Episodes,
		Chapters:    b.Chapters,
		Volumes:     b.Volumes,
		Duration:    b.Duration,
		Season:      b.Season,
		SeasonYear:  b.SeasonYear,
		Status:      b.Status,
		MeanScore:   b.MeanScore,
		Genres:      b.Genres,
		Studio:      b.Studio,
	}
	if mediaType == "ANIME" {
		entry.AnimeID = mediaID
	}
	snapshot, err := json.Marshal(entry)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	item := &models.ToWatchItem{
		ProfileID: profileID,
		AnimeID:   mediaID,
		MediaType: mediaType,
		Position:  count + 1,
		Value:     snapshot,
	}

	if err := h.App.Database.InsertToWatchItem(item); err != nil {
		return h.RespondWithError(c, err)
	}

	h.App.Logger.Info().Int("mediaId", mediaID).Str("mediaType", mediaType).Uint("profileId", profileID).
		Msg("profile: Added to the todo list")

	return h.respondWithToWatch(c, profileID)
}

// HandleRemoveToWatch
//
//	@summary removes anime or manga from the authenticated profile's todo list.
//	@route /api/v1/profile/to-watch/remove [POST]
//	@returns []toWatchEntry
func (h *Handler) HandleRemoveToWatch(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}

	type body struct {
		MediaID   int    `json:"mediaId"`
		AnimeID   int    `json:"animeId"`
		MediaType string `json:"mediaType"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	mediaID := b.MediaID
	if mediaID == 0 {
		mediaID = b.AnimeID
	}
	if mediaID <= 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaId is required"))
	}

	mediaType := normalizeToWatchMediaType(b.MediaType)
	if b.MediaType != "" && mediaType == "ANIME" && !strings.EqualFold(strings.TrimSpace(b.MediaType), "ANIME") {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaType must be ANIME or MANGA"))
	}
	if err := h.App.Database.DeleteToWatchItem(profileID, mediaID, mediaType); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.respondWithToWatch(c, profileID)
}

// HandleReorderToWatch
//
//	@summary rewrites the order of the authenticated profile's todo list.
//	@desc The body is the media IDs and types in their new order; positions are rewritten whole from it, so a
//	@desc reorder is exactly the arrangement that was made.
//	@route /api/v1/profile/to-watch/reorder [POST]
//	@returns []toWatchEntry
func (h *Handler) HandleReorderToWatch(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}

	type body struct {
		AnimeIDs []int `json:"animeIds"`
		Items    []struct {
			MediaID   int    `json:"mediaId"`
			MediaType string `json:"mediaType"`
		} `json:"items"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	items := make([]*models.ToWatchItem, 0, len(b.Items)+len(b.AnimeIDs))
	for _, item := range b.Items {
		if item.MediaID <= 0 {
			return h.RespondWithError(c, echo.NewHTTPError(400, "mediaId must be positive"))
		}
		mediaType := normalizeToWatchMediaType(item.MediaType)
		if item.MediaType != "" && mediaType == "ANIME" && !strings.EqualFold(strings.TrimSpace(item.MediaType), "ANIME") {
			return h.RespondWithError(c, echo.NewHTTPError(400, "mediaType must be ANIME or MANGA"))
		}
		items = append(items, &models.ToWatchItem{AnimeID: item.MediaID, MediaType: mediaType})
	}
	if len(items) == 0 {
		for _, animeID := range b.AnimeIDs {
			items = append(items, &models.ToWatchItem{AnimeID: animeID, MediaType: "ANIME"})
		}
	}
	if len(items) == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "no order given"))
	}

	if err := h.App.Database.SetToWatchOrder(profileID, items); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.respondWithToWatch(c, profileID)
}

// HandleClearToWatch
//
//	@summary empties the authenticated profile's todo list.
//	@route /api/v1/profile/to-watch/clear [POST]
//	@returns []toWatchEntry
func (h *Handler) HandleClearToWatch(c echo.Context) error {
	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(401, "Not authenticated"))
	}

	if err := h.App.Database.ClearToWatchItems(profileID); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}
