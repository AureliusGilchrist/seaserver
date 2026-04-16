package unmatched

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/animap"
	"seanime/internal/database/db"
	"seanime/internal/util/result"

	"github.com/samber/lo"

	"github.com/rs/zerolog"
)

const (
	UnmatchedBasePath = "/aeternae/Soul/Otaku Media/Unmatched"
)

type Repository struct {
	logger   *zerolog.Logger
	database *db.Database

	metadataCache  *animap.Cache
	cacheMu        sync.Mutex
	cachedTorrents []*UnmatchedTorrent
	cacheExpiry    time.Time
}

func NewRepository(logger *zerolog.Logger, database *db.Database) *Repository {
	return &Repository{
		logger:        logger,
		database:      database,
		metadataCache: &animap.Cache{Cache: result.NewCache[string, *animap.Anime]()},
	}
}

// getAnimeBasePath returns the user's configured library path from settings
func (r *Repository) getAnimeBasePath() string {
	if r.database == nil {
		r.logger.Warn().Msg("unmatched: Database not available, using default path")
		return "/aeternae/Soul/Otaku Media/Anime"
	}
	libraryPath, err := r.database.GetLibraryPathFromSettings()
	if err != nil || libraryPath == "" {
		r.logger.Warn().Err(err).Msg("unmatched: Could not get library path from settings, using default")
		return "/aeternae/Soul/Otaku Media/Anime"
	}
	return libraryPath
}

// UnmatchedTorrent represents a downloaded torrent that hasn't been matched to an anime yet
type UnmatchedTorrent struct {
	Name      string             `json:"name"`
	Path      string             `json:"path"`
	Size      int64              `json:"size"`
	FileCount int                `json:"fileCount"`
	Files     []*UnmatchedFile   `json:"files"`
	Seasons   []*UnmatchedSeason `json:"seasons,omitempty"`
	// Anime metadata (from AniList, stored when torrent is added)
	AnimeID               int    `json:"animeId,omitempty"`
	AnimeTitleRomaji      string `json:"animeTitleRomaji,omitempty"`
	AnimeTitleNative      string `json:"animeTitleNative,omitempty"`
	AnimeFormat           string `json:"animeFormat,omitempty"`
	AnimeStartYear        int    `json:"animeStartYear,omitempty"`
	AnimeExpectedEpisodes int    `json:"animeExpectedEpisodes,omitempty"`
}

// TorrentMetadata stores anime info for an unmatched torrent
type TorrentMetadata struct {
	AnimeID               int    `json:"animeId"`
	AnimeTitleRomaji      string `json:"animeTitleRomaji"`
	AnimeTitleNative      string `json:"animeTitleNative"`
	AnimeFormat           string `json:"animeFormat,omitempty"`
	AnimeStartYear        int    `json:"animeStartYear,omitempty"`
	AnimeExpectedEpisodes int    `json:"animeExpectedEpisodes,omitempty"`
}

// UnmatchedSeason represents a season folder within a torrent
type UnmatchedSeason struct {
	Name   string           `json:"name"`
	Path   string           `json:"path"`
	Files  []*UnmatchedFile `json:"files"`
	Number int              `json:"number"` // Extracted season number
}

// UnmatchedFile represents a single file within an unmatched torrent
type UnmatchedFile struct {
	Name         string `json:"name"`
	Path         string `json:"path"`
	RelativePath string `json:"relativePath"` // Path relative to torrent root
	Size         int64  `json:"size"`
	IsVideo      bool   `json:"isVideo"`
	Season       string `json:"season,omitempty"`       // Season folder name if applicable
	SeasonNumber int    `json:"seasonNumber,omitempty"` // Extracted season number
}

// MatchRequest represents a request to match files to an anime
type MatchRequest struct {
	TorrentName           string   `json:"torrentName"`
	SelectedFiles         []string `json:"selectedFiles"` // Relative paths of selected files
	AnimeID               int      `json:"animeId"`
	AnimeTitleJP          string   `json:"animeTitleJp"`    // Japanese title from AniList
	AnimeTitleClean       string   `json:"animeTitleClean"` // Cleaned title for folder name
	UseIndexBasedEpisodes bool     `json:"useIndexBasedEpisodes"`
	EpisodeOffset         int      `json:"episodeOffset"`
}

