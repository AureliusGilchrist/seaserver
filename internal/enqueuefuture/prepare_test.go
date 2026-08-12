package enqueuefuture

import (
	"testing"

	"seanime/internal/api/anilist"

	"github.com/samber/lo"
)

// The format follows the media type, the way AniList's own payload does: discovery demands both an
// ANIME type and an anime format before it will queue anything, so a node with only one of the two is
// not a realistic stand-in for a real one.
func recEdge(id int, title string, status anilist.MediaStatus, mediaType anilist.MediaType, episodes int) *anilist.AnimeDetailsById_Media_Recommendations_Edges {
	format := anilist.MediaFormatTv
	if mediaType != anilist.MediaTypeAnime {
		format = anilist.MediaFormatManga
	}
	return &anilist.AnimeDetailsById_Media_Recommendations_Edges{
		Node: &anilist.AnimeDetailsById_Media_Recommendations_Edges_Node{
			MediaRecommendation: &anilist.AnimeDetailsById_Media_Recommendations_Edges_Node_MediaRecommendation{
				ID:       id,
				Status:   lo.ToPtr(status),
				Type:     lo.ToPtr(mediaType),
				Format:   lo.ToPtr(format),
				Episodes: lo.ToPtr(episodes),
				Title: &anilist.AnimeDetailsById_Media_Recommendations_Edges_Node_MediaRecommendation_Title{
					UserPreferred: lo.ToPtr(title),
				},
			},
		},
	}
}

func TestRecommendationsFrom(t *testing.T) {
	details := &anilist.AnimeDetailsById_Media{
		Recommendations: &anilist.AnimeDetailsById_Media_Recommendations{
			Edges: []*anilist.AnimeDetailsById_Media_Recommendations_Edges{
				recEdge(1, "Finished Show", anilist.MediaStatusFinished, anilist.MediaTypeAnime, 12),
				recEdge(2, "Upcoming Show", anilist.MediaStatusNotYetReleased, anilist.MediaTypeAnime, 0),
				// A recommendation graph crosses into manga adaptations, which cannot be downloaded
				// as anime and have no business in the queue.
				recEdge(3, "Some Manga", anilist.MediaStatusFinished, anilist.MediaTypeManga, 0),
				nil,
				{Node: nil},
			},
		},
	}

	got := recommendationsFrom(details)

	// Only the finished show survives. Unreleased entries and non-anime are now rejected here, at
	// discovery, rather than being queued and skipped later — see rejectReason.
	if len(got) != 1 {
		t.Fatalf("got %d recommendations, want 1 (manga, unreleased and nils dropped): %+v", len(got), got)
	}
	if got[0].mediaID != 1 || got[0].title != "Finished Show" || got[0].episodes != 12 {
		t.Errorf("recommendation is %+v", got[0])
	}
	if got[0].notYetReleased {
		t.Error("a finished show was flagged as unreleased")
	}
	if got[0].isFamily {
		t.Error("a recommendation is not a family edge")
	}
}

// The entries that were filling the queue: promotional material, and anything AniList lists no
// episodes for.
func TestRecommendationsFromRejectsPromoAndEpisodeless(t *testing.T) {
	details := &anilist.AnimeDetailsById_Media{
		Recommendations: &anilist.AnimeDetailsById_Media_Recommendations{
			Edges: []*anilist.AnimeDetailsById_Media_Recommendations_Edges{
				recEdge(1, "Real Show", anilist.MediaStatusFinished, anilist.MediaTypeAnime, 12),
				recEdge(2, "Real Show PV", anilist.MediaStatusFinished, anilist.MediaTypeAnime, 1),
				recEdge(3, "Real Show CM", anilist.MediaStatusFinished, anilist.MediaTypeAnime, 1),
				recEdge(4, "Something With No Episodes", anilist.MediaStatusFinished, anilist.MediaTypeAnime, 0),
			},
		},
	}

	got := recommendationsFrom(details)
	if len(got) != 1 || got[0].mediaID != 1 {
		ids := make([]int, 0, len(got))
		for _, r := range got {
			ids = append(ids, r.mediaID)
		}
		t.Fatalf("got %v, want just [1]", ids)
	}
}

func TestRecommendationsFromHandlesMissingData(t *testing.T) {
	if got := recommendationsFrom(nil); got != nil {
		t.Errorf("nil details should yield nothing, got %+v", got)
	}
	if got := recommendationsFrom(&anilist.AnimeDetailsById_Media{}); got != nil {
		t.Errorf("details with no recommendations should yield nothing, got %+v", got)
	}
}

func relationEdge(relation anilist.MediaRelation, format anilist.MediaFormat) *anilist.AnimeDetailsById_Media_Relations_Edges {
	return &anilist.AnimeDetailsById_Media_Relations_Edges{
		RelationType: lo.ToPtr(relation),
		Node:         &anilist.BaseAnime{ID: 1, Format: lo.ToPtr(format)},
	}
}

