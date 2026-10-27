package achievement

import (
	"math"
	"sort"
	"time"
)

// The building blocks the rules are made of. Each measures one kind of thing over a side's history
// or list, and is tested on its own (measure_test.go).

// ── Consumption by calendar period ───────────────────────────────────────────────────────────

// perDay is episodes (or chapters) per local day: logged rows, plus the daily totals of days from
// before the log, whichever is larger.
func (s *side) perDay() map[dayKey]int {
	if v, ok := s.memo["perDay"].(map[dayKey]int); ok {
		return v
	}
	out := map[dayKey]int{}
	for _, r := range s.consumption {
		out[dayOf(r.at)]++
	}
	for k, n := range s.dayTotals {
		if n > out[k] {
			out[k] = n
		}
	}
	s.memo["perDay"] = out
	return out
}

func (s *side) activeDays() map[dayKey]bool {
	out := map[dayKey]bool{}
	for k, n := range s.perDay() {
		if n > 0 {
			out[k] = true
		}
	}
	return out
}

func maxValue(m map[dayKey]int) int {
	best := 0
	for _, n := range m {
		if n > best {
			best = n
		}
	}
	return best
}

// maxPerDay is the most in a single local day.
func (s *side) maxPerDay() int { return maxValue(s.perDay()) }

// weekendKey identifies a Saturday–Sunday pair by its Saturday.
func weekendKey(k dayKey, loc *time.Location) (dayKey, bool) {
	t := k.time(loc)
	switch t.Weekday() {
	case time.Saturday:
		return k, true
	case time.Sunday:
		return dayOf(t.AddDate(0, 0, -1)), true
	}
	return dayKey{}, false
}

// weekKey identifies an ISO week.
type weekKey struct{ y, w int }

func weekOf(k dayKey, loc *time.Location) weekKey {
	y, w := k.time(loc).ISOWeek()
	return weekKey{y, w}
}

type monthKey struct {
	y int
	m time.Month
}

func (s *side) sumBy(group func(dayKey) (interface{}, bool), pred func(dayKey) bool) map[interface{}]int {
	out := map[interface{}]int{}
	for k, n := range s.perDay() {
		if pred != nil && !pred(k) {
			continue
		}
		if g, ok := group(k); ok {
			out[g] += n
		}
	}
	return out
}

func maxOf(m map[interface{}]int) int {
	best := 0
	for _, n := range m {
		if n > best {
			best = n
		}
	}
	return best
}

func (s *side) maxPerWeekend(loc *time.Location) int {
	return maxOf(s.sumBy(func(k dayKey) (interface{}, bool) { return weekendKey(k, loc) }, nil))
}

func (s *side) maxPerWeek(loc *time.Location) int {
	return maxOf(s.sumBy(func(k dayKey) (interface{}, bool) { return weekOf(k, loc), true }, nil))
}

func (s *side) maxPerMonth() int {
	return maxOf(s.sumBy(func(k dayKey) (interface{}, bool) { return monthKey{k.y, k.m}, true }, nil))
}

// totalOnDays sums consumption over the days that satisfy pred (weekends, weekdays, a holiday).
func (s *side) totalOnDays(pred func(dayKey) bool) int {
	n := 0
	for k, c := range s.perDay() {
		if pred(k) {
			n += c
		}
	}
	return n
}

// distinctMediaPerDay is the most different series touched in one day.
func (s *side) maxDistinctMediaPerDay() int {
	per := map[dayKey]map[int]bool{}
	for _, r := range s.consumption {
		k := dayOf(r.at)
		if per[k] == nil {
			per[k] = map[int]bool{}
		}
		per[k][r.mediaID] = true
	}
	best := 0
	for _, m := range per {
		if len(m) > best {
			best = len(m)
		}
	}
	return best
}

// ── Time of day ──────────────────────────────────────────────────────────────────────────────

