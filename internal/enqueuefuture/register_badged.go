package enqueuefuture

import (
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

	states, err := r.database.AnimeDownloadStates()
	if err != nil {
		return 0, err
	}
	if len(states) == 0 {
		return 0, nil
	}

	titles, covers := r.knownTitlesAndCovers()

	added := 0
	for _, state := range states {
		if state.MediaID <= 0 || state.State == "" {
			continue
		}
		// Already in the queue: the row is there and the badge is attached to it by ListItems. There
		// is nothing to add and nothing to overwrite.
		if r.database.HasEnqueueFutureItem(state.MediaID) {
			continue
		}

		title := titles[state.MediaID]
		if title == "" {
			title = ""
		}

		inserted, err := r.database.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			MediaID:     state.MediaID,
			RootMediaID: state.MediaID,
			// Its own family until a walk says otherwise. A later run that reaches this anime through
			// a franchise folds the two families together — see LinkEnqueueFutureFamilies — so
			// registering it alone now does not strand it outside its franchise later.
			FamilyID: state.MediaID,
			// Ready, not pending: pending is what the worker picks up to prepare, and there is
			// nothing to prepare here. A torrent search for a series already in your library is work
			// in aid of a row you cannot act on anyway.
			Status:     db.EnqueueFutureStatusReady,
			Title:      title,
			CoverImage: covers[state.MediaID],
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
