package cron

import (
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
	"seanime/internal/events"
)

// checkAnilistCollectionNotifications compares the old cached collection with the freshly fetched
// one and creates notifications for:
//   - New episodes available for titles the user is currently watching (CURRENT/REPEATING).
//   - Planning titles that have started airing since the last check.
//
// If oldCollection is nil (no cache existed yet) the function returns silently without error.
func checkAnilistCollectionNotifications(c *JobCtx, oldCollection, newCollection *anilist.AnimeCollection) {
	if oldCollection == nil || newCollection == nil {
		return
	}
	if c.App.ProfileDatabaseManager == nil {
		return
	}

	// Build a snapshot map of mediaID -> state from the old (cached) collection.
	type oldState struct {
		nextEp      int // next airing episode number (0 = none known)
		mediaStatus anilist.MediaStatus
		listStatus  anilist.MediaListStatus
	}
	oldMap := make(map[int]oldState)
	for _, list := range oldCollection.MediaListCollection.Lists {
		if list == nil || len(list.Entries) == 0 {
			continue
		}
		for _, e := range list.Entries {
			if e == nil || e.Media == nil {
				continue
			}
			st := oldState{}
			if e.Status != nil {
				st.listStatus = *e.Status
			}
			if e.Media.Status != nil {
				st.mediaStatus = *e.Media.Status
			}
			if e.Media.NextAiringEpisode != nil {
				st.nextEp = e.Media.NextAiringEpisode.Episode
			}
			oldMap[e.Media.ID] = st
		}
	}

	// Collect notifications to create.
	var notifs []*models.Notification

	for _, list := range newCollection.MediaListCollection.Lists {
		if list == nil || list.Status == nil || len(list.Entries) == 0 {
			continue
		}
		for _, e := range list.Entries {
			if e == nil || e.Media == nil || e.Status == nil {
				continue
			}
			media := e.Media
			listStatus := *e.Status

			title := mediaTitle(media)
			imageURL := mediaCoverImage(media)

			old, existed := oldMap[media.ID]

			// Case 1: New episode available for currently watching.
			if listStatus == anilist.MediaListStatusCurrent || listStatus == anilist.MediaListStatusRepeating {
				newNextEp := 0
				if media.NextAiringEpisode != nil {
					newNextEp = media.NextAiringEpisode.Episode
				}
				// Only notify when we knew the previous next-episode number and it has advanced.
				if existed && old.nextEp > 0 && newNextEp > old.nextEp {
					numNew := newNextEp - old.nextEp
					var body string
					if numNew == 1 {
						body = fmt.Sprintf("Episode %d is now available.", old.nextEp)
					} else {
						body = fmt.Sprintf("Episodes %d–%d are now available.", old.nextEp, newNextEp-1)
					}
					notifs = append(notifs, &models.Notification{
						Type:     "new_episode",
						Title:    title,
						Body:     body,
						ImageURL: imageURL,
						MediaID:  media.ID,
					})
				}
			}

			// Case 2: A planning title has started airing.
			if listStatus == anilist.MediaListStatusPlanning {
				var newMediaStatus anilist.MediaStatus
				if media.Status != nil {
					newMediaStatus = *media.Status
				}
				newNextEp := 0
				if media.NextAiringEpisode != nil {
					newNextEp = media.NextAiringEpisode.Episode
				}
				var oldMediaStatus anilist.MediaStatus
				oldNextEp := 0
				if existed {
					oldMediaStatus = old.mediaStatus
					oldNextEp = old.nextEp
				}

				// "First episode aired" — fire the richer notification with
				// interactive prompts. Signal: media is now releasing AND
				// NextAiringEpisode is at episode 2 or later (meaning ep 1
				// has aired) AND we hadn't already flagged it before.
				firstEpisodeAired := newMediaStatus == anilist.MediaStatusReleasing &&
					newNextEp >= 2 &&
					(oldNextEp == 0 || oldNextEp <= 1)
				justStartedAiring := newMediaStatus == anilist.MediaStatusReleasing &&
					oldMediaStatus != anilist.MediaStatusReleasing

				if firstEpisodeAired {
					notifs = append(notifs, &models.Notification{
						Type:     "planning_first_episode",
						Title:    title,
						Body:     "The first episode is out — want to move this to Currently Watching?",
						ImageURL: imageURL,
						MediaID:  media.ID,
					})
				} else if justStartedAiring {
					notifs = append(notifs, &models.Notification{
						Type:     "related_airing",
						Title:    title,
						Body:     "This title has started airing.",
						ImageURL: imageURL,
						MediaID:  media.ID,
					})
				}
			}
		}
	}

	if len(notifs) == 0 {
		return
	}

	// Write to the global fallback database and all open per-profile databases.
	allDBs := c.App.ProfileDatabaseManager.GetAllOpenDatabases()
	if fallbackDB := c.App.ProfileDatabaseManager.GetFallbackDatabase(); fallbackDB != nil {
		for _, n := range notifs {
			_ = fallbackDB.CreateNotification(n)
		}
	}
	for _, pdb := range allDBs {
		if pdb == nil {
			continue
		}
		for _, n := range notifs {
			_ = pdb.CreateNotification(n)
		}
	}

	// Emit a WS event for each notification so the frontend can update in real time.
	for _, n := range notifs {
		c.App.WSEventManager.SendEvent(events.NotificationCreated, n)
	}
}

// mediaTitle returns the best available display title for a BaseAnime entry.
func mediaTitle(m *anilist.BaseAnime) string {
	if m == nil || m.Title == nil {
		return "Unknown"
	}
	if m.Title.UserPreferred != nil && *m.Title.UserPreferred != "" {
		return *m.Title.UserPreferred
	}
	if m.Title.Romaji != nil && *m.Title.Romaji != "" {
		return *m.Title.Romaji
	}
	if m.Title.English != nil {
		return *m.Title.English
	}
	return "Unknown"
}

// mediaCoverImage returns the highest-resolution cover image URL available.
func mediaCoverImage(m *anilist.BaseAnime) string {
	if m == nil || m.CoverImage == nil {
		return ""
	}
	if m.CoverImage.ExtraLarge != nil && *m.CoverImage.ExtraLarge != "" {
		return *m.CoverImage.ExtraLarge
	}
	if m.CoverImage.Large != nil {
		return *m.CoverImage.Large
	}
	return ""
}
