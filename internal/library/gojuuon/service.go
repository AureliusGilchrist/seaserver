package gojuuon

import (
	"context"
	"fmt"
	"seanime/internal/api/anilist"
	"seanime/internal/util/limiter"
	"sort"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// SortEntry holds the GoJuuon sort data for a single media entry.
type SortEntry struct {
	MediaID            int    `json:"mediaId"`
	GroupKey           string `json:"groupKey"`           // GoJuuon key of the series root
	GroupRomajiTitle   string `json:"groupRomajiTitle"`   // Romaji title of the series root
	ChronologicalOrder int    `json:"chronologicalOrder"` // Position within the series by start date
}

// Service provides GoJuuon sort computation and caching.
type Service struct {
	logger      *zerolog.Logger
	mu          sync.RWMutex
	animeSortMap map[int]*SortEntry
	mangaSortMap map[int]*SortEntry
}

// NewService creates a new GoJuuon sort service.
func NewService(logger *zerolog.Logger) *Service {
	return &Service{
		logger:      logger,
		animeSortMap: make(map[int]*SortEntry),
		mangaSortMap: make(map[int]*SortEntry),
	}
}

// GetAnimeSortMap returns the cached anime sort map.
func (s *Service) GetAnimeSortMap() map[int]*SortEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cp := make(map[int]*SortEntry, len(s.animeSortMap))
	for k, v := range s.animeSortMap {
		cp[k] = v
	}
	return cp
}

// GetMangaSortMap returns the cached manga sort map.
func (s *Service) GetMangaSortMap() map[int]*SortEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cp := make(map[int]*SortEntry, len(s.mangaSortMap))
	for k, v := range s.mangaSortMap {
		cp[k] = v
	}
	return cp
}

// -----------------------------------------------------------------------
// Anime sort computation
// -----------------------------------------------------------------------

// ComputeAnimeSortOrder computes GoJuuon sort entries for all anime in the
// user's collection. It uses CompleteAnimeByID to fetch relation data up to
// 4 levels deep (PREQUEL / SEQUEL) for series grouping.
func (s *Service) ComputeAnimeSortOrder(
	collection *anilist.AnimeCollection,
	anilistClient anilist.AnilistClient,
	rl *limiter.Limiter,
) (map[int]*SortEntry, error) {
	if collection == nil || collection.GetMediaListCollection() == nil {
		return nil, fmt.Errorf("gojuuon: anime collection is nil")
	}

	allAnime := collection.GetAllAnime()
	if len(allAnime) == 0 {
		return nil, nil
	}

	s.logger.Info().Int("count", len(allAnime)).Msg("gojuuon: Computing anime sort order")

	// Build a map of mediaID → BaseAnime for quick lookup
	animeByID := make(map[int]*anilist.BaseAnime, len(allAnime))
	for _, a := range allAnime {
		if a != nil {
			animeByID[a.ID] = a
		}
	}

	// Track which media IDs have been assigned to a group already
	assigned := make(map[int]bool)
	result := make(map[int]*SortEntry)

	for _, anime := range allAnime {
		if anime == nil || assigned[anime.ID] {
			continue
		}

		// Find the series group: walk relations up to 4 depth
		group := s.findAnimeSeriesGroup(anime.ID, anilistClient, rl, 4)

		// Determine root: the earliest by start date, or the one with no prequel
		sortGroup(group)

		rootRomaji := ""
		if len(group) > 0 {
			rootRomaji = group[0].romaji
		}
		groupKey := RomajiToGojuuonKey(rootRomaji)

		for i, member := range group {
			entry := &SortEntry{
				MediaID:            member.id,
				GroupKey:           groupKey,
				GroupRomajiTitle:   rootRomaji,
				ChronologicalOrder: i,
			}
			result[member.id] = entry
			assigned[member.id] = true
		}
	}

	// Also handle any anime that didn't get assigned (shouldn't happen, but safety)
	for _, anime := range allAnime {
		if anime == nil {
			continue
		}
		if _, ok := result[anime.ID]; !ok {
			romaji := ""
			if anime.Title != nil && anime.Title.Romaji != nil {
				romaji = *anime.Title.Romaji
			}
			result[anime.ID] = &SortEntry{
				MediaID:            anime.ID,
				GroupKey:           RomajiToGojuuonKey(romaji),
				GroupRomajiTitle:   romaji,
				ChronologicalOrder: 0,
			}
		}
	}

	// Update cache
	s.mu.Lock()
	s.animeSortMap = result
	s.mu.Unlock()

	s.logger.Info().Int("entries", len(result)).Msg("gojuuon: Anime sort order computed")
	return result, nil
}

// -----------------------------------------------------------------------
// Manga sort computation (alphabetical GoJuuon only, no series grouping)
// -----------------------------------------------------------------------

