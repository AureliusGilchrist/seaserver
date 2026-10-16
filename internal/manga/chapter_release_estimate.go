package manga

import (
	"math"
	"sort"
	"time"

	hibikemanga "seanime/internal/extension/hibike/manga"
)

const releaseEstimateLookback = 5
const minimumReleaseIntervals = 3

func estimateChapterReleaseCadence(chapters []*hibikemanga.ChapterDetails) (float64, *time.Time) {
	releaseDates := make(map[string]time.Time)
	for _, chapter := range chapters {
		if chapter == nil || chapter.UpdatedAt == "" {
			continue
		}

		date, err := time.Parse("2006-01-02", chapter.UpdatedAt)
		if err != nil {
			date, err = time.Parse(time.RFC3339, chapter.UpdatedAt)
		}
		if err != nil {
			continue
		}

		date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
		releaseDates[date.Format("2006-01-02")] = date
	}

	dates := make([]time.Time, 0, len(releaseDates))
	for _, date := range releaseDates {
		dates = append(dates, date)
	}
	sort.Slice(dates, func(i, j int) bool { return dates[i].Before(dates[j]) })
	if len(dates) < minimumReleaseIntervals+1 {
		return 0, nil
	}

	gaps := make([]float64, 0, len(dates)-1)
	for i := 1; i < len(dates); i++ {
		gap := dates[i].Sub(dates[i-1]).Hours() / 24
		if gap > 0 {
			gaps = append(gaps, gap)
		}
	}
	if len(gaps) > releaseEstimateLookback {
		gaps = gaps[len(gaps)-releaseEstimateLookback:]
	}
	if len(gaps) < minimumReleaseIntervals {
		return 0, nil
	}

	sort.Float64s(gaps)
	middle := len(gaps) / 2
	median := gaps[middle]
	if len(gaps)%2 == 0 {
		median = (gaps[middle-1] + gaps[middle]) / 2
	}

	next := dates[len(dates)-1].Add(time.Duration(math.Round(median * float64(24*time.Hour))))
	return median, &next
}
