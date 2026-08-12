package core

import (
	"testing"
	"time"

	"seanime/internal/api/anilist"

	"github.com/rs/zerolog"
)

// managerWithCollection builds a manager holding one profile's collection, with nothing else wired
// up — the patch under test touches the cache and nothing but the cache.
func managerWithCollection(profileID uint, lists ...*anilist.AnimeCollection_MediaListCollection_Lists) *AnilistClientManager {
	logger := zerolog.Nop()
	m := &AnilistClientManager{
		animeColCache:    make(map[uint]*profileAnimeCache),
		lastAnimeRefresh: make(map[uint]time.Time),
		logger:           &logger,
	}
	m.animeColCache[profileID] = &profileAnimeCache{
		data: &anilist.AnimeCollection{
			MediaListCollection: &anilist.AnimeCollection_MediaListCollection{Lists: lists},
		},
		fetchedAt: time.Now(),
	}
	return m
}

func listWith(status anilist.MediaListStatus, mediaIDs ...int) *anilist.AnimeCollection_MediaListCollection_Lists {
	entries := make([]*anilist.AnimeCollection_MediaListCollection_Lists_Entries, 0, len(mediaIDs))
	for _, id := range mediaIDs {
		s := status
		entries = append(entries, &anilist.AnimeCollection_MediaListCollection_Lists_Entries{
			Media:  &anilist.BaseAnime{ID: id},
			Status: &s,
		})
	}
	s := status
	return &anilist.AnimeCollection_MediaListCollection_Lists{Status: &s, Entries: entries}
}

// locate returns the entry, the status of the list holding it, and how many copies exist.
func locate(m *AnilistClientManager, profileID uint, mediaID int) (*anilist.AnimeCollection_MediaListCollection_Lists_Entries, anilist.MediaListStatus, int) {
	var found *anilist.AnimeCollection_MediaListCollection_Lists_Entries
	var inList anilist.MediaListStatus
	count := 0
	cached := m.animeColCache[profileID]
	if cached == nil || cached.data == nil || cached.data.MediaListCollection == nil {
		return nil, "", 0
	}
	for _, l := range cached.data.MediaListCollection.Lists {
		for _, e := range l.Entries {
			if e != nil && e.Media != nil && e.Media.ID == mediaID {
				found = e
				if l.Status != nil {
					inList = *l.Status
				}
				count++
			}
		}
	}
	return found, inList, count
}

// An edit has to be visible in the cache the moment it returns, because the client refetches the
// entry immediately and reads whatever is there.
func TestApplyAnimeListEntryUpdateWritesTheNewStatus(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusPlanning, 42))

	status := anilist.MediaListStatusCurrent
	if !m.ApplyAnimeListEntryUpdate(1, 42, nil, &status, nil, nil, nil, nil) {
		t.Fatal("the entry was not found in the cache")
	}

	entry, inList, count := locate(m, 1, 42)
	if entry == nil {
		t.Fatal("the entry went missing")
	}
	if count != 1 {
		t.Fatalf("copies of the entry = %d, want 1 — it must move lists, not be duplicated", count)
	}
	if *entry.Status != anilist.MediaListStatusCurrent {
		t.Errorf("entry status = %q, want %q", *entry.Status, anilist.MediaListStatusCurrent)
	}
	if inList != anilist.MediaListStatusCurrent {
		t.Errorf("entry is filed under %q, want %q", inList, anilist.MediaListStatusCurrent)
	}
}

// Moving to a status the user has never used before still has to land somewhere.
func TestApplyAnimeListEntryUpdateCreatesAMissingList(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusPlanning, 42))

	status := anilist.MediaListStatusCompleted
	if !m.ApplyAnimeListEntryUpdate(1, 42, nil, &status, nil, nil, nil, nil) {
		t.Fatal("the entry was not found in the cache")
	}

	_, inList, count := locate(m, 1, 42)
	if count != 1 {
		t.Fatalf("copies = %d, want 1", count)
	}
	if inList != anilist.MediaListStatusCompleted {
		t.Errorf("filed under %q, want %q", inList, anilist.MediaListStatusCompleted)
	}
}

