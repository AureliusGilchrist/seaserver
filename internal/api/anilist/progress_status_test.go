package anilist

import "testing"

func TestProgressStatus(t *testing.T) {
	entry := func(s MediaListStatus) *AnimeListEntry { return &AnimeListEntry{Status: &s} }

	tests := []struct {
		name        string
		entry       *AnimeListEntry
		isCompleted bool
		want        *MediaListStatus
		write       bool
	}{
		{"not on the list", nil, false, ptrStatus(MediaListStatusCurrent), true},
		{"watching", entry(MediaListStatusCurrent), false, ptrStatus(MediaListStatusCurrent), true},
		{"last episode", entry(MediaListStatusCurrent), true, ptrStatus(MediaListStatusCompleted), true},
		{"planning stays", entry(MediaListStatusPlanning), false, ptrStatus(MediaListStatusPlanning), true},
		{"paused stays on the last episode", entry(MediaListStatusPaused), true, ptrStatus(MediaListStatusPaused), true},
		{"completed is not wound back", entry(MediaListStatusCompleted), false, ptrStatus(MediaListStatusCompleted), false},
		{"dropped behaves as before", entry(MediaListStatusDropped), false, ptrStatus(MediaListStatusCurrent), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, write := ProgressStatus(tt.entry, tt.isCompleted)
			if write != tt.write {
				t.Fatalf("write = %v, want %v", write, tt.write)
			}
			if (got == nil) != (tt.want == nil) || (got != nil && *got != *tt.want) {
				t.Fatalf("status = %v, want %v", got, tt.want)
			}
		})
	}
}

func ptrStatus(s MediaListStatus) *MediaListStatus { return &s }
