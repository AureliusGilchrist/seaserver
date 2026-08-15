package anilist

import "time"

// A list entry's start and completion dates are a record of when you first watched something, and
// they are worth exactly as much as they are accurate. Everything that advances progress used to
// stamp them the same way — start date on every episode 1, completion date on every completion —
// which is right the first time through and wrong every time after: a rewatch two years later moved
// the start date to the rewatch, and finishing it again moved the end date with it. The dates you
// were keeping quietly became the dates of the most recent rewatch.
//
// So the rule is narrow and the same everywhere: fill a date in when it is empty, and never change
// one that is already there. The first watch is the one that gets recorded; a later one fills a gap
// the first never left behind, and touches nothing else. After that these are somebody's data rather
// than this server's.
//
// A nil FuzzyDateInput means "leave this field as it is" — the mutation sends null, which AniList
// treats as no change, and it is what every progress update that is not a first watch now sends.

// FirstWatchDates decides the startedAt and completedAt to send with a progress update.
//
// entry is the list entry as it stands *before* this update, or nil when nothing is known about it —
// an entry the server has never seen, or a collection that could not be read. Nil is deliberately
// treated as "no dates recorded, not a rewatch", because the alternative is never recording a first
// watch for anything the collection happens not to hold yet.
//
// isCompleted says whether this update finishes the series; the caller has already worked that out
// from the episode count, and reproducing that here would be a second place for it to be wrong.
func FirstWatchDates(entry *AnimeListEntry, isCompleted bool, now time.Time) (startedAt *FuzzyDateInput, completedAt *FuzzyDateInput) {
	// A rewatch fills in what is missing, and still never overwrites what is there.
	//
	// Rewatches used to record nothing at all, on the reasoning that the dates belong to the first
	// time through. True — but an entry with no dates recorded has no first time through to protect,
	// and refusing to write one meant a series you had watched years ago, before any of this existed,
	// stayed blank forever no matter how many times you came back to it. The rule that matters is the
	// other one: an existing date is never touched.
	today := fuzzyDateFor(now)

	if !hasStartedAt(entry) {
		startedAt = today
	}
	if isCompleted && !hasCompletedAt(entry) {
		completedAt = today
	}
	return startedAt, completedAt
}

func fuzzyDateFor(now time.Time) *FuzzyDateInput {
	year, month, day := now.Year(), int(now.Month()), now.Day()
	return &FuzzyDateInput{Year: &year, Month: &month, Day: &day}
}

// hasStartedAt reports whether the entry already carries a start date.
//
// AniList sends a fuzzy date as a present object with null parts rather than as a missing one, so
// "is there an object here" is not the question — a date with no year is no date at all. The year is
// what makes it one; a month and day without it cannot be placed on a calendar.
func hasStartedAt(entry *AnimeListEntry) bool {
	if entry == nil || entry.StartedAt == nil {
		return false
	}
	return entry.StartedAt.Year != nil && *entry.StartedAt.Year > 0
}

// hasCompletedAt reports whether the entry already carries a completion date. See hasStartedAt.
func hasCompletedAt(entry *AnimeListEntry) bool {
	if entry == nil || entry.CompletedAt == nil {
		return false
	}
	return entry.CompletedAt.Year != nil && *entry.CompletedAt.Year > 0
}
