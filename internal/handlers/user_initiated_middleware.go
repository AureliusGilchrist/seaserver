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
func UserInitiatedMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		req := c.Request()
		c.SetRequest(req.WithContext(anilist.WithUserInitiated(req.Context())))
		return next(c)
	}
}
