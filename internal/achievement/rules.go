package achievement

import (
	"strconv"
	"strings"
	"time"
)

// A rule measures one achievement: it returns the value its tier thresholds are compared with (a
// count, hours, days in a row…). One-time achievements return 1 when met and 0 otherwise.
//
// Every definition has exactly one rule (rules_coverage_test.go), so nothing can silently go
// unmeasured again.
type rule func(f *Facts) float64

var rules = map[string]rule{}

func reg(key string, r rule) {
	if _, dup := rules[key]; dup {
		panic("achievement: duplicate rule " + key)
	}
	rules[key] = r
}

// canLapse marks achievements whose condition can stop being true for a legitimate reason (an
// exact count you have since passed, a list that was clean). Re-checking old unlocks never revokes
// these: that they are false now says nothing about whether they were true when unlocked.
var canLapse = map[string]bool{}

func lapsing(keys ...string) {
	for _, k := range keys {
		canLapse[k] = true
	}
}

// monotonic marks achievements measured from something that is only known while it happens (a
// live heartbeat session): the stored progress keeps its best value instead of following the
// current one.
var monotonic = map[string]bool{"a_non_stop": true, "m_non_stop_reading": true}

type sel func(f *Facts) *side

func A(f *Facts) *side { return f.Anime }
func M(f *Facts) *side { return f.Manga }

// units is a series' length in episodes (anime) or chapters (manga).
func (m *mediaInfo) units() int {
	if m == nil {
		return 0
	}
	if m.anime {
		return m.episodes
	}
	return m.chapters
}

// consumed is how many episodes/chapters the entry accounts for, rewatches included.
func (e *entry) consumed() int {
	n := e.progress
	if e.repeat > 0 && e.m.units() > 0 {
		n += e.repeat * e.m.units()
	}
	return n
}

func (s *side) totalUnits() int {
	n := 0
	for _, e := range s.entries {
		n += e.consumed()
	}
	// Logged rows of series no longer on the list still happened.
	if logged := len(s.consumption); logged > n {
		n = logged
	}
	return n
}

// ── Rule builders ────────────────────────────────────────────────────────────────────────────

func seenWith(sd sel, pred func(m *mediaInfo) bool) rule {
	return func(f *Facts) float64 {
		return float64(sd(f).count(func(e *entry) bool { return e.seen() && pred(e.m) }))
	}
}

func doneWith(sd sel, pred func(m *mediaInfo) bool) rule {
	return func(f *Facts) float64 {
		return float64(sd(f).count(func(e *entry) bool { return e.done() && pred(e.m) }))
	}
}

func anySeen(sd sel, pred func(m *mediaInfo) bool) rule {
	return func(f *Facts) float64 { return b2f(seenWith(sd, pred)(f) > 0) }
}

func atLeast(r rule, n float64) rule {
	return func(f *Facts) float64 { return b2f(r(f) >= n) }
}

func genre(g string) func(m *mediaInfo) bool { return func(m *mediaInfo) bool { return m.hasGenre(g) } }

func tagAny(names ...string) func(m *mediaInfo) bool {
	return func(m *mediaInfo) bool {
		for _, n := range names {
			if m.hasTag(n) {
				return true
			}
		}
		return false
	}
}

func format(fs ...string) func(m *mediaInfo) bool {
	return func(m *mediaInfo) bool {
		for _, x := range fs {
			if m != nil && m.format == x {
				return true
			}
		}
		return false
	}
}

func source(src string) func(m *mediaInfo) bool {
	return func(m *mediaInfo) bool { return m != nil && m.ex != nil && m.ex.Source == src }
}

func yearIn(from, to int) func(m *mediaInfo) bool {
	return func(m *mediaInfo) bool { return m != nil && m.year >= from && m.year <= to }
}

func genresOf(e *entry) []string { return e.m.genres }

func tagsOf(e *entry) []string { return e.m.tags }

func decadeOf(e *entry) []string {
	if e.m.year <= 0 {
		return nil
	}
	return []string{itoa(e.m.year / 10)}
}

func yearOf(e *entry) []string {
	if e.m.year <= 0 {
		return nil
	}
	return []string{itoa(e.m.year)}
}

func seasonOf(e *entry) []string {
	if e.m.season == "" || e.m.year <= 0 {
		return nil
	}
	return []string{e.m.season + itoa(e.m.year)}
}

func studiosOf(e *entry) []string {
	if e.m.ex == nil {
		return nil
	}
	out := make([]string, 0, len(e.m.ex.Studios))
	for _, id := range e.m.ex.Studios {
		out = append(out, itoa(id))
	}
	return out
}

