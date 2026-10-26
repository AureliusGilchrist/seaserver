package handlers

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"seanime/internal/news"

	"github.com/labstack/echo/v4"
)

// Extras on the community timeline: achievement unlocks (with their icon, tier and XP, bursts
// folded into one card), and paced news (see internal/news/timeline_rank.go).

// timelineAchievementBurst folds unlocks by one profile this close together into one card.
const timelineAchievementBurst = 15 * time.Minute

// TimelineAchievement is one unlock shown on an achievement card.
type TimelineAchievement struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Tier        int    `json:"tier"`
	TierName    string `json:"tierName,omitempty"`
	Description string `json:"description,omitempty"`
	IconSVG     string `json:"iconSvg,omitempty"`
	XP          int    `json:"xp,omitempty"`
}

// TimelineNewsBrief is one headline on a news card.
type TimelineNewsBrief struct {
	Title       string `json:"title"`
	Link        string `json:"link"`
	Image       string `json:"image,omitempty"`
	FeedTitle   string `json:"feedTitle"`
	PublishedAt int64  `json:"publishedAt"`
	Description string `json:"description,omitempty"`
	// Set when the headline names something on the viewer's lists.
	MatchedTitle string `json:"matchedTitle,omitempty"`
	MatchedList  string `json:"matchedList,omitempty"`
}

// TimelineNews is a news card: a lead headline, a digest of more, or both.
type TimelineNews struct {
	Lead   *TimelineNewsBrief   `json:"lead,omitempty"`
	Digest []*TimelineNewsBrief `json:"digest,omitempty"`
}

func achievementFromEvent(ev *TimelineEvent) *TimelineAchievement {
	a := &TimelineAchievement{Tier: 1}
	if meta := ParseEventMetadata(ev.Metadata); meta != nil {
		if v, ok := meta["key"].(string); ok {
			a.Key = v
		}
		if v, ok := meta["name"].(string); ok {
			a.Name = v
		}
		if v, ok := meta["tier"].(float64); ok && v > 0 {
			a.Tier = int(v)
		}
		if v, ok := meta["tierName"].(string); ok {
			a.TierName = v
		}
		if v, ok := meta["xp"].(float64); ok {
			a.XP = int(v)
		}
	}
	if ev.AchievementIconSVG != nil {
		a.IconSVG = *ev.AchievementIconSVG
	}
	if ev.AchievementDesc != nil {
		a.Description = *ev.AchievementDesc
	}
	if a.Name == "" {
		a.Name = a.Key
	}
	return a
}

// withAchievements gives a profile's achievement items their unlock details, adds unlocks that
// predate activity-event tracking (from the achievement table), and folds bursts into one card.
// Other items pass through untouched.
func (h *Handler) withAchievements(profileID uint, items []*TimelineFeedItem, limit int) []*TimelineFeedItem {
	var achItems []*TimelineFeedItem
	out := make([]*TimelineFeedItem, 0, len(items))
	seen := map[string]bool{}
	for _, it := range items {
		if it.Activity == nil || it.Activity.EventType != "achievement_unlocked" {
			out = append(out, it)
			continue
		}
		a := achievementFromEvent(it.Activity)
		seen[fmt.Sprintf("%s:%d", a.Key, a.Tier)] = true
		it.Achievements = []*TimelineAchievement{a}
		achItems = append(achItems, it)
	}

	// Backfill from the achievement table.
	if h.App.ProfileDatabaseManager != nil {
		if pdb, err := h.App.ProfileDatabaseManager.GetDatabase(profileID); err == nil && pdb != nil {
			if unlocked, err := pdb.GetUnlockedAchievements(); err == nil {
				defMap := achievement.DefinitionMap()
				author := (*TimelineProfileSummary)(nil)
				if len(items) > 0 {
					author = items[0].Author
				}
				if author == nil {
					author = h.timelineProfileCache().get(profileID)
				}
				for i, ach := range unlocked {
					if i >= limit {
						break
					}
					if ach.UnlockedAt == nil || seen[fmt.Sprintf("%s:%d", ach.Key, ach.Tier)] {
						continue
					}
					a := &TimelineAchievement{Key: ach.Key, Name: ach.Key, Tier: ach.Tier}
					if d, ok := defMap[ach.Key]; ok && d != nil {
						a.Name = d.Name
						a.IconSVG = d.IconSVG
						a.Description = achievement.FormatThreshold(d.Description, d.TierThresholds, ach.Tier)
						a.XP = d.XPReward
					}
					meta, _ := json.Marshal(map[string]interface{}{"key": a.Key, "name": a.Name, "tier": a.Tier, "xp": a.XP})
					achItems = append(achItems, &TimelineFeedItem{
						Key:          fmt.Sprintf("ach:%d:%s:%d", profileID, ach.Key, ach.Tier),
						Kind:         "activity",
						CreatedAt:    *ach.UnlockedAt,
						Author:       author,
						Activity:     &TimelineEvent{EventType: "achievement_unlocked", Metadata: string(meta), CreatedAt: *ach.UnlockedAt},
						Achievements: []*TimelineAchievement{a},
					})
				}
			}
		}
	}

	// Fold bursts: newest first, an unlock within the window of the group's oldest joins it.
	sort.SliceStable(achItems, func(i, j int) bool { return achItems[i].CreatedAt.After(achItems[j].CreatedAt) })
	var cur *TimelineFeedItem
	var curOldest time.Time
	for _, it := range achItems {
		if cur != nil && curOldest.Sub(it.CreatedAt) <= timelineAchievementBurst {
			cur.Achievements = append(cur.Achievements, it.Achievements...)
			curOldest = it.CreatedAt
			continue
		}
		cur = it
		curOldest = it.CreatedAt
		out = append(out, it)
	}
	return out
}

