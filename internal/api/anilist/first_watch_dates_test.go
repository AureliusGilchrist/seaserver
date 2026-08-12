package anilist

import (
	"testing"
	"time"
)

func entryWith(started *int, completed *int, repeat *int) *AnimeListEntry {
	entry := &AnimeListEntry{Repeat: repeat}
	if started != nil {
		entry.StartedAt = &AnimeCollection_MediaListCollection_Lists_Entries_StartedAt{Year: started}
	}
	if completed != nil {
		entry.CompletedAt = &AnimeCollection_MediaListCollection_Lists_Entries_CompletedAt{Year: completed}
	}
	return entry
}

func ptr(v int) *int { return &v }

func TestFirstWatchDates(t *testing.T) {
	now := time.Date(2026, 8, 12, 15, 4, 5, 0, time.UTC)

	tests := []struct {
		name          string
		entry         *AnimeListEntry
		isCompleted   bool
		wantStarted   bool
		wantCompleted bool
	}{
		{
			name:        "a first episode with nothing recorded records the start",
			entry:       entryWith(nil, nil, ptr(0)),
			wantStarted: true,
		},
		{
			// The entry is not in the cached collection. Recording the start is the harmless way to
			// be wrong here: the alternative is never recording one for anything new.
			name:        "an unknown entry is treated as a first watch",
			entry:       nil,
			wantStarted: true,
		},
		{
			name:  "a start date already recorded is left exactly as it was",
			entry: entryWith(ptr(2019), nil, ptr(0)),
		},
		{
			name:          "finishing for the first time records the end date",
			entry:         entryWith(ptr(2026), nil, ptr(0)),
			isCompleted:   true,
			wantCompleted: true,
		},
		{
			name:        "finishing records both when neither was ever recorded",
			entry:       entryWith(nil, nil, nil),
			isCompleted: true,
			// Both, because an entry with no start date recorded has not had one recorded.
			wantStarted:   true,
			wantCompleted: true,
		},
		{
			// The case this rule exists for: a rewatch used to move both dates to the rewatch.
			name:        "a rewatch records nothing",
			entry:       entryWith(ptr(2019), ptr(2019), ptr(1)),
			isCompleted: true,
		},
		{
			name:        "a rewatch with no dates recorded still records nothing",
			entry:       entryWith(nil, nil, ptr(2)),
			isCompleted: true,
		},
		{
			name:        "finishing again is not a completion date",
			entry:       entryWith(ptr(2019), ptr(2020), ptr(0)),
			isCompleted: true,
		},
		{
			// AniList sends a fuzzy date as an object with null parts rather than as a missing one,
			// so a date with no year has to read as no date.
			name:          "a date object with no year is not a date",
			entry:         entryWith(nil, nil, ptr(0)),
			isCompleted:   true,
			wantStarted:   true,
			wantCompleted: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			startedAt, completedAt := FirstWatchDates(tt.entry, tt.isCompleted, now)

			if (startedAt != nil) != tt.wantStarted {
				t.Errorf("startedAt = %v, want set: %v", startedAt, tt.wantStarted)
			}
			if (completedAt != nil) != tt.wantCompleted {
				t.Errorf("completedAt = %v, want set: %v", completedAt, tt.wantCompleted)
			}

			for label, date := range map[string]*FuzzyDateInput{"startedAt": startedAt, "completedAt": completedAt} {
				if date == nil {
					continue
				}
				if date.Year == nil || *date.Year != 2026 || date.Month == nil || *date.Month != 8 || date.Day == nil || *date.Day != 12 {
					t.Errorf("%s is %+v, want 2026-08-12", label, date)
				}
			}
		})
	}
}

// A zero year is what an empty fuzzy date decodes to in some payloads, and it is not a date either.
func TestFirstWatchDatesTreatsZeroYearAsEmpty(t *testing.T) {
	now := time.Now()
	entry := entryWith(ptr(0), ptr(0), ptr(0))

	startedAt, completedAt := FirstWatchDates(entry, true, now)
	if startedAt == nil || completedAt == nil {
		t.Fatalf("a zero year should read as no date; got startedAt=%v completedAt=%v", startedAt, completedAt)
	}
}
