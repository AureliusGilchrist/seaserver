package core

import (
	"seanime/internal/api/anilist"
	"seanime/internal/platforms/shared_platform"
)

// EnqueueRepeatUpdate queues a rewatch count for a profile until AniList can be reached.
func (m *AnilistClientManager) EnqueueRepeatUpdate(profileID uint, mediaID int, repeat int) {
	mid, rep := mediaID, repeat
	m.getPendingStore(profileID).Enqueue(&shared_platform.PendingMutation{
		Kind:    shared_platform.PendingKindUpdateEntryRepeat,
		MediaID: &mid,
		Repeat:  &rep,
	})
	m.KickPendingFlush(profileID)
}

// QueueListEntryRemoval takes an entry off a profile's stored lists now and queues the removal for
// AniList. It returns false when the entry isn't on a stored list, as its AniList id is needed.
func (m *AnilistClientManager) QueueListEntryRemoval(profileID uint, mediaType string, mediaID int) bool {
	var entryID int
	var found bool

	m.colMu.Lock()
	if mediaType == "manga" {
		if cached, ok := m.mangaColCache[profileID]; ok && cached != nil {
			entryID, found = removeMangaListEntry(cached.data, mediaID)
			if found {
				go m.saveMangaCollectionToDisk(profileID, cached.data)
			}
		}
	} else if cached, ok := m.animeColCache[profileID]; ok && cached != nil {
		entryID, found = removeAnimeListEntry(cached.data, mediaID)
		if found {
			go m.saveAnimeCollectionToDisk(profileID, cached.data)
		}
	}
	m.colMu.Unlock()

	if !found {
		return false
	}
	m.getPendingStore(profileID).Enqueue(&shared_platform.PendingMutation{
		Kind:    shared_platform.PendingKindDeleteEntry,
		EntryID: &entryID,
	})
	m.KickPendingFlush(profileID)
	return true
}

func removeAnimeListEntry(col *anilist.AnimeCollection, mediaID int) (int, bool) {
	if col == nil || col.MediaListCollection == nil {
		return 0, false
	}
	for _, list := range col.MediaListCollection.Lists {
		for i, entry := range list.Entries {
			if entry.GetMedia().GetID() == mediaID {
				list.Entries = append(list.Entries[:i:i], list.Entries[i+1:]...)
				return entry.ID, true
			}
		}
	}
	return 0, false
}

func removeMangaListEntry(col *anilist.MangaCollection, mediaID int) (int, bool) {
	if col == nil || col.MediaListCollection == nil {
		return 0, false
	}
	for _, list := range col.MediaListCollection.Lists {
		for i, entry := range list.Entries {
			if entry.GetMedia().GetID() == mediaID {
				list.Entries = append(list.Entries[:i:i], list.Entries[i+1:]...)
				return entry.ID, true
			}
		}
	}
	return 0, false
}

// withNewestQueuedProgress keeps a queued Save from undoing an episode finished after it. The Save
// holds the progress of the moment it was made, and the two queues are sent separately.
func (m *AnilistClientManager) withNewestQueuedProgress(edit *QueuedListEdit) {
	if edit.Progress == nil {
		return
	}
	for _, item := range m.PendingProgressItems(edit.ProfileID) {
		if item.MediaID == edit.MediaID && item.Progress > *edit.Progress {
			progress := item.Progress
			edit.Progress = &progress
		}
	}
}
