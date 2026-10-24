package cron

import (
	"encoding/json"
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
)

// AniList's notifications field takes a single NotificationType, not a list, so callers
// issue one query per type they care about.
const anilistNotificationsQuery = `query AniListNotifications($page: Int, $perPage: Int, $type: NotificationType) {
  Page(page: $page, perPage: $perPage) {
    notifications(type: $type) {
      ... on AiringNotification {
        id
        type
        episode
        media {
          id
          title {
            userPreferred
            romaji
            english
          }
          coverImage {
            extraLarge
            large
          }
        }
      }
      ... on RelatedMediaAdditionNotification {
        id
        type
        context
        media {
          id
          type
          title {
            userPreferred
            romaji
            english
          }
          coverImage {
            extraLarge
            large
          }
        }
      }
    }
  }
}`

type relatedMediaNotificationResponse struct {
	Page struct {
		Notifications []anilistNotification `json:"notifications"`
	} `json:"Page"`
}

type anilistNotification struct {
	ID      int                            `json:"id"`
	Type    string                         `json:"type"`
	Episode int                            `json:"episode"`
	Context *string                        `json:"context"`
	Media   *relatedMediaNotificationMedia `json:"media"`
}

type relatedMediaNotificationMedia struct {
	ID    int    `json:"id"`
	Type  string `json:"type"`
	Title struct {
		UserPreferred *string `json:"userPreferred"`
		Romaji        *string `json:"romaji"`
		English       *string `json:"english"`
	} `json:"title"`
	CoverImage struct {
		ExtraLarge *string `json:"extraLarge"`
		Large      *string `json:"large"`
	} `json:"coverImage"`
}

func checkAnilistRelatedMediaNotifications(c *JobCtx) {
	if c == nil || c.App == nil || c.App.ProfileDatabaseManager == nil {
		return
	}

	client := c.App.AnilistClientRef.Get()
	if client == nil || !client.IsAuthenticated() {
		return
	}

	persistAnilistNotifications(c, client, []string{"RELATED_MEDIA_ADDITION"}, []*db.Database{
		c.App.ProfileDatabaseManager.GetFallbackDatabase(),
	})
}

func checkProfileAnilistNotifications(c *JobCtx) {
	if c == nil || c.App == nil || c.App.ProfileManager == nil || c.App.AnilistClientManager == nil {
		return
	}

	profiles, err := c.App.ProfileManager.GetAllProfiles()
	if err != nil {
		c.App.Logger.Error().Err(err).Msg("cron: failed to list profiles for AniList notifications")
		return
	}

	for _, profile := range profiles {
		if profile == nil {
			continue
		}
		client := c.App.AnilistClientManager.GetClient(profile.ID)
		if client == nil || !client.IsAuthenticated() {
			continue
		}
		database, err := c.App.ProfileDatabaseManager.GetDatabase(profile.ID)
		if err != nil {
			c.App.Logger.Error().Err(err).Uint("profileID", profile.ID).
				Msg("cron: failed to open profile database for AniList notifications")
			continue
		}
		persistAnilistNotifications(c, client, []string{"AIRING", "RELATED_MEDIA_ADDITION"}, []*db.Database{database})
	}
}

func persistAnilistNotifications(c *JobCtx, client anilist.AnilistClient, types []string, databases []*db.Database) {
	if c == nil || c.App == nil || client == nil || len(databases) == 0 {
		return
	}

	// One request per type: AniList's notifications query only accepts a single NotificationType.
	for _, notificationType := range types {
		request, err := json.Marshal(map[string]interface{}{
			"query": anilistNotificationsQuery,
			"variables": map[string]interface{}{
				"page":    1,
				"perPage": 50,
				"type":    notificationType,
			},
		})
		if err != nil {
			c.App.Logger.Error().Err(err).Str("type", notificationType).
				Msg("cron: failed to encode AniList notification query")
			continue
		}

		response, err := client.CustomQuery(request, c.App.Logger)
		if err != nil {
			c.App.Logger.Error().Err(err).Str("type", notificationType).
				Msg("cron: failed to fetch AniList notifications")
			continue
		}

		responseJSON, err := json.Marshal(response)
		if err != nil {
			c.App.Logger.Error().Err(err).Str("type", notificationType).
				Msg("cron: failed to encode AniList notifications")
			continue
		}

		var decoded relatedMediaNotificationResponse
		if err := json.Unmarshal(responseJSON, &decoded); err != nil {
			c.App.Logger.Error().Err(err).Str("type", notificationType).
				Msg("cron: failed to decode AniList notifications")
			continue
		}

		for _, notification := range decoded.Page.Notifications {
			if notif := anilistNotificationToModel(notification); notif != nil {
				persistAnilistNotificationToDatabases(c, notif, databases)
			}
		}
	}
}