// Score and progress come through too, and a score is stored as AniList reports it.
func TestApplyAnimeListEntryUpdateWritesScoreAndProgress(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusCurrent, 42))

	score := 85
	progress := 7
	if !m.ApplyAnimeListEntryUpdate(1, 42, nil, nil, &score, &progress, nil, nil) {
		t.Fatal("the entry was not found in the cache")
	}

	entry, _, _ := locate(m, 1, 42)
	if entry.Score == nil || *entry.Score != 85 {
		t.Errorf("score = %v, want 85", entry.Score)
	}
	if entry.Progress == nil || *entry.Progress != 7 {
		t.Errorf("progress = %v, want 7", entry.Progress)
	}
}

// An anime that is not on any list yet cannot be patched, and saying so is what tells the caller to
// refresh instead of leaving the user looking at nothing.
func TestApplyAnimeListEntryUpdateReportsAnUnknownAnime(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusPlanning, 42))

	status := anilist.MediaListStatusCurrent
	if m.ApplyAnimeListEntryUpdate(1, 999, nil, &status, nil, nil, nil, nil) {
		t.Fatal("reported success for an anime that is not in the collection")
	}
}

// No cached collection is not an error, just nothing to patch.
func TestApplyAnimeListEntryUpdateWithNoCache(t *testing.T) {
	logger := zerolog.Nop()
	m := &AnilistClientManager{
		animeColCache:    make(map[uint]*profileAnimeCache),
		lastAnimeRefresh: make(map[uint]time.Time),
		logger:           &logger,
	}

	status := anilist.MediaListStatusCurrent
	if m.ApplyAnimeListEntryUpdate(1, 42, nil, &status, nil, nil, nil, nil) {
		t.Fatal("reported success with nothing cached")
	}
}

// Other entries are left exactly where they were.
func TestApplyAnimeListEntryUpdateLeavesOtherEntriesAlone(t *testing.T) {
	m := managerWithCollection(1,
		listWith(anilist.MediaListStatusPlanning, 42, 43),
		listWith(anilist.MediaListStatusCurrent, 50),
	)

	status := anilist.MediaListStatusCurrent
	m.ApplyAnimeListEntryUpdate(1, 42, nil, &status, nil, nil, nil, nil)

	if _, inList, count := locate(m, 1, 43); count != 1 || inList != anilist.MediaListStatusPlanning {
		t.Errorf("43 is in %q with %d copies, want PLANNING with 1", inList, count)
	}
	if _, inList, count := locate(m, 1, 50); count != 1 || inList != anilist.MediaListStatusCurrent {
		t.Errorf("50 is in %q with %d copies, want CURRENT with 1", inList, count)
	}
}

// Adding an anime that is on no list yet has to leave list data behind, because the entry page
// shows its "add to list" button exactly while list data is missing — so an addition that returns
// nothing leaves that button spinning on a change that actually succeeded.
func TestApplyAnimeListEntryUpdateInsertsAFirstTimeAddition(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusCurrent, 50))

	status := anilist.MediaListStatusPlanning
	media := &anilist.BaseAnime{ID: 777}
	if !m.ApplyAnimeListEntryUpdate(1, 777, media, &status, nil, nil, nil, nil) {
		t.Fatal("the addition was not inserted")
	}

	entry, inList, count := locate(m, 1, 777)
	if entry == nil {
		t.Fatal("the new entry is not in the collection")
	}
	if count != 1 {
		t.Fatalf("copies = %d, want 1", count)
	}
	if inList != anilist.MediaListStatusPlanning {
		t.Errorf("filed under %q, want %q", inList, anilist.MediaListStatusPlanning)
	}
	if entry.Media == nil || entry.Media.ID != 777 {
		t.Error("the entry carries no media, so nothing can render it")
	}
}

