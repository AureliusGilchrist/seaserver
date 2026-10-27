package news

import (
	"strings"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
)

// Per-profile choice of which new feed entries become notifications (Settings → Personal → News).
const (
	NotifyModeAll      = "all"      // every new headline
	NotifyModeLists    = "lists"    // headlines naming something on the profile's chosen lists (Watching, Planning, Completed)
	NotifyModeKeywords = "keywords" // headlines matching the profile's keywords (default; built-in list when none set)
)

// NotifyFilter decides, for one profile, whether a new item is worth a notification.
type NotifyFilter struct {
	mode     string
	keywords []string
	titles   []string // lower-cased list titles for NotifyModeLists
}

// minListTitleLen keeps very short titles ("K", "Mob") from matching half the headlines.
const minListTitleLen = 4

// NewNotifyFilter builds the filter for a profile from its Personal overrides. The collections
// are only read in "lists" mode; pass whatever is cached (nil is fine — nothing will match).
func NewNotifyFilter(ovr *db.ClientSettingsOverrides, animeCol func() *anilist.AnimeCollection, mangaCol func() *anilist.MangaCollection) *NotifyFilter {
	f := &NotifyFilter{mode: NotifyModeKeywords}
	if ovr != nil && ovr.NewsNotifyMode != nil {
		switch *ovr.NewsNotifyMode {
		case NotifyModeAll, NotifyModeLists, NotifyModeKeywords:
			f.mode = *ovr.NewsNotifyMode
		}
	}

	switch f.mode {
	case NotifyModeKeywords:
		if ovr != nil && ovr.NewsNotifyKeywords != nil {
			for _, kw := range strings.Split(*ovr.NewsNotifyKeywords, ",") {
				if kw = strings.ToLower(strings.TrimSpace(kw)); kw != "" {
					f.keywords = append(f.keywords, kw)
				}
			}
		}
	case NotifyModeLists:
		seen := map[string]bool{}
		add := func(titles ...*string) {
			for _, t := range titles {
				if t == nil {
					continue
				}
				lt := strings.ToLower(strings.TrimSpace(*t))
				if len([]rune(lt)) >= minListTitleLen && !seen[lt] {
					seen[lt] = true
					f.titles = append(f.titles, lt)
				}
			}
		}
		on := func(b *bool) bool { return b == nil || *b }
		current, planning, completed := true, true, true
		readAnime, readManga := true, false
		if ovr != nil {
			current, planning, completed = on(ovr.NewsNotifyListCurrent), on(ovr.NewsNotifyListPlanning), on(ovr.NewsNotifyListCompleted)
			readAnime = on(ovr.NewsNotifyListAnime)
			readManga = ovr.NewsNotifyListManga != nil && *ovr.NewsNotifyListManga
		}
		wanted := func(st *anilist.MediaListStatus) bool {
			if st == nil {
				return false
			}
			switch *st {
			case anilist.MediaListStatusCurrent, anilist.MediaListStatusRepeating:
				return current
			case anilist.MediaListStatusPlanning:
				return planning
			case anilist.MediaListStatusCompleted:
				return completed
			}
			return false
		}
		if animeCol != nil && readAnime {
			if col := animeCol(); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					if !wanted(l.GetStatus()) {
						continue
					}
					for _, e := range l.GetEntries() {
						if m := e.GetMedia(); m != nil && m.Title != nil {
							add(m.Title.English, m.Title.Romaji, m.Title.UserPreferred)
						}
					}
				}
			}
		}
		if mangaCol != nil && readManga {
			if col := mangaCol(); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					if !wanted(l.GetStatus()) {
						continue
					}
					for _, e := range l.GetEntries() {
						if m := e.GetMedia(); m != nil && m.Title != nil {
							add(m.Title.English, m.Title.Romaji, m.Title.UserPreferred)
						}
					}
				}
			}
		}
	}
	return f
}

// Matches reports whether the item should become a notification for this profile.
func (f *NotifyFilter) Matches(item Item) bool {
	switch f.mode {
	case NotifyModeAll:
		return true
	case NotifyModeLists:
		haystack := strings.ToLower(item.Title + " " + item.Description)
		for _, t := range f.titles {
			if strings.Contains(haystack, t) {
				return true
			}
		}
		return false
	default:
		if len(f.keywords) == 0 {
			return matchesNewsNotifyKeywords(item.Title, item.Description)
		}
		haystack := strings.ToLower(item.Title + " " + item.Description)
		for _, kw := range f.keywords {
			if strings.Contains(kw, " ") {
				if strings.Contains(haystack, kw) {
					return true
				}
			} else if containsWholeWord(haystack, kw) {
				return true
			}
		}
		return false
	}
}
