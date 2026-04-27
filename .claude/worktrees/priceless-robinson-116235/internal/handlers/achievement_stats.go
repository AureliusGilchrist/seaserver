package handlers

import (
	"math"
	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
	"strings"
)

// buildCollectionStats computes achievement-relevant stats from the anime and manga collections.
func buildCollectionStats(
	animeCol *anilist.AnimeCollection,
	mangaCol *anilist.MangaCollection,
) *achievement.CollectionStats {
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
	mangaFormatSet := make(map[string]struct{})
	decadeSet := make(map[int]struct{})
	allTagSet := make(map[string]struct{})

	var animeTotalScore float64
	var animeScoreCount int
	var mangaTotalScore float64
	var mangaScoreCount int

	// Process anime collection
	if animeCol != nil && animeCol.GetMediaListCollection() != nil {
		for _, list := range animeCol.GetMediaListCollection().GetLists() {
			if list == nil {
				continue
			}
			for _, entry := range list.GetEntries() {
				if entry == nil {
					continue
				}
				media := entry.GetMedia()

				stats.TotalAnime++

				if entry.Progress != nil {
					stats.TotalEpisodes += *entry.Progress
				}

				if entry.Progress != nil && media != nil && media.Duration != nil {
					stats.TotalMinutes += *entry.Progress * *media.Duration
				}

				if entry.Repeat != nil && *entry.Repeat > 0 {
					stats.AnimeRewatches += *entry.Repeat
				}

				if entry.Status != nil {
					switch *entry.Status {
					case anilist.MediaListStatusCompleted:
						stats.CompletedAnime++
					case anilist.MediaListStatusDropped:
						stats.DroppedAnime++
					case anilist.MediaListStatusCurrent:
						stats.WatchingAnime++
					case anilist.MediaListStatusPaused:
						stats.PausedAnime++
					case anilist.MediaListStatusPlanning:
						stats.PTWAnime++
					}
				}

				if entry.Score != nil && *entry.Score > 0 {
					stats.AnimeRatingCount++
					animeTotalScore += *entry.Score
					animeScoreCount++
					score := normalizeScore(*entry.Score)
					if score >= 1 && score <= 10 {
						stats.AnimeScoreHist[score]++
					}
					if *entry.Score == 100 || *entry.Score == 10 {
						stats.PerfectTenAnime++
					}
					if *entry.Score > 0 && *entry.Score <= 30 {
						stats.HarshCriticAnime++
					}
					if score >= 5 && score <= 7 {
						stats.MediocreCountAnime++
					}
				}

				if media != nil {
					isPlanning := entry.Status != nil && *entry.Status == anilist.MediaListStatusPlanning

					if !isPlanning {
						if media.Format != nil {
							f := string(*media.Format)
							animeFormatSet[f] = struct{}{}
							stats.AnimeFormatCounts[f]++
							switch *media.Format {
							case anilist.MediaFormatTv:
								stats.TVCount++
							case anilist.MediaFormatMovie:
								stats.MovieCount++
							case anilist.MediaFormatOva:
								stats.OVACount++
							case anilist.MediaFormatOna:
								stats.ONACount++
							case anilist.MediaFormatSpecial:
								stats.SpecialCount++
							case anilist.MediaFormatMusic:
								stats.MusicCount++
							case anilist.MediaFormatTvShort:
								stats.TVShortCount++
							}
						}

						for _, g := range media.Genres {
							if g != nil {
								allGenreSet[*g] = struct{}{}
								stats.AnimeGenreCounts[*g]++
							}
						}

						for _, tag := range media.GetTags() {
							if tag != nil {
								stats.AnimeTagCounts[tag.Name]++
								allTagSet[tag.Name] = struct{}{}
							}
						}

						if media.SeasonYear != nil && *media.SeasonYear > 0 {
							decade := (*media.SeasonYear / 10) * 10
							decadeSet[decade] = struct{}{}
						}
					}
				}
			}
		}
	}

	// Process manga collection
	if mangaCol != nil && mangaCol.GetMediaListCollection() != nil {
		for _, list := range mangaCol.GetMediaListCollection().GetLists() {
			if list == nil {
				continue
			}
			for _, entry := range list.GetEntries() {
				if entry == nil {
					continue
				}
				media := entry.GetMedia()

				stats.TotalManga++

				if entry.Progress != nil {
					stats.TotalChapters += *entry.Progress
				}

				if entry.Repeat != nil && *entry.Repeat > 0 {
					stats.MangaRereads += *entry.Repeat
				}

				if entry.Status != nil {
					switch *entry.Status {
					case anilist.MediaListStatusCompleted:
						stats.CompletedManga++
					case anilist.MediaListStatusDropped:
						stats.DroppedManga++
					case anilist.MediaListStatusCurrent:
						stats.ReadingManga++
					case anilist.MediaListStatusPaused:
						stats.PausedManga++
					case anilist.MediaListStatusPlanning:
						stats.PTRManga++
					}
				}

				if entry.Score != nil && *entry.Score > 0 {
					stats.MangaRatingCount++
					mangaTotalScore += *entry.Score
					mangaScoreCount++
					score := normalizeScore(*entry.Score)
					if score >= 1 && score <= 10 {
						stats.MangaScoreHist[score]++
					}
					if *entry.Score == 100 || *entry.Score == 10 {
						stats.PerfectTenManga++
					}
					if *entry.Score > 0 && *entry.Score <= 30 {
						stats.HarshCriticManga++
					}
					if score >= 5 && score <= 7 {
						stats.MediocreCountManga++
					}
				}

				if media != nil {
					isPlanning := entry.Status != nil && *entry.Status == anilist.MediaListStatusPlanning

					if !isPlanning {
						for _, g := range media.Genres {
							if g != nil {
								allGenreSet[*g] = struct{}{}
								stats.MangaGenreCounts[*g]++
							}
						}

						for _, tag := range media.GetTags() {
							if tag != nil {
								stats.MangaTagCounts[tag.Name]++
								allTagSet[tag.Name] = struct{}{}
							}
						}

						if media.Format != nil {
							f := string(*media.Format)
							mangaFormatSet[f] = struct{}{}
							stats.MangaFormatCounts[f]++
							fl := strings.ToUpper(f)
							switch {
							case fl == "MANHWA":
								stats.ManhwaCount++
							case fl == "MANHUA":
								stats.ManhuaCount++
							case fl == "ONE_SHOT":
								stats.OneshotCount++
							case fl == "NOVEL":
								stats.NovelCount++
							case fl == "LIGHT_NOVEL":
								stats.LightNovelCount++
							}
						}
					}
				}
			}
		}
	}

	stats.GenreCount = len(allGenreSet)
	stats.FormatCount = len(animeFormatSet) + len(mangaFormatSet)
	stats.DecadeCount = len(decadeSet)
	stats.TagCount = len(allTagSet)
	stats.StudioCount = 0 // Studios not available from base anime query
	stats.AnimeUniqueFormatCount = len(animeFormatSet)
	stats.MangaUniqueFormatCount = len(mangaFormatSet)

	if animeScoreCount > 0 {
		stats.AnimeAverageRating = animeTotalScore / float64(animeScoreCount)
	}
	if mangaScoreCount > 0 {
		stats.MangaAverageRating = mangaTotalScore / float64(mangaScoreCount)
	}

	// Compute scoring metadata
	computeScoringMeta(stats)

	return stats
}