// Without the media there is nothing to build an entry from, and saying so sends the caller off to
// refresh rather than inserting something unrenderable.
func TestApplyAnimeListEntryUpdateWontInventAnEntry(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusCurrent, 50))

	status := anilist.MediaListStatusPlanning
	if m.ApplyAnimeListEntryUpdate(1, 777, nil, &status, nil, nil, nil, nil) {
		t.Fatal("inserted an entry with no media behind it")
	}
}

// The refresh that follows an edit arrives holding AniList's pre-edit answer, because AniList's
// collection query lags its own mutations. Replaying the edit over it is what stops the change the
// user just made being overwritten by the request that was sent to confirm it.
func TestRecentEditSurvivesAStaleRefresh(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusPlanning, 42))

	status := anilist.MediaListStatusCurrent
	m.ApplyAnimeListEntryUpdate(1, 42, nil, &status, nil, nil, nil, nil)

	// What AniList hands back a second later: the old status, as though nothing had happened.
	stale := &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
			Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
				listWith(anilist.MediaListStatusPlanning, 42),
			},
		},
	}

	m.colMu.Lock()
	m.replayRecentEditsLocked(1, stale)
	m.animeColCache[1] = &profileAnimeCache{data: stale, fetchedAt: time.Now()}
	m.colMu.Unlock()

	entry, inList, count := locate(m, 1, 42)
	if count != 1 {
		t.Fatalf("copies = %d, want 1", count)
	}
	if inList != anilist.MediaListStatusCurrent || entry.Status == nil || *entry.Status != anilist.MediaListStatusCurrent {
		t.Errorf("status reverted to %q — the stale refresh overwrote the edit", inList)
	}
}

// Once AniList agrees, the edit is forgotten — it must not go on overriding a collection that has
// caught up, or a change made later on AniList's own site would be fought over.
func TestRecentEditIsDroppedOnceAniListAgrees(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusPlanning, 42))

	status := anilist.MediaListStatusCurrent
	m.ApplyAnimeListEntryUpdate(1, 42, nil, &status, nil, nil, nil, nil)

	agreed := &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
			Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
				listWith(anilist.MediaListStatusCurrent, 42),
			},
		},
	}

	m.colMu.Lock()
	m.replayRecentEditsLocked(1, agreed)
	remaining := len(m.recentEdits[1])
	m.colMu.Unlock()

	if remaining != 0 {
		t.Errorf("edits still held = %d, want 0 once AniList reports the same value", remaining)
	}
}

// An edit older than its window stops being defended, so nothing is overridden indefinitely.
func TestRecentEditExpires(t *testing.T) {
	m := managerWithCollection(1, listWith(anilist.MediaListStatusPlanning, 42))

	status := anilist.MediaListStatusCurrent
	m.ApplyAnimeListEntryUpdate(1, 42, nil, &status, nil, nil, nil, nil)

	m.colMu.Lock()
	m.recentEdits[1][42].appliedAt = time.Now().Add(-recentEditTTL - time.Minute)
	m.colMu.Unlock()

	stale := &anilist.AnimeCollection{
		MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
			Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{
				listWith(anilist.MediaListStatusPlanning, 42),
			},
		},
	}

	m.colMu.Lock()
	m.replayRecentEditsLocked(1, stale)
	remaining := len(m.recentEdits[1])
	m.colMu.Unlock()

	if remaining != 0 {
		t.Errorf("expired edits still held = %d, want 0", remaining)
	}
	if _, inList, _ := func() (*anilist.AnimeCollection_MediaListCollection_Lists_Entries, anilist.MediaListStatus, int) {
		for _, l := range stale.MediaListCollection.Lists {
			for _, e := range l.Entries {
				if e.Media != nil && e.Media.ID == 42 {
					return e, *l.Status, 1
				}
			}
		}
		return nil, "", 0
	}(); inList != anilist.MediaListStatusPlanning {
		t.Errorf("an expired edit was still applied: entry is in %q", inList)
	}
}
