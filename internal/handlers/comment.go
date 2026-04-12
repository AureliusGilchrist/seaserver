package handlers

import (
	"errors"
	"fmt"
	"seanime/internal/core"
	"seanime/internal/database/models"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// CommentResponse is the enriched response for a single comment, including author info, score, and children.
type CommentResponse struct {
	ID        uint                 `json:"id"`
	MediaID   int                  `json:"mediaId"`
	MediaType string               `json:"mediaType"`
	ParentID  *uint                `json:"parentId"`
	Content   string               `json:"content"`
	IsEdited  bool                 `json:"isEdited"`
	IsSpoiler bool                 `json:"isSpoiler"`
	CreatedAt time.Time            `json:"createdAt"`
	UpdatedAt time.Time            `json:"updatedAt"`
	Score     int                  `json:"score"`
	MyVote    int                  `json:"myVote"` // +1, -1, or 0
	Author    *core.ProfileSummary `json:"author"`
	Children  []*CommentResponse   `json:"children"`
}

// CommentsResponse is the top-level response for the comments endpoint.
type CommentsResponse struct {
	Comments   []*CommentResponse `json:"comments"`
	TotalCount int64              `json:"totalCount"`
}

// HandleGetComments
//
//	@summary get comments for a media entry.
//	@desc Returns a threaded tree of comments for the given media.
//	@returns handlers.CommentsResponse
//	@route /api/v1/comments [GET]
func (h *Handler) HandleGetComments(c echo.Context) error {
	mediaIDStr := c.QueryParam("mediaId")
	mediaType := c.QueryParam("mediaType")
	sortBy := c.QueryParam("sort")

	if mediaIDStr == "" || mediaType == "" {
		return h.RespondWithError(c, fmt.Errorf("mediaId and mediaType are required"))
	}

	mediaID, err := strconv.Atoi(mediaIDStr)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("invalid mediaId"))
	}

	if mediaType != "anime" && mediaType != "manga" {
		return h.RespondWithError(c, fmt.Errorf("mediaType must be 'anime' or 'manga'"))
	}

	if sortBy == "" {
		sortBy = "newest"
	}

	profileID := h.GetProfileID(c)

	comments, err := h.App.Database.GetCommentsByMedia(mediaID, mediaType, sortBy)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	totalCount, _ := h.App.Database.GetCommentCountByMedia(mediaID, mediaType)

	if len(comments) == 0 {
		return h.RespondWithData(c, CommentsResponse{
			Comments:   make([]*CommentResponse, 0),
			TotalCount: totalCount,
		})
	}

	// Collect all comment IDs
	commentIDs := make([]uint, len(comments))
	profileIDs := make(map[uint]bool)
	for i, cm := range comments {
		commentIDs[i] = cm.ID
		profileIDs[cm.ProfileID] = true
	}

	// Fetch all votes for these comments
	allVotes, _ := h.App.Database.GetCommentVotes(commentIDs)
	var myVotes []*models.CommentVote
	if profileID > 0 {
		myVotes, _ = h.App.Database.GetCommentVotesByProfile(commentIDs, profileID)
	}

	// Build vote score map and my vote map
	scoreMap := make(map[uint]int)
	for _, v := range allVotes {
		scoreMap[v.CommentID] += v.Value
	}
	myVoteMap := make(map[uint]int)
	for _, v := range myVotes {
		myVoteMap[v.CommentID] = v.Value
	}

	// Fetch all unique author profiles
	authorMap := make(map[uint]*core.ProfileSummary)
	if h.App.ProfileManager != nil {
		for pid := range profileIDs {
			profile, pErr := h.App.ProfileManager.GetProfile(pid)
			if pErr == nil {
				authorMap[pid] = profile.ToSummary()
			}
		}
	}

	// Build response objects
	responseMap := make(map[uint]*CommentResponse)
	var allResponses []*CommentResponse
	for _, cm := range comments {
		cr := &CommentResponse{
			ID:        cm.ID,
			MediaID:   cm.MediaID,
			MediaType: cm.MediaType,
			ParentID:  cm.ParentID,
			Content:   cm.Content,
			IsEdited:  cm.IsEdited,
			IsSpoiler: cm.IsSpoiler,
			CreatedAt: cm.CreatedAt,
			UpdatedAt: cm.UpdatedAt,
			Score:     scoreMap[cm.ID],
			MyVote:    myVoteMap[cm.ID],
			Author:    authorMap[cm.ProfileID],
			Children:  make([]*CommentResponse, 0),
		}
		responseMap[cm.ID] = cr
		allResponses = append(allResponses, cr)
	}

	// Build tree: attach children to parents
	var roots []*CommentResponse
	for _, cr := range allResponses {
		if cr.ParentID == nil || *cr.ParentID == 0 {
			roots = append(roots, cr)
		} else {
			parent, ok := responseMap[*cr.ParentID]
			if ok {
				parent.Children = append(parent.Children, cr)
			} else {
				// Orphaned comment — treat as root
				roots = append(roots, cr)
			}
		}
	}

	// Sort roots
	sortComments(roots, sortBy)

	// Recursively sort children
	var sortTree func(nodes []*CommentResponse)
	sortTree = func(nodes []*CommentResponse) {
		for _, n := range nodes {
			if len(n.Children) > 0 {
				sortComments(n.Children, sortBy)
				sortTree(n.Children)
			}
		}
	}
	sortTree(roots)

	if roots == nil {
		roots = make([]*CommentResponse, 0)
	}

	return h.RespondWithData(c, CommentsResponse{
		Comments:   roots,
		TotalCount: totalCount,
	})
}

