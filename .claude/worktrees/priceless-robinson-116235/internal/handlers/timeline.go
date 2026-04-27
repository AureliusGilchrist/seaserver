package handlers

import (
	"encoding/json"
	"strconv"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// TimelineEvent is a single resolved activity event for the timeline UI.
type TimelineEvent struct {
	ID        uint       `json:"id"`
	EventType string     `json:"eventType"`
	MediaID   int        `json:"mediaId"`
	Metadata  string     `json:"metadata"`
	CreatedAt time.Time  `json:"createdAt"`
	// Resolved media info (nil if media not found in collection)
	MediaTitle    *string `json:"mediaTitle,omitempty"`
	MediaImage    *string `json:"mediaImage,omitempty"`
	MediaType     string  `json:"mediaType"` // "anime" or "manga" or ""
}

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

	events, total, err := pdb.GetActivityEventsPaginated(page, pageSize)
	if err != nil {
		return h.RespondWithError(c, err)
	}

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
	resolved := make([]*TimelineEvent, 0, len(events))
	for _, ev := range events {
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

		resolved = append(resolved, te)
	}

	return h.RespondWithData(c, &TimelineResponse{
		Events:  resolved,
		Page:    page,
		HasMore: int64(page*pageSize) < total,
		Total:   total,
	})
}

// inferMediaType guesses media type from event type and metadata payload.
func inferMediaType(eventType string, metadata string) string {
	switch eventType {
	case models.ActivityEventEpisodeWatched:
		return "anime"
	case models.ActivityEventMangaChapterRead:
		return "manga"
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
