package handlers

import (
	"testing"

	"seanime/internal/api/anilist"
)

func TestMangaMediaByIDIncludesPlanningCollectionAndPreservesEarlierMetadata(t *testing.T) {
	profileTitle := "Profile title"
	planningTitle := "Naruto"
	profileMedia := &anilist.BaseManga{
		ID:    30011,
		Title: &anilist.BaseManga_Title{Romaji: &profileTitle},
	}
	planningMedia := &anilist.BaseManga{
		ID:    30011,
		Title: &anilist.BaseManga_Title{Romaji: &planningTitle},
	}
	planningOnlyMedia := &anilist.BaseManga{
		ID:    2,
		Title: &anilist.BaseManga_Title{Romaji: &planningTitle},
	}

	collections := mangaMediaByID(
		&anilist.MangaCollection{
			MediaListCollection: &anilist.MangaCollection_MediaListCollection{
				Lists: []*anilist.MangaCollection_MediaListCollection_Lists{{
					Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{{
						Media: profileMedia,
					}},
				}},
			},
		},
		&anilist.MangaCollection{
			MediaListCollection: &anilist.MangaCollection_MediaListCollection{
				Lists: []*anilist.MangaCollection_MediaListCollection_Lists{{
					Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{{
						Media: planningMedia,
					}, {
						Media: planningOnlyMedia,
					}},
				}},
			},
		},
	)

	if collections[30011] != profileMedia {
		t.Fatal("expected profile metadata to take precedence for duplicate media IDs")
	}
	if collections[2] != planningOnlyMedia {
		t.Fatal("expected planning-only manga metadata to be included")
	}
}
