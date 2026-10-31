package anilist

// Watching an episode only moves an entry to Current on its own when that is plainly what happened.
// Planning, Paused and Completed are choices the user made, so the player asks instead, and until it
// has an answer a progress update leaves the status alone.

// KeepsStatusOnProgress reports whether a progress update must not change this status by itself.
func KeepsStatusOnProgress(status *MediaListStatus) bool {
	if status == nil {
		return false
	}
	switch *status {
	case MediaListStatusPlanning, MediaListStatusPaused, MediaListStatusCompleted:
		return true
	}
	return false
}

// ProgressStatus decides what a progress update sends for entry, the list entry before the update,
// or nil when it is not on the list. Keeping a status means sending it back: AniList refuses nulls on
// this mutation's fields.
//
// write is false for a Completed entry: without a yes to the rewatch, sending the episode would wind
// a finished series back to it.
func ProgressStatus(entry *AnimeListEntry, isCompleted bool) (status *MediaListStatus, write bool) {
	if entry != nil && KeepsStatusOnProgress(entry.Status) {
		return entry.Status, *entry.Status != MediaListStatusCompleted
	}
	s := MediaListStatusCurrent
	if isCompleted {
		s = MediaListStatusCompleted
	}
	return &s, true
}
