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
	if !f.Matches(Item{Title: "Dandadan season 2 date"}) {
		t.Fatalf("lists mode should match a watching title by default")
	}
	if f.Matches(Item{Title: "Mob mentality in fandoms"}) {
		t.Fatalf("very short titles must not match")
	}
}

func TestNotifyFilterListCheckboxes(t *testing.T) {
	strp := func(s string) *string { return &s }
	boolp := func(b bool) *bool { return &b }
	planning, current, completed := anilist.MediaListStatusPlanning, anilist.MediaListStatusCurrent, anilist.MediaListStatusCompleted
	list := func(st *anilist.MediaListStatus, title string) *anilist.AnimeCollection_MediaListCollection_Lists {
		return &anilist.AnimeCollection_MediaListCollection_Lists{Status: st, Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{
			{Media: &anilist.BaseAnime{Title: &anilist.BaseAnime_Title{Romaji: strp(title)}}},
		}}
	}
	col := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
		Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
			list(&planning, "Frieren"), list(&current, "Dandadan"), list(&completed, "Steins;Gate"),
		},
	}}
	cases := []struct {
		name                         string
		cur, plan, comp              bool
		wantFrieren, wantDan, wantSG bool
	}{
		{"all on", true, true, true, true, true, true},
		{"watching only", true, false, false, false, true, false},
		{"planning only", false, true, false, true, false, false},
		{"completed only", false, false, true, false, false, true},
		{"none", false, false, false, false, false, false},
	}
	for _, c := range cases {
		f := NewNotifyFilter(&db.ClientSettingsOverrides{
			NewsNotifyMode:          strp(NotifyModeLists),
			NewsNotifyListCurrent:   boolp(c.cur),
			NewsNotifyListPlanning:  boolp(c.plan),
			NewsNotifyListCompleted: boolp(c.comp),
		}, func() *anilist.AnimeCollection { return col }, nil)
		if got := f.Matches(Item{Title: "Frieren news"}); got != c.wantFrieren {
			t.Errorf("%s: Frieren = %v", c.name, got)
		}
		if got := f.Matches(Item{Title: "Dandadan news"}); got != c.wantDan {
			t.Errorf("%s: Dandadan = %v", c.name, got)
		}
		if got := f.Matches(Item{Title: "Steins;Gate news"}); got != c.wantSG {
			t.Errorf("%s: Steins;Gate = %v", c.name, got)
		}
	}
}

// A profile whose lists can't be read gets no list-mode news — never another account's.
func TestNotifyFilterListsWithoutCollection(t *testing.T) {
	f := NewNotifyFilter(&db.ClientSettingsOverrides{NewsNotifyMode: strp(NotifyModeLists)},
		func() *anilist.AnimeCollection { return nil },
		func() *anilist.MangaCollection { return nil },
	)
	if f.Matches(Item{Title: "Frieren season 3 announced", Description: "One Piece and Naruto news"}) {
		t.Fatalf("lists mode with no collection should match nothing")
	}
}

// A manga list runs to thousands of titles, so it only notifies when asked for; anime always can.
func TestNotifyFilterListMedia(t *testing.T) {
	boolp := func(b bool) *bool { return &b }
	planning := anilist.MediaListStatusPlanning
	anime := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
		Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{{Status: &planning, Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{
			{Media: &anilist.BaseAnime{Title: &anilist.BaseAnime_Title{Romaji: strp("Frieren")}}},
		}}},
	}}
	manga := &anilist.MangaCollection{MediaListCollection: &anilist.MangaCollection_MediaListCollection{
		Lists: []*anilist.MangaCollection_MediaListCollection_Lists{{Status: &planning, Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{
			{Media: &anilist.BaseManga{Title: &anilist.BaseManga_Title{Romaji: strp("Getsuyoubi no Tawawa")}}},
		}}},
	}}
	build := func(ovr *db.ClientSettingsOverrides) *NotifyFilter {
		ovr.NewsNotifyMode = strp(NotifyModeLists)
		return NewNotifyFilter(ovr, func() *anilist.AnimeCollection { return anime }, func() *anilist.MangaCollection { return manga })
	}
	animeNews, mangaNews := Item{Title: "Frieren news"}, Item{Title: "[DISC] Getsuyoubi no Tawawa - Ep. 610"}

	f := build(&db.ClientSettingsOverrides{})
	if !f.Matches(animeNews) || f.Matches(mangaNews) {
		t.Fatalf("by default only the anime list should notify")
	}
	f = build(&db.ClientSettingsOverrides{NewsNotifyListManga: boolp(true)})
	if !f.Matches(animeNews) || !f.Matches(mangaNews) {
		t.Fatalf("manga turned on should add the manga list")
	}
	f = build(&db.ClientSettingsOverrides{NewsNotifyListAnime: boolp(false), NewsNotifyListManga: boolp(true)})
	if f.Matches(animeNews) || !f.Matches(mangaNews) {
		t.Fatalf("anime turned off should drop the anime list")
	}
}
