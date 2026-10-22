package handlers

import (
	"sort"
	"strconv"

	"seanime/internal/api/anilist"
	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// ProfileTimelineEvent is one activity event tagged with the profile that did it.
type ProfileTimelineEvent struct {
	TimelineEvent
	ProfileID uint   `json:"profileId"`
	Username  string `json:"username"`
}

// ProfilesTimelineResponse is the paginated response for the cross-profile timeline.
type ProfilesTimelineResponse struct {
	Events  []*ProfileTimelineEvent `json:"events"`
	Page    int                     `json:"page"`
	HasMore bool                    `json:"hasMore"`
	Total   int64                   `json:"total"`
}

// HandleGetProfilesTimeline
//
//	@summary returns activity events from every profile, merged into one timeline.
//	@desc Each profile's own database is read and the events are merged newest-first,
//	@desc so the News page can show what everyone on the server was doing as one feed.
//	@desc Media titles resolve against the acting profile's AniList collection.
//	@param page - int - false - "Page number (default 1)"
//	@param pageSize - int - false - "Events per page (default 20, max 100)"
//	@returns []*handlers.ProfilesTimelineResponse
//	@route /api/v1/profiles/timeline [GET]
func (h *Handler) HandleGetProfilesTimeline(c echo.Context) error {
	page := 1
	if p, err := strconv.Atoi(c.QueryParam("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 20
	if ps, err := strconv.Atoi(c.QueryParam("pageSize")); err == nil && ps > 0 && ps <= 100 {
		pageSize = ps
	}

	profiles, err := h.App.ProfileManager.GetAllProfiles()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	merged := make([]*ProfileTimelineEvent, 0, pageSize)
	var total int64

	for _, p := range profiles {
		if p == nil {
			continue
		}
		pdb, err := h.App.ProfileDatabaseManager.GetDatabase(p.ID)
		if err != nil {
			continue
		}

		// Fetch enough from each profile to fill the requested page of the merged
		// result: page * pageSize per profile over-covers, capped to keep it cheap.
		perProfile := page * pageSize
		if perProfile > 200 {
			perProfile = 200
		}
		events, count, err := pdb.GetActivityEventsPaginated(1, perProfile)
		if err != nil {
			continue
		}
		total += count
		if len(events) == 0 {
			continue
		}

		// Resolve titles/images against the acting profile's own collections — the
		// same rule the single-profile timeline uses — falling back to the global
		// collection and then to whatever the event recorded at the time.
		animeLookup := make(map[int]*anilist.BaseAnime)
		mangaLookup := make(map[int]*anilist.BaseManga)
		if h.App.AnilistClientManager != nil {
			if col, _ := h.App.AnilistClientManager.GetAnimeCollection(p.ID); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					for _, e := range l.GetEntries() {
						if e.GetMedia() != nil {
							animeLookup[e.GetMedia().ID] = e.GetMedia()
						}
					}
				}
			}
			if col, _ := h.App.AnilistClientManager.GetMangaCollection(p.ID); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					for _, e := range l.GetEntries() {
						if e.GetMedia() != nil {
							mangaLookup[e.GetMedia().ID] = e.GetMedia()
						}
					}
				}
			}
		}
		if len(animeLookup) == 0 {
			if col, _ := h.App.GetAnimeCollection(false); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					for _, e := range l.GetEntries() {
						if e.GetMedia() != nil {
							animeLookup[e.GetMedia().ID] = e.GetMedia()
						}
					}
				}
			}
		}
		if len(mangaLookup) == 0 {
			if col, _ := h.App.GetMangaCollection(false); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					for _, e := range l.GetEntries() {
						if e.GetMedia() != nil {
							mangaLookup[e.GetMedia().ID] = e.GetMedia()
						}
					}
				}
			}
		}

		for _, ev := range events {
			te := resolveTimelineEvent(ev, animeLookup, mangaLookup)
			merged = append(merged, &ProfileTimelineEvent{
				TimelineEvent: *te,
				ProfileID:     p.ID,
				Username:      p.Name,
			})
		}
	}

	sort.Slice(merged, func(i, j int) bool {
		return merged[i].CreatedAt.After(merged[j].CreatedAt)
	})

	start := (page - 1) * pageSize
	end := start + pageSize
	hasMore := int64(end) < total
	if start > len(merged) {
		merged = []*ProfileTimelineEvent{}
	} else {
		if end > len(merged) {
			end = len(merged)
		}
		merged = merged[start:end]
	}

	return h.RespondWithData(c, ProfilesTimelineResponse{
		Events:  merged,
		Page:    page,
		HasMore: hasMore,
		Total:   total,
	})
}

// resolveTimelineEvent maps one raw activity event to the timeline shape shared with the
// single-profile endpoint: collection lookup first, then the title/image recorded in the
// event's metadata at the time it happened.
func resolveTimelineEvent(ev *models.ActivityEvent, animeLookup map[int]*anilist.BaseAnime, mangaLookup map[int]*anilist.BaseManga) *TimelineEvent {
	te := &TimelineEvent{
		ID:        ev.ID,
		EventType: ev.EventType,
		MediaID:   ev.MediaId,
		Metadata:  ev.Metadata,
		CreatedAt: ev.CreatedAt,
	}

	if ev.MediaId > 0 {
		if anime, ok := animeLookup[ev.MediaId]; ok {
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
			return te
		}
		if manga, ok := mangaLookup[ev.MediaId]; ok {
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
			return te
		}
	}

	te.MediaType = inferMediaType(ev.EventType, ev.Metadata)
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
	return te
}
