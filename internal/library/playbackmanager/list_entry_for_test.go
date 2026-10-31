package playbackmanager

import (
	"testing"

	"seanime/internal/api/anilist"

	"github.com/samber/mo"
)

func TestListEntryForTellsAMissingListFromAMissingEntry(t *testing.T) {
	empty := &anilist.AnimeCollection{MediaListCollection: &anilist.AnimeCollection_MediaListCollection{}}

	tests := []struct {
		name         string
		pm           *PlaybackManager
		profileID    uint
		wantListRead bool
	}{
		{
			name: "no shared collection",
			pm:   &PlaybackManager{animeCollection: mo.None[*anilist.AnimeCollection]()},
		},
		{
			name:         "a shared collection without the anime",
			pm:           &PlaybackManager{animeCollection: mo.Some(empty)},
			wantListRead: true,
		},
		{
			name: "an unreadable profile collection is not answered from the shared one",
			pm: &PlaybackManager{
				animeCollection:               mo.Some(empty),
				getProfileAnimeCollectionFunc: func(uint) *anilist.AnimeCollection { return nil },
			},
			profileID: 2,
		},
		{
			name: "a profile collection without the anime",
			pm: &PlaybackManager{
				getProfileAnimeCollectionFunc: func(uint) *anilist.AnimeCollection { return empty },
			},
			profileID:    2,
			wantListRead: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entry, listRead := tt.pm.listEntryFor(1, tt.profileID)
			if entry != nil {
				t.Errorf("entry = %v, want nil", entry)
			}
			if listRead != tt.wantListRead {
				t.Errorf("listRead = %v, want %v", listRead, tt.wantListRead)
			}
		})
	}
}
