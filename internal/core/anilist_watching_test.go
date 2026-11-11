package core

import (
	"context"
	"testing"

	"seanime/internal/api/anilist"

	"github.com/stretchr/testify/assert"
)

// Only an entry the user is actually watching is the one taken off the watching list. Everything
// else is where the user put it, and moving it would be this feature deciding something the user
// never asked it to.
func TestIsWatching(t *testing.T) {
	tests := []struct {
		name     string
		lists    []*anilist.AnimeCollection_MediaListCollection_Lists
		mediaID  int
		expected bool
	}{
		{
			name:     "an entry being watched",
			lists:    []*anilist.AnimeCollection_MediaListCollection_Lists{listWith(anilist.MediaListStatusCurrent, 42)},
			mediaID:  42,
			expected: true,
		},
		{
			name:     "a paused entry",
			lists:    []*anilist.AnimeCollection_MediaListCollection_Lists{listWith(anilist.MediaListStatusPaused, 42)},
			mediaID:  42,
			expected: false,
		},
		{
			name:     "a planned entry",
			lists:    []*anilist.AnimeCollection_MediaListCollection_Lists{listWith(anilist.MediaListStatusPlanning, 42)},
			mediaID:  42,
			expected: false,
		},
		{
			name:     "a completed entry",
			lists:    []*anilist.AnimeCollection_MediaListCollection_Lists{listWith(anilist.MediaListStatusCompleted, 42)},
			mediaID:  42,
			expected: false,
		},
		{
			name:     "a dropped entry",
			lists:    []*anilist.AnimeCollection_MediaListCollection_Lists{listWith(anilist.MediaListStatusDropped, 42)},
			mediaID:  42,
			expected: false,
		},
		{
			name:     "a series that is not on the list at all",
			lists:    []*anilist.AnimeCollection_MediaListCollection_Lists{listWith(anilist.MediaListStatusCurrent, 7)},
			mediaID:  42,
			expected: false,
		},
		{
			name:     "an entry with no status",
			lists:    []*anilist.AnimeCollection_MediaListCollection_Lists{listWithNoStatus(42)},
			mediaID:  42,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := managerWithCollection(1, tt.lists...)
			assert.Equal(t, tt.expected, m.isWatching(1, tt.mediaID))
		})
	}
}

// A collection that carries no list collection is an empty one, not a broken one — the simulated
// platform hands one out. Asking whether anything is being watched has to answer no, not crash.
func TestIsWatchingWithAnEmptyCollection(t *testing.T) {
	m := managerWithCollection(1)
	assert.False(t, m.isWatching(1, 42))
}

// With nothing to write with, nothing is written: no account is linked, or there is no app behind
// the manager at all. This is the state a fresh install is in.
func TestCompleteWatchingWithoutAnAccount(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusCurrent, 42))

	changed, err := m.CompleteWatching(context.Background(), 42)

	assert.NoError(t, err)
	assert.False(t, changed)
	// The entry is untouched, still where the user put it.
	assert.True(t, m.isWatching(1, 42))
}

// listWithNoStatus is a list entry AniList returned without a status, which happens on an entry
// that is still being added.
func listWithNoStatus(mediaIDs ...int) *anilist.AnimeCollection_MediaListCollection_Lists {
	entries := make([]*anilist.AnimeCollection_MediaListCollection_Lists_Entries, 0, len(mediaIDs))
	for _, id := range mediaIDs {
		entries = append(entries, &anilist.AnimeCollection_MediaListCollection_Lists_Entries{
			Media: &anilist.BaseAnime{ID: id},
		})
	}
	return &anilist.AnimeCollection_MediaListCollection_Lists{Entries: entries}
}