// MatchResult represents the result of a match operation
type MatchResult struct {
	Success      bool     `json:"success"`
	MovedFiles   []string `json:"movedFiles"`
	FailedFiles  []string `json:"failedFiles"`
	Destination  string   `json:"destination"`
	ErrorMessage string   `json:"errorMessage,omitempty"`
}

// GetUnmatchedTorrents returns all torrents in the unmatched directory that are fully downloaded
func (r *Repository) GetUnmatchedTorrents() ([]*UnmatchedTorrent, error) {
	if torrents := r.getCachedTorrents(); torrents != nil {
		return torrents, nil
	}

	if _, err := os.Stat(UnmatchedBasePath); os.IsNotExist(err) {
		// Create the directory if it doesn't exist
		if err := os.MkdirAll(UnmatchedBasePath, 0755); err != nil {
			return nil, fmt.Errorf("failed to create unmatched directory: %w", err)
		}
		return []*UnmatchedTorrent{}, nil
	}

	var torrents []*UnmatchedTorrent

	entries, err := os.ReadDir(UnmatchedBasePath)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		name := entry.Name()
		fullPath := filepath.Join(UnmatchedBasePath, name)

		// Single files in the root
		if !entry.IsDir() {
			if isTempFileName(name) {
				continue
			}
			if !isVideoFile(name) {
				continue
			}
			fileTorrent, scanErr := r.scanSingleFile(name, fullPath)
			if scanErr != nil {
				r.logger.Warn().Err(scanErr).Str("path", fullPath).Msg("unmatched: Failed to scan unmatched file")
				continue
			}
			if fileTorrent.FileCount > 0 {
				torrents = append(torrents, fileTorrent)
			}
			continue
		}

		// Directories: treat each top-level folder as a torrent root
		if hasTempFiles(fullPath) {
			continue
		}
		if !hasVideoFiles(fullPath) {
			continue
		}

		torrent, scanErr := r.scanTorrentDirectory(name, fullPath)
		if scanErr != nil {
			r.logger.Warn().Err(scanErr).Str("path", fullPath).Msg("unmatched: Failed to scan torrent directory")
			continue
		}
		if torrent.FileCount > 0 {
			torrents = append(torrents, torrent)
		}
	}

	r.setCachedTorrents(torrents)
	return torrents, nil
}

func (r *Repository) getCachedTorrents() []*UnmatchedTorrent {
	r.cacheMu.Lock()
	defer r.cacheMu.Unlock()
	if r.cachedTorrents == nil || time.Now().After(r.cacheExpiry) {
		return nil
	}
	// Return a shallow copy to avoid callers mutating cache
	out := make([]*UnmatchedTorrent, len(r.cachedTorrents))
	copy(out, r.cachedTorrents)
	return out
}

func (r *Repository) setCachedTorrents(torrents []*UnmatchedTorrent) {
	r.cacheMu.Lock()
	defer r.cacheMu.Unlock()
	r.cachedTorrents = torrents
	r.cacheExpiry = time.Now().Add(10 * time.Second)
}

func (r *Repository) invalidateCache() {
	r.cacheMu.Lock()
	defer r.cacheMu.Unlock()
	r.cachedTorrents = nil
	r.cacheExpiry = time.Time{}
}

// InvalidateCache clears the cached unmatched torrents so a fresh scan is used.
func (r *Repository) InvalidateCache() {
	r.invalidateCache()
}

// hasTempFiles checks if a directory contains any qBittorrent temp files (still downloading)
func hasTempFiles(path string) bool {
	hasTemp := false

	filepath.Walk(path, func(filePath string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if info.IsDir() {
			return nil
		}

		name := info.Name()

		// Check for qBittorrent temp file extensions
		if strings.HasSuffix(name, ".!qB") || strings.HasSuffix(name, ".qBt") {
			hasTemp = true
			return filepath.SkipAll
		}

		// Check for other common temp file patterns
		if strings.HasSuffix(name, ".part") || strings.HasSuffix(name, ".temp") ||
			strings.HasSuffix(name, ".downloading") || strings.HasSuffix(name, ".incomplete") {
			hasTemp = true
			return filepath.SkipAll
		}

		return nil
	})

	return hasTemp
}

