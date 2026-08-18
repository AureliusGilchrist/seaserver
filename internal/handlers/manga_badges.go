package handlers

import (
	"fmt"
	"hash/fnv"
	"sort"
	"strconv"

	"github.com/labstack/echo/v4"
)

// The manga library had no badges at all, while the anime library has had three for a long time —
// and the two sit next to each other, so a manga card said nothing where the anime card beside it
// said "downloading", "downloaded" or "matched" at a glance.
//
// This is the manga counterpart, built the same way and for the same reason: one endpoint, polled by
// every screen that draws a card, answering with the set of series in each state rather than making
// each card work it out for itself. Per-card is what a shelf of five hundred cards cannot afford,
// and it is also how two cards come to disagree.
//
// Synthetic series are in here on equal terms. Their IDs are negative, which is the only thing that
// makes them unusual, and a client that treats an ID as an opaque number needs to know nothing about
// that.

// MangaBadgeStatus is the badge state of every manga that has one.
//
// Four lists, and a series may be in more than one: the first three are the states of its files and
// the fourth says what kind of record it is. That is the difference the "synthetic" tag draws — it
// is not a fourth state competing with the others, it is a note attached to whichever of them
// applies, which is why it is its own list rather than folded into them.
type MangaBadgeStatus struct {
	// Downloading is every series with chapters queued or in flight right now.
	Downloading []int `json:"downloading"`
	// Downloaded is every series with chapters on disk.
	Downloaded []int `json:"downloaded"`
	// Matched is every series the library can name — one linked to an AniList entry, or one with a
	// local record of its own. Everything in the local manga library is in here.
	Matched []int `json:"matched"`
	// Synthetic is every series whose description came from a local record rather than from AniList.
	Synthetic []int `json:"synthetic"`
	// Fingerprint identifies this exact answer; the client sends it back on the next poll.
	Fingerprint string `json:"fingerprint,omitempty"`
	// Unchanged says the lists are the ones the client already holds and were not re-sent.
	Unchanged bool `json:"unchanged,omitempty"`
}

// HandleGetMangaBadgeStatus
//
//	@summary returns the badge state of every manga that has one.
//	@desc Four sets of media IDs — downloading, downloaded, matched and synthetic — for the cards to
//	@desc draw from. Synthetic IDs are negative and are included on the same terms as any other.
//	@desc A series may be in several: "synthetic" is a note on whichever state applies rather than a
//	@desc state of its own. Polled, so an unchanged answer costs only its fingerprint.
//	@route /api/v1/manga/badges [GET]
//	@returns handlers.MangaBadgeStatus
func (h *Handler) HandleGetMangaBadgeStatus(c echo.Context) error {
	res := h.buildMangaBadgeStatus()

	// Sorted so a poll that changed nothing looks like it changed nothing.
	sort.Ints(res.Downloading)
	sort.Ints(res.Downloaded)
	sort.Ints(res.Matched)
	sort.Ints(res.Synthetic)

	fingerprint := mangaBadgeFingerprint(res)
	if c.QueryParam("known") == fingerprint {
		return h.RespondWithData(c, MangaBadgeStatus{Unchanged: true, Fingerprint: fingerprint})
	}
	res.Fingerprint = fingerprint

	return h.RespondWithData(c, res)
}