// Episodes is set because relationsFrom now rejects anything AniList lists no episodes for. These
// tests are about which relation *types* belong to a franchise, so the nodes are given an episode
// count to keep that the only thing under test.
func relationEdgeID(id int, relation anilist.MediaRelation, format anilist.MediaFormat) *anilist.AnimeDetailsById_Media_Relations_Edges {
	return &anilist.AnimeDetailsById_Media_Relations_Edges{
		RelationType: lo.ToPtr(relation),
		Node: &anilist.BaseAnime{
			ID:       id,
			Format:   lo.ToPtr(format),
			Type:     lo.ToPtr(anilist.MediaTypeAnime),
			Episodes: lo.ToPtr(12),
		},
	}
}

func TestRelationsFrom(t *testing.T) {
	details := &anilist.AnimeDetailsById_Media{
		Relations: &anilist.AnimeDetailsById_Media_Relations{
			Edges: []*anilist.AnimeDetailsById_Media_Relations_Edges{
				relationEdgeID(10, anilist.MediaRelationSequel, anilist.MediaFormatTv),
				relationEdgeID(11, anilist.MediaRelationPrequel, anilist.MediaFormatTv),
				relationEdgeID(12, anilist.MediaRelationSideStory, anilist.MediaFormatOva),
				// The manga it came from is not something to download as anime.
				relationEdgeID(13, anilist.MediaRelationSource, anilist.MediaFormatManga),
				relationEdgeID(14, anilist.MediaRelationAdaptation, anilist.MediaFormatManga),
				// A shared cast member is a loose tie, but it is still an anime and still worth
				// walking — the relation type is not what decides this.
				relationEdgeID(15, anilist.MediaRelationCharacter, anilist.MediaFormatTv),
				// Familial, but still a novel — nothing to download as anime.
				relationEdgeID(16, anilist.MediaRelationSequel, anilist.MediaFormatNovel),
				nil,
			},
		},
	}

	got := relationsFrom(details)

	ids := make([]int, 0, len(got))
	for _, rel := range got {
		ids = append(ids, rel.mediaID)
	}

	want := []int{10, 11, 12, 15}
	if len(ids) != len(want) {
		t.Fatalf("got %v, want %v", ids, want)
	}
	for i, id := range want {
		if ids[i] != id {
			t.Errorf("position %d: got %d, want %d", i, ids[i], id)
		}
	}

	// Family edges are queued ahead of every recommendation and never cost a franchise slot, so the
	// walker has to be able to tell them apart from one.
	for _, rel := range got {
		if !rel.isFamily {
			t.Errorf("media %d came from a relation edge but is not marked as family", rel.mediaID)
		}
	}
}

// Every relation type is walked now, so the only thing keeping the source manga and the light novel
// under it out of the queue is the media check — and a node that says nothing about what it is has to
// be turned away too, not waved through.
func TestRelationsFromQueuesNothingButAnime(t *testing.T) {
	edge := func(id int, mediaType *anilist.MediaType, format *anilist.MediaFormat) *anilist.AnimeDetailsById_Media_Relations_Edges {
		return &anilist.AnimeDetailsById_Media_Relations_Edges{
			RelationType: lo.ToPtr(anilist.MediaRelationOther),
			Node: &anilist.BaseAnime{
				ID:       id,
				Type:     mediaType,
				Format:   format,
				Episodes: lo.ToPtr(12),
				Status:   lo.ToPtr(anilist.MediaStatusFinished),
			},
		}
	}
	anime := lo.ToPtr(anilist.MediaTypeAnime)
	manga := lo.ToPtr(anilist.MediaTypeManga)

	details := &anilist.AnimeDetailsById_Media{
		Relations: &anilist.AnimeDetailsById_Media_Relations{
			Edges: []*anilist.AnimeDetailsById_Media_Relations_Edges{
				edge(1, anime, lo.ToPtr(anilist.MediaFormatTv)),
				edge(2, manga, lo.ToPtr(anilist.MediaFormatManga)),
				edge(3, manga, lo.ToPtr(anilist.MediaFormatNovel)),
				edge(4, manga, lo.ToPtr(anilist.MediaFormatOneShot)),
				// A manga filed with a TV format, or an anime filed with a manga one: either field
				// disagreeing is enough to leave it out.
				edge(5, manga, lo.ToPtr(anilist.MediaFormatTv)),
				edge(6, anime, lo.ToPtr(anilist.MediaFormatNovel)),
				// Nothing known about it is not the same as known to be an anime.
				edge(7, nil, lo.ToPtr(anilist.MediaFormatTv)),
				edge(8, anime, nil),
				edge(9, nil, nil),
			},
		},
	}

	got := relationsFrom(details)
	if len(got) != 1 || got[0].mediaID != 1 {
		ids := make([]int, 0, len(got))
		for _, r := range got {
			ids = append(ids, r.mediaID)
		}
		t.Fatalf("got %v, want just [1] — only the anime belongs in the queue", ids)
	}
}