func hasVideoFiles(path string) bool {
	hasVideo := false

	filepath.Walk(path, func(filePath string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			return nil
		}
		if isVideoFile(info.Name()) {
			hasVideo = true
			return filepath.SkipAll
		}
		return nil
	})

	return hasVideo
}

// GetTorrentContents returns the detailed contents of a specific torrent
func (r *Repository) GetTorrentContents(torrentName string) (*UnmatchedTorrent, error) {
	torrentPath := filepath.Join(UnmatchedBasePath, torrentName)
	info, err := os.Stat(torrentPath)
	if os.IsNotExist(err) {
		return nil, fmt.Errorf("torrent not found: %s", torrentName)
	}
	if err != nil {
		return nil, err
	}

	if info.IsDir() {
		return r.scanTorrentDirectory(torrentName, torrentPath)
	}

	if isTempFileName(info.Name()) {
		return nil, fmt.Errorf("torrent still downloading: %s", torrentName)
	}
	if !isVideoFile(info.Name()) {
		return nil, fmt.Errorf("unsupported file type: %s", torrentName)
	}

	return r.scanSingleFile(torrentName, torrentPath)
}

// scanTorrentDirectory scans a torrent directory and returns its structure
func (r *Repository) scanTorrentDirectory(name, path string) (*UnmatchedTorrent, error) {
	torrent := &UnmatchedTorrent{
		Name:    name,
		Path:    path,
		Files:   make([]*UnmatchedFile, 0),
		Seasons: make([]*UnmatchedSeason, 0),
	}

	// Load anime metadata if it exists
	if metadata := r.loadTorrentMetadata(path); metadata != nil {
		torrent.AnimeID = metadata.AnimeID
		torrent.AnimeTitleRomaji = metadata.AnimeTitleRomaji
		torrent.AnimeTitleNative = metadata.AnimeTitleNative
		torrent.AnimeFormat = metadata.AnimeFormat
		torrent.AnimeStartYear = metadata.AnimeStartYear
		torrent.AnimeExpectedEpisodes = metadata.AnimeExpectedEpisodes

		// Best-effort: fetch episode titles from Animap using AniList ID to name files
		if metadata.AnimeID > 0 {
			if animeMeta, err := r.fetchAnimeMetadata(metadata.AnimeID); err == nil && animeMeta != nil {
				torrent.AnimeTitleRomaji = firstNonEmpty(torrent.AnimeTitleRomaji, animeMeta.Title, animeMeta.Titles["romaji"], animeMeta.Titles["english"], animeMeta.Titles["native"])
				if animeMeta.Episodes != nil && torrent.AnimeExpectedEpisodes == 0 {
					torrent.AnimeExpectedEpisodes = len(animeMeta.Episodes)
				}
			}
		}
	}

	seasonMap := make(map[string]*UnmatchedSeason)

	err := filepath.Walk(path, func(filePath string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			// Check if this is a season folder
			if filePath != path {
				seasonNum := extractSeasonNumber(info.Name())
				if seasonNum > 0 {
					season := &UnmatchedSeason{
						Name:   info.Name(),
						Path:   filePath,
						Number: seasonNum,
						Files:  make([]*UnmatchedFile, 0),
					}
					seasonMap[filePath] = season
				}
			}
			return nil
		}

		// Skip non-video files
		if !isVideoFile(info.Name()) {
			return nil
		}

		relativePath, _ := filepath.Rel(path, filePath)
		file := &UnmatchedFile{
			Name:         info.Name(),
			Path:         filePath,
			RelativePath: relativePath,
			Size:         info.Size(),
			IsVideo:      true,
		}

		// Check if file belongs to a season folder
		parentDir := filepath.Dir(filePath)
		if season, ok := seasonMap[parentDir]; ok {
			file.Season = season.Name
			file.SeasonNumber = season.Number
			season.Files = append(season.Files, file)
		} else {
			// Check if parent is a season folder we haven't seen yet
			parentName := filepath.Base(parentDir)
			seasonNum := extractSeasonNumber(parentName)
			if seasonNum > 0 && parentDir != path {
				season := &UnmatchedSeason{
					Name:   parentName,
					Path:   parentDir,
					Number: seasonNum,
					Files:  make([]*UnmatchedFile, 0),
				}
				seasonMap[parentDir] = season
				file.Season = season.Name
				file.SeasonNumber = season.Number
				season.Files = append(season.Files, file)
			}
		}

		torrent.Files = append(torrent.Files, file)
		torrent.Size += info.Size()
		torrent.FileCount++

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Convert season map to slice and sort by season number
	for _, season := range seasonMap {
		if len(season.Files) > 0 {
			torrent.Seasons = append(torrent.Seasons, season)
		}
	}
	sort.Slice(torrent.Seasons, func(i, j int) bool {
		return torrent.Seasons[i].Number < torrent.Seasons[j].Number
	})

	return torrent, nil
}

// fetchAnimeMetadata gets Animap metadata for an AniList ID with simple caching.
func (r *Repository) fetchAnimeMetadata(anilistID int) (*animap.Anime, error) {
	cacheKey := fmt.Sprintf("anilist:%d", anilistID)

	if cached, ok := r.metadataCache.Get(cacheKey); ok {
		return cached, nil
	}

	media, err := animap.FetchAnimapMedia("anilist", anilistID)
	if err != nil {
		return nil, err
	}

	r.metadataCache.Set(cacheKey, media)
	return media, nil
}

// getEpisodeTitle returns the English episode title when available, falling back to AniDB titles.
func (r *Repository) getEpisodeTitle(anilistID int, episodeNum int) string {
	if anilistID <= 0 || episodeNum <= 0 {
		return ""
	}

	media, err := r.fetchAnimeMetadata(anilistID)
	if err != nil || media == nil || media.Episodes == nil {
		return ""
	}

	epKey := strconv.Itoa(episodeNum)
	ep, ok := media.Episodes[epKey]
	if !ok || ep == nil {
		return ""
	}

	return firstNonEmpty(ep.TvdbTitle, ep.AnidbTitle)
}

// firstNonEmpty returns the first non-empty string from the provided list.
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// MatchAndMoveFiles matches selected files to an anime and moves them to the anime directory
func (r *Repository) MatchAndMoveFiles(req *MatchRequest) (*MatchResult, error) {
	result := &MatchResult{
		Success:     true,
		MovedFiles:  make([]string, 0),
		FailedFiles: make([]string, 0),
	}

	if req.AnimeTitleClean == "" {
		return nil, errors.New("anime title is required")
	}

	// Clean the anime title for use as folder name
	cleanTitle := sanitizeNamePreserveWhitespace(req.AnimeTitleClean)
	destination := filepath.Join(r.getAnimeBasePath(), cleanTitle)

	// Create destination directory
	if err := os.MkdirAll(destination, 0755); err != nil {
		return nil, fmt.Errorf("failed to create destination directory: %w", err)
	}

	result.Destination = destination

	// Get torrent contents to understand the structure
	torrent, err := r.GetTorrentContents(req.TorrentName)
	if err != nil {
		return nil, err
	}

	// Build a map of selected files
	selectedMap := make(map[string]bool)
	for _, f := range req.SelectedFiles {
		selectedMap[f] = true
	}

	// Group files by season for episode numbering
	var filesToMove []fileWithSeason

	for _, file := range torrent.Files {
		if selectedMap[file.RelativePath] {
			filesToMove = append(filesToMove, fileWithSeason{
				file:   file,
				season: file.SeasonNumber,
			})
		}
	}

	// Work only with video files (ignore folders/other types)
	videoFiles := lo.Filter(filesToMove, func(f fileWithSeason, _ int) bool {
		return f.file.IsVideo
	})

	// Sort video files by season, then by name (to maintain episode order)
	sort.Slice(videoFiles, func(i, j int) bool {
		if videoFiles[i].season != videoFiles[j].season {
			return videoFiles[i].season < videoFiles[j].season
		}
		return videoFiles[i].file.Name < videoFiles[j].file.Name
	})

	// Calculate episode offset for each season (stacking) using video files only
	seasonOffsets := r.calculateSeasonOffsets(videoFiles)

	// Enforce expected episode count for TV/OVA using video files only (ignore folders)
	// If we have fewer files than the expected count, log a warning but continue. Some torrents
	// legitimately have fewer episodes than AniList metadata, and users may intentionally match a subset.
	// Use the user-selected AniList ID instead of the torrent's cached ID to respect manual selection.
	var expectedEpisodes int
	if req.AnimeID > 0 {
		if animeMeta, err := r.fetchAnimeMetadata(req.AnimeID); err == nil && animeMeta != nil && animeMeta.Episodes != nil {
			expectedEpisodes = len(animeMeta.Episodes)
		}
	} else if torrent.AnimeExpectedEpisodes > 0 {
		expectedEpisodes = torrent.AnimeExpectedEpisodes
	}

	if expectedEpisodes > 0 {
		if len(videoFiles) == 0 {
			return nil, fmt.Errorf("no video files selected to match")
		}
		if len(videoFiles) < expectedEpisodes {
			r.logger.Warn().
				Str("torrent", torrent.Name).
				Int("expectedEpisodes", expectedEpisodes).
				Int("selectedVideos", len(videoFiles)).
				Msg("unmatched: fewer video files than expected; proceeding with selected files")
		}
	}

	// Move and rename files
	for i, fw := range videoFiles {
		ext := filepath.Ext(fw.file.Name)

		// Determine format from user-selected AniList ID, falling back to torrent cached format
		var format string
		if req.AnimeID > 0 {
			if animeMeta, err := r.fetchAnimeMetadata(req.AnimeID); err == nil && animeMeta != nil && animeMeta.Type != "" {
				format = animeMeta.Type
			}
		} else if torrent.AnimeFormat != "" {
			format = torrent.AnimeFormat
		}
		// Normalize to uppercase to match existing checks
		formatUpper := strings.ToUpper(format)

		// Movie naming: <AnimeTitle> (<Year>)
		// Use user-selected AniList ID to fetch the correct year instead of cached torrent metadata
		var startYear int
		if req.AnimeID > 0 {
			if animeMeta, err := r.fetchAnimeMetadata(req.AnimeID); err == nil && animeMeta != nil && animeMeta.StartDate != "" {
				// Extract year from StartDate (format: YYYY-MM-DD)
				if len(animeMeta.StartDate) >= 4 {
					if parsed, err := strconv.Atoi(animeMeta.StartDate[:4]); err == nil {
						startYear = parsed
					}
				}
			}
		} else if torrent.AnimeStartYear > 0 {
			startYear = torrent.AnimeStartYear
		}

		if formatUpper == "MOVIE" {
			yearSuffix := ""
			if startYear > 0 {
				yearSuffix = fmt.Sprintf(" (%d)", startYear)
			}
			movieBase := fmt.Sprintf("%s%s", cleanTitle, yearSuffix)
			safeMovieBase := sanitizeNamePreserveWhitespace(movieBase)
			newName := fmt.Sprintf("%s%s", safeMovieBase, ext)
			destPath := filepath.Join(destination, newName)

			if err := r.moveFile(fw.file.Path, destPath); err != nil {
				r.logger.Error().Err(err).Str("src", fw.file.Path).Str("dest", destPath).Msg("unmatched: Failed to move file")
				result.FailedFiles = append(result.FailedFiles, fw.file.RelativePath)
				result.Success = false
			} else {
				result.MovedFiles = append(result.MovedFiles, newName)
				r.logger.Info().Str("src", fw.file.Path).Str("dest", destPath).Msg("unmatched: Moved file")
			}
			continue
		}

		var episodeNum int
		if req.UseIndexBasedEpisodes {
			offset := req.EpisodeOffset
			if offset <= 0 {
				offset = 1
			}
			episodeNum = i + offset
		} else {
			baseEpisode := extractEpisodeNumber(fw.file.Name)
			episodeNum = i + 1
			if fw.season > 0 {
				// Apply season offset for stacking
				if baseEpisode > 0 {
					episodeNum = seasonOffsets[fw.season] + baseEpisode
				}
			} else if baseEpisode > 0 {
				// Use the actual episode number from the filename instead of sort index
				episodeNum = baseEpisode
			}
		}

		episodeTitle := r.getEpisodeTitle(req.AnimeID, episodeNum)
		baseName := fmt.Sprintf("%s - Episode %03d", cleanTitle, episodeNum)
		if episodeTitle != "" {
			baseName = fmt.Sprintf("%s - Episode %03d - %s", cleanTitle, episodeNum, episodeTitle)
		}
		safeBaseName := sanitizeNamePreserveWhitespace(baseName)
		newName := fmt.Sprintf("%s%s", safeBaseName, ext)
		destPath := filepath.Join(destination, newName)

		// Move the file
		if err := r.moveFile(fw.file.Path, destPath); err != nil {
			r.logger.Error().Err(err).Str("src", fw.file.Path).Str("dest", destPath).Msg("unmatched: Failed to move file")
			result.FailedFiles = append(result.FailedFiles, fw.file.RelativePath)
			result.Success = false
		} else {
			result.MovedFiles = append(result.MovedFiles, newName)
			r.logger.Info().Str("src", fw.file.Path).Str("dest", destPath).Msg("unmatched: Moved file")
		}
	}

	// Clean up empty torrent directory if all files were moved
	if len(result.FailedFiles) == 0 {
		r.cleanupEmptyDirectories(filepath.Join(UnmatchedBasePath, req.TorrentName))
		r.invalidateCache()
	}

	// Save user's selection back to torrent metadata if the match was successful
	// This ensures that if any files remain, they use the correct metadata in future scans
	if result.Success && req.AnimeID > 0 && len(result.MovedFiles) > 0 {
		// Fetch metadata for the user-selected anime
		if animeMeta, err := r.fetchAnimeMetadata(req.AnimeID); err == nil && animeMeta != nil {
			startYear := 0
			if animeMeta.StartDate != "" && len(animeMeta.StartDate) >= 4 {
				// Extract year from StartDate (format: YYYY-MM-DD)
				if parsed, err := strconv.Atoi(animeMeta.StartDate[:4]); err == nil {
					startYear = parsed
				}
			}
			
			// Save the user's selection to override the cached metadata
			if err := r.SaveTorrentMetadata(req.TorrentName, req.AnimeID, animeMeta.Title, "", animeMeta.Type, startYear); err != nil {
				r.logger.Warn().Err(err).Str("torrent", req.TorrentName).Msg("unmatched: Failed to save user's selection metadata")
			} else {
				r.logger.Debug().Int("animeId", req.AnimeID).Str("torrent", req.TorrentName).Msg("unmatched: Saved user's selection metadata")
			}
		}
	}

	if len(result.FailedFiles) > 0 {
		result.ErrorMessage = fmt.Sprintf("Failed to move %d files", len(result.FailedFiles))
	}

	return result, nil
}

// fileWithSeason pairs a file with its season number
type fileWithSeason struct {
	file   *UnmatchedFile
	season int
}

// calculateSeasonOffsets calculates the episode offset for each season for stacking
func (r *Repository) calculateSeasonOffsets(files []fileWithSeason) map[int]int {
	offsets := make(map[int]int)
	seasonEpisodeCounts := make(map[int]int)

	// Count episodes per season
	for _, fw := range files {
		if fw.season > 0 {
			seasonEpisodeCounts[fw.season]++
		}
	}

	// Calculate cumulative offsets
	// Season 1 starts at 0, Season 2 starts at Season 1 count, etc.
	var seasons []int
	for s := range seasonEpisodeCounts {
		seasons = append(seasons, s)
	}
	sort.Ints(seasons)

	cumulative := 0
	for _, s := range seasons {
		offsets[s] = cumulative
		cumulative += seasonEpisodeCounts[s]
	}

	return offsets
}

// moveFile moves a file from src to dest, handling cross-device moves
func (r *Repository) moveFile(src, dest string) error {
	// Try rename first (fastest if on same filesystem)
	if err := os.Rename(src, dest); err == nil {
		return nil
	}

	// Fall back to copy + delete for cross-device moves
	srcFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	destFile, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, srcFile); err != nil {
		os.Remove(dest) // Clean up partial file
		return err
	}

	// Sync to ensure data is written
	if err := destFile.Sync(); err != nil {
		return err
	}

	// Remove source file
	return os.Remove(src)
}

