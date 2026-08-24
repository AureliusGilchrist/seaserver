package kitsu_platform

import (
	"strings"

	"seanime/internal/api/kitsu"
)

// statusToAnilistStyle maps Kitsu's lowercase status to the alphanumeric AniList-style token the
// frontend already renders. Hidden inside the conversion package so the rest of the platform
// never sees a Kitsu literal — keeping both pipelines internally consistent means the UI badge
// logic continues to work without modification.
func anilistStatusFromKitsu(kitsuStatus string) string {
	switch strings.ToLower(strings.TrimSpace(kitsuStatus)) {
	case kitsu.LibraryStatusCurrent:
		return "CURRENT"
	case kitsu.LibraryStatusPlanned:
		return "PLANNING"
	case kitsu.LibraryStatusCompleted:
		return "COMPLETED"
	case kitsu.LibraryStatusOnHold:
		return "PAUSED"
	case kitsu.LibraryStatusDropped:
		return "DROPPED"
	default:
		// Unknown status — leave the token empty so the frontend doesn't render a wrong badge.
		// A subsequent library refresh will overwrite this row with whatever Kitsu now stores.
		return ""
	}
}

// anilistScoreToKitsu maps the 0–100 scale used everywhere else in seanime to Kitsu's
// 2-20 scale. A 0 (unrated) means "do not send a rating" — the caller passes nil to opt out.
func anilistScoreToKitsu(score float64) *int {
	if score <= 0 {
		return nil
	}
	// Round to the nearest 2 — Kitsu only has 10 visible buckets anyway.
	raw := int((score / 100.0) * 20.0)
	if raw < 2 {
		raw = 2
	}
	if raw > 20 {
		raw = 20
	}
	return &raw
}

// kitsuScoreToAnilist flips the conversion. Kitsu scores come in as 2–20 (or 0 for unrated);
// the platform standard is 0–100.
func kitsuScoreToAnilist(score float64) float64 {
	if score <= 0 {
		return 0
	}
	out := (score / 20.0) * 100.0
	if out < 0 {
		return 0
	}
	if out > 100 {
		return 100
	}
	return out
}

// parseYearMonth pulls out a YYYY-MM-DD date string from Kitsu's datetime field. Kitsu sends
// ISO8601 timestamps for nearly every date; the AniList-shaped consumers want just the YYYY-MM-DD
// portion.
func parseYearMonth(s string) string {
	if s == "" {
		return ""
	}
	if before, _, ok := strings.Cut(s, "T"); ok {
		return before
	}
	// Some Kitsu attributes only carry year/month — pad with -01 so JSON consumers don't get a
	// string they consider invalid.
	if len(s) == 7 {
		return s + "-01"
	}
	return s
}

// coverFromKitsu converts the kitsu model's cover/poster image into our platform ImageSet.
func coverFromKitsu(p *kitsu.CoverImageMeta) *ImageSet {
	if p == nil {
		return nil
	}
	if p.Small == "" && p.Medium == "" && p.Large == "" && p.Original == "" {
		return nil
	}
	return &ImageSet{
		Small:    p.Small,
		Medium:   p.Medium,
		Large:    p.Large,
		Original: p.Original,
	}
}
