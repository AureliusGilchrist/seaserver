package news

import (
	"strings"
	"testing"
)

func TestDedupeItems(t *testing.T) {
	tests := []struct {
		name     string
		in       []Item
		wantLen  int
		wantImg  string // image on the first kept item, when it matters
		wantLink string // link on the first kept item
	}{
		{
			name: "same link collapses",
			in: []Item{
				{Title: "A", Link: "https://x/1"},
				{Title: "A, revisited", Link: "https://x/1"},
			},
			wantLen:  1,
			wantLink: "https://x/1",
		},
		{
			name: "same title different link collapses",
			in: []Item{
				{Title: "Same Story", Link: "https://x/1"},
				{Title: "same   story", Link: "https://x/2"},
			},
			wantLen:  1,
			wantLink: "https://x/1",
		},
		{
			name: "title match ignores case and extra whitespace",
			in: []Item{
				{Title: "  Scriptwriter   Dies  ", Link: "https://x/1"},
				{Title: "scriptwriter dies", Link: "https://x/2"},
			},
			wantLen: 1,
		},
		{
			name: "different stories both kept",
			in: []Item{
				{Title: "A", Link: "https://x/1"},
				{Title: "B", Link: "https://x/2"},
			},
			wantLen: 2,
		},
		{
			name: "duplicate without image loses to one with",
			in: []Item{
				{Title: "A", Link: "https://x/1", Image: ""},
				{Title: "a", Link: "https://x/2", Image: "https://img/1"},
			},
			wantLen: 1,
			wantImg: "https://img/1",
		},
		{
			name: "empty title items are not collapsed together",
			in: []Item{
				{Title: "", Link: "https://x/1"},
				{Title: "", Link: "https://x/2"},
			},
			wantLen: 2,
		},
		{
			name: "no link items collapse by title",
			in: []Item{
				{Title: "Same Story"},
				{Title: "same story"},
			},
			wantLen: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := dedupeItems(tt.in)
			if len(out) != tt.wantLen {
				t.Fatalf("dedupeItems() kept %d items, want %d", len(out), tt.wantLen)
			}
			if tt.wantLink != "" && out[0].Link != tt.wantLink {
				t.Errorf("first item link = %q, want %q", out[0].Link, tt.wantLink)
			}
			if tt.wantImg != "" && out[0].Image != tt.wantImg {
				t.Errorf("first item image = %q, want %q", out[0].Image, tt.wantImg)
			}
		})
	}
}

func TestGetFeedUrls(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want int
	}{
		{name: "empty falls back to defaults", raw: "", want: len(defaultFeeds)},
		{name: "newline separated", raw: "https://a/rss.xml\nhttps://b/rss.xml", want: 2},
		{name: "comma separated", raw: "https://a/rss.xml, https://b/rss.xml", want: 2},
		{name: "semicolon separated", raw: "https://a/rss.xml;https://b/rss.xml", want: 2},
		{name: "non-http lines dropped", raw: "https://a/rss.xml\nnot a url\nftp://x", want: 1},
		{name: "all invalid falls back to defaults", raw: "garbage", want: len(defaultFeeds)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := len(GetFeedUrls(tt.raw)); got != tt.want {
				t.Errorf("GetFeedUrls(%q) returned %d feeds, want %d", tt.raw, got, tt.want)
			}
		})
	}
}

func TestStripHTML(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "tags removed", in: "<p>Hello <b>world</b></p>", want: "Hello world"},
		{name: "whitespace collapsed", in: "<p>Hello</p>\n  <p>world</p>", want: "Hello world"},
		{name: "long input truncated to 500 chars plus ellipsis", in: "<p>" + strings.Repeat("a", 600) + "</p>", want: strings.Repeat("a", 500) + "…"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := stripHTML(tt.in); got != tt.want {
				t.Errorf("stripHTML(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