// normalizeScore converts AniList scores (which can be on different scales) to 1-10.
func normalizeScore(score float64) int {
	if score > 10 {
		return int(math.Round(score / 10))
	}
	return int(math.Round(score))
}

// computeScoringMeta derives scoring-related boolean/aggregate stats from histograms.
func computeScoringMeta(s *achievement.CollectionStats) {
	// Bell curve: check if middle scores (4-7) have more entries than extremes
	computeBellCurve := func(hist [11]int, count int) bool {
		if count < 20 {
			return false
		}
		middle := 0
		for i := 4; i <= 7; i++ {
			middle += hist[i]
		}
		return float64(middle)/float64(count) > 0.5
	}
	s.BellCurveAnime = computeBellCurve(s.AnimeScoreHist, s.AnimeRatingCount)
	s.BellCurveManga = computeBellCurve(s.MangaScoreHist, s.MangaRatingCount)

	// Used all scores 1-10
	computeUsedAll := func(hist [11]int) bool {
		for i := 1; i <= 10; i++ {
			if hist[i] == 0 {
				return false
			}
		}
		return true
	}
	s.UsedAllScoresAnime = computeUsedAll(s.AnimeScoreHist)
	s.UsedAllScoresManga = computeUsedAll(s.MangaScoreHist)

	// All completed rated
	s.AllCompletedRatedAnime = s.CompletedAnime > 0 && s.AnimeRatingCount >= s.CompletedAnime
	s.AllCompletedRatedManga = s.CompletedManga > 0 && s.MangaRatingCount >= s.CompletedManga

	// Max same score
	computeMaxSame := func(hist [11]int) int {
		max := 0
		for i := 1; i <= 10; i++ {
			if hist[i] > max {
				max = hist[i]
			}
		}
		return max
	}
	s.MaxSameScoreAnime = computeMaxSame(s.AnimeScoreHist)
	s.MaxSameScoreManga = computeMaxSame(s.MangaScoreHist)

	// Score variance
	computeVariance := func(hist [11]int, count int, avg float64) float64 {
		if count < 2 {
			return 0
		}
		normalizedAvg := avg
		if avg > 10 {
			normalizedAvg = avg / 10.0
		}
		var sumSqDiff float64
		for i := 1; i <= 10; i++ {
			diff := float64(i) - normalizedAvg
			sumSqDiff += float64(hist[i]) * diff * diff
		}
		return sumSqDiff / float64(count)
	}
	s.ScoreVarianceAnime = computeVariance(s.AnimeScoreHist, s.AnimeRatingCount, s.AnimeAverageRating)
	s.ScoreVarianceManga = computeVariance(s.MangaScoreHist, s.MangaRatingCount, s.MangaAverageRating)
}
