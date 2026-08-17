package enqueuefuture

import (
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
)

// The queue shows what you have already dealt with, greyed out, so that working down a franchise
// reads as a record rather than as a list that silently shrinks. But that only covers anime the walk
// happened to find. Everything you downloaded or matched before any of this existed — or through the
// anime page rather than the queue — is invisible here, which makes the queue a partial record of
// your library and a confusing one: a franchise shows the season it walked to and not the two you
// already own.
//
// The download badges are the cheap way to fix that. Every anime you have downloaded, finished
// downloading or matched already has a row in that table — one read, no walking, no AniList — and
// that set is exactly "anime this queue should be able to show you as done".
//
// They are registered as terminal-looking rows: greyed on arrival, never prepared, never walked. The
// queue is not going to search torrents for something already in your library; it is going to admit
// that it is there.

// RegisterBadgedAnime puts every anime carrying a download badge into the queue, if it is not there
// already. Returns how many rows it added.
//
// Titles and cover art come from the anime collection, which is already in memory — an entry on one
// of your lists describes itself for free. One that is on no list is registered anyway, with the
// media ID standing in for the title, because a row that says "#12345, matched" is still a truer
// record than no row at all.
func (r *Repository) RegisterBadgedAnime() (int, error) {
	if r.database == nil {
		return 0, nil
	}

	// Every source, not just the badge table.
	//
	// The badge table only holds downloads this server watched happen. A download sitting in the
	// unmatched folder from before that, or a series scanned into the library, has no row there — and
	// those were exactly the entries missing from the queue: "downloaded" content the screen could not
	// show because nothing had ever registered it. This is the same derivation the rows themselves use
	// (badge, staged files, library files), so what gets registered and what gets greyed agree.
	states := r.downloadStatesByMediaID()
	if len(states) == 0 {
		return 0, nil
	}

	titles, covers := r.knownTitlesAndCovers()

	added := 0
	for mediaID, state := range states {
		if mediaID <= 0 || state == "" {
			continue
		}
		// Already in the queue: the row is there and the badge is attached to it by ListItems. There
		// is nothing to add and nothing to overwrite.
		if r.database.HasEnqueueFutureItem(mediaID) {
			continue
		}

		inserted, err := r.database.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			MediaID:     mediaID,
			RootMediaID: mediaID,
			// Its own family until a walk says otherwise. A later run that reaches this anime through
			// a franchise folds the two families together — see LinkEnqueueFutureFamilies — so
			// registering it alone now does not strand it outside its franchise later.
			FamilyID: mediaID,
			// Ready, not pending: pending is what the worker picks up to prepare, and there is
			// nothing to prepare here. A torrent search for a series already in your library is work
			// in aid of a row you cannot act on anyway.
			Status:     db.EnqueueFutureStatusReady,
			Title:      titles[mediaID],
			CoverImage: covers[mediaID],
		})
		if err != nil || !inserted {
			continue
		}
		added++
	}

	if added > 0 {
		r.logger.Info().Int("added", added).
			Msg("enqueuefuture: Registered anime you have already downloaded or matched")
	}
	return added, nil
}

// knownTitlesAndCovers reads what the collection already knows, so registering costs no requests.
func (r *Repository) knownTitlesAndCovers() (map[int]string, map[int]string) {
	titles := make(map[int]string)
	covers := make(map[int]string)

	if r.animeCollectionFunc == nil {
		return titles, covers
	}
	collection, err := r.animeCollectionFunc()
	if err != nil || collection == nil || collection.MediaListCollection == nil {
		return titles, covers
	}

	for _, list := range collection.MediaListCollection.Lists {
		if list == nil {
			continue
		}
		for _, entry := range list.Entries {
			if entry == nil || entry.Media == nil {
				continue
			}
			media := entry.Media
			titles[media.ID] = titleOf(media)
			if media.GetCoverImage() != nil {
				if large := media.GetCoverImage().GetLarge(); large != nil {
					covers[media.ID] = *large
				}
			}
		}
	}
	return titles, covers
}

func titleOf(media *anilist.BaseAnime) string {
	if media.GetTitle() == nil {
		return ""
	}
	for _, candidate := range []*string{
		media.GetTitle().GetUserPreferred(),
		media.GetTitle().GetRomaji(),
		media.GetTitle().GetEnglish(),
	} {
		if candidate != nil && *candidate != "" {
			return *candidate
		}
	}
	return ""
}

// RewalkAllFamilies queues every franchise in the queue to be walked again.
//
// Relations — which entry a season hangs off, and how — are recorded as a walk discovers them, so
// anything queued before that was recorded has none, and the queue screen draws those families flat.
// This is the way to fill them in: one root per franchise, appended to the waiting list, walked one
// after another.
//
// It is deliberately expensive and deliberately explicit. Each root is a full AniList walk at the
// background pacing, so a queue of several hundred franchises is days of unattended work — which is
// fine, because it survives restarts and picks up where it left off, but is not something to trigger
// by accident. Returns how many franchises were queued.
func (r *Repository) RewalkAllFamilies() (int, error) {
	if r.database == nil {
		return 0, nil
	}

	items, err := r.database.GetAllEnqueueFutureListItems()
	if err != nil {
		return 0, err
	}

	// One root per franchise: the earliest entry of it, which is where a walk of that story should
	// start. Falls back to whichever member was seen first when nothing carries a date.
	type candidate struct {
		mediaID int
		title   string
		airedAt int
	}
	roots := make(map[int]candidate)
	for _, item := range items {
		if item == nil || item.MediaID <= 0 {
			continue
		}
		key := item.FamilyID
		if key == 0 {
			key = item.MediaID
		}

		current, seen := roots[key]
		switch {
		case !seen:
		case current.airedAt == 0 && item.AiredAt > 0:
		case item.AiredAt > 0 && item.AiredAt < current.airedAt:
		default:
			continue
		}
		roots[key] = candidate{mediaID: item.MediaID, title: item.Title, airedAt: item.AiredAt}
	}

	pending := make([]pendingRoot, 0, len(roots))
	for _, root := range roots {
		pending = append(pending, pendingRoot{
			MediaID:  root.mediaID,
			Title:    root.title,
			QueuedAt: time.Now(),
		})
	}

	added := r.queueRootsBulk(pending)
	if added > 0 {
		r.logger.Info().Int("queued", added).Int("franchises", len(roots)).
			Msg("enqueuefuture: Queued every franchise to be walked again")
		// Nothing may be running, in which case the first of them starts now rather than waiting for
		// a run that will never finish because there isn't one.
		go r.startNextPendingRoot()
	}
	return added, nil
}
