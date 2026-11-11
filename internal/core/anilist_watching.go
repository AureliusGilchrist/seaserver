package core

import (
	"context"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/util"
)

// watchingListRefreshWait is how long the app-level collection refresh waits after a list write.
//
// AniList's collection query lags a mutation by a few seconds: asked for the collection right after
// a status change, it answers with the old one. Refreshing at once would therefore put the
// pre-edit collection back into the cache and back on screen, which is the "it worked, then it
// reverted" that the list editor's own wait exists to avoid.
const watchingListRefreshWait = 3 * time.Second

// CompleteWatching marks the media as completed on the user's AniList list, which takes it out of
// the "currently watching" list. It reports whether anything was changed.
//
// It is what the auto downloader calls once a series is over and entirely in the library: there is
// nothing left to follow, so it leaves the watching list and lands in Completed.
//
// Only an entry that is being watched is moved. A series that is paused, planned, dropped or
// already completed is where the user put it and stays there — this takes a series off the watching
// list, it does not decide what else to do with it.
//
// The write is the status-only mutation, so the user's own score, progress and dates survive it.
// Completed is used rather than removing the entry: removing it would take the user's score and
// progress with it, and a finished series is what Completed is for.
func (m *AnilistClientManager) CompleteWatching(ctx context.Context, mediaID int) (bool, error) {
	defer util.HandlePanicInModuleThen("core/CompleteWatching", func() {})

	if m == nil || m.app == nil || mediaID <= 0 {
		return false, nil
	}

	client, profileID := m.ResolveClientForWrites(0)
	if client == nil || !client.IsAuthenticated() {
		return false, nil
	}

	if !m.isWatching(profileID, mediaID) {
		return false, nil
	}

	status := anilist.MediaListStatusCompleted
	if _, err := client.UpdateMediaListEntryStatus(ctx, &mediaID, &status); err != nil {
		return false, err
	}

	if profileID > 0 {
		// A profile reads from the manager's own copy of its collection, so the change is written
		// into it and that copy is what the next read returns. The refresh behind it picks up
		// whatever AniList works out for itself, and the edit is replayed over it for the next
		// couple of minutes so the stale collection AniList serves in the meantime cannot put the
		// old status back.
		m.ApplyAnimeListEntryUpdate(profileID, mediaID, nil, &status, nil, nil, nil, nil)
		m.RefreshAnimeCollectionInBackground(profileID)
	} else {
		// The owner's own collection belongs to the platform, which has no way to patch it: it is
		// refetched instead, after the wait above.
		time.AfterFunc(watchingListRefreshWait, func() {
			defer util.HandlePanicInModuleThen("core/CompleteWatching/refresh", func() {})
			_, _ = m.app.RefreshAnimeCollection()
		})
	}

	m.logger.Info().Int("mediaId", mediaID).Uint("profileID", profileID).
		Msg("anilist: Series taken out of the watching list")

	return true, nil
}

// isWatching tells if the media is in the "currently watching" list of the account the list writes
// go to.
func (m *AnilistClientManager) isWatching(profileID uint, mediaID int) bool {
	entry, found := m.watchingEntry(profileID, mediaID)
	return found && entry != nil && entry.Status != nil && *entry.Status == anilist.MediaListStatusCurrent
}

// watchingEntry reads the media's list entry from the collection the given account reads from.
func (m *AnilistClientManager) watchingEntry(profileID uint, mediaID int) (*anilist.AnimeListEntry, bool) {
	var (
		ac  *anilist.AnimeCollection
		err error
	)
	if profileID > 0 {
		ac, err = m.GetAnimeCollection(profileID)
	} else {
		ac, err = m.app.GetAnimeCollection(false)
	}
	if err != nil || ac == nil {
		return nil, false
	}
	return ac.GetListEntryFromAnimeId(mediaID)
}
