package anilist

import (
	"testing"
	"time"
)

func mangaEntryWith(started *int, completed *int) *MangaListEntry {
	entry := &MangaListEntry{
		StartedAt:   &MangaCollection_MediaListCollection_Lists_Entries_StartedAt{Year: started},
		CompletedAt: &MangaCollection_MediaListCollection_Lists_Entries_CompletedAt{Year: completed},
	}
	return entry
}

func TestFirstReadDates(t *testing.T) {
	now := time.Date(2026, 8, 12, 15, 4, 5, 0, time.UTC)

	tests := []struct {
		name          string
		entry         *MangaListEntry
		listRead      bool
		isCompleted   bool
		wantStarted   bool
		wantCompleted bool
	}{
		{
			name:        "no start date gets today",
			entry:       mangaEntryWith(nil, nil),
			listRead:    true,
			wantStarted: true,
		},
		{
			name:     "an existing start date is kept",
			entry:    mangaEntryWith(ptr(2019), nil),
			listRead: true,
		},
		{
			name:        "a manga the list does not hold is a first read",
			listRead:    true,
			wantStarted: true,
		},
		{
			name:        "a zero year is not a date",
			entry:       mangaEntryWith(ptr(0), nil),
			listRead:    true,
			wantStarted: true,
		},
		{
			name:          "finishing fills only the completion date",
			entry:         mangaEntryWith(ptr(2019), nil),
			listRead:      true,
			isCompleted:   true,
			wantCompleted: true,
		},
		{
			name:        "finishing a re-read keeps the completion date",
			entry:       mangaEntryWith(ptr(2019), ptr(2020)),
			listRead:    true,
			isCompleted: true,
		},
		{
			name:        "a list that could not be read sends nothing",
			isCompleted: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			startedAt, completedAt := FirstReadDates(tt.entry, tt.listRead, tt.isCompleted, now)

			if (startedAt != nil) != tt.wantStarted {
				t.Errorf("startedAt = %v, want set: %v", startedAt, tt.wantStarted)
			}
			if (completedAt != nil) != tt.wantCompleted {
				t.Errorf("completedAt = %v, want set: %v", completedAt, tt.wantCompleted)
			}
		})
	}
}

func TestFirstWatchDatesFromListSendsNothingWithoutTheList(t *testing.T) {
	startedAt, completedAt := FirstWatchDatesFromList(nil, false, true, time.Now())
	if startedAt != nil || completedAt != nil {
		t.Errorf("got startedAt=%v completedAt=%v, want neither", startedAt, completedAt)
	}

	// Read, and not holding the media, is a first watch.
	startedAt, completedAt = FirstWatchDatesFromList(nil, true, true, time.Now())
	if startedAt == nil || completedAt == nil {
		t.Errorf("got startedAt=%v completedAt=%v, want both", startedAt, completedAt)
	}
}
