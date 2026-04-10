package handlers

import (
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
	}

	allGenreSet := make(map[string]struct{})
	formatSet := make(map[string]struct{})
	decadeSet := make(map[int]struct{})

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
					if *entry.Score == 100 || *entry.Score == 10 {
						stats.PerfectTenAnime++
					}
					if *entry.Score > 0 && *entry.Score <= 30 {
						stats.HarshCriticAnime++
					}
				}

				if media != nil {
					if media.Format != nil {
						f := string(*media.Format)
						formatSet[f] = struct{}{}
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
					if *entry.Score == 100 || *entry.Score == 10 {
						stats.PerfectTenManga++
					}
					if *entry.Score > 0 && *entry.Score <= 30 {
						stats.HarshCriticManga++
					}
				}

				if media != nil {
					for _, g := range media.Genres {
						if g != nil {
							allGenreSet[*g] = struct{}{}
							stats.MangaGenreCounts[*g]++
						}
					}

					if media.Format != nil {
						f := string(*media.Format)
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

	stats.GenreCount = len(allGenreSet)
	stats.FormatCount = len(formatSet)
	stats.DecadeCount = len(decadeSet)
	stats.StudioCount = 0 // Studios not available from base anime query

	if animeScoreCount > 0 {
		stats.AnimeAverageRating = animeTotalScore / float64(animeScoreCount)
	}
	if mangaScoreCount > 0 {
		stats.MangaAverageRating = mangaTotalScore / float64(mangaScoreCount)
	}

	return stats
}
