package handlers

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"

	"seanime/internal/api/anilist"
	"seanime/internal/events"

	"github.com/labstack/echo/v4"
)

var anilistOverwriteRunning atomic.Bool

// overwriteEntry is the part of a list entry that is compared and pushed.
type overwriteEntry struct {
	mediaID   int
	entryID   int
	status    anilist.MediaListStatus
	score     int
	progress  int
	repeat    int
	startedAt [3]int
	endedAt   [3]int
}

func (e overwriteEntry) same(o overwriteEntry) bool {
	return e.status == o.status && e.score == o.score && e.progress == o.progress &&
		e.repeat == o.repeat && e.startedAt == o.startedAt && e.endedAt == o.endedAt
}

func fuzzyInput(d [3]int) *anilist.FuzzyDateInput {
	if d == [3]int{} {
		return nil
	}
	in := &anilist.FuzzyDateInput{}
	if d[0] > 0 {
		in.Year = &d[0]
	}
	if d[1] > 0 {
		in.Month = &d[1]
	}
	if d[2] > 0 {
		in.Day = &d[2]
	}
	return in
}

func fuzzyOf(y, m, d *int) [3]int {
	var out [3]int
	if y != nil {
		out[0] = *y
	}
	if m != nil {
		out[1] = *m
	}
	if d != nil {
		out[2] = *d
	}
	return out
}

func animeEntries(col *anilist.AnimeCollection) map[int]overwriteEntry {
	out := map[int]overwriteEntry{}
	if col == nil || col.MediaListCollection == nil {
		return out
	}
	for _, l := range col.MediaListCollection.Lists {
		if l == nil || l.Status == nil {
			continue
		}
		for _, e := range l.Entries {
			if e == nil || e.Media == nil || e.Status == nil {
				continue
			}
			oe := overwriteEntry{mediaID: e.Media.ID, entryID: e.ID, status: *e.Status}
			if e.Score != nil {
				oe.score = int(*e.Score)
			}
			if e.Progress != nil {
				oe.progress = *e.Progress
			}
			if e.Repeat != nil {
				oe.repeat = *e.Repeat
			}
			if e.StartedAt != nil {
				oe.startedAt = fuzzyOf(e.StartedAt.Year, e.StartedAt.Month, e.StartedAt.Day)
			}
			if e.CompletedAt != nil {
				oe.endedAt = fuzzyOf(e.CompletedAt.Year, e.CompletedAt.Month, e.CompletedAt.Day)
			}
			out[oe.mediaID] = oe
		}
	}
	return out
}

func mangaEntries(col *anilist.MangaCollection) map[int]overwriteEntry {
	out := map[int]overwriteEntry{}
	if col == nil || col.MediaListCollection == nil {
		return out
	}
	for _, l := range col.MediaListCollection.Lists {
		if l == nil || l.Status == nil {
			continue
		}
		for _, e := range l.Entries {
			if e == nil || e.Media == nil || e.Status == nil {
				continue
			}
			oe := overwriteEntry{mediaID: e.Media.ID, entryID: e.ID, status: *e.Status}
			if e.Score != nil {
				oe.score = int(*e.Score)
			}
			if e.Progress != nil {
				oe.progress = *e.Progress
			}
			if e.Repeat != nil {
				oe.repeat = *e.Repeat
			}
			if e.StartedAt != nil {
				oe.startedAt = fuzzyOf(e.StartedAt.Year, e.StartedAt.Month, e.StartedAt.Day)
			}
			if e.CompletedAt != nil {
				oe.endedAt = fuzzyOf(e.CompletedAt.Year, e.CompletedAt.Month, e.CompletedAt.Day)
			}
			out[oe.mediaID] = oe
		}
	}
	return out
}

type overwriteResult struct {
	Updated   int `json:"updated"`
	Removed   int `json:"removed"`
	Unchanged int `json:"unchanged"`
	Failed    int `json:"failed"`
}

