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
// treats as no change, and it is what every update sends for a date that is already recorded.
//
// The same rule covers manga: reading a chapter is to a manga entry what watching an episode is to an
// anime entry, and which chapter it was decides nothing.
//
// One thing is not known to be empty: a date on a list that could not be read. "Not in the list" and
// "the list was not available" are different answers. The first means nothing is recorded, so today
// is right. The second says nothing about the entry, and today could replace a real date, so nothing
// is sent; the next update, with the list back, fills the date in. FirstWatchDatesFromList and
// FirstReadDates take that distinction as listRead.

// FirstWatchDates decides the startedAt and completedAt to send with a progress update.
//
// entry is the list entry as it stands *before* this update, or nil when the list was read and does
// not hold it. Nil is deliberately treated as "no dates recorded, not a rewatch", because the
// alternative is never recording a first watch for anything new. A caller that could not read the
// list at all wants FirstWatchDatesFromList.
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
	hasStartedAt, hasCompletedAt := RecordedAnimeDates(entry)
	return FillEmptyDates(hasStartedAt, hasCompletedAt, isCompleted, now)
}

// FirstWatchDatesFromList is FirstWatchDates for a caller whose list may not have been readable.
// listRead false sends no dates at all.
func FirstWatchDatesFromList(entry *AnimeListEntry, listRead bool, isCompleted bool, now time.Time) (startedAt *FuzzyDateInput, completedAt *FuzzyDateInput) {
	if !listRead {
		return nil, nil
	}
	return FirstWatchDates(entry, isCompleted, now)
}

// FirstReadDates is FirstWatchDatesFromList for a manga entry: nil entry means the list does not hold
// it, and listRead false sends no dates at all.
func FirstReadDates(entry *MangaListEntry, listRead bool, isCompleted bool, now time.Time) (startedAt *FuzzyDateInput, completedAt *FuzzyDateInput) {
	if !listRead {
		return nil, nil
	}
	hasStartedAt, hasCompletedAt := RecordedMangaDates(entry)
	return FillEmptyDates(hasStartedAt, hasCompletedAt, isCompleted, now)
}

// FillEmptyDates is the rule itself, for a caller that already knows which dates are recorded.
func FillEmptyDates(hasStartedAt bool, hasCompletedAt bool, isCompleted bool, now time.Time) (startedAt *FuzzyDateInput, completedAt *FuzzyDateInput) {
	today := fuzzyDateFor(now)

	if !hasStartedAt {
		startedAt = today
	}
	if isCompleted && !hasCompletedAt {
		completedAt = today
	}
	return startedAt, completedAt
}

func fuzzyDateFor(now time.Time) *FuzzyDateInput {
	year, month, day := now.Year(), int(now.Month()), now.Day()
	return &FuzzyDateInput{Year: &year, Month: &month, Day: &day}
}

// RecordedAnimeDates reports whether the entry already carries a start date and a completion date.
func RecordedAnimeDates(entry *AnimeListEntry) (hasStartedAt bool, hasCompletedAt bool) {
	if entry == nil {
		return false, false
	}
	if entry.StartedAt != nil {
		hasStartedAt = isRecordedYear(entry.StartedAt.Year)
	}
	if entry.CompletedAt != nil {
		hasCompletedAt = isRecordedYear(entry.CompletedAt.Year)
	}
	return hasStartedAt, hasCompletedAt
}

// RecordedMangaDates is RecordedAnimeDates for a manga entry.
func RecordedMangaDates(entry *MangaListEntry) (hasStartedAt bool, hasCompletedAt bool) {
	if entry == nil {
		return false, false
	}
	if entry.StartedAt != nil {
		hasStartedAt = isRecordedYear(entry.StartedAt.Year)
	}
	if entry.CompletedAt != nil {
		hasCompletedAt = isRecordedYear(entry.CompletedAt.Year)
	}
	return hasStartedAt, hasCompletedAt
}

// isRecordedYear decides whether a fuzzy date is a date.
//
// AniList sends a fuzzy date as a present object with null parts rather than as a missing one, so
// "is there an object here" is not the question — a date with no year is no date at all. The year is
// what makes it one; a month and day without it cannot be placed on a calendar.
func isRecordedYear(year *int) bool {
	return year != nil && *year > 0
}
