package achievement

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
)

// Facts is everything the rules measure for one profile, built once per evaluation.
//
// The rules used to be fed whatever metadata the event that triggered them happened to carry, and
// most events carried almost none — which is how "watch 12 episodes in a day" became "watch 12
// episodes, ever", and how a third of the achievements could never unlock at all. Every rule now
// reads the same complete picture: the lists, the history of what was watched and read and when,
// and the profile's own social activity.
type Facts struct {
	Now   time.Time
	TZ    *time.Location
	Anime *side
	Manga *side

	FavoriteAnime int
	FavoriteManga int

	// CommentDays are the local days the profile commented, posted or replied on.
	CommentAnime int
	CommentManga int
	SocialDays   map[dayKey]bool

	Parties []partySession

	// Achievements is the profile's achievement rows, for the meta rules.
	Achievements []models.Achievement
	// AchievementXP is the XP the profile holds from achievements alone.
	AchievementXP int

	// LiveSessionHours is the continuous session measured from heartbeats right now.
	LiveAnimeSessionHours float64
	LiveMangaSessionHours float64
}

// side is one medium's half of the facts.
type side struct {
	anime   bool
	entries []*entry
	byID    map[int]*entry

	// consumption is one row per episode watched / chapter read, oldest first.
	consumption []logRow
	// completions is one row per series finished (log rows and AniList completion dates).
	completions []completion
	// scores is one row per score given or changed, oldest first.
	scores []logRow
	// statuses is one row per status change, oldest first.
	statuses []logRow
	// activeMinutes is the time spent per local day (heartbeats and per-episode minutes).
	activeMinutes map[dayKey]int
	// actions counts one-off app actions (random pick, …) by name.
	actions map[string]int
	// dayTotals adds the daily totals recorded before the log existed.
	dayTotals map[dayKey]int

	memo map[string]interface{}
}

type mediaInfo struct {
	id        int
	anime     bool
	format    string
	episodes  int
	chapters  int
	volumes   int
	duration  int
	genres    []string
	tags      []string
	season    string
	year      int
	startDate time.Time
	endDate   time.Time
	country   string
	meanScore int // 0-100
	status    string
	ex        *MediaExtras
}

type entry struct {
	m         *mediaInfo
	status    string
	score     float64 // 0-10
	progress  int
	repeat    int
	started   time.Time
	completed time.Time
}

type logRow struct {
	at      time.Time
	kind    string
	mediaID int
	number  int
	minutes int
	dayOnly bool
	data    map[string]interface{}
	m       *mediaInfo
}

type completion struct {
	at      time.Time
	m       *mediaInfo
	dayOnly bool
}

type partySession struct {
	start, end   time.Time
	host         bool
	peers        []string
	maxPeers     int
	chatMessages int
}

// dayKey is a local calendar day.
type dayKey struct {
	y int
	m time.Month
	d int
}

func dayOf(t time.Time) dayKey { y, m, d := t.Date(); return dayKey{y, m, d} }

func (k dayKey) time(loc *time.Location) time.Time {
	return time.Date(k.y, k.m, k.d, 12, 0, 0, 0, loc)
}

// Log kinds stored in AchievementLogEntry.Kind.
const (
	LogKindEpisode  = "episode"
	LogKindChapter  = "chapter"
	LogKindComplete = "complete"
	LogKindScore    = "score"
	LogKindStatus   = "status"
	LogKindActive   = "active" // minutes of active watching/reading (heartbeats), per flush
	LogKindParty    = "party"
	LogKindAction   = "action" // a one-off app action; Data {"action": name}
)

// ── Building ─────────────────────────────────────────────────────────────────────────────────

type factsInput struct {
	now           time.Time
	tz            *time.Location
	animeCol      *anilist.AnimeCollection
	mangaCol      *anilist.MangaCollection
	extras        map[int]*MediaExtras
	log           []models.AchievementLogEntry
	dailyTotals   []*models.ActivityLog
	favAnime      int
	favManga      int
	commentAnime  int
	commentManga  int
	socialTimes   []time.Time
	achievements  []models.Achievement
	achievementXP int
	liveAnimeHrs  float64
	liveMangaHrs  float64
}

