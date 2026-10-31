package simulated_platform

import (
	"testing"

	"seanime/internal/api/anilist"
	"seanime/internal/local"

	"github.com/samber/lo"
)

// memoryLocalManager keeps collections in the platform; only the saves are reached here.
type memoryLocalManager struct {
	local.Manager
}

func (m *memoryLocalManager) SaveSimulatedAnimeCollection(*anilist.AnimeCollection) {}
func (m *memoryLocalManager) SaveSimulatedMangaCollection(*anilist.MangaCollection) {}

func platformWithManga(mediaId int, startedYear *int, status anilist.MediaListStatus) *SimulatedPlatform {
	return &SimulatedPlatform{
		localManager: &memoryLocalManager{},
		mangaCollection: &anilist.MangaCollection{MediaListCollection: &anilist.MangaCollection_MediaListCollection{
			Lists: []*anilist.MangaCollection_MediaListCollection_Lists{{
				Status: &status,
				Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{{
					Status:      &status,
					Media:       &anilist.BaseManga{ID: mediaId},
					StartedAt:   &anilist.MangaCollection_MediaListCollection_Lists_Entries_StartedAt{Year: startedYear},
					CompletedAt: &anilist.MangaCollection_MediaListCollection_Lists_Entries_CompletedAt{},
				}},
			}},
		}},
	}
}

func TestMangaProgressFillsAnEmptyStartDate(t *testing.T) {
	sp := platformWithManga(1, nil, anilist.MediaListStatusPlanning)
	wrapper := sp.GetMangaCollectionWrapper()

	if err := wrapper.UpdateEntryProgress(1, 5, lo.ToPtr(50)); err != nil {
		t.Fatal(err)
	}

	entry, err := wrapper.findMangaEntry(1)
	if err != nil {
		t.Fatal(err)
	}
	if entry.StartedAt == nil || entry.StartedAt.Year == nil {
		t.Fatal("a manga with no start date should get one on its first chapter, even chapter 5")
	}
}

func TestMangaProgressKeepsAnExistingStartDate(t *testing.T) {
	sp := platformWithManga(1, lo.ToPtr(2019), anilist.MediaListStatusCurrent)
	wrapper := sp.GetMangaCollectionWrapper()

	if err := wrapper.UpdateEntryProgress(1, 50, lo.ToPtr(50)); err != nil {
		t.Fatal(err)
	}

	entry, err := wrapper.findMangaEntry(1)
	if err != nil {
		t.Fatal(err)
	}
	if *entry.StartedAt.Year != 2019 {
		t.Errorf("start year = %d, want 2019", *entry.StartedAt.Year)
	}
	if entry.CompletedAt.Year == nil {
		t.Error("finishing should fill the empty completion date")
	}
}

// Anything still releasing reports a total of -1, and every progress is past that.
func TestUnknownTotalDoesNotComplete(t *testing.T) {
	for _, total := range []int{-1, 0} {
		sp := platformWithManga(1, nil, anilist.MediaListStatusCurrent)
		wrapper := sp.GetMangaCollectionWrapper()

		if err := wrapper.UpdateEntryProgress(1, 3, lo.ToPtr(total)); err != nil {
			t.Fatal(err)
		}

		entry, err := wrapper.findMangaEntry(1)
		if err != nil {
			t.Fatal(err)
		}
		if *entry.Status != anilist.MediaListStatusCurrent {
			t.Errorf("total %d: status = %v, want CURRENT", total, *entry.Status)
		}
		if entry.CompletedAt.Year != nil {
			t.Errorf("total %d: completion date was set", total)
		}
	}
}