// timelineNewsItems scores and paces the cached news for the viewer. It never fetches: a cold
// cache starts a background refresh and the feed simply has no news this time.
func (h *Handler) timelineNewsItems(c echo.Context) []*TimelineFeedItem {
	if h.App.Settings == nil || h.App.Settings.Library == nil {
		return nil
	}
	pdb := h.GetProfileDatabase(c)
	var keywords []string
	if pdb != nil {
		if ovr, _ := pdb.GetClientSettingsOverrides(); ovr != nil {
			if ovr.CommunityShowNews != nil && !*ovr.CommunityShowNews {
				return nil
			}
			if ovr.NewsNotifyKeywords != nil {
				for _, kw := range strings.Split(*ovr.NewsNotifyKeywords, ",") {
					if kw = strings.ToLower(strings.TrimSpace(kw)); kw != "" {
						keywords = append(keywords, kw)
					}
				}
			}
		}
	}

	urls := news.GetFeedUrls(h.App.Settings.Library.NewsFeeds)
	resp := news.CachedResponse(urls)
	if resp == nil {
		go news.GetResponse(urls)
		return nil
	}

	viewer := h.GetProfileID(c)
	var animeCol *anilist.AnimeCollection
	var mangaCol *anilist.MangaCollection
	if viewer > 0 && h.App.AnilistClientManager != nil {
		animeCol, _ = h.App.AnilistClientManager.GetAnimeCollection(viewer)
		mangaCol, _ = h.App.AnilistClientManager.GetMangaCollection(viewer)
	}
	if animeCol == nil {
		animeCol, _ = h.App.GetAnimeCollection(false)
	}
	if mangaCol == nil {
		mangaCol, _ = h.App.GetMangaCollection(false)
	}

	cards := news.BuildTimelineNews(resp.Items, &news.RankContext{
		Titles:   news.ViewerListTitles(animeCol, mangaCol),
		Keywords: keywords,
	}, time.Now())

	out := make([]*TimelineFeedItem, 0, len(cards))
	for _, card := range cards {
		tn := &TimelineNews{}
		keySrc := ""
		if card.Lead != nil {
			tn.Lead = newsBrief(card.Lead)
			keySrc = card.Lead.Item.Link
		}
		for i := range card.Digest {
			tn.Digest = append(tn.Digest, newsBrief(&card.Digest[i]))
			if keySrc == "" {
				keySrc = card.Digest[i].Item.Link
			}
		}
		out = append(out, &TimelineFeedItem{
			Key:       newsKey(keySrc),
			Kind:      "news",
			CreatedAt: card.At,
			News:      tn,
		})
	}
	return out
}

func newsBrief(r *news.RankedNews) *TimelineNewsBrief {
	b := &TimelineNewsBrief{
		Title:       r.Item.Title,
		Link:        r.Item.Link,
		Image:       r.Item.Image,
		FeedTitle:   r.Item.FeedTitle,
		PublishedAt: r.Item.PublishedAt,
	}
	if d := r.Item.Description; d != "" {
		if len([]rune(d)) > 220 {
			d = string([]rune(d)[:220]) + "…"
		}
		b.Description = d
	}
	if r.Matched != nil {
		b.MatchedTitle = r.Matched.Title
		b.MatchedList = r.Matched.List
	}
	return b
}

func newsKey(link string) string {
	sum := sha1.Sum([]byte(link))
	return "news:" + hex.EncodeToString(sum[:])[:12]
}

// separateNewsCards folds a news card into the one before it whenever two would sit next to each
// other in the (sorted) feed, so news never runs in a block.
func separateNewsCards(items []*TimelineFeedItem) []*TimelineFeedItem {
	out := make([]*TimelineFeedItem, 0, len(items))
	for _, it := range items {
		if it.Kind == "news" && len(out) > 0 {
			if prev := out[len(out)-1]; prev.Kind == "news" && prev.News != nil && it.News != nil {
				if it.News.Lead != nil {
					prev.News.Digest = append(prev.News.Digest, it.News.Lead)
				}
				prev.News.Digest = append(prev.News.Digest, it.News.Digest...)
				continue
			}
		}
		out = append(out, it)
	}
	return out
}