// A franchise's relations are where the PVs and CMs live — they hang off the series as specials and
// side stories, which is the path that was queueing most of them.
func TestRelationsFromRejectsPromoEntries(t *testing.T) {
	promoEdge := func(id int, title string) *anilist.AnimeDetailsById_Media_Relations_Edges {
		return &anilist.AnimeDetailsById_Media_Relations_Edges{
			RelationType: lo.ToPtr(anilist.MediaRelationSideStory),
			Node: &anilist.BaseAnime{
				ID:       id,
				Format:   lo.ToPtr(anilist.MediaFormatSpecial),
				Type:     lo.ToPtr(anilist.MediaTypeAnime),
				Episodes: lo.ToPtr(1),
				Title:    &anilist.BaseAnime_Title{UserPreferred: lo.ToPtr(title)},
			},
		}
	}

	details := &anilist.AnimeDetailsById_Media{
		Relations: &anilist.AnimeDetailsById_Media_Relations{
			Edges: []*anilist.AnimeDetailsById_Media_Relations_Edges{
				relationEdgeID(10, anilist.MediaRelationSequel, anilist.MediaFormatTv),
				promoEdge(20, "Show PV"),
				promoEdge(21, "Show CM 3"),
				promoEdge(22, "Show Special Program"),
			},
		},
	}

	got := relationsFrom(details)
	if len(got) != 1 || got[0].mediaID != 10 {
		ids := make([]int, 0, len(got))
		for _, r := range got {
			ids = append(ids, r.mediaID)
		}
		t.Fatalf("got %v, want just [10] — the promotional relations should be rejected", ids)
	}
}

func TestRelationsFromHandlesMissingData(t *testing.T) {
	if got := relationsFrom(nil); got != nil {
		t.Errorf("nil details should yield nothing, got %+v", got)
	}
	if got := relationsFrom(&anilist.AnimeDetailsById_Media{}); got != nil {
		t.Errorf("details with no relations should yield nothing, got %+v", got)
	}
}

func TestTetheredOVA(t *testing.T) {
	tests := []struct {
		name   string
		format anilist.MediaFormat
		edges  []*anilist.AnimeDetailsById_Media_Relations_Edges
		want   bool
	}{
		{
			name:   "OVA hanging off a TV series belongs with that series",
			format: anilist.MediaFormatOva,
			edges:  []*anilist.AnimeDetailsById_Media_Relations_Edges{relationEdge(anilist.MediaRelationParent, anilist.MediaFormatTv)},
			want:   true,
		},
		{
			name:   "OVA that is a side story of an ONA is still tied to it",
			format: anilist.MediaFormatOva,
			edges:  []*anilist.AnimeDetailsById_Media_Relations_Edges{relationEdge(anilist.MediaRelationSideStory, anilist.MediaFormatOna)},
			want:   true,
		},
		{
			name:   "OVA adapted from a manga stands on its own",
			format: anilist.MediaFormatOva,
			edges:  []*anilist.AnimeDetailsById_Media_Relations_Edges{relationEdge(anilist.MediaRelationSource, anilist.MediaFormatManga)},
			want:   false,
		},
		{
			name:   "OVA merely sharing characters with a TV series is not part of it",
			format: anilist.MediaFormatOva,
			edges:  []*anilist.AnimeDetailsById_Media_Relations_Edges{relationEdge(anilist.MediaRelationCharacter, anilist.MediaFormatTv)},
			want:   false,
		},
		{
			name:   "OVA with no relations at all is standalone",
			format: anilist.MediaFormatOva,
			edges:  nil,
			want:   false,
		},
		{
			name:   "a TV series with a parent is not an OVA and is never dropped",
			format: anilist.MediaFormatTv,
			edges:  []*anilist.AnimeDetailsById_Media_Relations_Edges{relationEdge(anilist.MediaRelationParent, anilist.MediaFormatTv)},
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			details := &anilist.AnimeDetailsById_Media{
				Relations: &anilist.AnimeDetailsById_Media_Relations{Edges: tt.edges},
			}
			if got := tetheredOVA(details, lo.ToPtr(tt.format)); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}

	t.Run("a missing format is never treated as an OVA", func(t *testing.T) {
		if tetheredOVA(&anilist.AnimeDetailsById_Media{}, nil) {
			t.Error("an unknown format was dropped as a tethered OVA")
		}
	})
}
