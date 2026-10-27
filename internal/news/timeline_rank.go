package news

import (
	"math"
	"sort"
	"strings"
	"time"

	"seanime/internal/api/anilist"
)

// News on the community timeline. The feeds publish far more than anyone wants interleaved with
// their friends' activity, so items are scored for the viewer and paced: each six-hour window gets
// at most a couple of headlines of its own (ones naming something on the viewer's lists, or one
// strong story), and everything else in that window folds into a single "more headlines" digest.

const (
	timelineNewsMaxAge      = 7 * 24 * time.Hour
	timelineNewsWindow      = 6 * time.Hour
	timelineNewsMaxMatched  = 2
	timelineNewsLeadMinimum = 1.2
)

// ListMatch is a title on the viewer's lists and how much a headline naming it counts.
type ListMatch struct {
	Title  string // as shown to the user
	List   string // "Watching", "Planning", "Completed"
	Weight float64
}

// RankContext is what scoring knows about the viewer.
type RankContext struct {
	// Lower-cased title -> match. Built by ViewerListTitles.
	Titles   map[string]ListMatch
	Keywords []string // lower-cased; empty uses the built-in list
}

// RankedNews is one scored headline.
type RankedNews struct {
	Item    Item
	Score   float64
	Matched *ListMatch
}

// TimelineNewsCard is one news card on the timeline: a lead headline, a digest of headlines, or
// (after two cards end up next to each other in the feed) both.
type TimelineNewsCard struct {
	At     time.Time
	Lead   *RankedNews
	Digest []RankedNews
}

// ViewerListTitles collects the viewer's anime and manga list titles with their weights.

// minListTitleLen keeps very short titles ("K", "Mob") from matching half the headlines.
const minListTitleLen = 4

func ViewerListTitles(animeCol *anilist.AnimeCollection, mangaCol *anilist.MangaCollection) map[string]ListMatch {
	out := map[string]ListMatch{}
	weightOf := func(st *anilist.MediaListStatus) (string, float64) {
		if st == nil {
			return "", 0
		}
		switch *st {
		case anilist.MediaListStatusCurrent, anilist.MediaListStatusRepeating:
			return "Watching", 3
		case anilist.MediaListStatusPlanning:
			return "Planning", 2
		case anilist.MediaListStatusCompleted:
			return "Completed", 1
		}
		return "", 0
	}
	add := func(list string, w float64, display string, titles ...*string) {
		for _, t := range titles {
			if t == nil {
				continue
			}
			lt := strings.ToLower(strings.TrimSpace(*t))
			if len([]rune(lt)) < minListTitleLen {
				continue
			}
			if prev, ok := out[lt]; ok && prev.Weight >= w {
				continue
			}
			out[lt] = ListMatch{Title: display, List: list, Weight: w}
		}
	}
	if animeCol != nil {
		for _, l := range animeCol.GetMediaListCollection().GetLists() {
			list, w := weightOf(l.GetStatus())
			if w == 0 {
				continue
			}
			for _, e := range l.GetEntries() {
				if m := e.GetMedia(); m != nil && m.Title != nil {
					display := firstNonEmpty(m.Title.UserPreferred, m.Title.Romaji, m.Title.English)
					add(list, w, display, m.Title.English, m.Title.Romaji, m.Title.UserPreferred)
				}
			}
		}
	}
	if mangaCol != nil {
		for _, l := range mangaCol.GetMediaListCollection().GetLists() {
			list, w := weightOf(l.GetStatus())
			if w == 0 {
				continue
			}
			if list == "Watching" {
				list = "Reading"
			}
			for _, e := range l.GetEntries() {
				if m := e.GetMedia(); m != nil && m.Title != nil {
					display := firstNonEmpty(m.Title.UserPreferred, m.Title.Romaji, m.Title.English)
					add(list, w, display, m.Title.English, m.Title.Romaji, m.Title.UserPreferred)
				}
			}
		}
	}
	return out
}

func firstNonEmpty(ss ...*string) string {
	for _, s := range ss {
		if s != nil && *s != "" {
			return *s
		}
	}
	return ""
}