// buildMangaBadgeStatus reads each state from the one place that actually knows it.
//
// Nothing here is inferred from anything else and nothing is written back. Every fact has a single
// owner — the queue owns "downloading", the download folder owns "downloaded", the mapping table and
// the local records own "matched" and "synthetic" — so the states cannot drift out of agreement with
// what they describe, which is the failure the anime badges were rebuilt to escape.
func (h *Handler) buildMangaBadgeStatus() MangaBadgeStatus {
	res := MangaBadgeStatus{
		Downloading: make([]int, 0),
		Downloaded:  make([]int, 0),
		Matched:     make([]int, 0),
		Synthetic:   make([]int, 0),
	}

	if h.App.MangaDownloader == nil || h.App.Database == nil {
		return res
	}

	// A series whose chapters came down under its old local ID and has since been matched is one
	// series, and it is shown under the ID the card is drawn with. Without this the badge landed on
	// an ID nothing on screen uses, and the card showed nothing at all.
	display := func(mediaID int) int {
		if mediaID >= 0 {
			return mediaID
		}
		if anilistID, found := h.App.Database.GetMangaIDMapping(mediaID); found && anilistID > 0 {
			return anilistID
		}
		return mediaID
	}

	// Downloaded: the download folder, read through the map the downloader keeps of it.
	downloadedSet := make(map[int]struct{})
	for mediaID, providers := range h.App.MangaDownloader.GetMediaMap() {
		if mediaID == 0 {
			continue
		}
		chapters := 0
		for _, list := range providers {
			chapters += len(list)
		}
		if chapters == 0 {
			continue
		}
		downloadedSet[display(mediaID)] = struct{}{}
	}

	// Downloading: the queue, which is the only thing that knows what is in flight. Anything not
	// finished counts — queued and downloading are both "coming down" as far as a card is concerned.
	downloadingSet := make(map[int]struct{})
	if queue, err := h.App.Database.GetChapterDownloadQueue(); err == nil {
		for _, item := range queue {
			if item == nil || item.MediaID == 0 {
				continue
			}
			switch item.Status {
			case "downloaded", "errored", "cancelled":
				continue
			}
			downloadingSet[display(item.MediaID)] = struct{}{}
		}
	}

	// Synthetic: every local record, under the ID it is displayed as. A matched one keeps the tag —
	// the record is still where its description came from, which is what the tag is about.
	syntheticSet := make(map[int]struct{})
	if synthetics, err := h.App.Database.GetAllSyntheticManga(); err == nil {
		for _, synthetic := range synthetics {
			if synthetic == nil || synthetic.SyntheticID == 0 {
				continue
			}
			syntheticSet[display(synthetic.SyntheticID)] = struct{}{}
		}
	}

	// Matched: anything the library can name. Three things make that true, and together they are
	// exactly "everything in the local manga library" — a link to an AniList entry, a local record
	// of its own, or chapters already filed under a real AniList ID.
	matchedSet := make(map[int]struct{})
	if mappings, err := h.App.Database.GetAllMangaIDMappings(); err == nil {
		for _, mapping := range mappings {
			if mapping == nil || mapping.AnilistID <= 0 {
				continue
			}
			matchedSet[mapping.AnilistID] = struct{}{}
		}
	}
	for mediaID := range syntheticSet {
		matchedSet[mediaID] = struct{}{}
	}
	for mediaID := range downloadedSet {
		if mediaID > 0 {
			matchedSet[mediaID] = struct{}{}
		}
	}

	for mediaID := range downloadingSet {
		res.Downloading = append(res.Downloading, mediaID)
	}
	for mediaID := range downloadedSet {
		res.Downloaded = append(res.Downloaded, mediaID)
	}
	for mediaID := range matchedSet {
		res.Matched = append(res.Matched, mediaID)
	}
	for mediaID := range syntheticSet {
		res.Synthetic = append(res.Synthetic, mediaID)
	}

	return res
}

// mangaBadgeFingerprint summarises the four lists. They are sorted, so equal contents always produce
// an equal fingerprint.
func mangaBadgeFingerprint(res MangaBadgeStatus) string {
	hash := fnv.New64a()
	for _, group := range [][]int{res.Downloading, res.Downloaded, res.Matched, res.Synthetic} {
		for _, id := range group {
			_, _ = fmt.Fprintf(hash, "%d,", id)
		}
		_, _ = hash.Write([]byte(";"))
	}
	return strconv.FormatUint(hash.Sum64(), 36)
}
