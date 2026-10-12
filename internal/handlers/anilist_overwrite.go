package handlers

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync/atomic"

	"seanime/internal/api/anilist"
	"seanime/internal/events"

	"github.com/labstack/echo/v4"
)

var anilistOverwriteRunning atomic.Bool

// overwriteEntry is the part of a list entry that is compared and pushed.
type overwriteEntry struct {
	title     string
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
			oe := overwriteEntry{mediaID: e.Media.ID, entryID: e.ID, status: *e.Status, title: e.Media.GetPreferredTitle()}
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
			oe := overwriteEntry{mediaID: e.Media.ID, entryID: e.ID, status: *e.Status, title: e.Media.GetPreferredTitle()}
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

// OverwriteChange is one entry that differs between the library and AniList.
type OverwriteChange struct {
	// Kind is "add", "update" or "remove".
	Kind    string   `json:"kind"`
	Media   string   `json:"media"` // "anime" or "manga"
	MediaID int      `json:"mediaId"`
	Title   string   `json:"title"`
	Fields  []string `json:"fields"`

	want, have overwriteEntry
}

// OverwritePreview is what an overwrite would change, without changing anything.
type OverwritePreview struct {
	Changes   []OverwriteChange `json:"changes"`
	Add       int               `json:"add"`
	Update    int               `json:"update"`
	Remove    int               `json:"remove"`
	Unchanged int               `json:"unchanged"`
}

func fmtDate(d [3]int) string {
	if d == [3]int{} {
		return "none"
	}
	return fmt.Sprintf("%04d-%02d-%02d", d[0], d[1], d[2])
}

func fmtStatus(s anilist.MediaListStatus) string {
	return strings.ToLower(strings.ReplaceAll(string(s), "_", " "))
}

func fieldDeltas(have, want overwriteEntry) []string {
	var out []string
	if have.status != want.status {
		out = append(out, fmt.Sprintf("Status: %s → %s", fmtStatus(have.status), fmtStatus(want.status)))
	}
	if have.score != want.score {
		out = append(out, fmt.Sprintf("Score: %d → %d", have.score, want.score))
	}
	if have.progress != want.progress {
		out = append(out, fmt.Sprintf("Progress: %d → %d", have.progress, want.progress))
	}
	if have.repeat != want.repeat {
		out = append(out, fmt.Sprintf("Rewatches: %d → %d", have.repeat, want.repeat))
	}
	if have.startedAt != want.startedAt {
		out = append(out, fmt.Sprintf("Started: %s → %s", fmtDate(have.startedAt), fmtDate(want.startedAt)))
	}
	if have.endedAt != want.endedAt {
		out = append(out, fmt.Sprintf("Completed: %s → %s", fmtDate(have.endedAt), fmtDate(want.endedAt)))
	}
	return out
}

// diffEntries lists only what differs between the library and AniList.
func diffEntries(media string, library, live map[int]overwriteEntry) (changes []OverwriteChange, unchanged int) {
	for id, want := range library {
		have, ok := live[id]
		if ok && have.same(want) {
			unchanged++
			continue
		}
		c := OverwriteChange{Kind: "update", Media: media, MediaID: id, Title: want.title, want: want, have: have}
		if ok {
			c.Fields = fieldDeltas(have, want)
		} else {
			c.Kind = "add"
			c.Fields = []string{"Status: " + fmtStatus(want.status), fmt.Sprintf("Progress: %d", want.progress)}
			if want.score > 0 {
				c.Fields = append(c.Fields, fmt.Sprintf("Score: %d", want.score))
			}
		}
		changes = append(changes, c)
	}
	for id, have := range live {
		if _, ok := library[id]; !ok {
			changes = append(changes, OverwriteChange{Kind: "remove", Media: media, MediaID: id, Title: have.title,
				Fields: []string{"Removed from AniList (" + fmtStatus(have.status) + ")"}, have: have})
		}
	}
	sort.Slice(changes, func(i, j int) bool { return changes[i].Title < changes[j].Title })
	return
}

// pushChanges writes only the entries that differ.
func pushChanges(ctx context.Context, client anilist.AnilistClient, changes []OverwriteChange) overwriteResult {
	var res overwriteResult

	for _, c := range changes {
		if c.Kind == "remove" {
			entryID := c.have.entryID
			if _, err := client.DeleteEntry(ctx, &entryID); err != nil {
				res.Failed++
				continue
			}
			res.Removed++
			continue
		}
		want := c.want
		mediaID := c.MediaID
		status := want.status
		score := want.score
		progress := want.progress
		if _, err := client.UpdateMediaListEntry(ctx, &mediaID, &status, &score, &progress,
			fuzzyInput(want.startedAt), fuzzyInput(want.endedAt)); err != nil {
			res.Failed++
			continue
		}
		if c.Kind == "add" || c.have.repeat != want.repeat {
			repeat := want.repeat
			if _, err := client.UpdateMediaListEntryRepeat(ctx, &mediaID, &repeat); err != nil {
				res.Failed++
				continue
			}
		}
		res.Updated++
	}
	return res
}

type overwriteContext struct {
	profileID            uint
	client               anilist.AnilistClient
	username             string
	animeWant, mangaWant map[int]overwriteEntry
}

func (h *Handler) overwriteContext(c echo.Context) (*overwriteContext, error) {
	oc := &overwriteContext{profileID: h.GetProfileID(c), client: h.GetProfileAnilistClient(c)}
	if oc.client == nil || !oc.client.IsAuthenticated() {
		return nil, errors.New("no AniList account is linked, log in to AniList first")
	}

	if oc.profileID > 0 {
		oc.username = h.App.AnilistClientManager.GetUsername(oc.profileID)
	} else if u := h.App.GetUser(); u != nil && u.Viewer != nil {
		oc.username = u.Viewer.Name
	}
	if oc.username == "" {
		return nil, errors.New("could not determine the AniList username")
	}

	var (
		animeLib *anilist.AnimeCollection
		mangaLib *anilist.MangaCollection
		err      error
	)
	if oc.profileID > 0 {
		if animeLib, err = h.App.AnilistClientManager.GetAnimeCollection(oc.profileID); err == nil {
			mangaLib, err = h.App.AnilistClientManager.GetMangaCollection(oc.profileID)
		}
	} else if animeLib, err = h.App.GetAnimeCollection(false); err == nil {
		mangaLib, err = h.App.GetMangaCollection(false)
	}
	if err != nil {
		return nil, err
	}

	oc.animeWant, oc.mangaWant = animeEntries(animeLib), mangaEntries(mangaLib)
	if len(oc.animeWant)+len(oc.mangaWant) == 0 {
		return nil, errors.New("your library is empty, refusing to wipe AniList with it")
	}
	return oc, nil
}

// diff reads AniList as it is right now and compares it with the library.
func (oc *overwriteContext) diff(ctx context.Context) ([]OverwriteChange, int, error) {
	animeLive, err := oc.client.AnimeCollection(ctx, &oc.username)
	if err != nil {
		return nil, 0, err
	}
	mangaLive, err := oc.client.MangaCollection(ctx, &oc.username)
	if err != nil {
		return nil, 0, err
	}
	ac, au := diffEntries("anime", oc.animeWant, animeEntries(animeLive))
	mc, mu := diffEntries("manga", oc.mangaWant, mangaEntries(mangaLive))
	return append(ac, mc...), au + mu, nil
}

// HandleOverwriteAnilistPreview
//
//	@summary lists what an AniList overwrite would change, without changing anything.
//	@route /api/v1/anilist/overwrite/preview [POST]
//	@returns handlers.OverwritePreview
func (h *Handler) HandleOverwriteAnilistPreview(c echo.Context) error {
	oc, err := h.overwriteContext(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	changes, unchanged, err := oc.diff(anilist.WithUserInitiated(context.Background()))
	if err != nil {
		return h.RespondWithError(c, errors.New("could not read AniList: "+err.Error()))
	}
	p := OverwritePreview{Changes: changes, Unchanged: unchanged}
	if p.Changes == nil {
		p.Changes = []OverwriteChange{}
	}
	for _, ch := range changes {
		switch ch.Kind {
		case "add":
			p.Add++
		case "remove":
			p.Remove++
		default:
			p.Update++
		}
	}
	return h.RespondWithData(c, p)
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
	oc, err := h.overwriteContext(c)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	profileID, client := oc.profileID, oc.client

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

		changes, unchanged, err := oc.diff(ctx)
		if err != nil {
			notify(map[string]any{"ok": false, "message": "Could not read AniList: " + err.Error()})
			return
		}

		r := pushChanges(ctx, client, changes)

		if profileID > 0 {
			h.App.AnilistClientManager.InvalidateAnimeCollection(profileID)
			h.App.AnilistClientManager.InvalidateMangaCollection(profileID)
		} else {
			_, _ = h.App.RefreshAnimeCollectionWithCtx(ctx)
			_, _ = h.App.RefreshMangaCollectionWithCtx(ctx)
		}

		msg := fmt.Sprintf("AniList overwritten: %d updated, %d removed, %d already matched",
			r.Updated, r.Removed, unchanged)
		if r.Failed > 0 {
			msg += fmt.Sprintf(", %d failed", r.Failed)
		}
		notify(map[string]any{"ok": r.Failed == 0, "message": msg})
	}()

	return h.RespondWithData(c, true)
}