// cleanupEmptyDirectories removes empty directories recursively
func (r *Repository) cleanupEmptyDirectories(path string) {
	filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			entries, _ := os.ReadDir(p)
			if len(entries) == 0 {
				os.Remove(p)
			}
		}
		return nil
	})

	// Try to remove the root directory if empty
	entries, _ := os.ReadDir(path)
	if len(entries) == 0 {
		os.Remove(path)
	}
}

// DeleteTorrent removes a torrent directory from the unmatched folder
func (r *Repository) DeleteTorrent(torrentName string) error {
	torrentPath := filepath.Join(UnmatchedBasePath, torrentName)
	info, err := os.Stat(torrentPath)
	if os.IsNotExist(err) {
		return fmt.Errorf("torrent not found: %s", torrentName)
	}
	if err != nil {
		return err
	}

	if info.IsDir() {
		err := os.RemoveAll(torrentPath)
		if err == nil {
			r.invalidateCache()
		}
		return err
	}
	err = os.Remove(torrentPath)
	if err == nil {
		r.invalidateCache()
	}
	return err
}

// GetUnmatchedDestination returns the path where a torrent should be downloaded
func (r *Repository) GetUnmatchedDestination(torrentName string) string {
	return filepath.Join(UnmatchedBasePath, sanitizeNamePreserveWhitespace(torrentName))
}

