package news

import (
	"fmt"
	"testing"
	"time"
)

func TestScoreItemListMatchBeatsUnmatched(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	ctx := &RankContext{Titles: map[string]ListMatch{"frieren": {Title: "Frieren", List: "Watching", Weight: 3}}, Keywords: []string{"zzz-none"}}
	a := ScoreItem(Item{Title: "Frieren season 2 trailer", PublishedAt: now.Unix(), FeedTitle: "ANN"}, ctx, now)
	b := ScoreItem(Item{Title: "Some other show announced", PublishedAt: now.Unix(), FeedTitle: "ANN"}, ctx, now)
	if a.Matched == nil || a.Score <= b.Score {
		t.Fatalf("matched %v score %.2f should beat %.2f", a.Matched, a.Score, b.Score)
	}
	r := ScoreItem(Item{Title: "Some other show announced", PublishedAt: now.Unix(), FeedTitle: "r/anime"}, ctx, now)
	if r.Score >= b.Score {
		t.Fatalf("reddit %.2f should rank under editorial %.2f", r.Score, b.Score)
	}
}

func TestBuildTimelineNewsPacing(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	// Ten items inside one six-hour window, three of them on the viewer's lists.
	windowStart := (now.Unix() / int64(timelineNewsWindow.Seconds())) * int64(timelineNewsWindow.Seconds())
	ctx := &RankContext{Titles: map[string]ListMatch{
		"frieren":  {Title: "Frieren", List: "Watching", Weight: 3},
		"dandadan": {Title: "Dandadan", List: "Planning", Weight: 2},
		"oshi no":  {Title: "Oshi no Ko", List: "Completed", Weight: 1},
	}, Keywords: []string{"zzz-none"}}
	var items []Item
	titles := []string{"Frieren news", "Dandadan news", "Oshi no Ko news"}
	for i := 0; i < 10; i++ {
		title := fmt.Sprintf("Generic headline %d", i)
		if i < len(titles) {
			title = titles[i]
		}
		items = append(items, Item{Title: title, Link: fmt.Sprintf("l%d", i), PublishedAt: windowStart + int64(i*60), FeedTitle: "ANN"})
	}
	// One stale item that must be dropped.
	items = append(items, Item{Title: "Frieren old", Link: "old", PublishedAt: now.Add(-8 * 24 * time.Hour).Unix(), FeedTitle: "ANN"})

	cards := BuildTimelineNews(items, ctx, now)
	leads, digests, total := 0, 0, 0
	for _, c := range cards {
		if c.Lead != nil {
			leads++
			total++
			if c.Lead.Item.Link == "old" {
				t.Fatalf("stale item kept")
			}
		}
		if len(c.Digest) > 0 {
			digests++
			total += len(c.Digest)
		}
	}
	if leads > 2 || digests != 1 || total != 10 {
		t.Fatalf("leads=%d digests=%d total=%d, want <=2, 1, 10", leads, digests, total)
	}
}

func TestBuildTimelineNewsStrongUnmatchedLead(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	cards := BuildTimelineNews([]Item{
		{Title: "Big studio news", Link: "a", PublishedAt: now.Unix(), FeedTitle: "ANN", Image: "x", Coverage: 3},
		{Title: "Small post", Link: "b", PublishedAt: now.Unix() - 60, FeedTitle: "r/anime"},
	}, &RankContext{Keywords: []string{"zzz-none"}}, now)
	if len(cards) != 2 || cards[0].Lead == nil && cards[1].Lead == nil {
		t.Fatalf("want a lead plus a digest, got %+v", cards)
	}
}

func TestMergeAdjacent(t *testing.T) {
	a := TimelineNewsCard{Lead: &RankedNews{Item: Item{Link: "a"}, Score: 2}}
	b := TimelineNewsCard{Digest: []RankedNews{{Item: Item{Link: "b"}, Score: 1}}, Lead: &RankedNews{Item: Item{Link: "c"}, Score: 3}}
	a.MergeAdjacent(&b)
	if a.Lead.Item.Link != "a" || len(a.Digest) != 2 || a.Digest[0].Item.Link != "c" {
		t.Fatalf("bad merge: %+v", a)
	}
}
