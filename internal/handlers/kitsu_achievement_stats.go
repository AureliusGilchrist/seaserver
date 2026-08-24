package handlers

import (
	"context"
	"errors"

	"seanime/internal/achievement"
	"seanime/internal/api/kitsu"
	"seanime/internal/platforms/kitsu_platform"
)

// buildCollectionStatsFromKitsu builds an achievement.CollectionStats from the Kitsu
// planning-slut-library, mirroring the AniList-side builder as closely as Kitsu's data shape
// allows.
//
// On any error or empty library, returns (nil, false) so the caller falls back to the AniList
// builder — exactly the user's stated preference: Kitsu-first, AniList if Kitsu fails.
func (h *Handler) buildCollectionStatsFromKitsu(ctx context.Context) (*achievement.CollectionStats, bool) {
	if h.App == nil || h.App.KitsuClientManager == nil {
		return nil, false
	}
	platform := h.App.KitsuClientManager.GetPlanningSlut()
	if platform == nil {
		return nil, false
	}

	entries, err := platform.GetAnimeCollection(ctx, false)
	if err != nil {
		h.App.Logger.Debug().Err(err).Msg("kitsu achievement stats: fetch failed, falling back to AniList")
		return nil, false
	}
	if len(entries) == 0 {
		return nil, false
	}

	stats := &achievement.CollectionStats{
		AnimeGenreCounts:  make(map[string]int),
		MangaGenreCounts:  make(map[string]int),
		AnimeFormatCounts: make(map[string]int),
		MangaFormatCounts: make(map[string]int),
		AnimeTagCounts:    make(map[string]int),
		MangaTagCounts:    make(map[string]int),
	}

	allGenreSet := make(map[string]struct{})
	animeFormatSet := make(map[string]struct{})
	decadeSet := make(map[int]struct{})

	var animeTotalScore float64
	var animeScoreCount int

	for _, e := range entries {
		status := kitsu.LibraryStatusMap(e.Status)
		stats.TotalAnime++

		stats.TotalEpisodes += e.Progress

		switch status {
		case "COMPLETED":
			stats.CompletedAnime++
		case "DROPPED":
			stats.DroppedAnime++
		case "CURRENT":
			stats.WatchingAnime++
		case "PAUSED":
			stats.PausedAnime++
		case "PLANNING":
			stats.PTWAnime++
		}

		if e.Score > 0 {
			stats.AnimeRatingCount++
			animeTotalScore += e.Score
			animeScoreCount++
			intScore := int((e.Score / 10.0) + 0.5)
			if intScore >= 1 && intScore <= 10 {
				stats.AnimeScoreHist[intScore]++
			}
			if intScore == 10 {
				stats.PerfectTenAnime++
			}
			if intScore <= 3 {
				stats.HarshCriticAnime++
			}
			if intScore >= 5 && intScore <= 7 {
				stats.MediocreCountAnime++
			}
		}

		// Look up full details for genre/format/decade. Kitsu snippet data on a library row
		// doesn't include those — we pay one GetAnimeByID per row.
		if e.MediaID > 0 && h.App.KitsuClientManager != nil {
			anime, err := h.App.KitsuClientManager.GetPlanningSlut().GetAnime(ctx, e.MediaID)
			if err == nil && anime != nil {
				subs := anime.Subtype
				if subs != "" {
					animeFormatSet[subs] = struct{}{}
					stats.AnimeFormatCounts[subs]++
				}
				for _, g := range anime.Genres {
					allGenreSet[g] = struct{}{}
					stats.AnimeGenreCounts[g]++
				}
				if len(anime.StartDate) >= 4 {
					var year int
					_, _ = parseIntSafe(anime.StartDate[:4], &year)
					if year > 0 {
						decade := (year / 10) * 10
						decadeSet[decade] = struct{}{}
					}
				}
			} else if err != nil {
				h.App.Logger.Debug().Err(err).Int("mediaId", e.MediaID).Msg("kitsu achievement stats: per-anime lookup failed")
			}
		}
	}

	stats.GenreCount = len(allGenreSet)
	stats.AnimeUniqueFormatCount = len(animeFormatSet)
	stats.FormatCount = len(animeFormatSet)
	stats.DecadeCount = len(decadeSet)
	stats.StudioCount = 0

	if animeScoreCount > 0 {
		stats.AnimeAverageRating = animeTotalScore / float64(animeScoreCount)
	}
	computeScoringMeta(stats)
	return stats, true
}

// BuildCollectionStatsKitsuFirst is the entry point the achievement refresh handler uses: it
// tries the Kitsu planning-slut first, and if that fails (or returns empty) it builds from
// AniList instead. Mirrors the user-facing instruction: "try Kitsu, fall back to AniList".
func (h *Handler) BuildCollectionStatsKitsuFirst(ctx context.Context) (*achievement.CollectionStats, bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if stats, ok := h.buildCollectionStatsFromKitsu(ctx); ok {
		return stats, true, nil
	}

	animeCol, err := h.App.GetAnimeCollection(false)
	if err != nil {
		return nil, false, err
	}
	mangaCol, err := h.App.GetMangaCollection(false)
	if err != nil {
		return nil, false, err
	}
	if animeCol == nil && mangaCol == nil {
		return nil, false, errors.New("no collections available (neither Kitsu nor AniList)")
	}
	return buildCollectionStats(animeCol, mangaCol), false, nil
}

// parseIntSafe parses an int without exposing strconv everywhere.
func parseIntSafe(s string, out *int) (bool, error) {
	v := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			*out = 0
			return false, errors.New("not an int")
		}
		v = v*10 + int(r-'0')
	}
	*out = v
	return true, nil
}

// keep imports happy
var _ kitsu.LibraryEntry
var _ = (*kitsu_platform.KitsuPlatform)(nil)
