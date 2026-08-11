package core

import (
	"testing"
	"time"

	"seanime/internal/api/anilist"
)

func entry(id int, listStatus anilist.MediaListStatus, mediaStatus anilist.MediaStatus, nextAiring bool) *anilist.AnimeListEntry {
	media := &anilist.BaseAnime{ID: id, Status: &mediaStatus}
	if nextAiring {
		media.NextAiringEpisode = &anilist.BaseAnime_NextAiringEpisode{Episode: 5, TimeUntilAiring: 3600}
	}
	return &anilist.AnimeListEntry{Media: media, Status: &listStatus}
}

// The countdown on something you are watching has to be right at the moment it reaches zero.
func TestWatchingAndAiringIsCheckedHourly(t *testing.T) {
	tier := tierForEntry(entry(1, anilist.MediaListStatusCurrent, anilist.MediaStatusReleasing, true))
	if tier != TierAiring {
		t.Errorf("tier = %q, want %q", tier, TierAiring)
	}
	if got := tier.Interval(); got != time.Hour {
		t.Errorf("interval = %v, want 1h", got)
	}
}

// Rewatching is watching.
func TestRepeatingIsTreatedAsWatching(t *testing.T) {
	if tier := tierForEntry(entry(2, anilist.MediaListStatusRepeating, anilist.MediaStatusReleasing, true)); tier != TierAiring {
		t.Errorf("tier = %q, want %q", tier, TierAiring)
	}
}

// Not out yet: the start date moves, and that is the thing worth re-reading.
func TestUnairedIsCheckedEverySixHours(t *testing.T) {
	tier := tierForEntry(entry(3, anilist.MediaListStatusPlanning, anilist.MediaStatusNotYetReleased, false))
	if tier != TierUnaired {
		t.Errorf("tier = %q, want %q", tier, TierUnaired)
	}
	if got := tier.Interval(); got != 6*time.Hour {
		t.Errorf("interval = %v, want 6h", got)
	}
}

// Unaired is unaired wherever it is listed — the date moves regardless of which list it sits on.
func TestUnairedOutsidePlanningStillCountsAsUnaired(t *testing.T) {
	if tier := tierForEntry(entry(4, anilist.MediaListStatusCurrent, anilist.MediaStatusNotYetReleased, false)); tier != TierUnaired {
		t.Errorf("tier = %q, want %q", tier, TierUnaired)
	}
}

// Everything settled falls to the weekly pass — this is the bulk of a library, and the whole
// reason the other two can afford to be frequent.
func TestSettledEntriesAreWeekly(t *testing.T) {
	cases := []*anilist.AnimeListEntry{
		entry(5, anilist.MediaListStatusCompleted, anilist.MediaStatusFinished, false),
		entry(6, anilist.MediaListStatusDropped, anilist.MediaStatusFinished, false),
		entry(7, anilist.MediaListStatusPlanning, anilist.MediaStatusFinished, false),
		// On the Watching list but finished airing: no next episode to be on time for.
		entry(8, anilist.MediaListStatusCurrent, anilist.MediaStatusFinished, false),
	}
	for _, c := range cases {
		if tier := tierForEntry(c); tier != TierSettled {
			t.Errorf("media %d: tier = %q, want %q", c.GetMedia().GetID(), tier, TierSettled)
		}
	}
	if got := TierSettled.Interval(); got != 7*24*time.Hour {
		t.Errorf("interval = %v, want 7 days", got)
	}
}

// Planned but already airing sits between the two: nobody is watching a countdown, but this is the
// list things leave when they start.
func TestPlanningAndAiringIsCheckedOften(t *testing.T) {
	if tier := tierForEntry(entry(9, anilist.MediaListStatusPlanning, anilist.MediaStatusReleasing, false)); tier != TierUnaired {
		t.Errorf("tier = %q, want %q", tier, TierUnaired)
	}
}