const metadataFileName = ".seanime-metadata.json"

// SaveTorrentMetadata saves anime metadata for a torrent
func (r *Repository) SaveTorrentMetadata(torrentName string, animeID int, titleRomaji, titleNative, format string, startYear int) error {
	torrentPath := filepath.Join(UnmatchedBasePath, sanitizeNamePreserveWhitespace(torrentName))

	// Create directory if it doesn't exist
	if err := os.MkdirAll(torrentPath, 0755); err != nil {
		return fmt.Errorf("failed to create torrent directory: %w", err)
	}

	metadata := TorrentMetadata{
		AnimeID:          animeID,
		AnimeTitleRomaji: titleRomaji,
		AnimeTitleNative: titleNative,
		AnimeFormat:      format,
		AnimeStartYear:   startYear,
	}

	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	metadataPath := filepath.Join(torrentPath, metadataFileName)
	if err := os.WriteFile(metadataPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write metadata: %w", err)
	}

	r.logger.Debug().Str("torrent", torrentName).Int("animeId", animeID).Str("title", titleRomaji).Msg("unmatched: Saved torrent metadata")
	return nil
}

// loadTorrentMetadata loads anime metadata for a torrent if it exists
func (r *Repository) loadTorrentMetadata(torrentPath string) *TorrentMetadata {
	metadataPath := filepath.Join(torrentPath, metadataFileName)

	data, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil
	}

	var metadata TorrentMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		r.logger.Warn().Err(err).Str("path", metadataPath).Msg("unmatched: Failed to parse metadata")
		return nil
	}

	return &metadata
}