// sourceWeight trusts editorial feeds over community ones.
func sourceWeight(feed string) float64 {
	f := strings.ToLower(feed)
	if strings.Contains(f, "reddit") || strings.HasPrefix(f, "r/") || strings.Contains(f, "/r/") {
		return 0.6
	}
	return 1
}

// ScoreItem scores one headline for the viewer.
func ScoreItem(it Item, ctx *RankContext, now time.Time) RankedNews {
	r := RankedNews{Item: it}
	haystack := strings.ToLower(it.Title + " " + it.Description)
	rel := 0.0
	if ctx != nil {
		for t, m := range ctx.Titles {
			if m.Weight > rel && strings.Contains(haystack, t) {
				rel = m.Weight
				mm := m
				r.Matched = &mm
			}
		}
	}
	kw := false
	if ctx != nil && len(ctx.Keywords) > 0 {
		for _, k := range ctx.Keywords {
			if strings.Contains(k, " ") {
				kw = kw || strings.Contains(haystack, k)
			} else {
				kw = kw || containsWholeWord(haystack, k)
			}
		}
	} else {
		kw = matchesNewsNotifyKeywords(it.Title, it.Description)
	}
	if kw {
		rel += 1.5
	}
	if it.Coverage > 1 {
		rel += 0.75 * float64(it.Coverage-1)
	}
	if it.Image != "" {
		rel += 0.25
	}
	ageHours := math.Max(0, now.Sub(time.Unix(it.PublishedAt, 0)).Hours())
	decay := 1 / (1 + ageHours/48)
	r.Score = sourceWeight(it.FeedTitle) * (1 + rel) * decay
	return r
}

// BuildTimelineNews scores the cached items and paces them into timeline cards, newest first.
func BuildTimelineNews(items []Item, ctx *RankContext, now time.Time) []TimelineNewsCard {
	cutoff := now.Add(-timelineNewsMaxAge).Unix()
	windows := map[int64][]RankedNews{}
	for _, it := range items {
		if it.PublishedAt <= 0 || it.PublishedAt < cutoff || it.PublishedAt > now.Add(time.Hour).Unix() {
			continue
		}
		w := it.PublishedAt / int64(timelineNewsWindow.Seconds())
		windows[w] = append(windows[w], ScoreItem(it, ctx, now))
	}

	var cards []TimelineNewsCard
	for _, ranked := range windows {
		sort.SliceStable(ranked, func(i, j int) bool { return ranked[i].Score > ranked[j].Score })
		var leads []RankedNews
		var rest []RankedNews
		for _, r := range ranked {
			if r.Matched != nil && len(leads) < timelineNewsMaxMatched {
				leads = append(leads, r)
				continue
			}
			rest = append(rest, r)
		}
		if len(leads) == 0 && len(rest) > 0 && rest[0].Score >= timelineNewsLeadMinimum {
			leads = append(leads, rest[0])
			rest = rest[1:]
		}
		for i := range leads {
			lead := leads[i]
			cards = append(cards, TimelineNewsCard{At: time.Unix(lead.Item.PublishedAt, 0), Lead: &lead})
		}
		if len(rest) > 0 {
			newest := int64(0)
			for _, r := range rest {
				if r.Item.PublishedAt > newest {
					newest = r.Item.PublishedAt
				}
			}
			cards = append(cards, TimelineNewsCard{At: time.Unix(newest, 0), Digest: rest})
		}
	}
	sort.SliceStable(cards, func(i, j int) bool { return cards[i].At.After(cards[j].At) })
	return cards
}

// MergeAdjacent folds a card into the one before it (in feed order); used when two news cards
// would otherwise sit next to each other.
func (c *TimelineNewsCard) MergeAdjacent(next *TimelineNewsCard) {
	if next.Lead != nil {
		c.Digest = append(c.Digest, *next.Lead)
	}
	c.Digest = append(c.Digest, next.Digest...)
	sort.SliceStable(c.Digest, func(i, j int) bool { return c.Digest[i].Score > c.Digest[j].Score })
}