// ComputeMangaSortOrder computes GoJuuon sort entries for all manga in the
// user's collection. Manga does not support deep relation traversal since
// BaseManga lacks a Relations field, so each entry is sorted individually
// by its Romaji title's GoJuuon row.
func (s *Service) ComputeMangaSortOrder(
	collection *anilist.MangaCollection,
) (map[int]*SortEntry, error) {
	if collection == nil || collection.GetMediaListCollection() == nil {
		return nil, fmt.Errorf("gojuuon: manga collection is nil")
	}

	var allManga []*anilist.BaseManga
	for _, list := range collection.GetMediaListCollection().GetLists() {
		if list == nil {
			continue
		}
		for _, entry := range list.GetEntries() {
			if entry != nil && entry.Media != nil {
				allManga = append(allManga, entry.Media)
			}
		}
	}
	if len(allManga) == 0 {
		return nil, nil
	}

	s.logger.Info().Int("count", len(allManga)).Msg("gojuuon: Computing manga sort order")

	result := make(map[int]*SortEntry, len(allManga))

	for _, manga := range allManga {
		if manga == nil {
			continue
		}
		romaji := ""
		if manga.Title != nil && manga.Title.Romaji != nil {
			romaji = *manga.Title.Romaji
		}
		result[manga.ID] = &SortEntry{
			MediaID:            manga.ID,
			GroupKey:           RomajiToGojuuonKey(romaji),
			GroupRomajiTitle:   romaji,
			ChronologicalOrder: 0,
		}
	}

	// Update cache
	s.mu.Lock()
	s.mangaSortMap = result
	s.mu.Unlock()

	s.logger.Info().Int("entries", len(result)).Msg("gojuuon: Manga sort order computed")
	return result, nil
}

// -----------------------------------------------------------------------
// Internal: series group discovery via depth-limited relation traversal
// -----------------------------------------------------------------------

type seriesMember struct {
	id        int
	romaji    string
	startDate time.Time
}

// findAnimeSeriesGroup discovers all related anime (PREQUEL/SEQUEL) up to
// maxDepth levels from the given startID. Returns a list of series members.
func (s *Service) findAnimeSeriesGroup(
	startID int,
	client anilist.AnilistClient,
	rl *limiter.Limiter,
	maxDepth int,
) []*seriesMember {
	visited := make(map[int]*seriesMember)
	s.walkRelations(startID, client, rl, maxDepth, 0, visited)

	members := make([]*seriesMember, 0, len(visited))
	for _, m := range visited {
		members = append(members, m)
	}
	return members
}

func (s *Service) walkRelations(
	mediaID int,
	client anilist.AnilistClient,
	rl *limiter.Limiter,
	maxDepth int,
	currentDepth int,
	visited map[int]*seriesMember,
) {
	if _, ok := visited[mediaID]; ok {
		return
	}
	if currentDepth > maxDepth {
		return
	}

	// Fetch the complete anime to get relations
	rl.Wait()
	res, err := client.CompleteAnimeByID(context.Background(), &mediaID)
	if err != nil {
		s.logger.Debug().Err(err).Int("mediaId", mediaID).Msg("gojuuon: Failed to fetch anime for relation traversal")
		return
	}
	media := res.GetMedia()
	if media == nil {
		return
	}

	romaji := ""
	if media.Title != nil && media.Title.Romaji != nil {
		romaji = *media.Title.Romaji
	}

	visited[mediaID] = &seriesMember{
		id:        mediaID,
		romaji:    romaji,
		startDate: startDateToTime(media.StartDate),
	}

	if media.Relations == nil {
		return
	}

	edges := media.GetRelations().GetEdges()
	for _, edge := range edges {
		if edge == nil || edge.RelationType == nil || edge.Node == nil {
			continue
		}
		relType := *edge.RelationType
		if relType != anilist.MediaRelationPrequel && relType != anilist.MediaRelationSequel {
			continue
		}
		nodeID := edge.GetNode().ID
		if _, ok := visited[nodeID]; ok {
			continue
		}
		s.walkRelations(nodeID, client, rl, maxDepth, currentDepth+1, visited)
	}
}

func startDateToTime(d *anilist.CompleteAnime_StartDate) time.Time {
	if d == nil {
		return time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC)
	}
	year := 9999
	month := 1
	day := 1
	if d.Year != nil {
		year = *d.Year
	}
	if d.Month != nil {
		month = *d.Month
	}
	if d.Day != nil {
		day = *d.Day
	}
	return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
}

// sortGroup sorts series members chronologically by start date.
func sortGroup(members []*seriesMember) {
	sort.Slice(members, func(i, j int) bool {
		return members[i].startDate.Before(members[j].startDate)
	})
}