// Helper functions

func isVideoFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	videoExts := []string{".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts"}
	for _, e := range videoExts {
		if ext == e {
			return true
		}
	}
	return false
}

func isTempFileName(name string) bool {
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".!qb") || strings.HasSuffix(lower, ".qbt") {
		return true
	}
	if strings.HasSuffix(lower, ".part") || strings.HasSuffix(lower, ".temp") ||
		strings.HasSuffix(lower, ".downloading") || strings.HasSuffix(lower, ".incomplete") {
		return true
	}
	return false
}

func (r *Repository) scanSingleFile(name, path string) (*UnmatchedTorrent, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("expected file but got directory: %s", path)
	}

	torrent := &UnmatchedTorrent{
		Name:    name,
		Path:    path,
		Files:   make([]*UnmatchedFile, 0),
		Seasons: make([]*UnmatchedSeason, 0),
	}

	file := &UnmatchedFile{
		Name:         info.Name(),
		Path:         path,
		RelativePath: info.Name(),
		Size:         info.Size(),
		IsVideo:      true,
	}

	torrent.Files = append(torrent.Files, file)
	torrent.Size = info.Size()
	torrent.FileCount = 1

	return torrent, nil
}

func extractSeasonNumber(name string) int {
	name = strings.ToLower(name)

	// Match patterns like "Season 1", "S01", "Season01", "S1"
	patterns := []string{
		`season\s*(\d+)`,
		`s(\d+)`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindStringSubmatch(name)
		if len(matches) > 1 {
			num, err := strconv.Atoi(matches[1])
			if err == nil {
				return num
			}
		}
	}

	return 0
}

