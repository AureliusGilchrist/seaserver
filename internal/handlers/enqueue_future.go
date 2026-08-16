package handlers

import (
	"fmt"
	"hash/fnv"
	"strconv"

	"github.com/labstack/echo/v4"

	"seanime/internal/enqueuefuture"
)

// Enqueue Future prepares whole stretches of the recommendation graph in the background, so that
// following a chain of "if you liked this" costs one click instead of a tab, a page load, a torrent
// search and a confirmation per series.
//
// Everything here is thin: the repository owns the run, the queue, and the rate limiting. These
// handlers exist to start it, watch it, and let the queue screen walk what it produced.

// HandleEnqueueFuture
//
//	@summary starts preparing the recommendation graph around an anime.
//	@desc Walks outward from the given anime, queueing what it recommends and what those recommend
//	@desc in turn, up to a per-run cap. Each queued anime gets its full entry metadata and a torrent
//	@desc search stored, so its download screen opens with no waiting.
//	@desc Returns as soon as the run starts — the work continues with no page open.
//	@route /api/v1/enqueue-future/enqueue [POST]
//	@returns enqueuefuture.Status
func (h *Handler) HandleEnqueueFuture(c echo.Context) error {
	type body struct {
		MediaId int    `json:"mediaId"`
		Title   string `json:"title"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.MediaId == 0 {
		return h.RespondWithError(c, echo.NewHTTPError(400, "mediaId is required"))
	}

	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}

	status, err := h.App.EnqueueFutureRepository.Enqueue(b.MediaId, b.Title, h.GetProfileID(c))
	if err != nil {
		// Say so rather than returning a success the caller cannot tell apart from a started run.
		// Swallowing this made a stuck run indistinguishable from a working one: the button did
		// nothing, reported nothing, and there was no way to tell the queue was not filling.
		return h.RespondWithError(c, echo.NewHTTPError(409, err.Error()))
	}

	return h.RespondWithData(c, status)
}

// HandleGetEnqueueFutureStatus
//
//	@summary returns the progress of the running (or last) Enqueue Future run.
//	@route /api/v1/enqueue-future/status [GET]
//	@returns enqueuefuture.Status
func (h *Handler) HandleGetEnqueueFutureStatus(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithData(c, enqueuefuture.Status{})
	}
	return h.RespondWithData(c, h.App.EnqueueFutureRepository.Status())
}

// HandleStopEnqueueFuture
//
//	@summary cancels the running Enqueue Future run.
//	@desc Everything already prepared stays in the queue.
//	@route /api/v1/enqueue-future/stop [POST]
//	@returns enqueuefuture.Status
func (h *Handler) HandleStopEnqueueFuture(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithData(c, enqueuefuture.Status{})
	}
	return h.RespondWithData(c, h.App.EnqueueFutureRepository.Stop())
}

// HandleResumeEnqueueFuture
//
//	@summary picks an interrupted Enqueue Future run back up.
//	@desc Continues from where it stopped rather than starting the graph over — everything already
//	@desc prepared stays, and the walk carries on from the anime it had reached. The server does this
//	@desc by itself when it starts, so this is for a run that was stopped by hand.
//	@route /api/v1/enqueue-future/resume [POST]
//	@returns enqueuefuture.Status
func (h *Handler) HandleResumeEnqueueFuture(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}

	status, err := h.App.EnqueueFutureRepository.Resume()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, status)
}

// HandleGetEnqueueFutureQueue
//
//	@summary returns the queue in walk order.
//	@desc Snapshots are omitted — they are large, and the list view only needs titles and covers.
//	@route /api/v1/enqueue-future/queue [GET]
//	@returns []*enqueuefuture.Item
func (h *Handler) HandleGetEnqueueFutureQueue(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithData(c, []*enqueuefuture.Item{})
	}

	items, err := h.App.EnqueueFutureRepository.ListItems()
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// An unchanged queue costs a fingerprint, not the queue.
	//
	// This is polled every few seconds while a run is going, and the answer is every row in the
	// queue — which for a library heading towards ten thousand entries is a payload measured in
	// megabytes, serialised, sent, parsed and diffed against the last one, over and over, to
	// discover that one row's status changed. Most polls change nothing at all.
	//
	// So the client sends back the fingerprint it already holds, and a poll that would return the
	// same rows returns "unchanged" instead. Nothing is delayed by it: the moment anything really
	// changes, the fingerprint differs and the full list goes out on that same poll.
	fingerprint := enqueueFutureQueueFingerprint(items)
	if c.QueryParam("known") == fingerprint {
		return h.RespondWithData(c, map[string]any{"unchanged": true, "fingerprint": fingerprint})
	}

	return h.RespondWithData(c, map[string]any{"items": items, "fingerprint": fingerprint})
}

// enqueueFutureQueueFingerprint summarises the queue as it is drawn.
//
// Every field the screen renders takes part, so a change the user would see always changes the
// fingerprint, and a change they would not see — a column nothing displays — costs nothing.
func enqueueFutureQueueFingerprint(items []*enqueuefuture.Item) string {
	hash := fnv.New64a()
	for _, item := range items {
		if item == nil {
			continue
		}
		_, _ = fmt.Fprintf(hash, "%d|%d|%s|%s|%d|%s|%d;",
			item.MediaID, item.FamilyID, item.Status, item.DownloadState,
			item.TotalSeeders, item.Title, item.Attempts)
	}
	return strconv.FormatUint(hash.Sum64(), 36)
}

// HandleGetEnqueueFutureItem
//
//	@summary returns one queued anime with its prepared snapshot.
//	@desc The snapshot holds the anime entry and the torrent search results, which is everything the
//	@desc download screen needs to open without asking the server anything.
//	@param mediaId - int - true - "AniList ID of the queued anime"
//	@route /api/v1/enqueue-future/item/{mediaId} [GET]
//	@returns enqueuefuture.Item
func (h *Handler) HandleGetEnqueueFutureItem(c echo.Context) error {
	mediaID, err := strconv.Atoi(c.Param("mediaId"))
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid media id"))
	}

	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}

	item, err := h.App.EnqueueFutureRepository.GetItem(mediaID)
	if err != nil {
		return h.RespondWithError(c, err)
	}
	if item == nil {
		return h.RespondWithError(c, echo.NewHTTPError(404, "not in the queue"))
	}

	return h.RespondWithData(c, item)
}

// HandleSetEnqueueFutureItemStatus
//
//	@summary records what you did with a queued anime.
//	@desc Accepts "downloaded", "skipped" or "ignored". All three are terminal — the item stays in
//	@desc the queue as a record of the decision, which is also what stops it being discovered again
//	@desc later. Skipped means "not this time"; ignored means "never suggest this show again".
//	@param mediaId - int - true - "AniList ID of the queued anime"
//	@route /api/v1/enqueue-future/item/{mediaId}/status [POST]
//	@returns bool
func (h *Handler) HandleSetEnqueueFutureItemStatus(c echo.Context) error {
	mediaID, err := strconv.Atoi(c.Param("mediaId"))
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid media id"))
	}

	type body struct {
		Status string `json:"status"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}

	if err := h.App.EnqueueFutureRepository.SetItemStatus(mediaID, b.Status); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleDeleteEnqueueFutureItem
//
//	@summary removes one anime from the queue.
//	@param mediaId - int - true - "AniList ID of the queued anime"
//	@route /api/v1/enqueue-future/item/{mediaId} [DELETE]
//	@returns bool
func (h *Handler) HandleDeleteEnqueueFutureItem(c echo.Context) error {
	mediaID, err := strconv.Atoi(c.Param("mediaId"))
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(400, "invalid media id"))
	}

	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}

	if err := h.App.EnqueueFutureRepository.DeleteItem(mediaID); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleClearEnqueueFuture
//
//	@summary empties the queue.
//	@desc Stops any run first, so the worker does not immediately refill what was just cleared.
//	@route /api/v1/enqueue-future/clear [POST]
//	@returns bool
func (h *Handler) HandleClearEnqueueFuture(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}

	if err := h.App.EnqueueFutureRepository.Clear(); err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, true)
}

// HandleRewalkEnqueueFutureFamilies
//
//	@summary queues every franchise in the queue to be walked again.
//	@desc Relations are recorded as a walk discovers them, so families queued before that was
//	@desc recorded draw flat. This fills them in: one root per franchise, walked one after another.
//	@desc Deliberately expensive — a full AniList walk per franchise, at background pacing.
//	@route /api/v1/enqueue-future/rewalk [POST]
//	@returns int
func (h *Handler) HandleRewalkEnqueueFutureFamilies(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithData(c, 0)
	}

	queued, err := h.App.EnqueueFutureRepository.RewalkAllFamilies()
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, queued)
}