func staffWhere(pred func(role string) bool) func(e *entry) []string {
	return func(e *entry) []string {
		if e.m.ex == nil {
			return nil
		}
		set := map[string]bool{}
		for _, s := range e.m.ex.Staff {
			if pred(s.Role) {
				set[itoa(s.ID)] = true
			}
		}
		out := make([]string, 0, len(set))
		for k := range set {
			out = append(out, k)
		}
		return out
	}
}

func isDirector(role string) bool {
	r := strings.ToLower(role)
	return (r == "director" || strings.Contains(r, "chief director") || strings.Contains(r, "series director")) && !strings.Contains(r, "assistant")
}

func isAuthor(role string) bool {
	r := strings.ToLower(role)
	return strings.Contains(r, "story") || strings.Contains(r, "original creator") || strings.Contains(r, "original story")
}

func isArtist(role string) bool {
	r := strings.ToLower(role)
	return strings.Contains(r, "art") && !strings.Contains(r, "assistant") && !strings.Contains(r, "cover")
}

func isOriginalCreator(role string) bool {
	return strings.Contains(strings.ToLower(role), "original creator")
}

func voiceActorsOf(e *entry) []string {
	if e.m.ex == nil {
		return nil
	}
	out := make([]string, 0, len(e.m.ex.VoiceActors))
	for _, id := range e.m.ex.VoiceActors {
		out = append(out, itoa(id))
	}
	return out
}

func itoa(n int) string { return strconv.Itoa(n) }

// ── Franchises ───────────────────────────────────────────────────────────────────────────────

// franchises groups list entries of one side connected by the given relation types. Members the
// relations point at that are not on the list are counted in missing.
type franchise struct {
	members []*entry
	missing int
}

func (s *side) franchises(types map[string]bool, sameFormats map[string]bool) []franchise {
	parent := map[int]int{}
	var find func(int) int
	find = func(x int) int {
		if parent[x] != x {
			parent[x] = find(parent[x])
		}
		return parent[x]
	}
	union := func(a, b int) {
		ra, rb := find(a), find(b)
		if ra != rb {
			parent[ra] = rb
		}
	}
	for _, e := range s.entries {
		if sameFormats == nil || sameFormats[e.m.format] {
			parent[e.m.id] = e.m.id
		}
	}
	missingOf := map[int]map[int]bool{}
	for _, e := range s.entries {
		if _, ok := parent[e.m.id]; !ok || e.m.ex == nil {
			continue
		}
		for _, r := range e.m.ex.Relations {
			if !types[r.Type] || r.Anime != s.anime || (sameFormats != nil && !sameFormats[r.Format]) {
				continue
			}
			if _, onList := parent[r.ID]; onList {
				union(e.m.id, r.ID)
			} else {
				if missingOf[e.m.id] == nil {
					missingOf[e.m.id] = map[int]bool{}
				}
				missingOf[e.m.id][r.ID] = true
			}
		}
	}
	groups := map[int]*franchise{}
	missing := map[int]map[int]bool{}
	for _, e := range s.entries {
		if _, ok := parent[e.m.id]; !ok {
			continue
		}
		root := find(e.m.id)
		if groups[root] == nil {
			groups[root] = &franchise{}
			missing[root] = map[int]bool{}
		}
		groups[root].members = append(groups[root].members, e)
		for id := range missingOf[e.m.id] {
			missing[root][id] = true
		}
	}
	out := make([]franchise, 0, len(groups))
	for root, g := range groups {
		g.missing = len(missing[root])
		out = append(out, *g)
	}
	return out
}

var sequelLinks = map[string]bool{"SEQUEL": true, "PREQUEL": true}
var franchiseLinks = map[string]bool{"SEQUEL": true, "PREQUEL": true, "SIDE_STORY": true, "SPIN_OFF": true, "PARENT": true, "ALTERNATIVE": true, "SUMMARY": true}
var seasonFormats = map[string]bool{"TV": true, "TV_SHORT": true, "ONA": true}

func allDone(fr franchise) bool {
	if fr.missing > 0 || len(fr.members) == 0 {
		return false
	}
	for _, e := range fr.members {
		if !e.done() {
			return false
		}
	}
	return true
}

// ── Holidays ─────────────────────────────────────────────────────────────────────────────────

type holiday struct {
	name string
	on   func(y int, loc *time.Location) time.Time
}

func fixed(m time.Month, d int) func(int, *time.Location) time.Time {
	return func(y int, loc *time.Location) time.Time { return time.Date(y, m, d, 12, 0, 0, 0, loc) }
}

