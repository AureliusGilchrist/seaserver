package news

import (
	"testing"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
)

func strp(s string) *string { return &s }

func TestNotifyFilterModes(t *testing.T) {
	death := Item{Title: "Legendary animator dies at 80"}
	plain := Item{Title: "Frieren season 3 announced"}

	// Default (no overrides): built-in keyword list.
	f := NewNotifyFilter(nil, nil, nil)
	if !f.Matches(death) || f.Matches(plain) {
		t.Fatalf("default filter should only match the built-in keywords")
	}

	f = NewNotifyFilter(&db.ClientSettingsOverrides{NewsNotifyMode: strp(NotifyModeAll)}, nil, nil)
	if !f.Matches(plain) {
		t.Fatalf("all mode should match everything")
	}

	f = NewNotifyFilter(&db.ClientSettingsOverrides{NewsNotifyMode: strp(NotifyModeKeywords), NewsNotifyKeywords: strp("season 3, movie")}, nil, nil)
	if !f.Matches(plain) || f.Matches(death) {
		t.Fatalf("custom keywords should replace the built-in list")
	}

	planning := anilist.MediaListStatusPlanning
	current := anilist.MediaListStatusCurrent
	title := "Sousou no Frieren"
	eng := "Frieren: Beyond Journey's End"
	short := "Mob"
	col := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
		Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
			{Status: &planning, Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{
				{Media: &anilist.BaseAnime{Title: &anilist.BaseAnime_Title{Romaji: &title, English: &eng}}},
				{Media: &anilist.BaseAnime{Title: &anilist.BaseAnime_Title{Romaji: &short}}},
			}},
			{Status: &current, Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{
				{Media: &anilist.BaseAnime{Title: &anilist.BaseAnime_Title{Romaji: strp("Dandadan")}}},
			}},
		},
	}}
	f = NewNotifyFilter(&db.ClientSettingsOverrides{NewsNotifyMode: strp(NotifyModeLists)}, func() *anilist.AnimeCollection { return col }, nil)
	if !f.Matches(Item{Title: "Frieren: Beyond Journey's End gets a new trailer"}) {
		t.Fatalf("lists mode should match a planning title")
	}
	if f.Matches(Item{Title: "Dandadan season 2 date"}) {
		t.Fatalf("lists mode should ignore titles that are only on Watching")
	}
	if f.Matches(Item{Title: "Mob mentality in fandoms"}) {
		t.Fatalf("very short titles must not match")
	}
}
