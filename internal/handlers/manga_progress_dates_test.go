package handlers

import (
	"testing"
	"time"

	"seanime/internal/api/anilist"
)

func TestMangaProgressUpdate(t *testing.T) {
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	year := 2019
	dated := &anilist.MangaListEntry{
		StartedAt: &anilist.MangaCollection_MediaListCollection_Lists_Entries_StartedAt{Year: &year},
	}
	undated := &anilist.MangaListEntry{
		StartedAt: &anilist.MangaCollection_MediaListCollection_Lists_Entries_StartedAt{},
	}

	tests := []struct {
		name          string
		chapter       int
		total         int
		entry         *anilist.MangaListEntry
		listRead      bool
		wantStatus    anilist.MediaListStatus
		wantStarted   bool
		wantCompleted bool
	}{
		{name: "chapter 1 with no date", chapter: 1, total: 50, entry: undated, listRead: true, wantStatus: anilist.MediaListStatusCurrent, wantStarted: true},
		{name: "starting at chapter 5", chapter: 5, total: 50, entry: undated, listRead: true, wantStatus: anilist.MediaListStatusCurrent, wantStarted: true},
		{name: "re-reading chapter 1 keeps the date", chapter: 1, total: 50, entry: dated, listRead: true, wantStatus: anilist.MediaListStatusCurrent},
		{name: "an unknown total never completes", chapter: 900, total: 0, entry: dated, listRead: true, wantStatus: anilist.MediaListStatusCurrent},
		{name: "the last chapter completes", chapter: 50, total: 50, entry: dated, listRead: true, wantStatus: anilist.MediaListStatusCompleted, wantCompleted: true},
		{name: "a cache miss sends no date", chapter: 50, total: 50, listRead: false, wantStatus: anilist.MediaListStatusCompleted},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, startedAt, completedAt := mangaProgressUpdate(tt.chapter, tt.total, tt.entry, tt.listRead, now)

			if status != tt.wantStatus {
				t.Errorf("status = %v, want %v", status, tt.wantStatus)
			}
			if (startedAt != nil) != tt.wantStarted {
				t.Errorf("startedAt = %v, want set: %v", startedAt, tt.wantStarted)
			}
			if (completedAt != nil) != tt.wantCompleted {
				t.Errorf("completedAt = %v, want set: %v", completedAt, tt.wantCompleted)
			}
		})
	}
}
