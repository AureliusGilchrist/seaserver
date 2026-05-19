package handlers

import (
	"encoding/json"
	"math"
	"strconv"
	"time"

	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// TimelineEvent is a single resolved activity event for the timeline UI.
type TimelineEvent struct {
	ID        uint      `json:"id"`
	EventType string    `json:"eventType"`
	MediaID   int       `json:"mediaId"`
	Metadata  string    `json:"metadata"`
	CreatedAt time.Time `json:"createdAt"`
	// Resolved media info (nil if media not found in collection)
	MediaTitle *string `json:"mediaTitle,omitempty"`
	MediaImage *string `json:"mediaImage,omitempty"`
	MediaType  string  `json:"mediaType"` // "anime" or "manga" or ""
	// Resolved achievement info (only set for achievement_unlocked events)
	AchievementIconSVG *string `json:"achievementIconSvg,omitempty"`
	AchievementDesc    *string `json:"achievementDesc,omitempty"`
}

// timelineHiddenEventTypes is the set of event types that should NEVER appear on
// the public-facing activity timeline (they're either internal bookkeeping or
// noise the user doesn't care about). Note: this does not delete them from the
// underlying DB — they're still used by achievement evaluation, etc.
var timelineHiddenEventTypes = map[string]bool{
	models.ActivityEventLibraryScanned:      true,
	models.ActivityEventFileMatched:         true,
	models.ActivityEventFileUnmatched:       true,
	models.ActivityEventAnilistEntryEdited:  true,
	models.ActivityEventAnilistEntryDeleted: true,
	models.ActivityEventStatusChanged:       true,
}

// sessionGapSeconds is the maximum gap between two consecutive episode-watched
// (or chapter-read) events for them to be collapsed into a single session card.
const sessionGapSeconds = 3600 // 1 hour

// TimelineResponse is the paginated response for the timeline endpoint.
type TimelineResponse struct {
	Events  []*TimelineEvent `json:"events"`
	Page    int              `json:"page"`
	HasMore bool             `json:"hasMore"`
	Total   int64            `json:"total"`
}

// HandleGetTimeline
//
//	@summary returns paginated timeline events with resolved media info.
//	@desc Returns activity events enriched with anime/manga titles and cover images.
//	@param page - int - false - "Page number (default 1)"
//	@param pageSize - int - false - "Events per page (default 50)"
//	@returns TimelineResponse
//	@route /api/v1/profile/timeline [GET]
func (h *Handler) HandleGetTimeline(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)
	return h.respondWithTimeline(c, pdb)
}

// HandleGetUserTimeline
//
//	@summary returns paginated timeline events for a specific profile.
//	@desc Returns activity events for another user's profile (community profile view).
//	@param id - int - true - "Profile ID"
//	@param page - int - false - "Page number (default 1)"
//	@param pageSize - int - false - "Events per page (default 50)"
//	@returns TimelineResponse
//	@route /api/v1/profile/timeline/{id} [GET]
func (h *Handler) HandleGetUserTimeline(c echo.Context) error {
	idStr := c.Param("id")
	pid, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || pid == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "Invalid profile ID"))
	}
	if h.App.ProfileDatabaseManager == nil {
		return h.RespondWithError(c, echo.NewHTTPError(404, "Profiles not active"))
	}
	pdb, err := h.App.ProfileDatabaseManager.GetDatabase(uint(pid))
	if err != nil || pdb == nil {
		return h.RespondWithError(c, echo.NewHTTPError(404, "Profile not found"))
	}
	return h.respondWithTimeline(c, pdb)
}