// inHours reports whether t falls in [from, to) local hours; a window may cross midnight.
func inHours(t time.Time, from, to int) bool {
	h := t.Hour()
	if from <= to {
		return h >= from && h < to
	}
	return h >= from || h < to
}

// countWhere counts consumption rows (with a known time of day) that satisfy pred.
func (s *side) countWhere(pred func(r logRow) bool) int {
	n := 0
	for _, r := range s.consumption {
		if !r.dayOnly && pred(r) {
			n++
		}
	}
	return n
}

func (s *side) countInHours(from, to int) int {
	return s.countWhere(func(r logRow) bool { return inHours(r.at, from, to) })
}

// distinctDaysWhere counts local days with at least one row satisfying pred.
func (s *side) distinctDaysWhere(pred func(r logRow) bool) map[dayKey]bool {
	out := map[dayKey]bool{}
	for _, r := range s.consumption {
		if !r.dayOnly && pred(r) {
			out[dayOf(r.at)] = true
		}
	}
	return out
}

func (s *side) distinctHours() int {
	h := map[int]bool{}
	for _, r := range s.consumption {
		if !r.dayOnly {
			h[r.at.Hour()] = true
		}
	}
	return len(h)
}

// ── Streaks ──────────────────────────────────────────────────────────────────────────────────

// longestDayRun is the longest run of consecutive local days in the set.
func longestDayRun(days map[dayKey]bool, loc *time.Location) int {
	if len(days) == 0 {
		return 0
	}
	list := make([]time.Time, 0, len(days))
	for k := range days {
		list = append(list, k.time(loc))
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Before(list[j]) })
	best, run := 1, 1
	for i := 1; i < len(list); i++ {
		if dayOf(list[i-1].AddDate(0, 0, 1)) == dayOf(list[i]) {
			run++
		} else {
			run = 1
		}
		if run > best {
			best = run
		}
	}
	return best
}

// dayRuns returns every maximal run of consecutive days, in order.
func dayRuns(days map[dayKey]bool, loc *time.Location) []int {
	if len(days) == 0 {
		return nil
	}
	list := make([]time.Time, 0, len(days))
	for k := range days {
		list = append(list, k.time(loc))
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Before(list[j]) })
	runs := []int{1}
	for i := 1; i < len(list); i++ {
		if dayOf(list[i-1].AddDate(0, 0, 1)) == dayOf(list[i]) {
			runs[len(runs)-1]++
		} else {
			runs = append(runs, 1)
		}
	}
	return runs
}

// longestWeekRun is the longest run of consecutive ISO weeks containing an active day.
func longestWeekRun(days map[dayKey]bool, loc *time.Location) int {
	weeks := map[time.Time]bool{}
	for k := range days {
		t := k.time(loc)
		// Monday of that week
		off := (int(t.Weekday()) + 6) % 7
		weeks[dayOf(t.AddDate(0, 0, -off)).time(loc)] = true
	}
	return longestStepRun(weeks, func(t time.Time) time.Time { return t.AddDate(0, 0, 7) })
}

// longestWeekendRun is the longest run of consecutive weekends with activity on Saturday or Sunday.
func longestWeekendRun(days map[dayKey]bool, loc *time.Location) int {
	wk := map[time.Time]bool{}
	for k := range days {
		if sat, ok := weekendKey(k, loc); ok {
			wk[sat.time(loc)] = true
		}
	}
	return longestStepRun(wk, func(t time.Time) time.Time { return t.AddDate(0, 0, 7) })
}

// longestMonthRun is the longest run of consecutive calendar months with activity.
func longestMonthRun(days map[dayKey]bool, loc *time.Location) int {
	months := map[time.Time]bool{}
	for k := range days {
		months[time.Date(k.y, k.m, 1, 12, 0, 0, 0, loc)] = true
	}
	return longestStepRun(months, func(t time.Time) time.Time { return t.AddDate(0, 1, 0) })
}

