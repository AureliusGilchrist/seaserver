package handlers

import (
	"errors"

	"github.com/labstack/echo/v4"

	"seanime/internal/core"
	"seanime/internal/enqueuefuture"
)

// Auto torrent runs on the server as a background task — see internal/enqueuefuture/autotorrent.go.
// These handlers are thin: they read the session, change it, and wire in how a torrent is actually
// added to the client, which lives here with the download handler it shares that code with.

// wireAutoTorrent hands the auto torrent session what it needs from the handlers, which also
// resumes a session the server was in the middle of when it last stopped.
func (h *Handler) wireAutoTorrent(app *core.App) {
	if app.EnqueueFutureRepository == nil {
		return
	}
	app.EnqueueFutureRepository.SetAutoTorrentHooks(enqueuefuture.AutoTorrentHooks{
		Add: func(job enqueuefuture.AutoTorrentJob) (bool, error) {
			repo := h.App.TorrentClientRepositoryRef.Get()
			if repo == nil {
				return false, errors.New("no torrent client is set up")
			}
			metadata := h.queuedTorrentMetadata(job.Media)
			added, err := h.addTorrentToClient(repo, job.Torrent, job.Media, metadata, job.AutoMatch, job.MatchSeasonOneOnly)
			if err == nil && added && job.Media != nil {
				h.addManualDownloadToPlanning(job.Media.ID)
			}
			return added, err
		},
		// Torrents waiting in the offline queue mean the client is not answering; adding more only
		// lengthens what it has to catch up on.
		ClientUnavailable: func() (bool, string) {
			repo := h.App.TorrentClientRepositoryRef.Get()
			if repo == nil {
				return true, "No torrent client is set up"
			}
			if view := repo.GetAddQueueView(); view != nil && view.Total > 0 {
				return true, "The torrent client is offline or busy, waiting for it"
			}
			return false, ""
		},
		ContentsClient: h.torrentContentsHTTPClient,
	})
}

// HandleGetAutoTorrent
//
//	@summary returns the auto torrent session.
//	@desc The session lives on the server and survives restarts: the anime being worked through, the
//	@desc batch on screen with its picks and your edits, and the torrents still being added.
//	@route /api/v1/enqueue-future/auto-torrent [GET]
//	@returns enqueuefuture.AutoTorrentView
func (h *Handler) HandleGetAutoTorrent(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithData(c, enqueuefuture.AutoTorrentView{})
	}
	return h.RespondWithData(c, h.App.EnqueueFutureRepository.AutoTorrentStatus())
}

// HandleStartAutoTorrent
//
//	@summary opens an auto torrent session over the given anime, in order.
//	@desc Fails with 409 while another session is open. The first batch is searched in the background.
//	@route /api/v1/enqueue-future/auto-torrent/start [POST]
//	@returns enqueuefuture.AutoTorrentView
func (h *Handler) HandleStartAutoTorrent(c echo.Context) error {
	type body struct {
		MediaIds []int `json:"mediaIds"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}
	view, err := h.App.EnqueueFutureRepository.StartAutoTorrent(b.MediaIds)
	if errors.Is(err, enqueuefuture.ErrAutoTorrentActive) {
		return h.RespondWithError(c, echo.NewHTTPError(409, err.Error()))
	}
	if err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, view)
}

// HandleEditAutoTorrent
//
//	@summary saves your edits to the batch on screen.
//	@desc Removed is what you struck out; autoMatchOff is which picks should not be matched automatically.
//	@route /api/v1/enqueue-future/auto-torrent/edit [POST]
//	@returns enqueuefuture.AutoTorrentView
func (h *Handler) HandleEditAutoTorrent(c echo.Context) error {
	type body struct {
		Removed      []int `json:"removed"`
		AutoMatchOff []int `json:"autoMatchOff"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}
	return h.RespondWithData(c, h.App.EnqueueFutureRepository.EditAutoTorrent(b.Removed, b.AutoMatchOff))
}

// HandleConfirmAutoTorrent
//
//	@summary confirms the batch on screen and moves to the next.
//	@desc What is left of the batch is added to the torrent client in the background, one at a time.
//	@route /api/v1/enqueue-future/auto-torrent/confirm [POST]
//	@returns enqueuefuture.AutoTorrentView
func (h *Handler) HandleConfirmAutoTorrent(c echo.Context) error {
	type body struct {
		MatchSeasonOneOnly bool `json:"matchSeasonOneOnly"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}
	view, err := h.App.EnqueueFutureRepository.ConfirmAutoTorrent(b.MatchSeasonOneOnly)
	if err != nil {
		return h.RespondWithError(c, echo.NewHTTPError(409, err.Error()))
	}
	return h.RespondWithData(c, view)
}

// HandleRetryAutoTorrent
//
//	@summary searches the batch on screen again.
//	@route /api/v1/enqueue-future/auto-torrent/retry [POST]
//	@returns enqueuefuture.AutoTorrentView
func (h *Handler) HandleRetryAutoTorrent(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}
	return h.RespondWithData(c, h.App.EnqueueFutureRepository.RetryAutoTorrent())
}

// HandleEndAutoTorrent
//
//	@summary closes the auto torrent session.
//	@desc Torrents already confirmed keep being added in the background.
//	@route /api/v1/enqueue-future/auto-torrent/end [POST]
//	@returns enqueuefuture.AutoTorrentView
func (h *Handler) HandleEndAutoTorrent(c echo.Context) error {
	if h.App.EnqueueFutureRepository == nil {
		return h.RespondWithError(c, echo.NewHTTPError(500, "enqueue future is unavailable"))
	}
	return h.RespondWithData(c, h.App.EnqueueFutureRepository.EndAutoTorrent())
}
