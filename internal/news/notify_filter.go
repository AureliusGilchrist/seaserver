package news

import (
	"strings"
	"unicode"

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
	titles   []listTitle // NotifyModeLists
}

// listTitle is one title from the profile's lists, kept as words so it only ever matches whole
// words of a headline, with where it came from for the notification's "why".
type listTitle struct {
	title string   // as written on AniList
	words []string // lower-cased words
	list  string   // "Watching", "Planning", "Completed"
	media string   // "anime" or "manga"
}

// NotifyMatch says why an item notified.
type NotifyMatch struct {
	Mode  string `json:"mode"`
	Title string `json:"matchedTitle,omitempty"`
	List  string `json:"matchedList,omitempty"`
	Media string `json:"matchedMedia,omitempty"`
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
		add := func(list, media string, titles ...*string) {
			for _, t := range titles {
				if t == nil {
					continue
				}
				title := strings.TrimSpace(*t)
				key := strings.ToLower(title)
				if len([]rune(key)) < minListTitleLen || seen[key] {
					continue
				}
				words := wordsOf(key)
				if len(words) == 0 {
					continue
				}
				seen[key] = true
				f.titles = append(f.titles, listTitle{title: title, words: words, list: list, media: media})
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
		listName := func(st *anilist.MediaListStatus) string {
			if st == nil {
				return ""
			}
			switch *st {
			case anilist.MediaListStatusCurrent, anilist.MediaListStatusRepeating:
				if current {
					return "Watching"
				}
			case anilist.MediaListStatusPlanning:
				if planning {
					return "Planning"
				}
			case anilist.MediaListStatusCompleted:
				if completed {
					return "Completed"
				}
			}
			return ""
		}
		if animeCol != nil && readAnime {
			if col := animeCol(); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					name := listName(l.GetStatus())
					if name == "" {
						continue
					}
					for _, e := range l.GetEntries() {
						if m := e.GetMedia(); m != nil && m.Title != nil {
							add(name, "anime", m.Title.English, m.Title.Romaji, m.Title.UserPreferred)
						}
					}
				}
			}
		}
		if mangaCol != nil && readManga {
			if col := mangaCol(); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					name := listName(l.GetStatus())
					if name == "Watching" {
						name = "Reading"
					}
					if name == "" {
						continue
					}
					for _, e := range l.GetEntries() {
						if m := e.GetMedia(); m != nil && m.Title != nil {
							add(name, "manga", m.Title.English, m.Title.Romaji, m.Title.UserPreferred)
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
	_, ok := f.Match(item)
	return ok
}

// Match reports whether the item should become a notification for this profile, and why.
//
// Lists mode reads the headline only, and a title has to appear there as whole words: the article
// description routinely names other shows ("from the studio behind…"), and a bare substring let a
// short title match inside unrelated words.
func (f *NotifyFilter) Match(item Item) (NotifyMatch, bool) {
	switch f.mode {
	case NotifyModeAll:
		return NotifyMatch{Mode: NotifyModeAll}, true
	case NotifyModeLists:
		headline := wordsOf(strings.ToLower(item.Title))
		for _, t := range f.titles {
			if containsWords(headline, t.words) {
				return NotifyMatch{Mode: NotifyModeLists, Title: t.title, List: t.list, Media: t.media}, true
			}
		}
		return NotifyMatch{}, false
	default:
		if len(f.keywords) == 0 {
			return NotifyMatch{Mode: NotifyModeKeywords}, matchesNewsNotifyKeywords(item.Title, item.Description)
		}
		haystack := strings.ToLower(item.Title + " " + item.Description)
		for _, kw := range f.keywords {
			if strings.Contains(kw, " ") {
				if strings.Contains(haystack, kw) {
					return NotifyMatch{Mode: NotifyModeKeywords, Title: kw}, true
				}
			} else if containsWholeWord(haystack, kw) {
				return NotifyMatch{Mode: NotifyModeKeywords, Title: kw}, true
			}
		}
		return NotifyMatch{}, false
	}
}

// wordsOf splits lower-cased text into words: runs of letters and digits.
func wordsOf(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) })
}

// containsWords reports whether needle appears as consecutive whole words in haystack.
func containsWords(haystack, needle []string) bool {
	if len(needle) == 0 || len(needle) > len(haystack) {
		return false
	}
outer:
	for i := 0; i+len(needle) <= len(haystack); i++ {
		for j, w := range needle {
			if haystack[i+j] != w {
				continue outer
			}
		}
		return true
	}
	return false
}
