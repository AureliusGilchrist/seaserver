package handlers

import (
	"fmt"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

// The profile page's Comments tab: every comment and reply a profile has left
// on any show or manga. This used to live in the chat handler file and survived
// it — comments are profile-page activity, not chat.

// HandleGetProfileComments
//
//	@summary returns the comments a profile has made, newest first.
//	@desc Used by the profile page's Comments tab: every comment the profile left on any
//	@desc show or manga, with the media reference and timestamp.
//	@returns handlers.ProfileCommentsResponse
//	@route /api/v1/profile/comments [GET]
func (h *Handler) HandleGetProfileComments(c echo.Context) error {
	profileID := uint(0)
	if s := c.QueryParam("profileId"); s != "" {
		v, err := parseUintParam(s)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		profileID = v
	} else {
		profileID = h.GetProfileID(c)
	}

	comments, err := h.App.Database.GetCommentsByProfile(int(profileID))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	items := make([]*ProfileCommentItem, 0, len(comments))
	for _, cm := range comments {
		items = append(items, &ProfileCommentItem{
			ID:        cm.ID,
			MediaID:   cm.MediaID,
			MediaType: cm.MediaType,
			Content:   cm.Content,
			IsReply:   cm.ParentID != nil && *cm.ParentID != 0,
			IsEdited:  cm.IsEdited,
			IsSpoiler: cm.IsSpoiler,
			CreatedAt: cm.CreatedAt,
			UpdatedAt: cm.UpdatedAt,
		})
	}

	h.resolveCommentTitles(profileID, items)

	return h.RespondWithData(c, ProfileCommentsResponse{Comments: items, TotalCount: int64(len(items))})
}

// resolveCommentTitles fills in the media title and cover of each comment from the comment
// author's cached AniList collection (memory or disk copy — never blocks on a
// fresh fetch). Comments are left from a media page, so the author's collection
// almost always contains the media. Unresolved titles stay empty and the client
// falls back to the media id.
func (h *Handler) resolveCommentTitles(profileID uint, items []*ProfileCommentItem) {
	needAnime, needManga := false, false
	for _, it := range items {
		if it.MediaType == "manga" {
			needManga = true
		} else {
			needAnime = true
		}
	}

	type mediaRef struct{ title, image string }
	anime := map[int]mediaRef{}
	manga := map[int]mediaRef{}
	if needAnime {
		if col, err := h.App.AnilistClientManager.GetAnimeCollection(profileID); err == nil && col.MediaListCollection != nil {
			for _, list := range col.MediaListCollection.Lists {
				if list == nil {
					continue
				}
				for _, e := range list.Entries {
					if e == nil || e.Media == nil {
						continue
					}
					anime[e.Media.ID] = mediaRef{title: e.Media.GetPreferredTitle(), image: e.Media.GetCoverImageSafe()}
				}
			}
		}
	}
	if needManga {
		if col, err := h.App.AnilistClientManager.GetMangaCollection(profileID); err == nil && col.MediaListCollection != nil {
			for _, list := range col.MediaListCollection.Lists {
				if list == nil {
					continue
				}
				for _, e := range list.Entries {
					if e == nil || e.Media == nil {
						continue
					}
					manga[e.Media.ID] = mediaRef{title: e.Media.GetPreferredTitle(), image: e.Media.GetCoverImageSafe()}
				}
			}
		}
	}

	for _, it := range items {
		ref := anime[it.MediaID]
		if it.MediaType == "manga" {
			ref = manga[it.MediaID]
		}
		it.MediaTitle, it.MediaImage = ref.title, ref.image
	}
}

// ProfileCommentItem is one comment in a profile's Comments tab.
type ProfileCommentItem struct {
	ID         uint      `json:"id"`
	MediaID    int       `json:"mediaId"`
	MediaType  string    `json:"mediaType"`
	MediaTitle string    `json:"mediaTitle"`
	MediaImage string    `json:"mediaImage"`
	Content    string    `json:"content"`
	IsReply    bool      `json:"isReply"`
	IsEdited   bool      `json:"isEdited"`
	IsSpoiler  bool      `json:"isSpoiler"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// ProfileCommentsResponse is the response of the profile comments endpoint.
type ProfileCommentsResponse struct {
	Comments   []*ProfileCommentItem `json:"comments"`
	TotalCount int64                 `json:"totalCount"`
}

// parseUintParam parses a uint query parameter.
func parseUintParam(s string) (uint, error) {
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid value %q", s)
	}
	return uint(v), nil
}
