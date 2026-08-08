package enqueuefuture

import (
	"testing"

	"seanime/internal/api/anilist"

	"github.com/samber/lo"
)

func recEdge(id int, title string, status anilist.MediaStatus, mediaType anilist.MediaType, episodes int) *anilist.AnimeDetailsById_Media_Recommendations_Edges {
	return &anilist.AnimeDetailsById_Media_Recommendations_Edges{
		Node: &anilist.AnimeDetailsById_Media_Recommendations_Edges_Node{
			MediaRecommendation: &anilist.AnimeDetailsById_Media_Recommendations_Edges_Node_MediaRecommendation{
				ID:       id,
				Status:   lo.ToPtr(status),
				Type:     lo.ToPtr(mediaType),
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

	if len(got) != 2 {
		t.Fatalf("got %d recommendations, want 2 (manga and nils dropped): %+v", len(got), got)
	}
	if got[0].mediaID != 1 || got[0].title != "Finished Show" || got[0].episodes != 12 {
		t.Errorf("first recommendation is %+v", got[0])
	}
	if got[0].notYetReleased {
		t.Error("a finished show was flagged as unreleased")
	}
	if !got[1].notYetReleased {
		t.Error("an unreleased show was not flagged, so it would be queued with nothing to download")
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

func relationEdgeID(id int, relation anilist.MediaRelation, format anilist.MediaFormat) *anilist.AnimeDetailsById_Media_Relations_Edges {
	return &anilist.AnimeDetailsById_Media_Relations_Edges{
		RelationType: lo.ToPtr(relation),
		Node: &anilist.BaseAnime{
			ID:     id,
			Format: lo.ToPtr(format),
			Type:   lo.ToPtr(anilist.MediaTypeAnime),
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
				// The manga it came from is not a season of it.
				relationEdgeID(13, anilist.MediaRelationSource, anilist.MediaFormatManga),
				relationEdgeID(14, anilist.MediaRelationAdaptation, anilist.MediaFormatManga),
				// A shared cast member is not a continuation.
				relationEdgeID(15, anilist.MediaRelationCharacter, anilist.MediaFormatTv),
				// Familial, but still a manga — nothing to download as anime.
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

	want := []int{10, 11, 12}
	if len(ids) != len(want) {
		t.Fatalf("got %v, want %v", ids, want)
	}
	for i, id := range want {
		if ids[i] != id {
			t.Errorf("position %d: got %d, want %d", i, ids[i], id)
		}
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
