package handlers

import (
	"github.com/labstack/echo/v4"
	"seanime/internal/news"
)

// News area: the handler is a thin pass-through — the fetching, merging, caching and the
// new-entry notifications live in internal/news, shared with the cron job that raises
// notifications. See that package for the how.

// HandleGetNewsFeed
//
//	@summary returns merged, sorted items from the configured RSS feeds.
//	@desc Fetches each feed configured in Settings -> App (defaults to anime/manga news feeds),
//	@desc merges the items newest-first and caches the result for 15 minutes.
//	@route /api/v1/news [GET]
//	@returns news.Response
func (h *Handler) HandleGetNewsFeed(c echo.Context) error {
	feeds := []string{}
	if h.App.Settings != nil && h.App.Settings.Library != nil {
		feeds = news.GetFeedUrls(h.App.Settings.Library.NewsFeeds)
	} else {
		feeds = news.GetFeedUrls("")
	}

	resp := news.GetResponse(feeds)

	return h.RespondWithData(c, resp)
}