func longestStepRun(set map[time.Time]bool, next func(time.Time) time.Time) int {
	if len(set) == 0 {
		return 0
	}
	list := make([]time.Time, 0, len(set))
	for t := range set {
		list = append(list, t)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Before(list[j]) })
	best, run := 1, 1
	for i := 1; i < len(list); i++ {
		if dayOf(next(list[i-1])) == dayOf(list[i]) {
			run++
		} else {
			run = 1
		}
		if run > best {
			best = run
		}
	}
	return best
}

// daysWithAtLeast is the set of days with at least n episodes/chapters.
func (s *side) daysWithAtLeast(n int) map[dayKey]bool {
	out := map[dayKey]bool{}
	for k, c := range s.perDay() {
		if c >= n {
			out[k] = true
		}
	}
	return out
}

// longestGap is the longest break between two active days, in days.
func longestGap(days map[dayKey]bool, loc *time.Location) int {
	list := make([]time.Time, 0, len(days))
	for k := range days {
		list = append(list, k.time(loc))
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Before(list[j]) })
	best := 0
	for i := 1; i < len(list); i++ {
		gap := int(math.Round(list[i].Sub(list[i-1]).Hours()/24)) - 1
		if gap > best {
			best = gap
		}
	}
	return best
}

// coversAll reports whether every day in [from, to] is in the set.
func coversAll(days map[dayKey]bool, from, to time.Time) bool {
	if to.Before(from) {
		return false
	}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if !days[dayOf(d)] {
			return false
		}
	}
	return true
}

// coversWholeMonthInAnyYear reports whether some year has activity on every day of the month.
func coversWholeMonthInAnyYear(days map[dayKey]bool, month time.Month, loc *time.Location) bool {
	years := map[int]bool{}
	for k := range days {
		if k.m == month {
			years[k.y] = true
		}
	}
	for y := range years {
		first := time.Date(y, month, 1, 12, 0, 0, 0, loc)
		last := first.AddDate(0, 1, -1)
		if coversAll(days, first, last) {
			return true
		}
	}
	return false
}

// anyCalendarMonthFull reports whether any calendar month (that has fully passed or is today's,
// up to today) has activity on every one of its days.
func anyCalendarMonthFull(days map[dayKey]bool, loc *time.Location) bool {
	months := map[monthKey]bool{}
	for k := range days {
		months[monthKey{k.y, k.m}] = true
	}
	for mk := range months {
		first := time.Date(mk.y, mk.m, 1, 12, 0, 0, 0, loc)
		if coversAll(days, first, first.AddDate(0, 1, -1)) {
			return true
		}
	}
	return false
}

// ── Sessions ─────────────────────────────────────────────────────────────────────────────────

// sessions groups consumption rows into sittings: the next one starts within the time the episode
// or chapter takes plus a short break. Rows from daily totals have no time and join no session.
func (s *side) sessions() [][]logRow {
	if v, ok := s.memo["sessions"].([][]logRow); ok {
		return v
	}
	var out [][]logRow
	var cur []logRow
	for _, r := range s.consumption {
		if r.dayOnly {
			continue
		}
		if len(cur) > 0 {
			prev := cur[len(cur)-1]
			allow := s.breakAllowance(r)
			if r.at.Sub(prev.at) > allow {
				out = append(out, cur)
				cur = nil
			}
		}
		cur = append(cur, r)
	}
	if len(cur) > 0 {
		out = append(out, cur)
	}
	s.memo["sessions"] = out
	return out
}

// breakAllowance is how long after the previous row this one may land and still be the same
// sitting: its own length plus fifteen minutes.
func (s *side) breakAllowance(r logRow) time.Duration {
	length := r.minutes
	if length <= 0 {
		if r.m != nil && r.m.duration > 0 {
			length = r.m.duration
		} else if s.anime {
			length = 24
		} else {
			length = 7
		}
	}
	return time.Duration(length+15) * time.Minute
}

