package anilist

import "testing"

func msAnime(id int, title string, status MediaStatus, sequels ...*BaseAnime) *CompleteAnime {
	edges := make([]*CompleteAnime_Relations_Edges, 0, len(sequels))
	seq := MediaRelationSequel
	for _, s := range sequels {
		edges = append(edges, &CompleteAnime_Relations_Edges{RelationType: &seq, Node: s})
	}
	return &CompleteAnime{
		ID:        id,
		Title:     &CompleteAnime_Title{English: &title, Romaji: &title, UserPreferred: &title},
		Status:    &status,
		Relations: &CompleteAnime_Relations{Edges: edges},
	}
}

func msBase(id int, status MediaStatus) *BaseAnime {
	return &BaseAnime{ID: id, Status: &status}
}

func msCollection(entries map[MediaListStatus][]*CompleteAnime) *AnimeCollectionWithRelations {
	lists := make([]*AnimeCollectionWithRelations_MediaListCollection_Lists, 0)
	for st, media := range entries {
		st := st
		list := &AnimeCollectionWithRelations_MediaListCollection_Lists{Status: &st}
		for _, m := range media {
			list.Entries = append(list.Entries, &AnimeCollectionWithRelations_MediaListCollection_Lists_Entries{Status: &st, Media: m})
		}
		lists = append(lists, list)
	}
	return &AnimeCollectionWithRelations{MediaListCollection: &AnimeCollectionWithRelations_MediaListCollection{Lists: lists}}
}

func TestFindMissedSequels(t *testing.T) {
	col := msCollection(map[MediaListStatus][]*CompleteAnime{
		MediaListStatusCompleted: {
			msAnime(1, "A", MediaStatusFinished, msBase(101, MediaStatusFinished)),       // missed
			msAnime(2, "B", MediaStatusFinished, msBase(102, MediaStatusNotYetReleased)), // not released
			msAnime(3, "C", MediaStatusFinished, msBase(103, MediaStatusReleasing)),      // planned -> still missed
			msAnime(4, "D", MediaStatusFinished, msBase(104, MediaStatusFinished)),       // watching -> excluded
			msAnime(5, "E", MediaStatusFinished, msBase(105, MediaStatusFinished)),       // dropped -> excluded
		},
		MediaListStatusPlanning: {msAnime(103, "C2", MediaStatusReleasing)},
		MediaListStatusCurrent:  {msAnime(104, "D2", MediaStatusFinished, msBase(999, MediaStatusFinished))},
		MediaListStatusDropped:  {msAnime(105, "E2", MediaStatusFinished)},
	})

	got := FindMissedSequels(col, nil)
	if len(got) != 2 {
		t.Fatalf("expected 2 missed sequels, got %d", len(got))
	}
	if got[0].Media.ID != 1 || got[0].Sequel.ID != 101 || got[0].SequelListStatus != nil {
		t.Errorf("unexpected first item: %+v", got[0])
	}
	if got[1].Media.ID != 3 || got[1].Sequel.ID != 103 || got[1].SequelListStatus == nil || *got[1].SequelListStatus != MediaListStatusPlanning {
		t.Errorf("unexpected second item: %+v", got[1])
	}
}

func TestFindMissedSequelsUsesFresherStatuses(t *testing.T) {
	col := msCollection(map[MediaListStatus][]*CompleteAnime{
		MediaListStatusCompleted: {msAnime(1, "A", MediaStatusFinished, msBase(101, MediaStatusFinished))},
	})
	current := MediaListStatusCurrent
	completed := MediaListStatusCompleted
	fresh := &AnimeCollection{MediaListCollection: &AnimeCollection_MediaListCollection{Lists: []*AnimeCollection_MediaListCollection_Lists{
		{Status: &completed, Entries: []*AnimeCollection_MediaListCollection_Lists_Entries{{Status: &completed, Media: msBase(1, MediaStatusFinished)}}},
		{Status: &current, Entries: []*AnimeCollection_MediaListCollection_Lists_Entries{{Status: &current, Media: msBase(101, MediaStatusFinished)}}},
	}}}

	if got := FindMissedSequels(col, fresh); len(got) != 0 {
		t.Fatalf("sequel started since the relations fetch should drop out, got %d", len(got))
	}
}
