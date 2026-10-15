package manga

import (
	"reflect"
	"testing"

	hibikemanga "seanime/internal/extension/hibike/manga"
)

func TestGetMangaChapterReleaseHistory(t *testing.T) {
	chapters := []*hibikemanga.ChapterDetails{
		{Chapter: "3", UpdatedAt: "2026-01-22"},
		{Chapter: "1", UpdatedAt: "2026-01-08"},
		{Chapter: "2.5", UpdatedAt: "2026-01-15"},
		{Chapter: "4", UpdatedAt: "not-a-date"},
		{Chapter: "2.5", UpdatedAt: "2026-01-16"},
		{Chapter: "5", UpdatedAt: ""},
	}

	got := getMangaChapterReleaseHistory(chapters)
	want := []MangaChapterReleaseHistoryItem{
		{Chapter: "1", UpdatedAt: "2026-01-08"},
		{Chapter: "2.5", UpdatedAt: "2026-01-16"},
		{Chapter: "3", UpdatedAt: "2026-01-22"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("release history = %#v, want %#v", got, want)
	}
}