// respondWithTimeline is the shared implementation for both my-timeline and
// user-timeline. It paginates events from the given profile DB, filters out
// internal/noisy event types, collapses consecutive episode_watched and
// manga_chapter_read events for the same media within sessionGapSeconds into a
// single synthetic "watch_session" / "reading_session" event, and resolves
// media + achievement metadata.
func (h *Handler) respondWithTimeline(c echo.Context, pdb interface {
	GetActivityEventsPaginated(page, pageSize int) ([]*models.ActivityEvent, int64, error)
}) error {
	page := 1
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}

	pageSize := 50
	if ps := c.QueryParam("pageSize"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 && v <= 200 {
			pageSize = v
		}
	}

	// Fetch a larger window than pageSize so we can both (a) skip hidden events
	// and (b) collapse session-style events without running out of data on the
	// last page. We then slice to pageSize after filtering.
	fetchSize := pageSize * 4
	if fetchSize > 400 {
		fetchSize = 400
	}
	events, total, err := pdb.GetActivityEventsPaginated(page, fetchSize)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Filter out hidden internal events first.
	visible := make([]*models.ActivityEvent, 0, len(events))
	for _, ev := range events {
		if timelineHiddenEventTypes[ev.EventType] {
			continue
		}
		visible = append(visible, ev)
	}

	// Collapse consecutive watch/read events for the same media into sessions.
	// Events are already ordered newest-first, so iterate and group while the
	// previous-of-same-type event (older timestamp) is within sessionGapSeconds.
	collapsed := collapseSessions(visible)

	// Build a lookup map for achievement definitions
	achDefMap := achievement.DefinitionMap()

	// Build lookup maps from cached collections
	animeLookup := make(map[int]*anilist.BaseAnime)
	mangaLookup := make(map[int]*anilist.BaseManga)

	if col, err := h.App.GetAnimeCollection(false); err == nil && col != nil {
		for _, l := range col.GetMediaListCollection().GetLists() {
			for _, e := range l.GetEntries() {
				if e.GetMedia() != nil {
					animeLookup[e.GetMedia().ID] = e.GetMedia()
				}
			}
		}
	}

	if col, err := h.App.GetMangaCollection(false); err == nil && col != nil {
		for _, l := range col.GetMediaListCollection().GetLists() {
			for _, e := range l.GetEntries() {
				if e.GetMedia() != nil {
					mangaLookup[e.GetMedia().ID] = e.GetMedia()
				}
			}
		}
	}

	// Resolve events
	resolved := make([]*TimelineEvent, 0, len(collapsed))
	for _, ev := range collapsed {
		te := &TimelineEvent{
			ID:        ev.ID,
			EventType: ev.EventType,
			MediaID:   ev.MediaId,
			Metadata:  ev.Metadata,
			CreatedAt: ev.CreatedAt,
		}

		// Try anime first, then manga
		if anime, ok := animeLookup[ev.MediaId]; ok && ev.MediaId > 0 {
			te.MediaType = "anime"
			if anime.Title != nil && anime.Title.UserPreferred != nil {
				te.MediaTitle = anime.Title.UserPreferred
			}
			if anime.CoverImage != nil {
				if anime.CoverImage.Medium != nil {
					te.MediaImage = anime.CoverImage.Medium
				} else if anime.CoverImage.Large != nil {
					te.MediaImage = anime.CoverImage.Large
				}
			}
		} else if manga, ok := mangaLookup[ev.MediaId]; ok && ev.MediaId > 0 {
			te.MediaType = "manga"
			if manga.Title != nil && manga.Title.UserPreferred != nil {
				te.MediaTitle = manga.Title.UserPreferred
			}
			if manga.CoverImage != nil {
				if manga.CoverImage.Medium != nil {
					te.MediaImage = manga.CoverImage.Medium
				} else if manga.CoverImage.Large != nil {
					te.MediaImage = manga.CoverImage.Large
				}
			}
		} else {
			// Infer type from event
			te.MediaType = inferMediaType(ev.EventType, ev.Metadata)
		}

		// Enrich achievement events with definition data
		if ev.EventType == "achievement_unlocked" {
			meta := ParseEventMetadata(ev.Metadata)
			if meta != nil {
				if key, ok := meta["key"].(string); ok {
					if def, ok := achDefMap[key]; ok && def != nil {
						svg := def.IconSVG
						desc := def.Description
						te.AchievementIconSVG = &svg
						te.AchievementDesc = &desc
					}
				}
			}
		}

		resolved = append(resolved, te)
	}

	// Trim to pageSize after filtering+collapsing.
	if len(resolved) > pageSize {
		resolved = resolved[:pageSize]
	}

	return h.RespondWithData(c, &TimelineResponse{
		Events:  resolved,
		Page:    page,
		HasMore: int64(page*fetchSize) < total,
		Total:   total,
	})
}