func (s *side) longestSession() int {
	best := 0
	for _, ss := range s.sessions() {
		if len(ss) > best {
			best = len(ss)
		}
	}
	return best
}

// maxSessionCountWhere is the most rows satisfying pred inside one sitting.
func (s *side) maxSessionCountWhere(pred func(r logRow) bool) int {
	best := 0
	for _, ss := range s.sessions() {
		n := 0
		for _, r := range ss {
			if pred(r) {
				n++
			}
		}
		if n > best {
			best = n
		}
	}
	return best
}

// sessionSpans reports whether some sitting covers the whole of [fromHour, toHour) on one night
// (e.g. 22→6): it starts at or before the window opens and ends at or after it closes.
func (s *side) sessionSpans(fromHour, toHour int) bool {
	for _, ss := range s.sessions() {
		start, end := ss[0].at, ss[len(ss)-1].at
		// The night window that the session's start belongs to.
		open := time.Date(start.Year(), start.Month(), start.Day(), fromHour, 0, 0, 0, start.Location())
		if start.Hour() < toHour && fromHour > toHour {
			open = open.AddDate(0, 0, -1)
		}
		closeAt := time.Date(open.Year(), open.Month(), open.Day(), toHour, 0, 0, 0, open.Location())
		if !closeAt.After(open) {
			closeAt = closeAt.AddDate(0, 0, 1)
		}
		// Allow the first row to land within one episode of the window opening.
		if !start.After(open.Add(s.breakAllowance(ss[0]))) && !end.Before(closeAt.Add(-s.breakAllowance(ss[len(ss)-1]))) {
			return true
		}
	}
	return false
}

// ── Completions ──────────────────────────────────────────────────────────────────────────────

// maxCompletionsWithin is the most series finished inside any window of the given number of days.
func (s *side) maxCompletionsWithin(days int) int {
	cs := s.completions
	best := 0
	j := 0
	for i := range cs {
		limit := dayOf(cs[i].at)
		for j < i && dayDiff(dayOf(cs[j].at), limit, cs[i].at.Location()) >= days {
			j++
		}
		if n := i - j + 1; n > best {
			best = n
		}
	}
	return best
}

func dayDiff(a, b dayKey, loc *time.Location) int {
	return int(math.Round(b.time(loc).Sub(a.time(loc)).Hours() / 24))
}

func (s *side) maxCompletionsPer(group func(time.Time) interface{}) int {
	per := map[interface{}]int{}
	for _, c := range s.completions {
		per[group(c.at)]++
	}
	return maxOf(per)
}

// completionDays is the set of days with a completion.
func (s *side) completionDays() map[dayKey]bool {
	out := map[dayKey]bool{}
	for _, c := range s.completions {
		out[dayOf(c.at)] = true
	}
	return out
}

// firstLast returns the first and last logged consumption time per media.
func (s *side) firstLast() map[int][2]time.Time {
	if v, ok := s.memo["firstLast"].(map[int][2]time.Time); ok {
		return v
	}
	out := map[int][2]time.Time{}
	for _, r := range s.consumption {
		if r.dayOnly {
			continue
		}
		fl, ok := out[r.mediaID]
		if !ok {
			out[r.mediaID] = [2]time.Time{r.at, r.at}
			continue
		}
		if r.at.After(fl[1]) {
			fl[1] = r.at
		}
		out[r.mediaID] = fl
	}
	s.memo["firstLast"] = out
	return out
}

// consumedCount is how many rows were logged for one media.
func (s *side) consumedCount() map[int]int {
	if v, ok := s.memo["consumedCount"].(map[int]int); ok {
		return v
	}
	out := map[int]int{}
	for _, r := range s.consumption {
		out[r.mediaID]++
	}
	s.memo["consumedCount"] = out
	return out
}

// ── List ─────────────────────────────────────────────────────────────────────────────────────

