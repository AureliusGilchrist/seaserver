package handlers

import (
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/core"
	"seanime/internal/database/models"

	"github.com/labstack/echo/v4"
)

// The AniList-style profile timeline: text posts (your own status, or a message on someone
// else's wall), merged with the profile's watch activity, each item likeable and repliable.
//
// Posts, likes and replies live in the global database so every profile sees the same thing.
// Activity events stay where they are recorded, in each profile's own database; a like or reply on
// one is keyed "act:<profileId>:<eventId>".

const (
	timelinePostMaxLen   = 4000
	timelineReplyMaxLen  = 2000
	timelinePostCooldown = 3 * time.Second
	// Consecutive episode_watched events for the same media within this window collapse into one
	// "watched episodes 3 – 5" item, the way AniList groups list activity.
	timelineEpisodeGroupWindow = 3 * time.Hour
)

// timelineActivityTypes are the activity events worth showing on a timeline; scans and file
// matching are bookkeeping, not activity.
var timelineActivityTypes = map[string]bool{
	models.ActivityEventEpisodeWatched:     true,
	models.ActivityEventMangaChapterRead:   true,
	models.ActivityEventStatusChanged:      true,
	models.ActivityEventAnilistEntryEdited: true,
	"achievement_unlocked":                 true,
}

var (
	timelinePostRateMu sync.Mutex
	timelinePostLast   = map[uint]time.Time{}
)

// TimelineProfileSummary is the author / wall owner shown on a timeline card.
type TimelineProfileSummary struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Avatar       string `json:"avatar"`
	DisplayTitle string `json:"displayTitle"`
	NameColorCss string `json:"nameColorCss"`
}

// TimelineFeedItem is one card on a timeline: a post or a (possibly grouped) activity event.
type TimelineFeedItem struct {
	Key         string                  `json:"key"`
	Kind        string                  `json:"kind"` // "post" | "activity" | "news"
	CreatedAt   time.Time               `json:"createdAt"`
	Author      *TimelineProfileSummary `json:"author"`
	WallProfile *TimelineProfileSummary `json:"wallProfile,omitempty"` // set when posted on someone else's wall

	// Post fields
	PostID    uint   `json:"postId,omitempty"`
	Content   string `json:"content,omitempty"`
	IsSpoiler bool   `json:"isSpoiler,omitempty"`
	IsEdited  bool   `json:"isEdited,omitempty"`
	MediaID   int    `json:"mediaId,omitempty"`
	MediaType string `json:"mediaType,omitempty"`

	// Activity fields
	Activity    *TimelineEvent `json:"activity,omitempty"`
	EpisodeFrom int            `json:"episodeFrom,omitempty"`
	EpisodeTo   int            `json:"episodeTo,omitempty"`
	// Achievement unlocks on this card (several when a burst was folded together).
	Achievements []*TimelineAchievement `json:"achievements,omitempty"`

	// News fields (community timeline only)
	News *TimelineNews `json:"news,omitempty"`

	LikeCount  int  `json:"likeCount"`
	LikedByMe  bool `json:"likedByMe"`
	ReplyCount int  `json:"replyCount"`
	CanEdit    bool `json:"canEdit"`
	CanDelete  bool `json:"canDelete"`
}

// TimelineFeedResponse is a page of timeline items.
type TimelineFeedResponse struct {
	Items   []*TimelineFeedItem `json:"items"`
	Page    int                 `json:"page"`
	HasMore bool                `json:"hasMore"`
}

// TimelineReplyItem is one reply under a timeline item.
type TimelineReplyItem struct {
	ID        uint                    `json:"id"`
	TargetKey string                  `json:"targetKey"`
	Author    *TimelineProfileSummary `json:"author"`
	Content   string                  `json:"content"`
	CreatedAt time.Time               `json:"createdAt"`
	CanDelete bool                    `json:"canDelete"`
}

// ---------------------------------------------------------------------------------------------