func buildFacts(in *factsInput) *Facts {
	tz := in.tz
	if tz == nil {
		tz = time.Local
	}
	f := &Facts{
		Now:                   in.now.In(tz),
		TZ:                    tz,
		Anime:                 newSide(true),
		Manga:                 newSide(false),
		FavoriteAnime:         in.favAnime,
		FavoriteManga:         in.favManga,
		CommentAnime:          in.commentAnime,
		CommentManga:          in.commentManga,
		SocialDays:            map[dayKey]bool{},
		Achievements:          in.achievements,
		AchievementXP:         in.achievementXP,
		LiveAnimeSessionHours: in.liveAnimeHrs,
		LiveMangaSessionHours: in.liveMangaHrs,
	}

	// Lists
	if in.animeCol != nil {
		for _, l := range in.animeCol.GetMediaListCollection().GetLists() {
			for _, e := range l.GetEntries() {
				if e == nil || e.GetMedia() == nil {
					continue
				}
				m := animeInfo(e.GetMedia(), in.extras)
				f.Anime.add(&entry{
					m:         m,
					status:    statusString(e.GetStatus()),
					score:     scoreOf(e.GetScore()),
					progress:  intOf(e.GetProgress()),
					repeat:    intOf(e.GetRepeat()),
					started:   fuzzy(e.GetStartedAt().GetYear(), e.GetStartedAt().GetMonth(), e.GetStartedAt().GetDay(), tz),
					completed: fuzzy(e.GetCompletedAt().GetYear(), e.GetCompletedAt().GetMonth(), e.GetCompletedAt().GetDay(), tz),
				})
			}
		}
	}
	if in.mangaCol != nil {
		for _, l := range in.mangaCol.GetMediaListCollection().GetLists() {
			for _, e := range l.GetEntries() {
				if e == nil || e.GetMedia() == nil {
					continue
				}
				m := mangaInfo(e.GetMedia(), in.extras)
				f.Manga.add(&entry{
					m:         m,
					status:    statusString(e.GetStatus()),
					score:     scoreOf(e.GetScore()),
					progress:  intOf(e.GetProgress()),
					repeat:    intOf(e.GetRepeat()),
					started:   fuzzy(e.GetStartedAt().GetYear(), e.GetStartedAt().GetMonth(), e.GetStartedAt().GetDay(), tz),
					completed: fuzzy(e.GetCompletedAt().GetYear(), e.GetCompletedAt().GetMonth(), e.GetCompletedAt().GetDay(), tz),
				})
			}
		}
	}

	// History
	for _, r := range in.log {
		row := logRow{
			at:      time.Unix(r.At, 0).In(tz),
			kind:    r.Kind,
			mediaID: r.MediaID,
			number:  r.Number,
			minutes: r.Minutes,
			dayOnly: r.DayOnly,
		}
		if r.Data != "" {
			_ = json.Unmarshal([]byte(r.Data), &row.data)
		}
		var s *side
		switch r.MediaType {
		case "anime":
			s = f.Anime
		case "manga":
			s = f.Manga
		}
		if r.Kind == LogKindParty {
			f.Parties = append(f.Parties, partyFromRow(row))
			continue
		}
		if s == nil {
			continue
		}
		if e := s.byID[r.MediaID]; e != nil {
			row.m = e.m
		} else if ex := in.extras[r.MediaID]; ex != nil {
			row.m = &mediaInfo{id: r.MediaID, anime: s.anime, ex: ex}
		}
		switch r.Kind {
		case LogKindEpisode, LogKindChapter:
			s.consumption = append(s.consumption, row)
			if !row.dayOnly {
				m := row.minutes
				if m <= 0 {
					if s.anime {
						m = 24
					} else {
						m = 7
					}
				}
				s.activeMinutes[dayOf(row.at)] += m
			}
		case LogKindComplete:
			s.completions = append(s.completions, completion{at: row.at, m: row.m, dayOnly: row.dayOnly})
		case LogKindScore:
			s.scores = append(s.scores, row)
		case LogKindStatus:
			s.statuses = append(s.statuses, row)
		case LogKindActive:
			s.activeMinutes[dayOf(row.at)] += row.minutes
		case LogKindAction:
			if name, ok := row.data["action"].(string); ok {
				s.actions[name]++
			}
		}
	}

	// Days recorded before the log existed only have totals; they count for day-level rules.
	for _, d := range in.dailyTotals {
		t, err := time.ParseInLocation("2006-01-02", d.Date, tz)
		if err != nil {
			continue
		}
		k := dayOf(t)
		if d.AnimeEpisodes > 0 {
			f.Anime.dayTotals[k] = d.AnimeEpisodes
		}
		if d.MangaChapters > 0 {
			f.Manga.dayTotals[k] = d.MangaChapters
		}
		if d.AnimeMinutes > 0 && f.Anime.activeMinutes[k] < d.AnimeMinutes {
			f.Anime.activeMinutes[k] = d.AnimeMinutes
		}
		if d.MangaMinutes > 0 && f.Manga.activeMinutes[k] < d.MangaMinutes {
			f.Manga.activeMinutes[k] = d.MangaMinutes
		}
	}

	// Completion dates AniList knows about count as completions too (day precision), so the
	// history of finishing things is not limited to what happened since the log began.
	for _, s := range []*side{f.Anime, f.Manga} {
		seen := map[int]map[dayKey]bool{}
		for _, c := range s.completions {
			if c.m == nil {
				continue
			}
			if seen[c.m.id] == nil {
				seen[c.m.id] = map[dayKey]bool{}
			}
			seen[c.m.id][dayOf(c.at)] = true
		}
		for _, e := range s.entries {
			if e.completed.IsZero() || (e.status != "COMPLETED" && e.status != "REPEATING") {
				continue
			}
			if seen[e.m.id][dayOf(e.completed)] {
				continue
			}
			s.completions = append(s.completions, completion{at: e.completed, m: e.m, dayOnly: true})
		}
		sort.SliceStable(s.completions, func(i, j int) bool { return s.completions[i].at.Before(s.completions[j].at) })
	}

	for _, t := range in.socialTimes {
		f.SocialDays[dayOf(t.In(tz))] = true
	}
	for _, p := range f.Parties {
		f.SocialDays[dayOf(p.start)] = true
	}

	return f
}

