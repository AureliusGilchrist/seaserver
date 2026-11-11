package autodownloader

import (
	"seanime/internal/api/anilist"
	"seanime/internal/library/anime"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHasEveryEpisode(t *testing.T) {
	tests := []struct {
		name     string
		episodes map[int]bool
		total    int
		expected bool
	}{
		{
			name:     "every episode is here",
			episodes: map[int]bool{1: true, 2: true, 3: true},
			total:    3,
			expected: true,
		},
		{
			name:     "an episode is missing",
			episodes: map[int]bool{1: true, 3: true},
			total:    3,
			expected: false,
		},
		{
			name:     "the last episode is missing",
			episodes: map[int]bool{1: true, 2: true},
			total:    3,
			expected: false,
		},
		{
			name:     "nothing is here",
			episodes: nil,
			total:    3,
			expected: false,
		},
		{
			name:     "more episodes than the series has",
			episodes: map[int]bool{1: true, 2: true, 3: true, 4: true},
			total:    3,
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, hasEveryEpisode(tt.episodes, tt.total))
		})
	}
}

func TestIsSeriesComplete(t *testing.T) {
	finished := anilist.MediaStatusFinished
	releasing := anilist.MediaStatusReleasing

	newAd := func() *AutoDownloader {
		return &AutoDownloader{}
	}

	collection := func(status *anilist.MediaStatus, episodes *int) *anilist.AnimeCollection {
		media := &anilist.BaseAnime{ID: 1, Status: status, Episodes: episodes}
		return &anilist.AnimeCollection{
			MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
				Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
					{
						Entries: []*anilist.AnimeCollection_MediaListCollection_Lists_Entries{
							{Media: media},
						},
					},
				},
			},
		}
	}

	twelve := 12

	tests := []struct {
		name     string
		ac       *anilist.AnimeCollection
		episodes map[int]bool
		expected bool
	}{
		{
			name:     "finished and entirely in the library",
			ac:       collection(&finished, &twelve),
			episodes: allEpisodes(12),
			expected: true,
		},
		{
			name:     "finished but an episode is still missing",
			ac:       collection(&finished, &twelve),
			episodes: allEpisodes(11),
			expected: false,
		},
		{
			name:     "still airing, however much is in the library",
			ac:       collection(&releasing, &twelve),
			episodes: allEpisodes(12),
			expected: false,
		},
		{
			name:     "the episode count is unknown",
			ac:       collection(&finished, nil),
			episodes: allEpisodes(12),
			expected: false,
		},
		{
			name:     "the series is not in the collection",
			ac:       &anilist.AnimeCollection{},
			episodes: allEpisodes(12),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, newAd().isSeriesComplete(tt.ac, 1, tt.episodes))
		})
	}
}

func allEpisodes(n int) map[int]bool {
	out := make(map[int]bool, n)
	for i := 1; i <= n; i++ {
		out[i] = true
	}
	return out
}

func TestLibraryEpisodeNumber(t *testing.T) {
	main := anime.LocalFileTypeMain
	special := anime.LocalFileTypeSpecial

	tests := []struct {
		name     string
		lf       *anime.LocalFile
		expected int
	}{
		{
			name: "a main episode",
			lf: &anime.LocalFile{
				Metadata: &anime.LocalFileMetadata{Episode: 5, Type: main},
			},
			expected: 5,
		},
		{
			name: "a special is not a main episode",
			lf: &anime.LocalFile{
				Metadata: &anime.LocalFileMetadata{Episode: 1, Type: special},
			},
			expected: 0,
		},
		{
			name: "an episode whose details were never filled in is read from its name",
			lf: &anime.LocalFile{
				Metadata:   &anime.LocalFileMetadata{},
				ParsedData: &anime.LocalFileParsedData{Episode: "10"},
			},
			expected: 10,
		},
		{
			name: "an unfilled file that names no single episode counts for nothing",
			lf: &anime.LocalFile{
				Metadata:   &anime.LocalFileMetadata{},
				ParsedData: &anime.LocalFileParsedData{Episode: ""},
			},
			expected: 0,
		},
		{
			name: "no metadata at all",
			lf: &anime.LocalFile{
				ParsedData: &anime.LocalFileParsedData{Episode: "3"},
			},
			expected: 3,
		},
		{
			name:     "nothing to read",
			lf:       &anime.LocalFile{},
			expected: 0,
		},
		{
			name:     "a nil file",
			lf:       nil,
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, libraryEpisodeNumber(tt.lf))
		})
	}
}
