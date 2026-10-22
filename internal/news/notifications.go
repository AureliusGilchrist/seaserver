package news

import (
	"encoding/json"
	"fmt"
	"seanime/internal/core"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"strings"
	"time"
	"unicode"
)

// Notifications for new feed entries.
//
// A ticker calls CheckNewItemsNotifications every so often; it fetches the feed (through the
// shared cache), finds the entries that appeared since the last check, and files a `news`
// notification per profile — the same drawer the AniList notifications land in, pushed over
// the same websocket event, so the client needs no new machinery to show them.
//
// Announced entries are deduped in memory: the first check after a server start marks
// everything currently in the feed as seen without announcing it, which is what keeps a
// restart (or a fresh install) from re-announcing a backlog of old headlines. A profile that
// opted out of news notifications gets no rows at all — not silent ones.
//
// Announcements are further filtered by keyword: only items that look like a death
// announcement ("death", "dies", "passed away", ...) become notifications. Every other
// headline still appears on the News page — it just never interrupts anyone.

// newsNotifyKeywords is the whitelist a headline must hit before it becomes a notification.
// Single words match whole words only (so "studies" never trips "dies", and "deadline"
// never trips "dead"); multi-word phrases match as substrings.
var newsNotifyKeywords = []string{
	"death", "deaths", "dies", "died", "dying", "dead", "killed", "kills", "killing", "killings",
	"obituary", "obituaries", "memoriam", "funeral", "funerals", "suicide",
	"mourning", "mourns", "mourned", "rip",
}

var newsNotifyPhrases = []string{
	"passes away", "passed away", "passing away", "rest in peace", "in memoriam",
}

func matchesNewsNotifyKeywords(title, description string) bool {
	if title == "" && description == "" {
		return false
	}
	haystack := strings.ToLower(title + " " + description)
	for _, kw := range newsNotifyKeywords {
		if containsWholeWord(haystack, kw) {
			return true
		}
	}
	for _, phrase := range newsNotifyPhrases {
		if strings.Contains(haystack, phrase) {
			return true
		}
	}
	return false
}

// containsWholeWord reports whether s contains word as a standalone word —
// punctuation is a separator, so "dies," and "author's dies" both match "dies".
func containsWholeWord(s, word string) bool {
	for _, field := range strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		if field == word {
			return true
		}
	}
	return false
}

type newsMetadata struct {
	Link        string `json:"link"`
	FeedTitle   string `json:"feedTitle"`
	PublishedAt int64  `json:"publishedAt"`
}

func CheckNewItemsNotifications(app *core.App) {
	if app == nil || app.Settings == nil || app.Settings.Library == nil {
		return
	}

	resp := GetResponse(GetFeedUrls(app.Settings.Library.NewsFeeds))
	if resp == nil {
		return
	}

	announceMu.Lock()
	if announced == nil {
		// First check of this server process: everything already in the feed is history.
		announced = make(map[string]bool, len(resp.Items))
		for _, item := range resp.Items {
			announced[item.Link] = true
		}
		announceMu.Unlock()
		return
	}

	fresh := make([]Item, 0, maxAnnouncementsPerCheck)
	cutoff := time.Now().Add(-announcementFreshness).Unix()
	for _, item := range resp.Items {
		if announced[item.Link] {
			continue
		}
		announced[item.Link] = true
		// A feed can carry a backlog, and a link without a date has none of the guarantees a
		// notification implies — both are recorded as seen, neither is announced.
		if item.PublishedAt < cutoff {
			continue
		}
		fresh = append(fresh, item)
		if len(fresh) >= maxAnnouncementsPerCheck {
			break
		}
	}
	announceMu.Unlock()

	// Only items that look like a death announcement are worth a notification — the rest
	// stay feed-only: visible on the News page, never filed into the drawer.
	notable := fresh[:0]
	for _, item := range fresh {
		if matchesNewsNotifyKeywords(item.Title, item.Description) {
			notable = append(notable, item)
		}
	}
	fresh = notable

	if len(fresh) == 0 {
		return
	}

	if app.ProfileManager != nil && app.ProfileManager.HasProfiles() {
		profiles, err := app.ProfileManager.GetAllProfiles()
		if err != nil {
			app.Logger.Error().Err(err).Msg("news: failed to list profiles for news notifications")
			return
		}
		for _, profile := range profiles {
			if profile == nil {
				continue
			}
			database, err := app.ProfileDatabaseManager.GetDatabase(profile.ID)
			if err != nil {
				app.Logger.Error().Err(err).Uint("profileID", profile.ID).Msg("news: failed to open profile database for news notifications")
				continue
			}
			announceToDatabase(app, database, fresh)
		}
		return
	}

	if fallback := app.ProfileDatabaseManager.GetFallbackDatabase(); fallback != nil {
		announceToDatabase(app, fallback, fresh)
	}
}

// announceToDatabase files one notification per fresh item into the database, honoring the
// profile's Personal "notify about new articles" choice (client-prefs override), and pushes
// each created notification over the websocket.
func announceToDatabase(app *core.App, database *db.Database, fresh []Item) {
	// No override means the feature's default: on, like every other notification source.
	if ovr, err := database.GetClientSettingsOverrides(); err == nil && ovr != nil && ovr.NewsNotifyNewEntries != nil && !*ovr.NewsNotifyNewEntries {
		return
	}

	for _, item := range fresh {
		meta := newsMetadata{
			Link:        item.Link,
			FeedTitle:   item.FeedTitle,
			PublishedAt: item.PublishedAt,
		}
		metaJSON, err := json.Marshal(meta)
		if err != nil {
			continue
		}

		n := &models.Notification{
			Type:     "news",
			Title:    item.Title,
			Body:     truncateNewsBody(item),
			ImageURL: item.Image,
			Metadata: string(metaJSON),
		}

		if err := database.CreateNotification(n); err != nil {
			app.Logger.Error().Err(err).Str("link", item.Link).Msg("news: failed to save news notification")
			continue
		}
		app.WSEventManager.SendEvent(events.NotificationCreated, n)
	}
}

func truncateNewsBody(item Item) string {
	const max = 220
	if item.Description == "" {
		return fmt.Sprintf("New from %s.", feedName(item))
	}
	if len(item.Description) <= max {
		return item.Description
	}
	return item.Description[:max] + "…"
}

func feedName(item Item) string {
	if item.FeedTitle != "" {
		return item.FeedTitle
	}
	return "your feeds"
}