func newSide(anime bool) *side {
	return &side{
		anime:         anime,
		byID:          map[int]*entry{},
		activeMinutes: map[dayKey]int{},
		actions:       map[string]int{},
		dayTotals:     map[dayKey]int{},
		memo:          map[string]interface{}{},
	}
}

func (s *side) add(e *entry) {
	if _, dup := s.byID[e.m.id]; dup {
		return
	}
	s.entries = append(s.entries, e)
	s.byID[e.m.id] = e
}

func partyFromRow(r logRow) partySession {
	p := partySession{start: r.at, end: r.at.Add(time.Duration(r.minutes) * time.Minute)}
	if r.data != nil {
		p.host, _ = r.data["host"].(bool)
		if v, ok := r.data["maxPeers"].(float64); ok {
			p.maxPeers = int(v)
		}
		if v, ok := r.data["chatMessages"].(float64); ok {
			p.chatMessages = int(v)
		}
		if arr, ok := r.data["peers"].([]interface{}); ok {
			for _, x := range arr {
				if s, ok := x.(string); ok && s != "" {
					p.peers = append(p.peers, s)
				}
			}
		}
	}
	return p
}

func animeInfo(m *anilist.BaseAnime, extras map[int]*MediaExtras) *mediaInfo {
	info := &mediaInfo{
		id:        m.GetID(),
		anime:     true,
		format:    formatString(m.GetFormat()),
		episodes:  intOf(m.GetEpisodes()),
		duration:  intOf(m.GetDuration()),
		genres:    strs(m.GetGenres()),
		country:   strOf(m.GetCountryOfOrigin()),
		meanScore: intOf(m.GetMeanScore()),
		ex:        extras[m.GetID()],
	}
	if s := m.GetSeason(); s != nil {
		info.season = string(*s)
	}
	if st := m.GetStatus(); st != nil {
		info.status = string(*st)
	}
	for _, t := range m.GetTags() {
		if t != nil && (t.Rank == nil || *t.Rank >= 50) {
			info.tags = append(info.tags, t.Name)
		}
	}
	if sd := m.GetStartDate(); sd != nil {
		info.startDate = fuzzy(sd.Year, sd.Month, sd.Day, time.UTC)
	}
	if ed := m.GetEndDate(); ed != nil {
		info.endDate = fuzzy(ed.Year, ed.Month, ed.Day, time.UTC)
	}
	info.year = intOf(m.GetSeasonYear())
	if info.year == 0 && !info.startDate.IsZero() {
		info.year = info.startDate.Year()
	}
	return info
}