// HandleGetProfileTimelineFeed
//
//	@summary returns a profile's timeline: wall posts merged with its watch activity.
//	@param profileId - int - false - "Profile to read (default: the current profile)"
//	@param page - int - false - "Page number (default 1)"
//	@returns handlers.TimelineFeedResponse
//	@route /api/v1/profile/timeline-feed [GET]
func (h *Handler) HandleGetProfileTimelineFeed(c echo.Context) error {
	viewer := h.GetProfileID(c)
	profileID := viewer
	if s := c.QueryParam("profileId"); s != "" {
		if v, err := parseUintParam(s); err == nil && v > 0 {
			profileID = v
		}
	}
	page := parsePageParam(c)
	wall := profileID
	res, err := h.buildTimelineFeed(c, []uint{profileID}, &wall, page, 20)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, res)
}

// HandleGetCommunityTimelineFeed
//
//	@summary returns the global timeline: every profile's posts and watch activity.
//	@param page - int - false - "Page number (default 1)"
//	@returns handlers.TimelineFeedResponse
//	@route /api/v1/community/timeline-feed [GET]
func (h *Handler) HandleGetCommunityTimelineFeed(c echo.Context) error {
	page := parsePageParam(c)
	var ids []uint
	if h.App.ProfileManager != nil {
		if profiles, err := h.App.ProfileManager.GetAllProfiles(); err == nil {
			for _, p := range profiles {
				ids = append(ids, p.ID)
			}
		}
	}
	res, err := h.buildTimelineFeed(c, ids, nil, page, 25)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, res)
}

