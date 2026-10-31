package anilist_platform

import (
	"testing"

	"seanime/internal/api/anilist"

	"github.com/samber/mo"
)

const (
	testAnimeID = 1
	testMangaID = 2
)

func collections(animeYear, mangaYear *int) (*anilist.AnimeCollection, *anilist.MangaCollection) {
	anime := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
		Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{{
			Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{{
				Media:     &anilist.BaseAnime{ID: testAnimeID},
				StartedAt: &anilist.AnimeCollection_MediaListCollection_Lists_Entries_StartedAt{Year: animeYear},
			}},
		}},
	}}
	manga := &anilist.MangaCollection{MediaListCollection: &anilist.MangaCollection_MediaListCollection{
		Lists: []*anilist.MangaCollection_MediaListCollection_Lists{{
			Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{{
				Media:     &anilist.BaseManga{ID: testMangaID},
				StartedAt: &anilist.MangaCollection_MediaListCollection_Lists_Entries_StartedAt{Year: mangaYear},
			}},
		}},
	}}
	return anime, manga
}

func TestDatesToFill(t *testing.T) {
	year := 2019
	dated, datedManga := collections(&year, &year)
	undated, undatedManga := collections(nil, nil)

	tests := []struct {
		name        string
		anime       mo.Option[*anilist.AnimeCollection]
		manga       mo.Option[*anilist.MangaCollection]
		mediaID     int
		wantStarted bool
	}{
		{name: "an anime with no date gets today", anime: mo.Some(undated), manga: mo.Some(undatedManga), mediaID: testAnimeID, wantStarted: true},
		{name: "an anime keeps its date", anime: mo.Some(dated), manga: mo.Some(datedManga), mediaID: testAnimeID},
		{name: "a manga with no date gets today", anime: mo.Some(undated), manga: mo.Some(undatedManga), mediaID: testMangaID, wantStarted: true},
		{name: "a manga keeps its date", anime: mo.Some(dated), manga: mo.Some(datedManga), mediaID: testMangaID},
		{name: "a manga is found without the anime collection", anime: mo.None[*anilist.AnimeCollection](), manga: mo.Some(datedManga), mediaID: testMangaID},
		{name: "media on neither loaded list gets today", anime: mo.Some(dated), manga: mo.Some(datedManga), mediaID: 3, wantStarted: true},
		{name: "no collections sends nothing", anime: mo.None[*anilist.AnimeCollection](), manga: mo.None[*anilist.MangaCollection](), mediaID: testMangaID},
		{name: "a manga with its collection missing sends nothing", anime: mo.Some(dated), manga: mo.None[*anilist.MangaCollection](), mediaID: testMangaID},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ap := &AnilistPlatform{rawAnimeCollection: tt.anime, rawMangaCollection: tt.manga}

			startedAt, completedAt := ap.datesToFill(tt.mediaID, false)
			if (startedAt != nil) != tt.wantStarted {
				t.Errorf("startedAt = %v, want set: %v", startedAt, tt.wantStarted)
			}
			if completedAt != nil {
				t.Errorf("completedAt = %v, want unset", completedAt)
			}
		})
	}
}
