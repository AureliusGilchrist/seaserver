package handlers

import (
	"seanime/internal/achievement"
	"seanime/internal/api/anilist"
)

// buildCollectionStats computes achievement-relevant stats from the anime and manga collections.
func buildCollectionStats(
	animeCol *anilist.AnimeCollection,
	mangaCol *anilist.MangaCollection,
) *achievement.CollectionStats {
	stats := &achievement.CollectionStats{
		GenreCounts:  make(map[string]int),
		FormatCounts: make(map[string]int),
	}

	genreSet := make(map[string]struct{})
	formatSet := make(map[string]struct{})
	decadeSet := make(map[int]struct{})

	var totalScore float64
	var scoreCount int

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

				// Progress / episodes
				if entry.Progress != nil {
					stats.TotalEpisodes += *entry.Progress
				}

				// Minutes = progress * duration
				if entry.Progress != nil && media != nil && media.Duration != nil {
					stats.TotalMinutes += *entry.Progress * *media.Duration
				}

				// Completed
				if entry.Status != nil && *entry.Status == anilist.MediaListStatusCompleted {
					stats.CompletedAnime++
				}

				// Score
				if entry.Score != nil && *entry.Score > 0 {
					stats.RatingCount++
					totalScore += *entry.Score
					scoreCount++
					if *entry.Score == 100 {
						stats.PerfectTenCount++
					}
					if *entry.Score > 0 && *entry.Score <= 30 {
						stats.HarshCriticCount++
					}
				}

				if media != nil {
					// Format
					if media.Format != nil {
						f := string(*media.Format)
						formatSet[f] = struct{}{}
						stats.FormatCounts[f]++
						if *media.Format == anilist.MediaFormatMovie {
							stats.MovieCount++
						}
					}

					// Genres
					for _, g := range media.Genres {
						if g != nil {
							genreSet[*g] = struct{}{}
							stats.GenreCounts[*g]++
						}
					}

					// Decade from SeasonYear
					if media.SeasonYear != nil && *media.SeasonYear > 0 {
						decade := (*media.SeasonYear / 10) * 10
						decadeSet[decade] = struct{}{}
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

				// Chapter progress
				if entry.Progress != nil {
					stats.TotalChapters += *entry.Progress
				}

				// Completed
				if entry.Status != nil && *entry.Status == anilist.MediaListStatusCompleted {
					stats.CompletedManga++
				}

				// Score (aggregate with anime scores)
				if entry.Score != nil && *entry.Score > 0 {
					stats.RatingCount++
					totalScore += *entry.Score
					scoreCount++
					if *entry.Score == 100 {
						stats.PerfectTenCount++
					}
					if *entry.Score > 0 && *entry.Score <= 30 {
						stats.HarshCriticCount++
					}
				}

				if media != nil {
					// Genres
					for _, g := range media.Genres {
						if g != nil {
							genreSet[*g] = struct{}{}
							stats.GenreCounts[*g]++
						}
					}
				}
			}
		}
	}

	stats.GenreCount = len(genreSet)
	stats.FormatCount = len(formatSet)
	stats.DecadeCount = len(decadeSet)

	if scoreCount > 0 {
		stats.AverageRating = totalScore / float64(scoreCount)
	}

	return stats
}
