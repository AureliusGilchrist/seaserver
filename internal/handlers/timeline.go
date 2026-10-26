package handlers

import (
	"encoding/json"
	"fmt"
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
	// The list entry's dates and status (YYYY-MM-DD, empty when AniList has none), and the first
	// time this profile watched or read the media here, so the Activity tab can show when a show
	// was started next to its latest update.
	EntryStatus      string     `json:"entryStatus,omitempty"`
	EntryStartedAt   string     `json:"entryStartedAt,omitempty"`
	EntryCompletedAt string     `json:"entryCompletedAt,omitempty"`
	FirstActivityAt  *time.Time `json:"firstActivityAt,omitempty"`
}

func fuzzyDateString(year, month, day *int) string {
	if year == nil || *year <= 0 {
		return ""
	}
	m, d := 1, 1
	if month != nil && *month > 0 {
		m = *month
	}
	if day != nil && *day > 0 {
		d = *day
	}
	return fmt.Sprintf("%04d-%02d-%02d", *year, m, d)
}

type timelineEntryInfo struct {
	status, startedAt, completedAt string
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
//	@param profileId - int - false - "Profile to read (default: the current profile)"
//	@returns TimelineResponse
//	@route /api/v1/profile/timeline [GET]
func (h *Handler) HandleGetTimeline(c echo.Context) error {
	pdb := h.GetProfileDatabase(c)
	profileID := h.GetProfileID(c)

	// Optional ?profileId= — the other-user profile page reads its subject's timeline,
	// not the viewer's. Falls back to the caller's profile when absent or invalid.
	if idStr := c.QueryParam("profileId"); idStr != "" {
		if pid, err := strconv.ParseUint(idStr, 10, 64); err == nil && pid > 0 {
			if h.App.ProfileDatabaseManager != nil {
				if viewedDB, err := h.App.ProfileDatabaseManager.GetDatabase(uint(pid)); err == nil {
					pdb = viewedDB
					profileID = uint(pid)
				}
			}
		}
	}

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

	resolved := h.resolveTimelineEvents(profileID, events)

	// First local watch/read per media on this page, for the "Started" half of the Activity tab.
	mediaIDs := make([]int, 0, len(resolved))
	seenMedia := map[int]bool{}
	for _, te := range resolved {
		if te.MediaID > 0 && !seenMedia[te.MediaID] && (te.EventType == models.ActivityEventEpisodeWatched || te.EventType == models.ActivityEventMangaChapterRead) {
			seenMedia[te.MediaID] = true
			mediaIDs = append(mediaIDs, te.MediaID)
		}
	}
	if firsts := pdb.GetFirstActivityTimes(mediaIDs); len(firsts) > 0 {
		for _, te := range resolved {
			if t, ok := firsts[te.MediaID]; ok {
				t := t
				te.FirstActivityAt = &t
			}
		}
	}

	return h.RespondWithData(c, &TimelineResponse{
		Events:  resolved,
		Page:    page,
		HasMore: int64(page*pageSize) < total,
		Total:   total,
	})
}

// resolveTimelineEvents enriches raw activity events with media titles/images (from the profile's
// cached collections) and achievement details. Shared by the Activity tab and the merged timeline feed.
func (h *Handler) resolveTimelineEvents(profileID uint, events []*models.ActivityEvent) []*TimelineEvent {
	// Build a lookup map for achievement definitions
	achDefMap := achievement.DefinitionMap()

	// Build lookup maps from cached collections.
	// Use the profile's own collections when available — resolving against the global
	// (legacy) collection misses media that only exists in the profile's AniList account,
	// which left timeline entries displaying "Media #123" instead of the title.
	animeLookup := make(map[int]*anilist.BaseAnime)
	mangaLookup := make(map[int]*anilist.BaseManga)
	entryLookup := make(map[int]timelineEntryInfo)

	var animeCol *anilist.AnimeCollection
	var mangaCol *anilist.MangaCollection
	if profileID > 0 && h.App.AnilistClientManager != nil {
		animeCol, _ = h.App.AnilistClientManager.GetAnimeCollection(profileID)
		mangaCol, _ = h.App.AnilistClientManager.GetMangaCollection(profileID)
	}
	if animeCol == nil {
		animeCol, _ = h.App.GetAnimeCollection(false)
	}
	if mangaCol == nil {
		mangaCol, _ = h.App.GetMangaCollection(false)
	}

	if animeCol != nil {
		for _, l := range animeCol.GetMediaListCollection().GetLists() {
			for _, e := range l.GetEntries() {
				if e.GetMedia() != nil {
					animeLookup[e.GetMedia().ID] = e.GetMedia()
					info := timelineEntryInfo{}
					if e.Status != nil {
						info.status = string(*e.Status)
					}
					if s := e.StartedAt; s != nil {
						info.startedAt = fuzzyDateString(s.Year, s.Month, s.Day)
					}
					if s := e.CompletedAt; s != nil {
						info.completedAt = fuzzyDateString(s.Year, s.Month, s.Day)
					}
					entryLookup[e.GetMedia().ID] = info
				}
			}
		}
	}

	if mangaCol != nil {
		for _, l := range mangaCol.GetMediaListCollection().GetLists() {
			for _, e := range l.GetEntries() {
				if e.GetMedia() != nil {
					mangaLookup[e.GetMedia().ID] = e.GetMedia()
					info := timelineEntryInfo{}
					if e.Status != nil {
						info.status = string(*e.Status)
					}
					if s := e.StartedAt; s != nil {
						info.startedAt = fuzzyDateString(s.Year, s.Month, s.Day)
					}
					if s := e.CompletedAt; s != nil {
						info.completedAt = fuzzyDateString(s.Year, s.Month, s.Day)
					}
					if _, taken := entryLookup[e.GetMedia().ID]; !taken {
						entryLookup[e.GetMedia().ID] = info
					}
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
		if info, ok := entryLookup[ev.MediaId]; ok && ev.MediaId > 0 {
			te.EntryStatus = info.status
			te.EntryStartedAt = info.startedAt
			te.EntryCompletedAt = info.completedAt
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
			// Fall back to the title/image stored in the event's metadata at record time —
			// covers media that has since left the collection.
			if meta := ParseEventMetadata(ev.Metadata); meta != nil {
				if t, ok := meta["title"].(string); ok && t != "" {
					title := t
					te.MediaTitle = &title
				}
				if img, ok := meta["image"].(string); ok && img != "" {
					image := img
					te.MediaImage = &image
				}
			}
		}

		// Enrich achievement events with definition data
		if ev.EventType == "achievement_unlocked" {
			meta := ParseEventMetadata(ev.Metadata)
			if meta != nil {
				if key, ok := meta["key"].(string); ok {
					if def, ok := achDefMap[key]; ok && def != nil {
						svg := def.IconSVG
						// Substitute {threshold} with the unlocked tier's actual value
						tier := 1
						if t, ok := meta["tier"].(float64); ok && t > 0 {
							tier = int(t)
						}
						desc := achievement.FormatThreshold(def.Description, def.TierThresholds, tier)
						te.AchievementIconSVG = &svg
						te.AchievementDesc = &desc
					}
				}
			}
		}

		resolved = append(resolved, te)
	}

	return resolved
}

// HandleRecordEpisodeWatched
//
//	@summary records that an episode was watched, independent of AniList progress.
//	@desc The in-app player calls this when an episode passes the watched threshold. Progress updates
//	@desc are skipped when the episode is already at or behind the list progress (rewatches, resumed
//	@desc episodes), and those used to leave no trace on the timeline. Deduped per media + episode.
//	@route /api/v1/profile/timeline/episode-watched [POST]
//	@returns bool
func (h *Handler) HandleRecordEpisodeWatched(c echo.Context) error {
	type body struct {
		MediaId       int `json:"mediaId"`
		EpisodeNumber int `json:"episodeNumber"`
		TotalEpisodes int `json:"totalEpisodes"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.MediaId <= 0 || b.EpisodeNumber <= 0 {
		return h.RespondWithData(c, false)
	}

	pdb := h.GetProfileDatabase(c)
	if pdb == nil {
		return h.RespondWithData(c, false)
	}

	minutes := 0
	if col, err := h.App.GetAnimeCollection(false); err == nil && col != nil {
		if anime, ok := col.FindAnime(b.MediaId); ok && anime.Duration != nil {
			minutes = *anime.Duration
		}
	}
	if err := pdb.RecordEpisodeWatched(b.MediaId, b.EpisodeNumber, b.TotalEpisodes, minutes); err != nil {
		return h.RespondWithError(c, err)
	}
	if h.App.MilestoneEngine != nil {
		profileID := h.GetProfileID(c)
		go h.App.MilestoneEngine.EvaluateProfile(profileID)
	}
	return h.RespondWithData(c, true)
}

// lookupMediaTitle resolves a media title from the profile's (or global) cached
// collections so it can be embedded in activity event metadata at record time.
// Returns "" when the media can't be found.
func (h *Handler) lookupMediaTitle(profileID uint, mediaType string, mediaId int) string {
	if mediaId <= 0 {
		return ""
	}

	if mediaType != "manga" {
		var col *anilist.AnimeCollection
		if profileID > 0 && h.App.AnilistClientManager != nil {
			col, _ = h.App.AnilistClientManager.GetAnimeCollection(profileID)
		}
		if col == nil {
			col, _ = h.App.GetAnimeCollection(false)
		}
		if col != nil {
			for _, l := range col.GetMediaListCollection().GetLists() {
				for _, e := range l.GetEntries() {
					if m := e.GetMedia(); m != nil && m.ID == mediaId {
						return m.GetPreferredTitle()
					}
				}
			}
		}
	}

	if mediaType != "anime" {
		var col *anilist.MangaCollection
		if profileID > 0 && h.App.AnilistClientManager != nil {
			col, _ = h.App.AnilistClientManager.GetMangaCollection(profileID)
		}
		if col == nil {
			col, _ = h.App.GetMangaCollection(false)
		}
		if col != nil {
			for _, l := range col.GetMediaListCollection().GetLists() {
				for _, e := range l.GetEntries() {
					if m := e.GetMedia(); m != nil && m.ID == mediaId {
						return m.GetPreferredTitle()
					}
				}
			}
		}
	}

	return ""
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