func extractEpisodeNumber(name string) int {
	base := filepath.Base(name)
	ext := filepath.Ext(base)
	base = strings.TrimSuffix(base, ext)
	lower := strings.ToLower(base)
	lower = strings.NewReplacer("_", " ", ".", " ").Replace(lower)

	// Strip common noise that contains numbers but isn't episode info:
	// [1080p], [720p], [480p], (1080p), x264, x265, h264, h265, 10bit, etc.
	noise := regexp.MustCompile(`(?i)[\[\(]\d{3,4}p[\]\)]|\b\d{3,4}p\b|\b(?:[xh]\.?26[45]|hevc|av1|flac|aac|opus|blu-?ray|b[rd]rip|web[- ]?dl|webrip|dual[- ]audio|multi[- ]subtitle|uncensored)\b|\b\d+[_-]?bit\b`)
	cleaned := noise.ReplaceAllString(lower, " ")

	// Strip subgroup tags in brackets: [SubGroup], (SubGroup)
	brackets := regexp.MustCompile(`[\[\(][^\]\)]*[\]\)]`)
	cleaned = brackets.ReplaceAllString(cleaned, " ")

	// 1. Most specific: S01E05 pattern — always episode
	re := regexp.MustCompile(`s\d+\s*e(\d+)`)
	if m := re.FindStringSubmatch(cleaned); len(m) > 1 {
		if num, err := strconv.Atoi(m[1]); err == nil && num > 0 && num < 10000 {
			return num
		}
	}

	// 2. "Episode ##" or "Episode ##" — explicit label
	re = regexp.MustCompile(`episode\s*(\d+)`)
	if m := re.FindStringSubmatch(cleaned); len(m) > 1 {
		if num, err := strconv.Atoi(m[1]); err == nil && num > 0 && num < 10000 {
			return num
		}
	}

	// 3. Standalone "EP##" or "E##" with word boundary (not preceded by letter)
	re = regexp.MustCompile(`(?:^|[^a-z])ep?\s*(\d+)(?:[^a-z\d]|$)`)
	if m := re.FindStringSubmatch(cleaned); len(m) > 1 {
		if num, err := strconv.Atoi(m[1]); err == nil && num > 0 && num < 10000 {
			return num
		}
	}

	// 4. " - ## " pattern — take the LAST match since the episode separator
	//    comes after the title. This avoids matching numbers in series names
	//    like "86 EIGHTY-SIX - 03" or "Season 2 - 05".
	//    Also strip "season X" before scanning to avoid "Season 2 - " being matched.
	noSeason := regexp.MustCompile(`(?i)\bseason\s*\d+\b|\b\d+(?:st|nd|rd|th)\s+season\b|\bcour\s*\d+\b|\bpart\s*\d+\b`).ReplaceAllString(cleaned, " ")
	re = regexp.MustCompile(`-\s*(\d+)`)
	allMatches := re.FindAllStringSubmatch(noSeason, -1)
	if len(allMatches) > 0 {
		last := allMatches[len(allMatches)-1]
		if num, err := strconv.Atoi(last[1]); err == nil && num > 0 && num < 10000 {
			return num
		}
	}

	// 5. A trailing standalone number — last resort for names like "Show 03"
	re = regexp.MustCompile(`(?:^|[^a-z\d])(\d{1,4})(?:v\d+)?\s*$`)
	if m := re.FindStringSubmatch(cleaned); len(m) > 1 {
		if num, err := strconv.Atoi(m[1]); err == nil && num > 0 && num < 10000 {
			return num
		}
	}

	return 0
}

func sanitizeDirectoryName(input string) string {
	return sanitizeNamePreserveWhitespace(input)
}

func sanitizeNamePreserveWhitespace(input string) string {
	return strings.ReplaceAll(input, "/", "-")
}
