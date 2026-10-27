package news

import (
	"strings"
	"unicode"
	"unicode/utf8"

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
	names    []listName // NotifyModeLists
}

// listName is one exact name of something on the profile's lists — its English, romaji or native
// title, or one of its AniList synonyms — kept as words so it only ever matches as a whole name,
// with the entry it belongs to for the notification's "why".
type listName struct {
	title string   // the entry's display title (user-preferred)
	words []string // the name's lower-cased words
	list  string   // "Watching", "Reading", "Planning", "Completed"
	media string   // "anime" or "manga"
}

// NotifyMatch says why an item notified.
type NotifyMatch struct {
	Mode  string `json:"mode"`
	Title string `json:"matchedTitle,omitempty"` // the list entry's display title
	List  string `json:"matchedList,omitempty"`
	Media string `json:"matchedMedia,omitempty"`
	// Text is the exact text that matched, as written in the article, and In says where
	// ("title" or "body"), so the client can set it in bold where it appears.
	Text string `json:"matchedText,omitempty"`
	In   string `json:"matchedIn,omitempty"`
}

// A name has to be specific enough to mean the show: at least 4 characters, and a name of a single
// word at least 5 letters. "Mob", "K", "Gate" or a synonym like "Ao" would otherwise match plain
// words in unrelated headlines.
const (
	minNameLen           = 4
	minSingleWordNameLen = 5
)

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
		add := func(display, list, media string, variants []*string) {
			for _, v := range variants {
				if v == nil {
					continue
				}
				name := strings.TrimSpace(*v)
				words := wordsOf(strings.ToLower(name))
				key := strings.Join(words, " ")
				if len(words) == 0 || seen[key] || !specificEnough(words) {
					continue
				}
				seen[key] = true
				f.names = append(f.names, listName{title: display, words: words, list: list, media: media})
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
		listName := func(st *anilist.MediaListStatus, watching string) string {
			if st == nil {
				return ""
			}
			switch *st {
			case anilist.MediaListStatusCurrent, anilist.MediaListStatusRepeating:
				if current {
					return watching
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
		display := func(t interface {
			GetUserPreferred() *string
			GetRomaji() *string
			GetEnglish() *string
		}) string {
			for _, s := range []*string{t.GetUserPreferred(), t.GetRomaji(), t.GetEnglish()} {
				if s != nil && strings.TrimSpace(*s) != "" {
					return strings.TrimSpace(*s)
				}
			}
			return ""
		}
		if animeCol != nil && readAnime {
			if col := animeCol(); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					name := listName(l.GetStatus(), "Watching")
					if name == "" {
						continue
					}
					for _, e := range l.GetEntries() {
						m := e.GetMedia()
						if m == nil || m.Title == nil {
							continue
						}
						variants := append([]*string{m.Title.English, m.Title.Romaji, m.Title.Native, m.Title.UserPreferred}, m.GetSynonyms()...)
						add(display(m.Title), name, "anime", variants)
					}
				}
			}
		}
		if mangaCol != nil && readManga {
			if col := mangaCol(); col != nil {
				for _, l := range col.GetMediaListCollection().GetLists() {
					name := listName(l.GetStatus(), "Reading")
					if name == "" {
						continue
					}
					for _, e := range l.GetEntries() {
						m := e.GetMedia()
						if m == nil || m.Title == nil {
							continue
						}
						variants := append([]*string{m.Title.English, m.Title.Romaji, m.Title.Native, m.Title.UserPreferred}, m.GetSynonyms()...)
						add(display(m.Title), name, "manga", variants)
					}
				}
			}
		}
	}
	return f
}

// specificEnough applies minNameLen / minSingleWordNameLen. CJK names are judged by characters,
// since a two- or three-character native title is a full name.
func specificEnough(words []string) bool {
	joined := strings.Join(words, " ")
	if hasCJK(joined) {
		return utf8.RuneCountInString(strings.ReplaceAll(joined, " ", "")) >= 2
	}
	if utf8.RuneCountInString(joined) < minNameLen {
		return false
	}
	if len(words) == 1 && utf8.RuneCountInString(words[0]) < minSingleWordNameLen {
		return false
	}
	return true
}

func hasCJK(s string) bool {
	for _, r := range s {
		if unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) {
			return true
		}
	}
	return false
}

// Matches reports whether the item should become a notification for this profile.
func (f *NotifyFilter) Matches(item Item) bool {
	_, ok := f.Match(item)
	return ok
}

// Match reports whether the item should become a notification for this profile, and why.
//
// Lists mode looks for an exact name of something on the chosen lists, as whole words, in the
// headline first and then in the post. The longest name wins, so "Bleach: Thousand-Year Blood War"
// is reported over "Bleach" when both are on the list.
func (f *NotifyFilter) Match(item Item) (NotifyMatch, bool) {
	switch f.mode {
	case NotifyModeAll:
		return NotifyMatch{Mode: NotifyModeAll}, true
	case NotifyModeLists:
		for _, where := range []struct{ in, text string }{{"title", item.Title}, {"body", item.Description}} {
			if where.text == "" {
				continue
			}
			toks := tokenize(where.text)
			var best *listName
			var bestText string
			for i := range f.names {
				n := &f.names[i]
				if best != nil && len(n.words) <= len(best.words) {
					continue
				}
				if text, ok := findWords(where.text, toks, n.words); ok {
					best, bestText = n, text
				}
			}
			if best != nil {
				return NotifyMatch{Mode: NotifyModeLists, Title: best.title, List: best.list, Media: best.media, Text: bestText, In: where.in}, true
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

// token is one word of a text with its byte span, so a match can be cut out of the original.
type token struct {
	word       string // lower-cased
	start, end int
}

func isWordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

// tokenize splits text into words: runs of letters and digits, with their positions.
func tokenize(text string) []token {
	var toks []token
	start := -1
	for i, r := range text {
		if isWordRune(r) {
			if start < 0 {
				start = i
			}
			continue
		}
		if start >= 0 {
			toks = append(toks, token{word: strings.ToLower(text[start:i]), start: start, end: i})
			start = -1
		}
	}
	if start >= 0 {
		toks = append(toks, token{word: strings.ToLower(text[start:]), start: start, end: len(text)})
	}
	return toks
}

// wordsOf splits lower-cased text into words.
func wordsOf(s string) []string {
	toks := tokenize(s)
	out := make([]string, len(toks))
	for i, t := range toks {
		out[i] = t.word
	}
	return out
}

// findWords looks for needle as consecutive whole words in text and returns the matched span of
// the original text.
func findWords(text string, toks []token, needle []string) (string, bool) {
	if len(needle) == 0 || len(needle) > len(toks) {
		return "", false
	}
outer:
	for i := 0; i+len(needle) <= len(toks); i++ {
		for j, w := range needle {
			if toks[i+j].word != w {
				continue outer
			}
		}
		return text[toks[i].start:toks[i+len(needle)-1].end], true
	}
	return "", false
}