func anilistNotificationToModel(notification anilistNotification) *models.Notification {
	if notification.ID <= 0 || notification.Media == nil || notification.Media.ID <= 0 {
		return nil
	}

	kind := ""
	body := ""
	switch notification.Type {
	case "AIRING":
		kind = "new_episode"
		if notification.Episode > 0 {
			body = fmt.Sprintf("Episode %d has aired.", notification.Episode)
		} else {
			body = "A new episode has aired."
		}
	case "RELATED_MEDIA_ADDITION":
		switch notification.Media.Type {
		case "ANIME":
			kind = "related_anime_addition"
			body = "A new anime in one of your AniList series is available."
		case "MANGA":
			kind = "related_manga_addition"
			body = "A new manga in one of your AniList series is available."
		default:
			return nil
		}
	default:
		return nil
	}
	if notification.Context != nil && *notification.Context != "" {
		body = *notification.Context
	}

	media := notification.Media
	return &models.Notification{
		Type:                  kind,
		Title:                 firstNonEmpty(media.Title.UserPreferred, media.Title.Romaji, media.Title.English),
		Body:                  body,
		ImageURL:              firstNonEmpty(media.CoverImage.ExtraLarge, media.CoverImage.Large),
		MediaID:               media.ID,
		AnilistNotificationID: notification.ID,
	}
}

func persistAnilistNotification(c *JobCtx, n *models.Notification) {
	if c == nil || c.App == nil || c.App.ProfileDatabaseManager == nil {
		return
	}

	manager := c.App.ProfileDatabaseManager
	databases := append([]*db.Database{}, manager.GetAllOpenDatabases()...)
	if fallbackDB := manager.GetFallbackDatabase(); fallbackDB != nil {
		databases = append(databases, fallbackDB)
	}
	persistAnilistNotificationToDatabases(c, n, databases)
}

func persistAnilistNotificationToDatabases(c *JobCtx, n *models.Notification, databases []*db.Database) {
	if c == nil || c.App == nil || n == nil {
		return
	}

	created := false
	var createdNotification *models.Notification
	for _, database := range databases {
		if database == nil {
			continue
		}
		if n.AnilistNotificationID > 0 {
			exists, err := database.HasAnilistNotification(n.AnilistNotificationID)
			if err != nil {
				c.App.Logger.Error().Err(err).
					Int("anilistNotificationID", n.AnilistNotificationID).
					Msg("cron: failed to check for an existing AniList notification")
				continue
			}
			if exists {
				if err := database.SaveAnilistNotificationReceipt(n.AnilistNotificationID); err != nil {
					c.App.Logger.Error().Err(err).
						Int("anilistNotificationID", n.AnilistNotificationID).
						Msg("cron: failed to save AniList notification receipt")
				}
				continue
			}
		}

		// GORM populates the model's ID and timestamps on create; each profile database needs its
		// own fresh model so one insert cannot leak its primary key into the next database.
		copy := *n
		copy.BaseModel = models.BaseModel{}
		if err := database.CreateNotification(&copy); err != nil {
			c.App.Logger.Error().Err(err).
				Int("anilistNotificationID", n.AnilistNotificationID).
				Msg("cron: failed to save AniList notification")
			continue
		}
		if n.AnilistNotificationID > 0 {
			if err := database.SaveAnilistNotificationReceipt(n.AnilistNotificationID); err != nil {
				c.App.Logger.Error().Err(err).
					Int("anilistNotificationID", n.AnilistNotificationID).
					Msg("cron: failed to save AniList notification receipt")
			}
		}
		if createdNotification == nil {
			createdNotification = &copy
		}
		created = true
	}

	if created && createdNotification != nil {
		c.App.WSEventManager.SendEvent(events.NotificationCreated, createdNotification)
	}
}

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

	if len(notifs) > 0 {
		databases := append([]*db.Database{}, c.App.ProfileDatabaseManager.GetAllOpenDatabases()...)
		if fallbackDB := c.App.ProfileDatabaseManager.GetFallbackDatabase(); fallbackDB != nil {
			databases = append(databases, fallbackDB)
		}
		for _, n := range notifs {
			persistAnilistNotificationToDatabases(c, n, databases)
		}
	}
}

func firstNonEmpty(values ...*string) string {
	for _, value := range values {
		if value != nil && *value != "" {
			return *value
		}
	}
	return "Unknown"
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
