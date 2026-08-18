package anilist

type MangaList = MangaCollection_MediaListCollection_Lists
type MangaListEntry = MangaCollection_MediaListCollection_Lists_Entries

func (ac *MangaCollection) GetListEntryFromMangaId(id int) (*MangaListEntry, bool) {

	if ac == nil || ac.MediaListCollection == nil {
		return nil, false
	}

	var entry *MangaCollection_MediaListCollection_Lists_Entries
	for _, l := range ac.MediaListCollection.Lists {
		if l.Entries == nil || len(l.Entries) == 0 {
			continue
		}
		for _, e := range l.Entries {
			if e.Media.ID == id {
				entry = e
				break
			}
		}
	}
	if entry == nil {
		return nil, false
	}

	return entry, true
}

func (m *BaseManga) GetTitleSafe() string {
	if m.GetTitle().GetEnglish() != nil {
		return *m.GetTitle().GetEnglish()
	}
	if m.GetTitle().GetRomaji() != nil {
		return *m.GetTitle().GetRomaji()
	}
	return "N/A"
}
func (m *BaseManga) GetRomajiTitleSafe() string {
	if m.GetTitle().GetRomaji() != nil {
		return *m.GetTitle().GetRomaji()
	}
	if m.GetTitle().GetEnglish() != nil {
		return *m.GetTitle().GetEnglish()
	}
	return "N/A"
}

func (m *BaseManga) GetPreferredTitle() string {
	if m.GetTitle().GetUserPreferred() != nil {
		return *m.GetTitle().GetUserPreferred()
	}
	return m.GetTitleSafe()
}

func (m *BaseManga) GetCoverImageSafe() string {
	if m.GetCoverImage().GetExtraLarge() != nil {
		return *m.GetCoverImage().GetExtraLarge()
	}
	if m.GetCoverImage().GetLarge() != nil {
		return *m.GetCoverImage().GetLarge()
	}
	if m.GetBannerImage() != nil {
		return *m.GetBannerImage()
	}
	return ""
}
func (m *BaseManga) GetBannerImageSafe() string {
	if m.GetBannerImage() != nil {
		return *m.GetBannerImage()
	}
	return m.GetCoverImageSafe()
}

func (m *BaseManga) GetAllTitles() []*string {
	titles := make([]*string, 0)
	if m.HasRomajiTitle() {
		titles = append(titles, m.Title.Romaji)
	}
	if m.HasEnglishTitle() {
		titles = append(titles, m.Title.English)
	}
	// Include native title for better matching
	if m.Title != nil && m.Title.Native != nil {
		titles = append(titles, m.Title.Native)
	}
	// Include all synonyms (removed > 1 restriction)
	if m.HasSynonyms() && len(m.Synonyms) > 0 {
		titles = append(titles, m.Synonyms...)
	}
	return titles
}

func (m *BaseManga) GetMainTitlesDeref() []string {
	titles := make([]string, 0)
	if m.HasRomajiTitle() {
		titles = append(titles, *m.Title.Romaji)
	}
	if m.HasEnglishTitle() {
		titles = append(titles, *m.Title.English)
	}
	return titles
}

func (m *BaseManga) HasEnglishTitle() bool {
	return m.Title.English != nil
}
func (m *BaseManga) HasRomajiTitle() bool {
	return m.Title.Romaji != nil
}
func (m *BaseManga) HasSynonyms() bool {
	return m.Synonyms != nil
}

func (m *BaseManga) GetStartYearSafe() int {
	if m.GetStartDate() != nil && m.GetStartDate().GetYear() != nil {
		return *m.GetStartDate().GetYear()
	}
	return 0
}

func (m *MangaListEntry) GetRepeatSafe() int {
	if m.Repeat == nil {
		return 0
	}
	return *m.Repeat
}

// AniList sends progress and score as null, not zero, for a list entry that has neither set — which
// is every entry the moment it is added to a list and until something is recorded against it.
//
// The manga code read both by dereferencing the pointer. A single such entry anywhere in the
// collection panicked the request that was building it, so the whole collection or the whole entry
// page came back as an error, and the screen fell back to showing the media with no list data at
// all: no status, no dates, no rating, and an "add to list" button on a series that was already on
// the list. The anime side has had GetProgressSafe and GetScoreSafe for exactly this reason and the
// manga side was simply never given them.

func (m *MangaListEntry) GetProgressSafe() int {
	if m == nil || m.Progress == nil {
		return 0
	}
	return *m.Progress
}

func (m *MangaListEntry) GetScoreSafe() float64 {
	if m == nil || m.Score == nil {
		return 0
	}
	return *m.Score
}
