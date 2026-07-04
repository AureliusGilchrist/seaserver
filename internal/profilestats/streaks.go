package profilestats

import (
	"seanime/internal/database/models"
	"sort"
	"time"
)

// BuildHeatmap converts activity logs into heatmap data for a date range.
// Fills in zero-activity days so the frontend gets a complete grid.
func BuildHeatmap(logs []*models.ActivityLog, startDate, endDate string) []*ActivityDay {
	// Index logs by date for O(1) lookup
	logMap := make(map[string]*models.ActivityLog, len(logs))
	for _, l := range logs {
		logMap[l.Date] = l
	}

	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil
	}

	var days []*ActivityDay
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		ds := d.Format("2006-01-02")
		day := &ActivityDay{Date: ds}
		if l, ok := logMap[ds]; ok {
			day.AnimeEpisodes = l.AnimeEpisodes
			day.MangaChapters = l.MangaChapters
			day.TotalActivity = l.AnimeEpisodes + l.MangaChapters
		}
		days = append(days, day)
	}
	return days
}

// ComputeStreaks calculates current and longest streak from activity logs.
// animeOnly: only count days with AnimeEpisodes > 0.
// mangaOnly: only count days with MangaChapters > 0.
func ComputeStreaks(logs []*models.ActivityLog, animeOnly bool) *StreakInfo {
	if len(logs) == 0 {
		return &StreakInfo{}
	}

	// Filter to days with relevant activity
	var activeDates []string
	for _, l := range logs {
		has := false
		if animeOnly {
			has = l.AnimeEpisodes > 0
		} else {
			has = l.MangaChapters > 0
		}
		if has {
			activeDates = append(activeDates, l.Date)
		}
	}

	if len(activeDates) == 0 {
		return &StreakInfo{}
	}

	// Parse dates and compute streaks
	today := time.Now().Format("2006-01-02")
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")

	longest := 1
	current := 1
	currentStreak := 1

	lastDate := activeDates[len(activeDates)-1]

	for i := 1; i < len(activeDates); i++ {
		prev, _ := time.Parse("2006-01-02", activeDates[i-1])
		curr, _ := time.Parse("2006-01-02", activeDates[i])

		if curr.Sub(prev).Hours() <= 24 {
			currentStreak++
		} else {
			currentStreak = 1
		}

		if currentStreak > longest {
			longest = currentStreak
		}
	}

	// Current streak: only counts if last active date is today or yesterday
	if lastDate == today || lastDate == yesterday {
		// Walk backwards from the end to find current streak length
		current = 1
		for i := len(activeDates) - 1; i > 0; i-- {
			curr, _ := time.Parse("2006-01-02", activeDates[i])
			prev, _ := time.Parse("2006-01-02", activeDates[i-1])
			if curr.Sub(prev).Hours() <= 24 {
				current++
			} else {
				break
			}
		}
	} else {
		current = 0
	}

	return &StreakInfo{
		Current:    current,
		Longest:    longest,
		LastActive: lastDate,
	}
}

// StreakDeadPeriod is the maximum gap between two consecutive activity events for a
// streak to stay alive. Slightly over a day so a routine that drifts (episode at 8pm one
// day, 10pm the next — or a session just past midnight that skips a calendar day) doesn't
// break the chain on a technicality.
const StreakDeadPeriod = 26 * time.Hour

// ComputeStreaksFromEvents chains discrete activity timestamps: consecutive events within
// StreakDeadPeriod of each other extend the chain. A streak's length is the number of
// distinct calendar days the chain covers, so values stay comparable with the daily-log
// based computation.
func ComputeStreaksFromEvents(times []time.Time) *StreakInfo {
	if len(times) == 0 {
		return &StreakInfo{}
	}

	sorted := make([]time.Time, len(times))
	copy(sorted, times)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Before(sorted[j]) })

	longest := 0
	chainDays := map[string]struct{}{sorted[0].Format("2006-01-02"): {}}

	for i := 1; i < len(sorted); i++ {
		if sorted[i].Sub(sorted[i-1]) <= StreakDeadPeriod {
			chainDays[sorted[i].Format("2006-01-02")] = struct{}{}
			continue
		}
		if len(chainDays) > longest {
			longest = len(chainDays)
		}
		chainDays = map[string]struct{}{sorted[i].Format("2006-01-02"): {}}
	}
	if len(chainDays) > longest {
		longest = len(chainDays)
	}

	// The final chain counts as the current streak only while the last event is still
	// within the dead period of now.
	current := 0
	last := sorted[len(sorted)-1]
	if time.Since(last) <= StreakDeadPeriod {
		current = len(chainDays)
	}

	return &StreakInfo{
		Current:    current,
		Longest:    longest,
		LastActive: last.Format("2006-01-02"),
	}
}

// MergeStreaks combines two streak computations, keeping the most favorable values.
// Used to overlay the event-timestamp streaks (26h dead period, but only as far back as
// granular events exist) onto the daily-log streaks (full history, midnight-bounded).
func MergeStreaks(a, b *StreakInfo) *StreakInfo {
	if a == nil {
		return b
	}
	if b == nil {
		return a
	}
	out := &StreakInfo{
		Current:    max(a.Current, b.Current),
		Longest:    max(a.Longest, b.Longest),
		LastActive: a.LastActive,
	}
	// Dates are YYYY-MM-DD, so lexicographic comparison is chronological
	if b.LastActive > out.LastActive {
		out.LastActive = b.LastActive
	}
	return out
}

// ComputeWatchPatterns aggregates activity by day of week.
func ComputeWatchPatterns(logs []*models.ActivityLog) *WatchPatterns {
	var patterns WatchPatterns
	for _, l := range logs {
		t, err := time.Parse("2006-01-02", l.Date)
		if err != nil {
			continue
		}
		// Go: Sunday=0, Monday=1, ..., Saturday=6
		// We want: Monday=0, ..., Sunday=6
		dow := int(t.Weekday())
		idx := (dow + 6) % 7 // Convert Sunday=0 → 6, Monday=1 → 0, etc.
		patterns.ByDayOfWeek[idx] += l.AnimeEpisodes + l.MangaChapters
	}
	return &patterns
}

// CountActiveDays returns total active days, anime days, and manga days.
func CountActiveDays(logs []*models.ActivityLog) (total, anime, manga int) {
	for _, l := range logs {
		anyActivity := false
		if l.AnimeEpisodes > 0 {
			anime++
			anyActivity = true
		}
		if l.MangaChapters > 0 {
			manga++
			anyActivity = true
		}
		if anyActivity {
			total++
		}
	}
	return
}