// pushEntries makes live match library: entries that differ or are missing are written, entries that
// exist only on AniList are deleted.
func pushEntries(ctx context.Context, client anilist.AnilistClient, library, live map[int]overwriteEntry) overwriteResult {
	var res overwriteResult

	for id, want := range library {
		if have, ok := live[id]; ok && have.same(want) {
			res.Unchanged++
			continue
		}
		mediaID := id
		status := want.status
		score := want.score
		progress := want.progress
		if _, err := client.UpdateMediaListEntry(ctx, &mediaID, &status, &score, &progress,
			fuzzyInput(want.startedAt), fuzzyInput(want.endedAt)); err != nil {
			res.Failed++
			continue
		}
		if have, ok := live[id]; !ok || have.repeat != want.repeat {
			repeat := want.repeat
			if _, err := client.UpdateMediaListEntryRepeat(ctx, &mediaID, &repeat); err != nil {
				res.Failed++
				continue
			}
		}
		res.Updated++
	}

	for id, have := range live {
		if _, ok := library[id]; ok {
			continue
		}
		entryID := have.entryID
		if _, err := client.DeleteEntry(ctx, &entryID); err != nil {
			res.Failed++
			continue
		}
		res.Removed++
	}
	return res
}

// HandleOverwriteAnilist
//
//	@summary overwrites the AniList lists with the library as the app shows it.
//	@desc Every entry's status, score, progress, repeats and dates are written to AniList, and entries
//	@desc that are on AniList but not in the library are deleted. Runs in the background; the result
//	@desc arrives as an "anilist-overwrite-completed" event.
//	@route /api/v1/anilist/overwrite [POST]
//	@returns bool
func (h *Handler) HandleOverwriteAnilist(c echo.Context) error {
	profileID := h.GetProfileID(c)
	client := h.GetProfileAnilistClient(c)
	if client == nil || !client.IsAuthenticated() {
		return h.RespondWithError(c, errors.New("no AniList account is linked, log in to AniList first"))
	}

	var username string
	if profileID > 0 {
		username = h.App.AnilistClientManager.GetUsername(profileID)
	} else if u := h.App.GetUser(); u != nil && u.Viewer != nil {
		username = u.Viewer.Name
	}
	if username == "" {
		return h.RespondWithError(c, errors.New("could not determine the AniList username"))
	}

	var (
		animeLib *anilist.AnimeCollection
		mangaLib *anilist.MangaCollection
		err      error
	)
	if profileID > 0 {
		if animeLib, err = h.App.AnilistClientManager.GetAnimeCollection(profileID); err == nil {
			mangaLib, err = h.App.AnilistClientManager.GetMangaCollection(profileID)
		}
	} else if animeLib, err = h.App.GetAnimeCollection(false); err == nil {
		mangaLib, err = h.App.GetMangaCollection(false)
	}
	if err != nil {
		return h.RespondWithError(c, err)
	}

	animeWant, mangaWant := animeEntries(animeLib), mangaEntries(mangaLib)
	if len(animeWant)+len(mangaWant) == 0 {
		return h.RespondWithError(c, errors.New("your library is empty, refusing to wipe AniList with it"))
	}

	if !anilistOverwriteRunning.CompareAndSwap(false, true) {
		return h.RespondWithError(c, errors.New("an AniList overwrite is already running"))
	}

	clientID, _ := c.Get("Seanime-Client-Id").(string)
	notify := func(payload map[string]any) {
		if clientID != "" {
			h.App.WSEventManager.SendEventTo(clientID, events.AnilistOverwriteCompleted, payload)
		} else {
			h.App.WSEventManager.SendEvent(events.AnilistOverwriteCompleted, payload)
		}
	}

	go func() {
		defer anilistOverwriteRunning.Store(false)
		ctx := anilist.WithUserInitiated(context.Background())

		animeLive, err := client.AnimeCollection(ctx, &username)
		if err != nil {
			notify(map[string]any{"ok": false, "message": "Could not read AniList: " + err.Error()})
			return
		}
		mangaLive, err := client.MangaCollection(ctx, &username)
		if err != nil {
			notify(map[string]any{"ok": false, "message": "Could not read AniList: " + err.Error()})
			return
		}

		a := pushEntries(ctx, client, animeWant, animeEntries(animeLive))
		m := pushEntries(ctx, client, mangaWant, mangaEntries(mangaLive))

		if profileID > 0 {
			h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
			h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
		} else {
			_, _ = h.App.RefreshAnimeCollectionWithCtx(ctx)
			_, _ = h.App.RefreshMangaCollectionWithCtx(ctx)
		}

		failed := a.Failed + m.Failed
		msg := fmt.Sprintf("AniList overwritten: %d updated, %d removed, %d already matched",
			a.Updated+m.Updated, a.Removed+m.Removed, a.Unchanged+m.Unchanged)
		if failed > 0 {
			msg += fmt.Sprintf(", %d failed", failed)
		}
		notify(map[string]any{"ok": failed == 0, "message": msg})
	}()

	return h.RespondWithData(c, true)
}
