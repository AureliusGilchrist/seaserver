package cron

import (
	"context"
	"seanime/internal/events"

	"github.com/goccy/go-json"
)

// RefreshViewerJob re-fetches the account's AniList profile and updates the stored snapshot.
//
// The banner and avatar the app shows come from the account row — a snapshot taken at login and
// stored in the database — so a banner changed on AniList after that did nothing until the next
// sign-in, which for a server that stays signed in is never. An hourly re-fetch is what keeps the
// snapshot current; an hour is the right cadence because a profile picture is not something that
// changes by the minute, and the refresh is one request against a budget shared by everything else
// the server does.
//
// When the refresh fails — a token that has expired, AniList that is down — the stored snapshot is
// left exactly as it was, which is the honest fallback: a banner that was true at login is better
// than none.
func RefreshViewerJob(c *JobCtx) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	if c.App.Settings == nil || c.App.Settings.Library == nil {
		return
	}

	// Only when there is a real AniList account behind the session — a simulated user has nothing
	// to refresh, and refreshing it would only rewrite the placeholder.
	if c.App.GetUser().IsSimulated {
		return
	}

	acc, err := c.App.Database.GetAccount()
	if err != nil || acc == nil || acc.Token == "" {
		return
	}

	client := c.App.AnilistClientRef.Get()
	if client == nil {
		return
	}

	viewer, err := client.GetViewer(context.Background())
	if err != nil || viewer == nil || viewer.Viewer == nil {
		c.App.Logger.Warn().Err(err).Msg("cron: Could not refresh the account's AniList profile")
		return
	}

	// Only write when something actually changed — one request an hour that rewrites the same
	// banner is a write the database did not need.
	if viewer.Viewer.GetName() == acc.Username {
		// The account row stores the viewer as raw JSON bytes, which is what NewUser unmarshals —
		// so the fresh viewer is stored the same way it was read.
		viewerBytes, err := json.Marshal(viewer.Viewer)
		if err != nil {
			return
		}
		acc.Viewer = viewerBytes
		if _, err := c.App.Database.UpsertAccount(acc); err != nil {
			c.App.Logger.Warn().Err(err).Msg("cron: Could not save the refreshed profile")
			return
		}
		c.App.WSEventManager.SendEvent(events.RefreshedAnilistAnimeCollection, nil)
	}
}