func TestGroupingSplitsACollectionBySchedule(t *testing.T) {
	collection := &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
			Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
				{Entries: []*anilist.AnimeListEntry{
					entry(1, anilist.MediaListStatusCurrent, anilist.MediaStatusReleasing, true),
					entry(2, anilist.MediaListStatusPlanning, anilist.MediaStatusNotYetReleased, false),
					entry(3, anilist.MediaListStatusCompleted, anilist.MediaStatusFinished, false),
				}},
			},
		},
	}

	byTier := mediaIDsByTier(collection)
	if len(byTier[TierAiring]) != 1 || byTier[TierAiring][0] != 1 {
		t.Errorf("airing = %v, want [1]", byTier[TierAiring])
	}
	if len(byTier[TierUnaired]) != 1 || byTier[TierUnaired][0] != 2 {
		t.Errorf("unaired = %v, want [2]", byTier[TierUnaired])
	}
	if len(byTier[TierSettled]) != 1 || byTier[TierSettled][0] != 3 {
		t.Errorf("settled = %v, want [3]", byTier[TierSettled])
	}
}

// An entry on two lists is checked on the more frequent of the two schedules: checking too often
// costs traffic, checking too rarely is a countdown that is wrong when it matters.
func TestDuplicateEntriesTakeTheMoreFrequentSchedule(t *testing.T) {
	collection := &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
			Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
				{Entries: []*anilist.AnimeListEntry{entry(42, anilist.MediaListStatusCompleted, anilist.MediaStatusFinished, false)}},
				{Entries: []*anilist.AnimeListEntry{entry(42, anilist.MediaListStatusCurrent, anilist.MediaStatusReleasing, true)}},
			},
		},
	}

	byTier := mediaIDsByTier(collection)
	if len(byTier[TierAiring]) != 1 || byTier[TierAiring][0] != 42 {
		t.Errorf("airing = %v, want [42]", byTier[TierAiring])
	}
	for _, id := range byTier[TierSettled] {
		if id == 42 {
			t.Error("42 was left on the weekly schedule as well as the hourly one")
		}
	}
}

func TestNilsAreSurvivable(t *testing.T) {
	if tier := tierForEntry(nil); tier != TierSettled {
		t.Errorf("nil entry: tier = %q", tier)
	}
	if got := mediaIDsByTier(nil); len(got[TierAiring]) != 0 {
		t.Error("a nil collection produced work to do")
	}
}

func airingEntry(id int, secondsUntilAiring int) *anilist.AnimeListEntry {
	e := entry(id, anilist.MediaListStatusCurrent, anilist.MediaStatusReleasing, false)
	e.Media.NextAiringEpisode = &anilist.BaseAnime_NextAiringEpisode{
		Episode:         3,
		TimeUntilAiring: secondsUntilAiring,
	}
	return e
}

func collectionOf(entries ...*anilist.AnimeListEntry) *anilist.AnimeCollection {
	return &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
			Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{{Entries: entries}},
		},
	}
}

// A countdown running down from days away needs no network at all — the airing time is cached and
// the clock is local. Re-reading it hourly is what was spending the rate budget.
func TestNoRefreshWhileEverythingIsStillDaysAway(t *testing.T) {
	col := collectionOf(airingEntry(1, int((6 * 24 * time.Hour).Seconds())))
	if anEpisodeWasDueSince(col, time.Now().Add(-time.Hour)) {
		t.Error("asked for a refresh for an episode six days out")
	}
}

// The moment it reaches zero is exactly what has to be noticed.
func TestRefreshOnceAnEpisodeWasDue(t *testing.T) {
	// Fetched two hours ago, with one hour left on the clock at that point.
	col := collectionOf(airingEntry(1, int(time.Hour.Seconds())))
	if !anEpisodeWasDueSince(col, time.Now().Add(-2*time.Hour)) {
		t.Error("missed an episode that aired since the data was fetched")
	}
}

func TestUnknownAgeForcesARefresh(t *testing.T) {
	col := collectionOf(airingEntry(1, int((6 * 24 * time.Hour).Seconds())))
	if !anEpisodeWasDueSince(col, time.Time{}) {
		t.Error("trusted countdowns whose age is unknown")
	}
}

func TestNothingAiringNeedsNoRefresh(t *testing.T) {
	col := collectionOf(entry(9, anilist.MediaListStatusCompleted, anilist.MediaStatusFinished, false))
	if anEpisodeWasDueSince(col, time.Now().Add(-time.Hour)) {
		t.Error("asked for a refresh with nothing airing")
	}
}