// nthWeekday is the nth given weekday of a month (n from 1).
func nthWeekday(m time.Month, wd time.Weekday, n int) func(int, *time.Location) time.Time {
	return func(y int, loc *time.Location) time.Time {
		t := time.Date(y, m, 1, 12, 0, 0, 0, loc)
		for t.Weekday() != wd {
			t = t.AddDate(0, 0, 1)
		}
		return t.AddDate(0, 0, 7*(n-1))
	}
}

// recognizedHolidays are the holidays the holiday achievements count, in calendar order.
var recognizedHolidays = []holiday{
	{"new_year", fixed(time.January, 1)},
	{"valentines", fixed(time.February, 14)},
	{"pi_day", fixed(time.March, 14)},
	{"spring_equinox", fixed(time.March, 20)},
	{"april_fools", fixed(time.April, 1)},
	{"anime_day", fixed(time.April, 15)},
	{"earth_day", fixed(time.April, 22)},
	{"star_wars_day", fixed(time.May, 4)},
	{"free_comic_day", nthWeekday(time.May, time.Saturday, 1)},
	{"summer_solstice", fixed(time.June, 21)},
	{"independence_day", fixed(time.July, 4)},
	{"tanabata", fixed(time.July, 7)},
	{"labor_day", nthWeekday(time.September, time.Monday, 1)},
	{"manga_day", fixed(time.September, 21)},
	{"halloween", fixed(time.October, 31)},
	{"culture_day", fixed(time.November, 3)},
	{"thanksgiving", nthWeekday(time.November, time.Thursday, 4)},
	{"winter_solstice", fixed(time.December, 21)},
	{"christmas_eve", fixed(time.December, 24)},
	{"christmas", fixed(time.December, 25)},
	{"new_years_eve", fixed(time.December, 31)},
}

func holidayByName(name string) holiday {
	for _, h := range recognizedHolidays {
		if h.name == name {
			return h
		}
	}
	panic("achievement: unknown holiday " + name)
}

// yearsActive is every year the side has activity in, so holiday checks only look where it matters.
func (s *side) yearsActive() []int {
	set := map[int]bool{}
	for k := range s.perDay() {
		set[k.y] = true
	}
	out := make([]int, 0, len(set))
	for y := range set {
		out = append(out, y)
	}
	return out
}

// onHoliday reports whether the side was active on the holiday in any year, optionally only with
// media satisfying pred, and with at least min episodes/chapters that day.
func onHoliday(sd sel, name string, pred func(m *mediaInfo) bool, min int) rule {
	h := holidayByName(name)
	return func(f *Facts) float64 {
		s := sd(f)
		for _, y := range s.yearsActive() {
			k := dayOf(h.on(y, f.TZ))
			if !onDay(s, k, pred, min) {
				continue
			}
			return 1
		}
		return 0
	}
}

func onDay(s *side, k dayKey, pred func(m *mediaInfo) bool, min int) bool {
	if min < 1 {
		min = 1
	}
	if pred == nil {
		return s.perDay()[k] >= min
	}
	n := 0
	for _, r := range s.consumption {
		if dayOf(r.at) == k && pred(r.m) {
			n++
		}
	}
	return n >= min
}

// onDate is onHoliday for a plain month/day.
func onDate(sd sel, m time.Month, d int, pred func(m *mediaInfo) bool) rule {
	return func(f *Facts) float64 {
		s := sd(f)
		for _, y := range s.yearsActive() {
			if onDay(s, dayKey{y, m, d}, pred, 1) {
				return 1
			}
		}
		return 0
	}
}

// holidaysActive returns, per year, which recognized holidays the side was active on.
func (s *side) holidaysActive(loc *time.Location) map[int]map[string]bool {
	out := map[int]map[string]bool{}
	days := s.activeDays()
	for _, y := range s.yearsActive() {
		for _, h := range recognizedHolidays {
			if days[dayOf(h.on(y, loc))] {
				if out[y] == nil {
					out[y] = map[string]bool{}
				}
				out[y][h.name] = true
			}
		}
	}
	return out
}

// longestHolidayRun is the most recognized holidays in a row (in calendar order, across years)
// with activity on each.
func (s *side) longestHolidayRun(loc *time.Location) int {
	years := s.yearsActive()
	if len(years) == 0 {
		return 0
	}
	minY, maxY := years[0], years[0]
	for _, y := range years {
		if y < minY {
			minY = y
		}
		if y > maxY {
			maxY = y
		}
	}
	days := s.activeDays()
	best, run := 0, 0
	for y := minY; y <= maxY; y++ {
		for _, h := range recognizedHolidays {
			t := h.on(y, loc)
			if t.After(time.Now().In(loc)) {
				break
			}
			if days[dayOf(t)] {
				run++
				if run > best {
					best = run
				}
			} else {
				run = 0
			}
		}
	}
	return best
}