func mangaInfo(m *anilist.BaseManga, extras map[int]*MediaExtras) *mediaInfo {
	info := &mediaInfo{
		id:        m.GetID(),
		anime:     false,
		format:    formatString(m.GetFormat()),
		chapters:  intOf(m.GetChapters()),
		volumes:   intOf(m.GetVolumes()),
		genres:    strs(m.GetGenres()),
		country:   strOf(m.GetCountryOfOrigin()),
		meanScore: intOf(m.GetMeanScore()),
		ex:        extras[m.GetID()],
	}
	if st := m.GetStatus(); st != nil {
		info.status = string(*st)
	}
	for _, t := range m.GetTags() {
		if t != nil && (t.Rank == nil || *t.Rank >= 50) {
			info.tags = append(info.tags, t.Name)
		}
	}
	if sd := m.GetStartDate(); sd != nil {
		info.startDate = fuzzy(sd.Year, sd.Month, sd.Day, time.UTC)
		info.year = intOf(sd.Year)
	}
	if ed := m.GetEndDate(); ed != nil {
		info.endDate = fuzzy(ed.Year, ed.Month, ed.Day, time.UTC)
	}
	return info
}

// ── Small helpers ────────────────────────────────────────────────────────────────────────────

func intOf(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func strOf(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func strs(in []*string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s != nil && *s != "" {
			out = append(out, *s)
		}
	}
	return out
}

func statusString(s *anilist.MediaListStatus) string {
	if s == nil {
		return ""
	}
	return string(*s)
}

func formatString(f *anilist.MediaFormat) string {
	if f == nil {
		return ""
	}
	return string(*f)
}

// scoreOf converts a POINT_100 list score to the 10-point scale the descriptions use.
func scoreOf(p *float64) float64 {
	if p == nil || *p <= 0 {
		return 0
	}
	return *p / 10
}

func fuzzy(y, m, d *int, loc *time.Location) time.Time {
	if y == nil || *y <= 0 {
		return time.Time{}
	}
	month, day := 1, 1
	if m != nil && *m > 0 {
		month = *m
	}
	if d != nil && *d > 0 {
		day = *d
	}
	return time.Date(*y, time.Month(month), day, 12, 0, 0, 0, loc)
}

func (m *mediaInfo) hasGenre(g string) bool {
	if m == nil {
		return false
	}
	for _, x := range m.genres {
		if strings.EqualFold(x, g) {
			return true
		}
	}
	return false
}

func (m *mediaInfo) hasTag(t string) bool {
	if m == nil {
		return false
	}
	for _, x := range m.tags {
		if strings.EqualFold(x, t) {
			return true
		}
	}
	return false
}

func (m *mediaInfo) hasGenreOrTag(name string) bool { return m.hasGenre(name) || m.hasTag(name) }
