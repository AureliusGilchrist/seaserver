package core

import (
	"time"

	"seanime/internal/api/anilist"
)

// Editing a manga list entry used to throw the cached collection away and refresh it in the
// background. The client refetches the entry the instant the edit returns, so what it got back was
// whatever the refresh had not yet replaced — the pre-edit collection, or nothing at all. Pressing
// "+" on a manga therefore added it to your planning list on AniList, correctly, and then showed
// you a card with no status and 0 chapters read, as though nothing had happened. Changing the
// status afterwards had the same problem in reverse: the edit went through and the screen kept
// showing the old one.
//
// The anime side solved this a while ago and manga was simply never given the same treatment. This
// is that treatment: the edit is written into the cached collection immediately, and remembered for
// a couple of minutes so the refresh behind it cannot put the old values back.
//
// Patching is safe here for the same reason it is safe for anime — an edit is one of the few things
// this server knows exactly. The user said what the new values are and AniList accepted them, so
// there is nothing to infer.

// mangaListEdit is one edit the user made here, kept just long enough to defend it.
type mangaListEdit struct {
	mediaID     int
	media       *anilist.BaseManga
	status      *anilist.MediaListStatus
	score       *int
	progress    *int
	startedAt   *anilist.FuzzyDateInput
	completedAt *anilist.FuzzyDateInput
	appliedAt   time.Time
}

// ApplyMangaListEntryUpdate writes an edit the user has just made into the cached collection, and
// reports whether it found or created an entry to write it into.
//
// A manga not on any list yet — the "+" button's whole job — is inserted rather than skipped,
// provided the caller supplies the media to insert. Pass a nil media to patch only, and read the
// return value to find out whether anything happened.
func (m *AnilistClientManager) ApplyMangaListEntryUpdate(
	profileID uint,
	mediaID int,
	media *anilist.BaseManga,
	status *anilist.MediaListStatus,
	scoreRaw *int,
	progress *int,
	startedAt *anilist.FuzzyDateInput,
	completedAt *anilist.FuzzyDateInput,
) bool {
	if mediaID <= 0 {
		return false
	}

	edit := &mangaListEdit{
		mediaID:     mediaID,
		media:       media,
		status:      status,
		score:       scoreRaw,
		progress:    progress,
		startedAt:   startedAt,
		completedAt: completedAt,
		appliedAt:   time.Now(),
	}

	m.colMu.Lock()
	m.rememberMangaEditLocked(profileID, edit)

	cached, ok := m.mangaColCache[profileID]
	if !ok || cached == nil || cached.data == nil {
		m.colMu.Unlock()
		// Nothing cached to patch. The edit is still remembered, so the next collection fetched —
		// including the one the client is about to trigger — has it replayed over it.
		return false
	}

	applied := applyMangaEditToCollection(cached.data, edit)
	col := cached.data
	m.colMu.Unlock()

	// Written through, so the change survives the in-memory copy being evicted or the server being
	// restarted.
	if applied {
		m.saveMangaCollectionToDisk(profileID, col)
	}
	return applied
}

// ReplayRecentMangaEdits returns the collection with any edit made in the last couple of minutes
// put back on top of it.
//
// AniList answers a collection query with pre-edit data for a few seconds after accepting a
// mutation, so a collection read just after an edit holds exactly the values that edit changed.
// Without this the screen shows the old status back — an edit that appears to work, holds for a
// second and then reverts.
//
// The collection handed in is never modified. It is usually the shared cached copy that other
// requests are reading at the same time, and quietly rewriting that from inside a read is both a
// data race and a way for one profile's edit to leak into another's view. When there is nothing to
// replay — the overwhelmingly common case — the same collection is handed straight back and nothing
// is copied at all.
//
// An edit is dropped as soon as the collection agrees with it, and otherwise once it is older than
// recentEditTTL, so this never masks a change made on AniList's own site.
func (m *AnilistClientManager) ReplayRecentMangaEdits(profileID uint, col *anilist.MangaCollection) *anilist.MangaCollection {
	if m == nil || col == nil {
		return col
	}

	m.colMu.Lock()
	defer m.colMu.Unlock()

	if len(m.recentMangaEdits[profileID]) == 0 {
		return col
	}

	clone := cloneMangaCollection(col)
	m.replayRecentMangaEditsLocked(profileID, clone)
	return clone
}

// cloneMangaCollection copies enough of a collection that edits can be applied to it without
// touching the original.
//
// The lists and their entry slices are rebuilt, and each entry struct is copied, because that is
// everything an edit writes to. The media each entry points at is shared: it is reference data
// about the manga and nothing here ever writes to it.
func cloneMangaCollection(col *anilist.MangaCollection) *anilist.MangaCollection {
	if col == nil || col.MediaListCollection == nil {
		return col
	}

	lists := make([]*anilist.MangaCollection_MediaListCollection_Lists, 0, len(col.MediaListCollection.Lists))
	for _, list := range col.MediaListCollection.Lists {
		if list == nil {
			lists = append(lists, nil)
			continue
		}
		entries := make([]*anilist.MangaCollection_MediaListCollection_Lists_Entries, 0, len(list.Entries))
		for _, entry := range list.Entries {
			if entry == nil {
				continue
			}
			copied := *entry
			entries = append(entries, &copied)
		}
		copiedList := *list
		copiedList.Entries = entries
		lists = append(lists, &copiedList)
	}

	copiedCollection := *col.MediaListCollection
	copiedCollection.Lists = lists

	return &anilist.MangaCollection{MediaListCollection: &copiedCollection}
}