// HandleCreateProfilePost
//
//	@summary posts on a profile's timeline (your own status, or a message on someone else's wall).
//	@route /api/v1/profile/posts [POST]
//	@returns handlers.TimelineFeedItem
func (h *Handler) HandleCreateProfilePost(c echo.Context) error {
	type body struct {
		WallProfileID uint   `json:"wallProfileId"`
		Content       string `json:"content"`
		MediaID       int    `json:"mediaId"`
		MediaType     string `json:"mediaType"`
		IsSpoiler     bool   `json:"isSpoiler"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	author := h.GetProfileID(c)
	if author == 0 {
		return h.RespondWithError(c, errors.New("sign in to a profile to post"))
	}
	content := strings.TrimSpace(b.Content)
	if content == "" {
		return h.RespondWithError(c, errors.New("post is empty"))
	}
	if len([]rune(content)) > timelinePostMaxLen {
		return h.RespondWithError(c, fmt.Errorf("post is too long (max %d characters)", timelinePostMaxLen))
	}
	if b.MediaType != "" && b.MediaType != "anime" && b.MediaType != "manga" {
		return h.RespondWithError(c, errors.New("invalid media type"))
	}
	wall := b.WallProfileID
	if wall == 0 {
		wall = author
	}
	if wall != author && h.App.ProfileManager != nil {
		if _, err := h.App.ProfileManager.GetProfile(wall); err != nil {
			return h.RespondWithError(c, errors.New("profile not found"))
		}
	}

	timelinePostRateMu.Lock()
	if last, ok := timelinePostLast[author]; ok && time.Since(last) < timelinePostCooldown {
		timelinePostRateMu.Unlock()
		return h.RespondWithError(c, errors.New("you're posting too fast, wait a moment"))
	}
	timelinePostLast[author] = time.Now()
	timelinePostRateMu.Unlock()

	post := &models.ProfilePost{
		AuthorProfileID: author,
		WallProfileID:   wall,
		Content:         content,
		MediaID:         b.MediaID,
		MediaType:       b.MediaType,
		IsSpoiler:       b.IsSpoiler,
	}
	if err := h.App.Database.Gorm().Create(post).Error; err != nil {
		return h.RespondWithError(c, err)
	}
	h.broadcastTimelineUpdated(wall)

	profiles := h.timelineProfileCache()
	item := h.postToFeedItem(post, profiles, author, h.isAdminSession(c))
	return h.RespondWithData(c, item)
}

// HandleUpdateProfilePost
//
//	@summary edits a post (author only).
//	@route /api/v1/profile/posts/:id [PATCH]
//	@returns bool
func (h *Handler) HandleUpdateProfilePost(c echo.Context) error {
	type body struct {
		Content   string `json:"content"`
		IsSpoiler bool   `json:"isSpoiler"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	post, err := h.getProfilePost(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	if post.AuthorProfileID != h.GetProfileID(c) {
		return h.RespondWithError(c, errors.New("you can only edit your own posts"))
	}
	content := strings.TrimSpace(b.Content)
	if content == "" || len([]rune(content)) > timelinePostMaxLen {
		return h.RespondWithError(c, errors.New("invalid post content"))
	}
	if err := h.App.Database.Gorm().Model(&models.ProfilePost{}).Where("id = ?", post.ID).
		Updates(map[string]interface{}{"content": content, "is_spoiler": b.IsSpoiler, "is_edited": true}).Error; err != nil {
		return h.RespondWithError(c, err)
	}
	h.broadcastTimelineUpdated(post.WallProfileID)
	return h.RespondWithData(c, true)
}

// HandleDeleteProfilePost
//
//	@summary deletes a post (author, wall owner, or admin), with its likes and replies.
//	@route /api/v1/profile/posts/:id [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteProfilePost(c echo.Context) error {
	post, err := h.getProfilePost(c.Param("id"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	viewer := h.GetProfileID(c)
	if post.AuthorProfileID != viewer && post.WallProfileID != viewer && !h.isAdminSession(c) {
		return h.RespondWithError(c, errors.New("you can't delete this post"))
	}
	key := postKey(post.ID)
	gdb := h.App.Database.Gorm()
	gdb.Where("target_key = ?", key).Delete(&models.TimelineLike{})
	gdb.Where("target_key = ?", key).Delete(&models.TimelineReply{})
	if err := gdb.Delete(&models.ProfilePost{}, post.ID).Error; err != nil {
		return h.RespondWithError(c, err)
	}
	h.broadcastTimelineUpdated(post.WallProfileID)
	return h.RespondWithData(c, true)
}

// HandleToggleTimelineLike
//
//	@summary likes or unlikes a timeline item.
//	@route /api/v1/profile/timeline/like [POST]
//	@returns map
func (h *Handler) HandleToggleTimelineLike(c echo.Context) error {
	type body struct {
		TargetKey string `json:"targetKey"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	viewer := h.GetProfileID(c)
	if viewer == 0 {
		return h.RespondWithError(c, errors.New("sign in to a profile to like"))
	}
	if !validTargetKey(b.TargetKey) {
		return h.RespondWithError(c, errors.New("invalid target"))
	}
	gdb := h.App.Database.Gorm()
	var existing models.TimelineLike
	liked := false
	if err := gdb.Where("target_key = ? AND profile_id = ?", b.TargetKey, viewer).First(&existing).Error; err == nil {
		gdb.Delete(&existing)
	} else {
		if err := gdb.Create(&models.TimelineLike{TargetKey: b.TargetKey, ProfileID: viewer}).Error; err != nil {
			return h.RespondWithError(c, err)
		}
		liked = true
	}
	var count int64
	gdb.Model(&models.TimelineLike{}).Where("target_key = ?", b.TargetKey).Count(&count)
	return h.RespondWithData(c, map[string]interface{}{"liked": liked, "likeCount": count})
}

// HandleGetTimelineReplies
//
//	@summary lists replies under a timeline item, oldest first.
//	@param targetKey - string - true - "Timeline item key"
//	@route /api/v1/profile/timeline/replies [GET]
//	@returns []handlers.TimelineReplyItem
func (h *Handler) HandleGetTimelineReplies(c echo.Context) error {
	key := c.QueryParam("targetKey")
	if !validTargetKey(key) {
		return h.RespondWithError(c, errors.New("invalid target"))
	}
	var replies []*models.TimelineReply
	if err := h.App.Database.Gorm().Where("target_key = ?", key).Order("created_at ASC").Find(&replies).Error; err != nil {
		return h.RespondWithError(c, err)
	}
	profiles := h.timelineProfileCache()
	viewer := h.GetProfileID(c)
	admin := h.isAdminSession(c)
	out := make([]*TimelineReplyItem, 0, len(replies))
	for _, r := range replies {
		out = append(out, &TimelineReplyItem{
			ID:        r.ID,
			TargetKey: r.TargetKey,
			Author:    profiles.get(r.AuthorProfileID),
			Content:   r.Content,
			CreatedAt: r.CreatedAt,
			CanDelete: r.AuthorProfileID == viewer || admin,
		})
	}
	return h.RespondWithData(c, out)
}

// HandleCreateTimelineReply
//
//	@summary replies under a timeline item.
//	@route /api/v1/profile/timeline/replies [POST]
//	@returns handlers.TimelineReplyItem
func (h *Handler) HandleCreateTimelineReply(c echo.Context) error {
	type body struct {
		TargetKey string `json:"targetKey"`
		Content   string `json:"content"`
	}
	b := new(body)
	if err := c.Bind(b); err != nil {
		return h.RespondWithError(c, err)
	}
	viewer := h.GetProfileID(c)
	if viewer == 0 {
		return h.RespondWithError(c, errors.New("sign in to a profile to reply"))
	}
	if !validTargetKey(b.TargetKey) {
		return h.RespondWithError(c, errors.New("invalid target"))
	}
	content := strings.TrimSpace(b.Content)
	if content == "" || len([]rune(content)) > timelineReplyMaxLen {
		return h.RespondWithError(c, errors.New("invalid reply"))
	}
	r := &models.TimelineReply{TargetKey: b.TargetKey, AuthorProfileID: viewer, Content: content}
	if err := h.App.Database.Gorm().Create(r).Error; err != nil {
		return h.RespondWithError(c, err)
	}
	h.broadcastTimelineUpdated(0)
	return h.RespondWithData(c, &TimelineReplyItem{
		ID: r.ID, TargetKey: r.TargetKey, Author: h.timelineProfileCache().get(viewer),
		Content: r.Content, CreatedAt: r.CreatedAt, CanDelete: true,
	})
}

// HandleDeleteTimelineReply
//
//	@summary deletes a reply (author or admin).
//	@route /api/v1/profile/timeline/replies/:id [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteTimelineReply(c echo.Context) error {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		return h.RespondWithError(c, errors.New("invalid id"))
	}
	var r models.TimelineReply
	gdb := h.App.Database.Gorm()
	if err := gdb.First(&r, id).Error; err != nil {
		return h.RespondWithError(c, errors.New("reply not found"))
	}
	if r.AuthorProfileID != h.GetProfileID(c) && !h.isAdminSession(c) {
		return h.RespondWithError(c, errors.New("you can't delete this reply"))
	}
	if err := gdb.Delete(&r).Error; err != nil {
		return h.RespondWithError(c, err)
	}
	h.broadcastTimelineUpdated(0)
	return h.RespondWithData(c, true)
}

// ---------------------------------------------------------------------------------------------

// buildTimelineFeed merges posts (all, or those on one wall) with the activity of the given
// profiles, newest first, and returns one page.
func (h *Handler) buildTimelineFeed(c echo.Context, profileIDs []uint, wall *uint, page, pageSize int) (*TimelineFeedResponse, error) {
	viewer := h.GetProfileID(c)
	admin := h.isAdminSession(c)
	profiles := h.timelineProfileCache()
	need := page*pageSize + 1

	items := make([]*TimelineFeedItem, 0)

	// Posts
	var posts []*models.ProfilePost
	q := h.App.Database.Gorm().Order("created_at DESC").Limit(need)
	if wall != nil {
		q = q.Where("wall_profile_id = ?", *wall)
	}
	if err := q.Find(&posts).Error; err != nil {
		return nil, err
	}
	for _, p := range posts {
		items = append(items, h.postToFeedItem(p, profiles, viewer, admin))
	}

	// Activity. Fetched generously since grouping folds many events into one item.
	if h.App.ProfileDatabaseManager != nil {
		for _, pid := range profileIDs {
			pdb, err := h.App.ProfileDatabaseManager.GetDatabase(pid)
			if err != nil || pdb == nil {
				continue
			}
			events, _, err := pdb.GetActivityEventsPaginated(1, need*4)
			if err != nil {
				continue
			}
			filtered := events[:0]
			for _, ev := range events {
				if timelineActivityTypes[ev.EventType] {
					filtered = append(filtered, ev)
				}
			}
			resolved := h.resolveTimelineEvents(pid, filtered)
			grouped := groupActivity(pid, resolved, profiles.get(pid))
			items = append(items, h.withAchievements(pid, grouped, need)...)
		}
	}

	// The community timeline also carries paced news.
	if wall == nil {
		items = append(items, h.timelineNewsItems(c)...)
	}

	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	items = separateNewsCards(items)

	start := (page - 1) * pageSize
	if start > len(items) {
		start = len(items)
	}
	end := start + pageSize
	hasMore := len(items) > end
	if end > len(items) {
		end = len(items)
	}
	pageItems := items[start:end]

	h.fillTimelineCounts(pageItems, viewer)
	for _, it := range pageItems {
		if it.Kind == "activity" {
			it.CanDelete = false
		}
	}

	return &TimelineFeedResponse{Items: pageItems, Page: page, HasMore: hasMore}, nil
}

// groupActivity turns a profile's resolved events (newest first) into feed items, collapsing runs
// of episode_watched for the same media into one "episodes a – b" item.
func groupActivity(profileID uint, events []*TimelineEvent, author *TimelineProfileSummary) []*TimelineFeedItem {
	var out []*TimelineFeedItem
	var cur *TimelineFeedItem
	var curOldest time.Time
	for _, ev := range events {
		ep := 0
		if ev.EventType == models.ActivityEventEpisodeWatched {
			if meta := ParseEventMetadata(ev.Metadata); meta != nil {
				if v, ok := meta["episode"].(float64); ok {
					ep = int(v)
				}
			}
		}
		if cur != nil && ep > 0 && cur.Activity.EventType == models.ActivityEventEpisodeWatched &&
			cur.Activity.MediaID == ev.MediaID && curOldest.Sub(ev.CreatedAt) <= timelineEpisodeGroupWindow {
			if ep < cur.EpisodeFrom {
				cur.EpisodeFrom = ep
			}
			if ep > cur.EpisodeTo {
				cur.EpisodeTo = ep
			}
			curOldest = ev.CreatedAt
			continue
		}
		cur = &TimelineFeedItem{
			Key:       fmt.Sprintf("act:%d:%d", profileID, ev.ID),
			Kind:      "activity",
			CreatedAt: ev.CreatedAt,
			Author:    author,
			Activity:  ev,
			MediaID:   ev.MediaID,
			MediaType: ev.MediaType,
		}
		if ep > 0 {
			cur.EpisodeFrom, cur.EpisodeTo = ep, ep
		}
		curOldest = ev.CreatedAt
		out = append(out, cur)
	}
	return out
}

func (h *Handler) postToFeedItem(p *models.ProfilePost, profiles *timelineProfiles, viewer uint, admin bool) *TimelineFeedItem {
	it := &TimelineFeedItem{
		Key:       postKey(p.ID),
		Kind:      "post",
		CreatedAt: p.CreatedAt,
		Author:    profiles.get(p.AuthorProfileID),
		PostID:    p.ID,
		Content:   p.Content,
		IsSpoiler: p.IsSpoiler,
		IsEdited:  p.IsEdited,
		MediaID:   p.MediaID,
		MediaType: p.MediaType,
		CanEdit:   p.AuthorProfileID == viewer,
		CanDelete: p.AuthorProfileID == viewer || p.WallProfileID == viewer || admin,
	}
	if p.WallProfileID != p.AuthorProfileID {
		it.WallProfile = profiles.get(p.WallProfileID)
	}
	return it
}

// fillTimelineCounts sets like/reply counts and the viewer's own like on a page of items.
func (h *Handler) fillTimelineCounts(items []*TimelineFeedItem, viewer uint) {
	if len(items) == 0 {
		return
	}
	keys := make([]string, 0, len(items))
	byKey := make(map[string]*TimelineFeedItem, len(items))
	for _, it := range items {
		keys = append(keys, it.Key)
		byKey[it.Key] = it
	}
	gdb := h.App.Database.Gorm()

	type countRow struct {
		TargetKey string
		N         int
	}
	var likeRows []countRow
	gdb.Model(&models.TimelineLike{}).Select("target_key, COUNT(*) as n").Where("target_key IN ?", keys).Group("target_key").Scan(&likeRows)
	for _, r := range likeRows {
		if it := byKey[r.TargetKey]; it != nil {
			it.LikeCount = r.N
		}
	}
	var replyRows []countRow
	gdb.Model(&models.TimelineReply{}).Select("target_key, COUNT(*) as n").Where("target_key IN ?", keys).Group("target_key").Scan(&replyRows)
	for _, r := range replyRows {
		if it := byKey[r.TargetKey]; it != nil {
			it.ReplyCount = r.N
		}
	}
	if viewer > 0 {
		var mine []string
		gdb.Model(&models.TimelineLike{}).Where("target_key IN ? AND profile_id = ?", keys, viewer).Pluck("target_key", &mine)
		for _, k := range mine {
			if it := byKey[k]; it != nil {
				it.LikedByMe = true
			}
		}
	}
}

func (h *Handler) getProfilePost(idStr string) (*models.ProfilePost, error) {
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return nil, errors.New("invalid id")
	}
	var post models.ProfilePost
	if err := h.App.Database.Gorm().First(&post, id).Error; err != nil {
		return nil, errors.New("post not found")
	}
	return &post, nil
}

func (h *Handler) isAdminSession(c echo.Context) bool {
	if s := h.GetProfileSession(c); s != nil {
		return s.IsAdmin
	}
	return h.App.ProfileManager == nil
}

func (h *Handler) broadcastTimelineUpdated(wallProfileID uint) {
	if h.App.WSEventManager != nil {
		h.App.WSEventManager.SendEvent("profile-timeline-updated", map[string]interface{}{"wallProfileId": wallProfileID})
	}
}

func postKey(id uint) string { return "post:" + strconv.FormatUint(uint64(id), 10) }

func validTargetKey(k string) bool {
	parts := strings.Split(k, ":")
	switch {
	case len(parts) == 2 && parts[0] == "post":
		_, err := strconv.ParseUint(parts[1], 10, 64)
		return err == nil
	case len(parts) == 3 && parts[0] == "act":
		_, e1 := strconv.ParseUint(parts[1], 10, 64)
		_, e2 := strconv.ParseUint(parts[2], 10, 64)
		return e1 == nil && e2 == nil
	case len(parts) == 4 && parts[0] == "ach":
		_, e1 := strconv.ParseUint(parts[1], 10, 64)
		_, e2 := strconv.ParseUint(parts[3], 10, 64)
		return e1 == nil && e2 == nil && parts[2] != "" && len(parts[2]) <= 80
	case len(parts) == 2 && parts[0] == "news":
		if len(parts[1]) != 12 {
			return false
		}
		_, err := hex.DecodeString(parts[1])
		return err == nil
	}
	return false
}

func parsePageParam(c echo.Context) int {
	if p := c.QueryParam("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 && v <= 500 {
			return v
		}
	}
	return 1
}

// timelineProfiles resolves profile summaries once per request.
type timelineProfiles struct {
	byID map[uint]*TimelineProfileSummary
}

func (t *timelineProfiles) get(id uint) *TimelineProfileSummary {
	if s, ok := t.byID[id]; ok {
		return s
	}
	return &TimelineProfileSummary{ID: id, Name: fmt.Sprintf("Profile %d", id)}
}

func (h *Handler) timelineProfileCache() *timelineProfiles {
	t := &timelineProfiles{byID: map[uint]*TimelineProfileSummary{}}
	if h.App.ProfileManager == nil {
		return t
	}
	profiles, err := h.App.ProfileManager.GetAllProfiles()
	if err != nil {
		return t
	}
	for _, p := range profiles {
		t.byID[p.ID] = profileSummary(p)
	}
	return t
}

func profileSummary(p *core.Profile) *TimelineProfileSummary {
	avatar := p.AniListAvatar
	if p.AvatarPath != "" {
		avatar = p.AvatarPath
	}
	return &TimelineProfileSummary{
		ID:           p.ID,
		Name:         p.Name,
		Avatar:       avatar,
		DisplayTitle: p.DisplayTitle,
		NameColorCss: p.NameColorCss,
	}
}