// collapseSessions merges consecutive episode_watched / manga_chapter_read
// events for the same media into a single synthetic event when they're within
// sessionGapSeconds of each other. Input must be sorted newest-first.
//
// The resulting synthetic event has:
//   - EventType = "watch_session" or "reading_session"
//   - CreatedAt = newest event's timestamp (used for sorting & day grouping)
//   - Metadata  = JSON: {"firstEpisode": N, "lastEpisode": M, "count": K,
//                        "startedAt": "...", "endedAt": "..."}
//
// Single-event sessions keep their original event type — the UI only needs the
// "session" treatment when there are 2+ episodes.
func collapseSessions(events []*models.ActivityEvent) []*models.ActivityEvent {
	if len(events) == 0 {
		return events
	}

	out := make([]*models.ActivityEvent, 0, len(events))

	// We walk newest→oldest. For each candidate "session anchor" (newest event),
	// scan forward while the next event is the same type, same media, and
	// within sessionGapSeconds of the previous one in the run.
	i := 0
	for i < len(events) {
		ev := events[i]
		isWatch := ev.EventType == models.ActivityEventEpisodeWatched
		isRead := ev.EventType == models.ActivityEventMangaChapterRead
		if !isWatch && !isRead {
			out = append(out, ev)
			i++
			continue
		}

		// Find run of consecutive same-media events within session gap.
		j := i
		prev := ev.CreatedAt
		for j+1 < len(events) {
			next := events[j+1]
			if next.EventType != ev.EventType || next.MediaId != ev.MediaId {
				break
			}
			// events sorted DESC → next is older than prev. Gap = prev - next.
			if prev.Sub(next.CreatedAt).Seconds() > float64(sessionGapSeconds) {
				break
			}
			prev = next.CreatedAt
			j++
		}

		if j == i {
			// Single event, no collapsing needed.
			out = append(out, ev)
			i++
			continue
		}

		// Build synthetic session event spanning events[i..j].
		// Newest event is events[i] (used for createdAt + ID).
		// Oldest is events[j] (used for startedAt).
		first, last := math.MaxInt, math.MinInt
		count := 0
		for k := i; k <= j; k++ {
			meta := ParseEventMetadata(events[k].Metadata)
			if meta == nil {
				continue
			}
			var n int
			if isWatch {
				if v, ok := meta["episode"]; ok {
					n = toInt(v)
				}
			} else {
				if v, ok := meta["chapter"]; ok {
					n = toInt(v)
				}
			}
			if n > 0 {
				if n < first {
					first = n
				}
				if n > last {
					last = n
				}
			}
			count++
		}

		sessionType := "watch_session"
		if isRead {
			sessionType = "reading_session"
		}

		payload := map[string]interface{}{
			"count":     count,
			"startedAt": events[j].CreatedAt.Format(time.RFC3339),
			"endedAt":   events[i].CreatedAt.Format(time.RFC3339),
		}
		if first != math.MaxInt && last != math.MinInt {
			if isWatch {
				payload["firstEpisode"] = first
				payload["lastEpisode"] = last
			} else {
				payload["firstChapter"] = first
				payload["lastChapter"] = last
			}
		}
		metaBytes, _ := json.Marshal(payload)

		synthetic := &models.ActivityEvent{
			BaseModel: events[i].BaseModel,
			EventType: sessionType,
			MediaId:   ev.MediaId,
			Metadata:  string(metaBytes),
		}
		out = append(out, synthetic)
		i = j + 1
	}

	return out
}

func toInt(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	}
	return 0
}

// inferMediaType guesses media type from event type and metadata payload.
func inferMediaType(eventType string, metadata string) string {
	switch eventType {
	case models.ActivityEventEpisodeWatched, "watch_session":
		return "anime"
	case models.ActivityEventMangaChapterRead, "reading_session":
		return "manga"
	case "series_complete":
		meta := ParseEventMetadata(metadata)
		if meta != nil {
			if t, ok := meta["type"].(string); ok {
				switch t {
				case "anime":
					return "anime"
				case "manga":
					return "manga"
				}
			}
		}
		// Default to anime — series_complete without type is recorded only by the
		// anime-completion path (handlers/anime_entries.go); manga path always sets type=manga.
		return "anime"
	case models.ActivityEventAnilistEntryEdited, models.ActivityEventAnilistEntryDeleted:
		meta := ParseEventMetadata(metadata)
		if meta != nil {
			if t, ok := meta["type"].(string); ok {
				switch t {
				case "anime":
					return "anime"
				case "manga":
					return "manga"
				}
			}
		}
		return ""
	default:
		return ""
	}
}

// ParseEventMetadata is a helper to parse the JSON metadata blob.
func ParseEventMetadata(metadata string) map[string]interface{} {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(metadata), &m); err != nil {
		return nil
	}
	return m
}
