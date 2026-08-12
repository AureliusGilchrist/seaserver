package handlers

import (
	"seanime/internal/api/anilist"

	"github.com/labstack/echo/v4"
)

// UserInitiatedMiddleware marks every inbound API request as a request the user is waiting on, so
// AniList work behind it takes priority over the server's own background work.
//
// Marked here rather than at each handler because an inbound request *is* somebody waiting — that
// is what an inbound request means — and there are dozens of handlers that reach AniList. Marking
// them one at a time would be a list to keep in step with, and the ones that were forgotten would
// be exactly the ones nobody thought about: the details page nobody opens often, the search nobody
// tested under a rate limit.
//
// Background work is unaffected, because none of it runs on a request context. The scanner, the
// auto-downloader, the enqueue-future worker, the collection refresher and the service runner all
// build their own contexts — which is also what makes them background work rather than something
// somebody is watching.
//
// One caveat worth stating: a handler that starts a goroutine and hands it the request context
// would carry the mark into work the user is no longer waiting for. That does not happen today —
// a request context is cancelled the moment the response is written, so those paths already use
// their own — but it is the way this could quietly become wrong.
// BackgroundRequestHeader is how a client says that nobody is waiting on a request.
//
// The one caller today is the web client's prefetching, which walks the library after login asking
// for the entry, the AniList details, the metadata and the episode list of everything you own. It
// is speculative by definition — work done on the chance it turns out to be useful — and there can
// be hundreds of requests of it.
//
// Left marked as user-initiated, all of it was spent from the budget the pacer keeps for requests
// somebody is watching, including the reserve. So the first thing you did after opening the app —
// matching a download, opening a series — queued behind a minute of speculative work and appeared
// to hang. Marked as background, the pacer holds it at the reserve line and the thing you asked for
// goes first, which is what the reserve was built for.
const BackgroundRequestHeader = "X-Seanime-Background"

func UserInitiatedMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		req := c.Request()
		if req.Header.Get(BackgroundRequestHeader) == "true" {
			return next(c)
		}
		c.SetRequest(req.WithContext(anilist.WithUserInitiated(req.Context())))
		return next(c)
	}
}