// seen reports whether an entry counts as watched/read: any progress, or finished.
func (e *entry) seen() bool {
	return e.progress > 0 || e.status == "COMPLETED" || e.status == "REPEATING"
}

func (e *entry) done() bool { return e.status == "COMPLETED" || e.status == "REPEATING" }

func (s *side) count(pred func(e *entry) bool) int {
	n := 0
	for _, e := range s.entries {
		if pred(e) {
			n++
		}
	}
	return n
}

func (s *side) countStatus(status string) int {
	return s.count(func(e *entry) bool { return e.status == status })
}

func (s *side) completed() int { return s.count((*entry).done) }

func (s *side) seenCount() int { return s.count((*entry).seen) }

// distinct counts distinct keys over seen (or, with doneOnly, finished) entries.
func (s *side) distinct(doneOnly bool, keys func(e *entry) []string) int {
	set := map[string]bool{}
	for _, e := range s.entries {
		if doneOnly && !e.done() || !doneOnly && !e.seen() {
			continue
		}
		for _, k := range keys(e) {
			if k != "" {
				set[k] = true
			}
		}
	}
	return len(set)
}

// maxGroup is the size of the largest group of seen entries sharing a key.
func (s *side) maxGroup(doneOnly bool, keys func(e *entry) []string) int {
	per := map[string]int{}
	for _, e := range s.entries {
		if doneOnly && !e.done() || !doneOnly && !e.seen() {
			continue
		}
		for _, k := range keys(e) {
			if k != "" {
				per[k]++
			}
		}
	}
	best := 0
	for _, n := range per {
		if n > best {
			best = n
		}
	}
	return best
}

// ── Scores ───────────────────────────────────────────────────────────────────────────────────

func (s *side) rated() []*entry {
	var out []*entry
	for _, e := range s.entries {
		if e.score > 0 {
			out = append(out, e)
		}
	}
	return out
}

func meanStd(es []*entry) (mean, std float64) {
	if len(es) == 0 {
		return 0, 0
	}
	for _, e := range es {
		mean += e.score
	}
	mean /= float64(len(es))
	for _, e := range es {
		std += (e.score - mean) * (e.score - mean)
	}
	return mean, math.Sqrt(std / float64(len(es)))
}

// histogram10 counts rated entries per whole point 1-10 (a 7.5 rounds to 8).
func histogram10(es []*entry) [11]int {
	var h [11]int
	for _, e := range es {
		p := int(math.Round(e.score))
		if p < 1 {
			p = 1
		}
		if p > 10 {
			p = 10
		}
		h[p]++
	}
	return h
}

// scoreDays is the set of days a score was given or changed.
func (s *side) scoreDays() map[dayKey]bool {
	out := map[dayKey]bool{}
	for _, r := range s.scores {
		out[dayOf(r.at)] = true
	}
	return out
}

// ── Status changes ───────────────────────────────────────────────────────────────────────────

// transitions returns, per media, the statuses it moved through in order, with when.
func (s *side) transitions() map[int][]logRow {
	out := map[int][]logRow{}
	for _, r := range s.statuses {
		out[r.mediaID] = append(out[r.mediaID], r)
	}
	return out
}

func rowFrom(r logRow) string {
	if r.data == nil {
		return ""
	}
	v, _ := r.data["from"].(string)
	return v
}

func rowTo(r logRow) string {
	if r.data == nil {
		return ""
	}
	v, _ := r.data["to"].(string)
	return v
}

// ── Numbers ──────────────────────────────────────────────────────────────────────────────────

func b2f(ok bool) float64 {
	if ok {
		return 1
	}
	return 0
}

func isSquare(n int) bool {
	if n <= 0 {
		return false
	}
	r := int(math.Sqrt(float64(n)))
	for _, c := range []int{r - 1, r, r + 1} {
		if c > 0 && c*c == n {
			return true
		}
	}
	return false
}