func sortComments(comments []*CommentResponse, sortBy string) {
	switch sortBy {
	case "top":
		sort.SliceStable(comments, func(i, j int) bool {
			return comments[i].Score > comments[j].Score
		})
	case "oldest":
		sort.SliceStable(comments, func(i, j int) bool {
			return comments[i].CreatedAt.Before(comments[j].CreatedAt)
		})
	default: // "newest"
		sort.SliceStable(comments, func(i, j int) bool {
			return comments[i].CreatedAt.After(comments[j].CreatedAt)
		})
	}
}

// HandleCreateComment
//
//	@summary create a new comment.
//	@desc Creates a new comment on an anime or manga entry.
//	@returns handlers.CommentResponse
//	@route /api/v1/comments [POST]
func (h *Handler) HandleCreateComment(c echo.Context) error {
	type body struct {
		MediaID   int    `json:"mediaId"`
		MediaType string `json:"mediaType"` // "anime" or "manga"
		ParentID  *uint  `json:"parentId"`
		Content   string `json:"content"`
		IsSpoiler bool   `json:"isSpoiler"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, errors.New("must be logged in to comment"))
	}

	content := strings.TrimSpace(b.Content)
	if content == "" {
		return h.RespondWithError(c, errors.New("comment content cannot be empty"))
	}
	if len(content) > 10000 {
		return h.RespondWithError(c, errors.New("comment too long (max 10000 characters)"))
	}

	if b.MediaType != "anime" && b.MediaType != "manga" {
		return h.RespondWithError(c, fmt.Errorf("mediaType must be 'anime' or 'manga'"))
	}

	// Verify parent exists if replying
	if b.ParentID != nil && *b.ParentID > 0 {
		parent, err := h.App.Database.GetComment(*b.ParentID)
		if err != nil {
			return h.RespondWithError(c, errors.New("parent comment not found"))
		}
		// Ensure reply is on same media
		if parent.MediaID != b.MediaID || parent.MediaType != b.MediaType {
			return h.RespondWithError(c, errors.New("reply must be on the same media"))
		}
	}

	comment := &models.Comment{
		MediaID:   b.MediaID,
		MediaType: b.MediaType,
		ProfileID: profileID,
		ParentID:  b.ParentID,
		Content:   content,
		IsSpoiler: b.IsSpoiler,
	}

	if err := h.App.Database.CreateComment(comment); err != nil {
		return h.RespondWithError(c, err)
	}

	// Build response
	var author *core.ProfileSummary
	if h.App.ProfileManager != nil {
		if profile, err := h.App.ProfileManager.GetProfile(profileID); err == nil {
			author = profile.ToSummary()
		}
	}

	return h.RespondWithData(c, &CommentResponse{
		ID:        comment.ID,
		MediaID:   comment.MediaID,
		MediaType: comment.MediaType,
		ParentID:  comment.ParentID,
		Content:   comment.Content,
		IsEdited:  false,
		IsSpoiler: comment.IsSpoiler,
		CreatedAt: comment.CreatedAt,
		UpdatedAt: comment.UpdatedAt,
		Score:     0,
		MyVote:    0,
		Author:    author,
		Children:  make([]*CommentResponse, 0),
	})
}

// HandleEditComment
//
//	@summary edit a comment.
//	@desc Updates the content of a comment. Only the author can edit.
//	@returns handlers.CommentResponse
//	@route /api/v1/comments/{id} [PATCH]
func (h *Handler) HandleEditComment(c echo.Context) error {
	type body struct {
		Content string `json:"content"`
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid comment ID"))
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, errors.New("must be logged in"))
	}

	content := strings.TrimSpace(b.Content)
	if content == "" {
		return h.RespondWithError(c, errors.New("comment content cannot be empty"))
	}
	if len(content) > 10000 {
		return h.RespondWithError(c, errors.New("comment too long (max 10000 characters)"))
	}

	comment, err := h.App.Database.GetComment(uint(id))
	if err != nil {
		return h.RespondWithError(c, errors.New("comment not found"))
	}

	if comment.ProfileID != profileID {
		return h.RespondWithError(c, errors.New("only the author can edit this comment"))
	}

	if err := h.App.Database.UpdateCommentContent(uint(id), content); err != nil {
		return h.RespondWithError(c, err)
	}

	// Fetch updated
	comment, _ = h.App.Database.GetComment(uint(id))

	var author *core.ProfileSummary
	if h.App.ProfileManager != nil {
		if profile, pErr := h.App.ProfileManager.GetProfile(comment.ProfileID); pErr == nil {
			author = profile.ToSummary()
		}
	}

	return h.RespondWithData(c, &CommentResponse{
		ID:        comment.ID,
		MediaID:   comment.MediaID,
		MediaType: comment.MediaType,
		ParentID:  comment.ParentID,
		Content:   comment.Content,
		IsEdited:  comment.IsEdited,
		IsSpoiler: comment.IsSpoiler,
		CreatedAt: comment.CreatedAt,
		UpdatedAt: comment.UpdatedAt,
		Score:     0,
		MyVote:    0,
		Author:    author,
		Children:  make([]*CommentResponse, 0),
	})
}

// HandleDeleteComment
//
//	@summary delete a comment.
//	@desc Deletes a comment and all its replies. Admin or author only.
//	@returns bool
//	@route /api/v1/comments/{id} [DELETE]
func (h *Handler) HandleDeleteComment(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid comment ID"))
	}

	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, errors.New("must be logged in"))
	}

	comment, err := h.App.Database.GetComment(uint(id))
	if err != nil {
		return h.RespondWithError(c, errors.New("comment not found"))
	}

	// Check permission: author or admin
	session := h.GetProfileSession(c)
	isAdmin := session != nil && session.IsAdmin
	if comment.ProfileID != profileID && !isAdmin {
		return h.RespondWithError(c, errors.New("only the author or an admin can delete this comment"))
	}

	if err := h.App.Database.DeleteComment(uint(id)); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleVoteComment
//
//	@summary vote on a comment.
//	@desc Upvote (+1), downvote (-1), or remove vote (0) on a comment.
//	@returns bool
//	@route /api/v1/comments/{id}/vote [POST]
func (h *Handler) HandleVoteComment(c echo.Context) error {
	type body struct {
		Value int `json:"value"` // +1, -1, or 0
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid comment ID"))
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	profileID := h.GetProfileID(c)
	if profileID == 0 {
		return h.RespondWithError(c, errors.New("must be logged in to vote"))
	}

	if b.Value != -1 && b.Value != 0 && b.Value != 1 {
		return h.RespondWithError(c, errors.New("value must be -1, 0, or 1"))
	}

	// Verify comment exists
	if _, err := h.App.Database.GetComment(uint(id)); err != nil {
		return h.RespondWithError(c, errors.New("comment not found"))
	}

	if err := h.App.Database.UpsertCommentVote(uint(id), profileID, b.Value); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}