// rememberMangaEditLocked files an edit for replay. Callers hold colMu.
func (m *AnilistClientManager) rememberMangaEditLocked(profileID uint, edit *mangaListEdit) {
	if m.recentMangaEdits == nil {
		m.recentMangaEdits = make(map[uint]map[int]*mangaListEdit)
	}
	if m.recentMangaEdits[profileID] == nil {
		m.recentMangaEdits[profileID] = make(map[int]*mangaListEdit)
	}
	m.recentMangaEdits[profileID][edit.mediaID] = edit
}

// replayRecentMangaEditsLocked is ReplayRecentMangaEdits with the lock already held.
func (m *AnilistClientManager) replayRecentMangaEditsLocked(profileID uint, col *anilist.MangaCollection) {
	edits := m.recentMangaEdits[profileID]
	if len(edits) == 0 || col == nil {
		return
	}

	for mediaID, edit := range edits {
		if time.Since(edit.appliedAt) > recentEditTTL || mangaCollectionAgreesWith(col, edit) {
			delete(edits, mediaID)
			continue
		}
		applyMangaEditToCollection(col, edit)
	}

	if len(edits) == 0 {
		delete(m.recentMangaEdits, profileID)
	}
}

// mangaCollectionAgreesWith reports whether a collection already says what an edit said, for every
// field the edit specified.
func mangaCollectionAgreesWith(col *anilist.MangaCollection, edit *mangaListEdit) bool {
	if col.MediaListCollection == nil {
		return false
	}
	for _, list := range col.MediaListCollection.Lists {
		if list == nil {
			continue
		}
		for _, e := range list.Entries {
			if e == nil || e.Media == nil || e.Media.ID != edit.mediaID {
				continue
			}
			if edit.status != nil && (e.Status == nil || *e.Status != *edit.status) {
				return false
			}
			if edit.progress != nil && (e.Progress == nil || *e.Progress != *edit.progress) {
				return false
			}
			if edit.score != nil && (e.Score == nil || int(*e.Score) != *edit.score) {
				return false
			}
			return true
		}
	}
	return false
}

// applyMangaEditToCollection writes one edit into a collection, moving the entry to the list its new
// status belongs under and creating that list if the user has never had anything in it.
func applyMangaEditToCollection(col *anilist.MangaCollection, edit *mangaListEdit) bool {
	if col == nil || col.MediaListCollection == nil {
		return false
	}

	lists := col.MediaListCollection.Lists

	// Find the entry wherever it currently sits and lift it out. An entry whose status has changed
	// belongs under a different heading, and leaving a copy behind is how one manga comes to appear
	// in two lists at once.
	var entry *anilist.MangaCollection_MediaListCollection_Lists_Entries
	for _, list := range lists {
		if list == nil {
			continue
		}
		for i, e := range list.Entries {
			if e == nil || e.Media == nil || e.Media.ID != edit.mediaID {
				continue
			}
			entry = e
			list.Entries = append(list.Entries[:i], list.Entries[i+1:]...)
			break
		}
		if entry != nil {
			break
		}
	}

	// Not on any list yet: build the entry from what the caller has, so the addition is visible on
	// the very next read instead of waiting on AniList to agree. This is the "+" button's case.
	if entry == nil {
		if edit.media == nil {
			return false
		}
		entry = &anilist.MangaCollection_MediaListCollection_Lists_Entries{Media: edit.media}
	}

	if edit.status != nil {
		entry.Status = edit.status
	}
	if edit.progress != nil {
		entry.Progress = edit.progress
	}
	if edit.score != nil {
		score := float64(*edit.score)
		entry.Score = &score
	}
	if edit.startedAt != nil {
		entry.StartedAt = &anilist.MangaCollection_MediaListCollection_Lists_Entries_StartedAt{
			Year: edit.startedAt.Year, Month: edit.startedAt.Month, Day: edit.startedAt.Day,
		}
	}
	if edit.completedAt != nil {
		entry.CompletedAt = &anilist.MangaCollection_MediaListCollection_Lists_Entries_CompletedAt{
			Year: edit.completedAt.Year, Month: edit.completedAt.Month, Day: edit.completedAt.Day,
		}
	}

	// The collection is read for progress as well as status, and an entry with no progress at all
	// reads as "nothing recorded" rather than as zero — which is what shows a freshly added manga as
	// a blank card. Zero is the honest answer for something just added.
	if entry.Progress == nil {
		zero := 0
		entry.Progress = &zero
	}
	if entry.Score == nil {
		zero := 0.0
		entry.Score = &zero
	}

	// Put it back under the heading it now belongs to.
	target := entry.Status
	if target == nil {
		target = edit.status
	}
	if target == nil {
		// Nothing says where it goes. Put it back rather than lose it; the next fetch sorts it out.
		if len(lists) > 0 && lists[0] != nil {
			lists[0].Entries = append(lists[0].Entries, entry)
			return true
		}
		return false
	}

	for _, list := range lists {
		if list != nil && list.Status != nil && *list.Status == *target {
			list.Entries = append(list.Entries, entry)
			return true
		}
	}

	name := string(*target)
	col.MediaListCollection.Lists = append(lists, &anilist.MangaCollection_MediaListCollection_Lists{
		Status:  target,
		Name:    &name,
		Entries: []*anilist.MangaCollection_MediaListCollection_Lists_Entries{entry},
	})
	return true
}
