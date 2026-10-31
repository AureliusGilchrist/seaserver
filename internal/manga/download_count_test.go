package manga

import "testing"

func TestCountMapChaptersAcrossProviders(t *testing.T) {
	media := MediaMap{
		1: {"a": {{ChapterID: "1"}, {ChapterID: "2"}}, "b": {{ChapterID: "3"}}},
		2: {"a": {{ChapterID: "1"}}},
		3: {},
	}
	if got := countMapChapters(media); got != 4 {
		t.Fatalf("got %d, want 4", got)
	}
}
