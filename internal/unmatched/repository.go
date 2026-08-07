package unmatched

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"seanime/internal/util/comparison"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/api/animap"
	"seanime/internal/database/db"
	"seanime/internal/util/result"

	"github.com/5rahim/habari"
	"github.com/samber/lo"

	"github.com/rs/zerolog"
)

// UnmatchedBasePath is the staging directory downloads land in before they are matched.
// A variable rather than a constant only so tests can point it at a temporary directory —
// nothing outside of tests ever assigns to it.
var UnmatchedBasePath = "/zroot/torrents/Anime/Unmatched"

// FallbackAnimeBasePath is the library directory used when settings cannot be read. Like
// UnmatchedBasePath, it is a variable only so tests can point it at a temporary directory —
// nothing outside of tests ever assigns to it.
var FallbackAnimeBasePath = "/zroot/Soul/Otaku Media/Anime"

type Repository struct {
	logger   *zerolog.Logger
	database *db.Database

	metadataCache  *animap.Cache
	cacheMu        sync.Mutex
	cachedTorrents []*UnmatchedTorrent
	cacheExpiry    time.Time
	// contentCache stores full torrent contents (files + seasons) for instant retrieval
	contentCache map[string]*UnmatchedTorrent

	// metadataByTorrent memoises the stored records, misses included. Keyed by metadataKey.
	metadataMu        sync.Mutex
	metadataByTorrent map[string]*TorrentMetadata
}

func NewRepository(logger *zerolog.Logger, database *db.Database) *Repository {
	return &Repository{
		logger:            logger,
		database:          database,
		metadataCache:     &animap.Cache{Cache: result.NewCache[string, *animap.Anime]()},
		contentCache:      make(map[string]*UnmatchedTorrent),
		metadataByTorrent: make(map[string]*TorrentMetadata),
	}
}

// getAnimeBasePath returns the user's configured library path from settings
func (r *Repository) getAnimeBasePath() string {
	if r.database == nil {
		r.logger.Warn().Msg("unmatched: Database not available, using default path")
		return FallbackAnimeBasePath
	}
	libraryPath, err := r.database.GetLibraryPathFromSettings()
	if err != nil || libraryPath == "" {
		r.logger.Warn().Err(err).Msg("unmatched: Could not get library path from settings, using default")
		return FallbackAnimeBasePath
	}
	return libraryPath
}

// GetAnimeBasePath is the exported version of getAnimeBasePath for use by handlers.
func (r *Repository) GetAnimeBasePath() string {
	return r.getAnimeBasePath()
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
	// AutoMatch marks the torrent to be matched automatically as soon as it finishes
	// downloading, without waiting for the user to match it by hand.
	AutoMatch bool `json:"autoMatch,omitempty"`
}

// TorrentMetadata is everything known about a download: which anime it is for, and what naming
// its files will need.
//
// It is captured when the download is queued, from the media page that already knows exactly what
// is being downloaded — including the episode titles, which are the one thing a match cannot work
// out for itself and used to cost a network round trip in the middle of moving files.
type TorrentMetadata struct {
	AnimeID               int    `json:"animeId"`
	AnimeTitleRomaji      string `json:"animeTitleRomaji"`
	AnimeTitleNative      string `json:"animeTitleNative"`
	AnimeFormat           string `json:"animeFormat,omitempty"`
	AnimeStartYear        int    `json:"animeStartYear,omitempty"`
	AnimeExpectedEpisodes int    `json:"animeExpectedEpisodes,omitempty"`
	// AutoMatch marks the torrent to be matched automatically as soon as it finishes
	// downloading, without waiting for the user to match it by hand.
	AutoMatch bool `json:"autoMatch,omitempty"`
	// EpisodeTitles maps episode number to title, keyed the way Animap keys them ("1", "2", …).
	// Present when the metadata was fetched at queue time; absent records simply fall back to
	// fetching at match time.
	EpisodeTitles map[string]string `json:"episodeTitles,omitempty"`
	// MetadataFetchedAt is when the episode data above was captured, RFC 3339.
	MetadataFetchedAt string `json:"metadataFetchedAt,omitempty"`
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
	Success     bool     `json:"success"`
	MovedFiles  []string `json:"movedFiles"`
	FailedFiles []string `json:"failedFiles"`
	// RemovedFiles are creditless/bonus files and "Extra" content deleted rather than moved.
	RemovedFiles []string `json:"removedFiles,omitempty"`
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
	// Store full contents for instant retrieval by GetTorrentContents
	for _, t := range torrents {
		if t != nil {
			r.contentCache[t.Name] = t
		}
	}
}

func (r *Repository) invalidateCache() {
	r.cacheMu.Lock()
	defer r.cacheMu.Unlock()
	r.cachedTorrents = nil
	r.cacheExpiry = time.Time{}
	r.contentCache = make(map[string]*UnmatchedTorrent)
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

// GetTorrentContents returns the detailed contents of a specific torrent.
// It first checks the in-memory content cache (populated during list scans)
// for instant response, falling back to filesystem scan only if needed.
func (r *Repository) GetTorrentContents(torrentName string) (*UnmatchedTorrent, error) {
	// Fast path: return from cache if available
	r.cacheMu.Lock()
	if cached, ok := r.contentCache[torrentName]; ok && cached != nil {
		r.cacheMu.Unlock()
		return cached, nil
	}
	r.cacheMu.Unlock()

	// Slow path: scan from filesystem (cache miss or fresh request)
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

	// What this download is for, from the record written when it was queued. Keyed by the
	// directory's own name, which is the name the download was saved under.
	r.applyMetadata(torrent, r.GetTorrentMetadata(name))

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
	if anilistID <= 0 {
		return ""
	}

	media, err := r.fetchAnimeMetadata(anilistID)
	if err != nil {
		return ""
	}

	return episodeTitleFrom(media, episodeNum)
}

// episodeTitleFrom reads an episode title out of metadata that has already been fetched. Same
// lookup getEpisodeTitle does, without the fetch — a match resolves every one of its titles from
// the single copy of the metadata it fetched up front.
func episodeTitleFrom(media *animap.Anime, episodeNum int) string {
	if media == nil || media.Episodes == nil || episodeNum <= 0 {
		return ""
	}

	ep, ok := media.Episodes[strconv.Itoa(episodeNum)]
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

// AutoMatchTorrent matches a finished torrent to the anime it was downloaded for, using the
// media that was recorded when the torrent was added. It performs exactly the same match a
// user would perform by hand: every video file in the torrent is selected and moved into the
// anime's library folder with episode numbering derived from the file names.
//
// It is a no-op (nil, nil) unless the torrent was queued with auto-match enabled and has a
// known AniList media ID — there is nothing to match against otherwise.
func (r *Repository) AutoMatchTorrent(torrentName string) (*MatchResult, error) {
	metadata := r.GetTorrentMetadata(torrentName)
	if metadata == nil || !metadata.AutoMatch {
		return nil, nil
	}
	if metadata.AnimeID == 0 {
		r.logger.Warn().Str("torrent", torrentName).Msg("unmatched: Auto-match requested but no anime ID was recorded, leaving for manual matching")
		return nil, nil
	}

	torrent, err := r.GetTorrentContents(torrentName)
	if err != nil {
		return nil, fmt.Errorf("failed to read torrent contents: %w", err)
	}

	// Select every video file, which is what a user matching the whole torrent would do.
	selected := make([]string, 0, len(torrent.Files))
	for _, f := range torrent.Files {
		if f != nil && f.IsVideo {
			selected = append(selected, f.RelativePath)
		}
	}
	if len(selected) == 0 {
		return nil, errors.New("no video files to match")
	}

	titleClean := firstNonEmpty(metadata.AnimeTitleRomaji, metadata.AnimeTitleNative, torrentName)
	titleJP := firstNonEmpty(metadata.AnimeTitleNative, metadata.AnimeTitleRomaji)

	r.logger.Info().
		Str("torrent", torrentName).
		Int("animeId", metadata.AnimeID).
		Int("files", len(selected)).
		Msg("unmatched: Auto-matching completed download")

	return r.MatchAndMoveFiles(&MatchRequest{
		TorrentName:     torrentName,
		SelectedFiles:   selected,
		AnimeID:         metadata.AnimeID,
		AnimeTitleJP:    titleJP,
		AnimeTitleClean: titleClean,
		// Name-based episode numbering, matching the modal's default.
		UseIndexBasedEpisodes: false,
	})
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

	// Everything recorded when this download was queued: which anime it is for, and the episode
	// titles the naming below needs. Read once, and kept for the match record too, so undoing the
	// match can put it back — without it the torrent would return to the Unmatched screen with no
	// anime attached.
	preMatchMetadata := r.GetTorrentMetadata(req.TorrentName)

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

	// Never move creditless/bonus content or anything under an "Extra" folder into the
	// library — delete it instead. Auto-match selects every video file in the torrent, so
	// without this the NCOP/NCED would be moved in and numbered as if they were episodes.
	kept := videoFiles[:0]
	for _, fw := range videoFiles {
		if !isNCName(fw.file.Name) && !pathHasExtraSegment(fw.file.RelativePath) {
			kept = append(kept, fw)
			continue
		}
		if err := os.Remove(fw.file.Path); err != nil {
			r.logger.Warn().Err(err).Str("path", fw.file.Path).Msg("unmatched: Failed to delete creditless/extra file")
			continue
		}
		result.RemovedFiles = append(result.RemovedFiles, fw.file.RelativePath)
		r.logger.Info().Str("path", fw.file.Path).Msg("unmatched: Deleted creditless/extra file instead of matching it")
	}
	videoFiles = kept

	// Sort video files by season, then by name (to maintain episode order)
	sort.Slice(videoFiles, func(i, j int) bool {
		if videoFiles[i].season != videoFiles[j].season {
			return videoFiles[i].season < videoFiles[j].season
		}
		return videoFiles[i].file.Name < videoFiles[j].file.Name
	})

	// Calculate episode offset for each season (stacking) using video files only
	seasonOffsets := r.calculateSeasonOffsets(videoFiles)

	// Everything the naming needs — the episode count, the format, the year, every episode title —
	// was captured when the download was queued, so the usual match reads it from the stored record
	// and touches the network not at all.
	//
	// The fetch below is the fallback, for a record that predates this, one that was never enriched
	// because Animap was unreachable at queue time, and for a match to a *different* anime than the
	// one the download was queued for (the user is free to pick another in the modal, and the
	// stored titles belong to the original). It is done once for the whole match: it used to run
	// three times per file, which with an unreachable Animap meant three 8-second timeouts per
	// file — minutes of stalling before anything moved.
	storedMeta := preMatchMetadata
	if !storedMeta.CoversMatch(req.AnimeID) {
		storedMeta = nil
	}

	var animeMeta *animap.Anime
	if req.AnimeID > 0 && storedMeta == nil {
		meta, metaErr := r.fetchAnimeMetadata(req.AnimeID)
		if metaErr != nil {
			r.logger.Warn().Err(metaErr).Int("animeId", req.AnimeID).
				Msg("unmatched: Could not fetch Animap metadata for this match")
		} else {
			animeMeta = meta
		}
	} else if storedMeta != nil {
		r.logger.Debug().Int("animeId", req.AnimeID).Int("episodeTitles", len(storedMeta.EpisodeTitles)).
			Msg("unmatched: Using the metadata stored when this download was queued")
	}

	// Enforce expected episode count for TV/OVA using video files only (ignore folders)
	// If we have fewer files than the expected count, log a warning but continue. Some torrents
	// legitimately have fewer episodes than AniList metadata, and users may intentionally match a subset.
	// Use the user-selected AniList ID instead of the torrent's cached ID to respect manual selection.
	// Prefer the count recorded when the torrent was queued (AniList's, for this exact entry) over
	// the Animap map, which also holds specials and, for multi-season mappings, other seasons.
	var expectedEpisodes int
	if torrent.AnimeExpectedEpisodes > 0 && (req.AnimeID == 0 || req.AnimeID == torrent.AnimeID) {
		expectedEpisodes = torrent.AnimeExpectedEpisodes
	} else if storedMeta != nil && storedMeta.AnimeExpectedEpisodes > 0 {
		expectedEpisodes = storedMeta.AnimeExpectedEpisodes
	} else if animeMeta != nil {
		expectedEpisodes = animeMeta.MainEpisodeCount()
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

	// Determine format from user-selected AniList ID, falling back to what was stored when the
	// download was queued and then to the torrent's cached format.
	var format string
	if req.AnimeID > 0 {
		if animeMeta != nil && animeMeta.Type != "" {
			format = animeMeta.Type
		} else if storedMeta != nil {
			format = storedMeta.AnimeFormat
		}
	} else if torrent.AnimeFormat != "" {
		format = torrent.AnimeFormat
	}
	// Normalize to uppercase to match existing checks
	formatUpper := strings.ToUpper(format)

	// Movie naming: <AnimeTitle> (<Year>)
	var startYear int
	if req.AnimeID > 0 {
		if animeMeta != nil && len(animeMeta.StartDate) >= 4 {
			// Extract year from StartDate (format: YYYY-MM-DD)
			if parsed, err := strconv.Atoi(animeMeta.StartDate[:4]); err == nil {
				startYear = parsed
			}
		} else if storedMeta != nil {
			startYear = storedMeta.AnimeStartYear
		}
	} else if torrent.AnimeStartYear > 0 {
		startYear = torrent.AnimeStartYear
	}

	// Work out every destination name first — this is pure string work, no I/O — then do the moves.
	// Splitting the two is what lets the moves run concurrently below; the names, the numbering and
	// the episode titles are exactly what the sequential version produced.
	planned := make([]plannedMove, 0, len(videoFiles))
	for i, fw := range videoFiles {
		ext := filepath.Ext(fw.file.Name)

		if formatUpper == "MOVIE" {
			yearSuffix := ""
			if startYear > 0 {
				yearSuffix = fmt.Sprintf(" (%d)", startYear)
			}
			movieBase := fmt.Sprintf("%s%s", cleanTitle, yearSuffix)
			safeMovieBase := sanitizeNamePreserveWhitespace(movieBase)
			newName := fmt.Sprintf("%s%s", safeMovieBase, ext)
			planned = append(planned, plannedMove{
				src:     fw.file.Path,
				dest:    filepath.Join(destination, newName),
				newName: newName,
				relPath: fw.file.RelativePath,
			})
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

		// Stored first: the titles captured at queue time are the same ones a fetch would return,
		// and reading them costs nothing.
		episodeTitle := storedMeta.EpisodeTitle(episodeNum)
		if episodeTitle == "" {
			episodeTitle = episodeTitleFrom(animeMeta, episodeNum)
		}
		baseName := fmt.Sprintf("%s - Episode %03d", cleanTitle, episodeNum)
		if episodeTitle != "" {
			baseName = fmt.Sprintf("%s - Episode %03d - %s", cleanTitle, episodeNum, episodeTitle)
		}
		safeBaseName := sanitizeNamePreserveWhitespace(baseName)
		newName := fmt.Sprintf("%s%s", safeBaseName, ext)
		planned = append(planned, plannedMove{
			src:     fw.file.Path,
			dest:    filepath.Join(destination, newName),
			newName: newName,
			relPath: fw.file.RelativePath,
		})
	}

	// Move the files. A same-filesystem match renames, which costs nothing, but a cross-filesystem
	// one copies every episode end to end — and doing that one file at a time leaves most of the
	// available throughput idle. Outcomes are collected by index, so the result is the same list,
	// in the same order, as when the moves ran one after another.
	moveErrs := r.runMoves(planned)

	for i, p := range planned {
		if err := moveErrs[i]; err != nil {
			r.logger.Error().Err(err).Str("src", p.src).Str("dest", p.dest).Msg("unmatched: Failed to move file")
			result.FailedFiles = append(result.FailedFiles, p.relPath)
			result.Success = false
			continue
		}
		result.MovedFiles = append(result.MovedFiles, p.newName)
		r.logger.Info().Str("src", p.src).Str("dest", p.dest).Msg("unmatched: Moved file")
	}

	// Write down what just happened while the plan and its outcomes are still to hand. This is the
	// only record of where each file came from and what it was called, and it is what the undo
	// screen replays backwards.
	r.recordMatch(req, result, planned, moveErrs, preMatchMetadata)

	// Record which anime the user actually matched to, so a partial torrent's remaining files —
	// and anything that looks this download up later — reflect the choice rather than whatever the
	// download was queued for. Writing a row costs nothing and cannot recreate a staging directory,
	// which is why this no longer has to check whether one still exists.
	if result.Success && req.AnimeID > 0 && len(result.MovedFiles) > 0 {
		selection := TorrentMetadata{
			AnimeID:          req.AnimeID,
			AnimeTitleRomaji: req.AnimeTitleClean,
			AnimeTitleNative: req.AnimeTitleJP,
		}
		if preMatchMetadata != nil && preMatchMetadata.AnimeID == req.AnimeID {
			// Same anime as queued: keep everything already captured, episode titles included.
			selection = *preMatchMetadata
		} else {
			// A different anime than the download was queued for. Its episode titles are the wrong
			// ones, so they are replaced rather than carried over.
			selection.AutoMatch = preMatchMetadata != nil && preMatchMetadata.AutoMatch
			r.EnrichMetadata(&selection)
		}

		if err := r.SaveTorrentMetadataRecord(req.TorrentName, selection); err != nil {
			r.logger.Warn().Err(err).Str("torrent", req.TorrentName).Msg("unmatched: Failed to save user's selection metadata")
		}
	}

	// Leave a sidecar in the anime folder the episodes went to, so the files carry their own
	// provenance: which anime they are, and the episode titles they were named from. This is the
	// one place a metadata file is still written, and it is the library — never the Unmatched
	// folder, where nothing can be relied on to exist. The library scanner reads it to place
	// files it could not match by title.
	if result.Success && result.Destination != "" && len(result.MovedFiles) > 0 {
		if err := r.writeMetadataToDestination(req.TorrentName, result.Destination); err != nil {
			r.logger.Warn().Err(err).
				Str("torrent", req.TorrentName).
				Str("destination", result.Destination).
				Msg("unmatched: Failed to write metadata to destination")
		}
	}

	// Clean up the staging directory last, so nothing recreates it afterwards.
	if len(result.FailedFiles) == 0 {
		r.CleanupTorrentDirectory(req.TorrentName)
		// The files are out; take the opportunity to drop any other staging
		// directories left holding nothing at all. Directories still carrying a
		// metadata sidecar are preserved — those belong to torrents that have not
		// finished downloading yet.
		r.SweepEmptyDirectories()
		r.invalidateCache()
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

// plannedMove is a single file move worked out ahead of time: where it comes from, where it goes,
// and the names needed to report the outcome.
type plannedMove struct {
	src     string
	dest    string
	newName string
	relPath string
}

// matchMoveConcurrency is how many files a match moves at once. Enough to keep a copy across
// filesystems (or to a NAS) busy, low enough not to turn one disk's worth of sequential reads
// into a seek storm.
const matchMoveConcurrency = 4

// runMoves performs the planned moves concurrently and returns their errors, indexed to match
// the plan. Files that share a destination stay in one group and move in plan order, so a
// duplicate episode number resolves exactly the way it did when every move ran sequentially.
func (r *Repository) runMoves(planned []plannedMove) []error {
	errs := make([]error, len(planned))
	if len(planned) == 0 {
		return errs
	}

	groups := make([][]int, 0, len(planned))
	groupByDest := make(map[string]int, len(planned))
	for i, p := range planned {
		if gi, ok := groupByDest[p.dest]; ok {
			groups[gi] = append(groups[gi], i)
			continue
		}
		groupByDest[p.dest] = len(groups)
		groups = append(groups, []int{i})
	}

	workers := matchMoveConcurrency
	if len(groups) < workers {
		workers = len(groups)
	}

	queue := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for gi := range queue {
				for _, idx := range groups[gi] {
					errs[idx] = r.moveFileSafely(planned[idx].src, planned[idx].dest)
				}
			}
		}()
	}
	for gi := range groups {
		queue <- gi
	}
	close(queue)
	wg.Wait()

	return errs
}

// moveFileSafely is moveFile with panic recovery. The moves run on worker goroutines, where an
// unrecovered panic would take the server down instead of failing the one file.
func (r *Repository) moveFileSafely(src, dest string) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic while moving file: %v", rec)
		}
	}()
	return r.moveFile(src, dest)
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

// extraDirName is the exact name of the junk folder releases ship alongside the episodes.
const extraDirName = "Extra"

// ncWithNumberRegex catches the "NCOP1"/"NCED2" form. The shared ValueContainsNC patterns
// require a word boundary right after the tag, which a trailing digit does not provide, so
// numbered creditless files slipped through.
var ncWithNumberRegex = regexp.MustCompile(`(?i)\bNC(OP|ED)\d*\b`)

// explicitNCRegex marks content that is unambiguously creditless/bonus material. These tags
// never appear in a genuine episode title, so a match is safe on its own.
var explicitNCRegex = regexp.MustCompile(`(?i)\b(NCOP|NCED|creditless|textless|clean[ _.-]*(opening|ending))\b`)

// bareOpeningEndingRegex matches a standalone "Opening"/"Ending" (optionally numbered, and
// optionally prefixed, as in "OP"/"ED"). On its own this is far weaker evidence than the
// explicit tags above — "Ending of an Era" is a perfectly ordinary episode title — so it is
// only trusted once the episode title has been blanked out and the file has no episode
// number. See isNCName.
// The trailing capture group matters: digits directly after the word ("Opening 2") mean a
// numbered OP/ED, whereas digits elsewhere in the name are an episode number.
var bareOpeningEndingRegex = regexp.MustCompile(`(?i)\b(opening|ending)\b[ _.-]*(\d{1,2})?`)

// isNCName reports whether a file name looks like creditless/bonus content — NCOP, NCED,
// creditless/textless openings and endings, trailers, promos, commercials.
//
// The name is normalized the same way anime.LocalFile.IsProbablyNC does before matching:
// the release group and episode title are blanked out first, because either can contain a
// bare "OP"/"ED"/"Opening" that would otherwise make a perfectly ordinary episode look like
// an NC and get it deleted.
//
// Callers delete what this reports, so it is deliberately asymmetric: an explicit creditless
// tag is trusted outright, while a bare "Opening"/"Ending" is only trusted for a file that
// carries no episode number. "05 - The Opening Ceremony" is an episode; "Opening 2" is not.
func isNCName(name string) bool {
	m := habari.Parse(name)

	normalized := name
	hasEpisodeNumber := false
	if m != nil {
		if m.EpisodeTitle != "" {
			normalized = strings.Replace(normalized, m.EpisodeTitle, "PLACEHOLDER", 1)
		}
		if m.ReleaseGroup != "" {
			normalized = strings.Replace(normalized, m.ReleaseGroup, "PLACEHOLDER", 1)
		}
		hasEpisodeNumber = len(m.EpisodeNumber) > 0
	}

	// Unambiguous markers — safe regardless of anything else in the name.
	if explicitNCRegex.MatchString(normalized) || ncWithNumberRegex.MatchString(normalized) {
		return true
	}

	if match := bareOpeningEndingRegex.FindStringSubmatch(normalized); match != nil {
		// "Opening 2" / "Ending 1" — the number belongs to the word, so this is a numbered
		// OP/ED even though the parser reports it as an episode number.
		if match[2] != "" {
			return true
		}
		// Otherwise a bare "Opening"/"Ending" only counts when the file has no episode
		// number at all. "05 - The Opening Ceremony" is an episode; "Opening" is not.
		if !hasEpisodeNumber {
			return true
		}
		return false
	}

	// A numbered episode is an episode — don't let the broader shared patterns delete it.
	if hasEpisodeNumber {
		return false
	}

	return comparison.ValueContainsNC(normalized)
}

// pathHasExtraSegment reports whether any directory in a relative path is the "Extra" folder.
func pathHasExtraSegment(relPath string) bool {
	for _, seg := range strings.Split(filepath.ToSlash(relPath), "/") {
		if isExtraName(seg) {
			return true
		}
	}
	return false
}

// isExtraName reports whether an entry is the "Extra" junk folder/file (exact name).
func isExtraName(name string) bool {
	return strings.EqualFold(name, extraDirName)
}

// purgeDiscardableContent deletes creditless/bonus content and "Extra" entries from a
// torrent's staging directory. These are never wanted in the library, and leaving them
// behind also kept the staging directory alive after everything else had been moved out.
//
// Returns the number of entries removed.
func (r *Repository) purgeDiscardableContent(path string) int {
	if !isInsideUnmatchedBase(path) {
		return 0
	}

	type victim struct {
		path  string
		isDir bool
	}
	var victims []victim

	_ = filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil || p == path {
			return nil
		}
		name := info.Name()
		if info.IsDir() {
			if isExtraName(name) {
				victims = append(victims, victim{p, true})
				return filepath.SkipDir
			}
			return nil
		}
		// Only video files are considered for NC removal — subtitles and artwork ride along
		// with whatever remains, and non-video junk is handled by the directory cleanup.
		if isExtraName(name) || (isVideoFile(name) && isNCName(name)) {
			victims = append(victims, victim{p, false})
		}
		return nil
	})

	removed := 0
	for _, v := range victims {
		var err error
		if v.isDir {
			err = os.RemoveAll(v.path)
		} else {
			err = os.Remove(v.path)
		}
		if err != nil {
			r.logger.Warn().Err(err).Str("path", v.path).Msg("unmatched: Failed to delete discardable content")
			continue
		}
		removed++
		r.logger.Info().Str("path", v.path).Bool("dir", v.isDir).Msg("unmatched: Deleted creditless/extra content")
	}

	return removed
}

// CleanupTorrentDirectory removes a torrent's staging directory once every video file has
// been moved out of it. Call this after any operation that moves files out of Unmatched.
//
// This previously left a directory behind almost every time, for three separate reasons:
//   - the caller passed the raw torrent name, while the directory on disk is created from the
//     sanitized name, so the cleanup often pointed at a path that did not exist;
//   - the .seanime-metadata.json sidecar we write ourselves kept the directory permanently
//     "non-empty", so the empty-directory check never fired;
//   - filepath.Walk is top-down, so a parent directory was always inspected before its
//     children were removed and therefore never looked empty.
func (r *Repository) CleanupTorrentDirectory(torrentName string) {
	if torrentName == "" {
		return
	}

	path := filepath.Join(UnmatchedBasePath, sanitizeNamePreserveWhitespace(torrentName))

	// Never let a crafted or empty name escape the staging area — this deletes recursively.
	if !isInsideUnmatchedBase(path) {
		r.logger.Warn().Str("path", path).Msg("unmatched: Refusing to clean a path outside the unmatched directory")
		return
	}

	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return
	}

	// Our own sidecar is meaningless once the torrent has been matched.
	_ = os.Remove(filepath.Join(path, metadataFileName))

	// Drop NCOP/NCED/creditless content and "Extra" folders before checking what remains,
	// so a torrent whose only leftovers are junk still gets its directory removed.
	r.purgeDiscardableContent(path)

	// Video files still present means this was a partial match — keep the directory, but
	// still tidy up any season folders that were emptied.
	if hasVideoFiles(path) {
		r.pruneEmptyDirs(path)
		return
	}

	// Everything is out: drop the directory along with any leftover torrent cruft
	// (.nfo files, sample folders, artwork) that would otherwise linger forever.
	if err := os.RemoveAll(path); err != nil {
		r.logger.Warn().Err(err).Str("path", path).Msg("unmatched: Failed to remove emptied torrent directory")
		return
	}

	r.logger.Info().Str("torrent", torrentName).Msg("unmatched: Removed emptied torrent directory")
	r.invalidateCache()
}

// SweepEmptyTorrentDirectories removes staging directories that hold nothing of value:
// either completely empty, or containing only our own metadata sidecar and empty folders.
// It clears out leftovers from matches that ran before the cleanup was fixed.
//
// Deliberately conservative — unlike CleanupTorrentDirectory, which runs as part of an
// explicit match, this runs unattended, so a directory holding any unrecognised file is
// left alone rather than deleted.
func (r *Repository) SweepEmptyTorrentDirectories() int {
	entries, err := os.ReadDir(UnmatchedBasePath)
	if err != nil {
		return 0
	}

	removed := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(UnmatchedBasePath, entry.Name())
		if !isInsideUnmatchedBase(path) {
			continue
		}

		// Prune emptied season folders first so the directory can qualify below.
		r.pruneEmptyDirs(path)

		if !onlyHoldsMetadata(path) {
			continue
		}

		// A directory holding nothing but a sidecar is ambiguous: it is either a
		// leftover from an old match, or a torrent that was just added and whose
		// client has not written any files yet. Removing the second kind destroys
		// the only record of which anime the download came from, and it resurfaces
		// later in the Unmatched screen with nothing attached. Give a freshly
		// written sidecar time to grow files before treating it as garbage.
		if metadataWrittenWithin(path, metadataSweepGracePeriod) {
			r.logger.Debug().Str("path", path).Msg("unmatched: Skipping recent metadata directory during sweep")
			continue
		}

		if err := os.RemoveAll(path); err != nil {
			r.logger.Warn().Err(err).Str("path", path).Msg("unmatched: Failed to sweep empty torrent directory")
			continue
		}
		removed++
		r.logger.Info().Str("torrent", entry.Name()).Msg("unmatched: Swept empty torrent directory")
	}

	if removed > 0 {
		r.invalidateCache()
	}
	return removed
}

// SweepEmptyDirectories removes staging directories that hold no files whatsoever,
// including ones that only became empty when their season folders were pruned.
//
// Directories holding a metadata sidecar are deliberately left alone. That sidecar is
// the only record of which anime a torrent came from, and a torrent that has been added
// but has not started writing files yet has nothing else on disk — removing it there
// would strand the download in the Unmatched screen with no anime attached.
func (r *Repository) SweepEmptyDirectories() int {
	entries, err := os.ReadDir(UnmatchedBasePath)
	if err != nil {
		return 0
	}

	removed := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(UnmatchedBasePath, entry.Name())
		if !isInsideUnmatchedBase(path) {
			continue
		}

		// Prune emptied season folders first so the directory can qualify below.
		r.pruneEmptyDirs(path)

		if !holdsNoFiles(path) {
			continue
		}

		if err := os.RemoveAll(path); err != nil {
			r.logger.Warn().Err(err).Str("path", path).Msg("unmatched: Failed to sweep empty directory")
			continue
		}
		removed++
		r.logger.Info().Str("torrent", entry.Name()).Msg("unmatched: Swept empty directory")
	}

	if removed > 0 {
		r.invalidateCache()
	}
	return removed
}

// holdsNoFiles reports whether a directory tree contains no files at all. A metadata
// sidecar counts as a file here, so directories holding one are preserved.
func holdsNoFiles(path string) bool {
	empty := true
	err := filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		empty = false
		return filepath.SkipAll
	})
	if err != nil {
		return false
	}
	return empty
}

// metadataSweepGracePeriod is how long a metadata-only directory is protected from the
// unattended sweep. It covers a torrent sitting queued in the client before it starts
// writing files. The sweep exists to clear leftovers from old matches, which are far
// older than this, so a generous window costs nothing — these directories are skipped
// by the scan and never shown in the UI.
const metadataSweepGracePeriod = 7 * 24 * time.Hour

// metadataWrittenWithin reports whether the directory's metadata sidecar was written
// within the given duration. A missing or unreadable sidecar reports false, leaving the
// caller's other checks to decide.
func metadataWrittenWithin(path string, within time.Duration) bool {
	info, err := os.Stat(filepath.Join(path, metadataFileName))
	if err != nil {
		return false
	}
	return time.Since(info.ModTime()) < within
}

// onlyHoldsMetadata reports whether a directory contains nothing but our metadata sidecar
// (and empty subdirectories). Any other file makes it unsafe to remove unattended.
func onlyHoldsMetadata(path string) bool {
	empty := true
	err := filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if info.Name() == metadataFileName {
			return nil
		}
		empty = false
		return filepath.SkipAll
	})
	if err != nil {
		return false
	}
	return empty
}

// pruneEmptyDirs removes empty subdirectories of root, deepest first so that a directory
// which only becomes empty after its children are removed is still cleaned up. root itself
// is left alone.
func (r *Repository) pruneEmptyDirs(root string) {
	var dirs []string
	_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() && p != root {
			dirs = append(dirs, p)
		}
		return nil
	})

	// Deepest paths first.
	sort.Slice(dirs, func(i, j int) bool { return len(dirs[i]) > len(dirs[j]) })

	for _, d := range dirs {
		if entries, err := os.ReadDir(d); err == nil && len(entries) == 0 {
			_ = os.Remove(d)
		}
	}
}

// isInsideUnmatchedBase reports whether path is strictly within the unmatched staging
// directory. Guards the recursive delete against path traversal and against being handed
// the base directory itself.
func isInsideUnmatchedBase(path string) bool {
	base, err := filepath.Abs(UnmatchedBasePath)
	if err != nil {
		return false
	}
	target, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	if target == base {
		return false
	}
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// DeleteTorrent removes everything a torrent left in the unmatched folder.
//
// "Everything" is deliberate: a delete that leaves anything behind means the torrent keeps
// showing up, or the staging directory lingers as an empty husk. So this removes the torrent's
// own directory or file, the partial files a download leaves next to it (.!qb, .part, and the
// rest), and any directory that is empty once that is gone. Both the raw name and the sanitized
// name the download directory is actually created from are tried, since a caller holding the
// torrent's own name rather than the on-disk one used to delete nothing at all.
func (r *Repository) DeleteTorrent(torrentName string) error {
	if strings.TrimSpace(torrentName) == "" {
		return errors.New("torrent name is required")
	}

	// The directory is created from the sanitized name, but callers may hold either.
	candidates := []string{filepath.Join(UnmatchedBasePath, torrentName)}
	if sanitized := DestinationFor(torrentName); sanitized != candidates[0] {
		candidates = append(candidates, sanitized)
	}

	var (
		removedAny bool
		firstErr   error
	)
	seen := make(map[string]bool, len(candidates))
	for _, path := range candidates {
		if seen[path] {
			continue
		}
		seen[path] = true

		// Never let a crafted name walk out of the staging directory.
		if !isInsideUnmatchedBase(path) {
			r.logger.Warn().Str("path", path).Msg("unmatched: Refusing to delete outside the unmatched directory")
			continue
		}
		if _, err := os.Lstat(path); err != nil {
			continue // nothing there under this name
		}
		if err := os.RemoveAll(path); err != nil {
			r.logger.Error().Err(err).Str("path", path).Msg("unmatched: Failed to delete")
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		removedAny = true
		r.logger.Info().Str("path", path).Msg("unmatched: Deleted")
	}

	// A half-finished download leaves its partial files beside the target rather than inside it,
	// so removing only the target leaves them sitting in the staging directory forever.
	if r.removePartialLeftovers(torrentName) {
		removedAny = true
	}

	if firstErr != nil {
		return firstErr
	}
	if !removedAny {
		return fmt.Errorf("torrent not found: %s", torrentName)
	}

	// Removing a torrent's files can leave the folders that held them behind. Prune whatever is
	// empty now so the delete leaves nothing in the staging directory.
	r.pruneEmptyDirs(UnmatchedBasePath)

	// The record of what this download was for goes with it. Keeping it would have a later
	// re-download of the same release silently inherit the anime it used to be matched to.
	r.DeleteTorrentMetadata(torrentName)

	r.invalidateCache()
	return nil
}

// removePartialLeftovers deletes the in-progress files a download leaves next to a torrent —
// "<name>.!qB", "<name>.part" and the rest. Matching is done on the name with the temp
// extension stripped, so it catches the exact casing the client happened to write.
//
// Reports whether anything was removed.
func (r *Repository) removePartialLeftovers(torrentName string) bool {
	wanted := make(map[string]bool, 2)
	wanted[strings.ToLower(torrentName)] = true
	wanted[strings.ToLower(sanitizeNamePreserveWhitespace(torrentName))] = true

	entries, err := os.ReadDir(UnmatchedBasePath)
	if err != nil {
		return false
	}

	removed := false
	for _, entry := range entries {
		name := entry.Name()
		if !isTempFileName(name) {
			continue
		}
		if !wanted[strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))] {
			continue
		}

		path := filepath.Join(UnmatchedBasePath, name)
		if !isInsideUnmatchedBase(path) {
			continue
		}
		if err := os.RemoveAll(path); err != nil {
			r.logger.Warn().Err(err).Str("path", path).Msg("unmatched: Failed to delete partial download leftover")
			continue
		}
		removed = true
		r.logger.Info().Str("path", path).Msg("unmatched: Deleted partial download leftover")
	}

	return removed
}

// DestinationFor returns the directory a torrent by this name downloads into.
//
// Every producer of unmatched torrents must route downloads here, and must record what the
// download is for under the same name (see SaveTorrentMetadataRecord) — that name is what joins
// the two. Downloading to UnmatchedBasePath directly drops the torrent's files loose in the
// staging area, where the scan reports them with no anime attached.
func DestinationFor(torrentName string) string {
	return filepath.Join(UnmatchedBasePath, sanitizeNamePreserveWhitespace(torrentName))
}

// GetUnmatchedDestination returns the path where a torrent should be downloaded
func (r *Repository) GetUnmatchedDestination(torrentName string) string {
	return DestinationFor(torrentName)
}

// MetadataFileName is the sidecar left in an anime's library folder when a match moves files into
// it, recording which anime the files are and the titles they were named from.
//
// New downloads no longer write one of these into the staging folder — that lives in the database
// now — but they are still read there, for downloads queued before the move.
const MetadataFileName = ".seanime-metadata.json"

const metadataFileName = MetadataFileName

// AnimeIDFromSidecar returns the anime ID recorded in the sidecar in dir, if there is one.
// Used by the scanner to match files that a title comparison couldn't place: the download
// already knows what it is, so there is no reason to ask the user.
func AnimeIDFromSidecar(dir string) (int, bool) {
	data, err := os.ReadFile(filepath.Join(dir, MetadataFileName))
	if err != nil {
		return 0, false
	}

	var metadata TorrentMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return 0, false
	}
	if metadata.AnimeID <= 0 {
		return 0, false
	}

	return metadata.AnimeID, true
}

// SaveTorrentMetadata records the basics about a torrent, for callers that have nothing more.
// Prefer SaveTorrentMetadataRecord, which carries the episode titles a match will need.
//
// expectedEpisodes should be the AniList episode count for the entry when the caller has it. That
// number is authoritative for the entry being downloaded, unlike the Animap fallback used when no
// count was recorded, so passing it keeps the episode count shown in the Unmatched screen exact.
// Pass 0 when it isn't known.
func (r *Repository) SaveTorrentMetadata(torrentName string, animeID int, titleRomaji, titleNative, format string, startYear, expectedEpisodes int, autoMatch bool) error {
	return r.SaveTorrentMetadataRecord(torrentName, TorrentMetadata{
		AnimeID:               animeID,
		AnimeTitleRomaji:      titleRomaji,
		AnimeTitleNative:      titleNative,
		AnimeFormat:           format,
		AnimeStartYear:        startYear,
		AnimeExpectedEpisodes: expectedEpisodes,
		AutoMatch:             autoMatch,
	})
}

// SaveTorrentMetadataRecord stores everything known about a download, keyed by torrent name.
//
// This goes to the database, not to a file beside the download. The download's own folder is the
// one place this cannot live: the torrent client may be writing somewhere the server cannot see,
// nothing exists there at all until the first byte arrives, and matching deletes the folder as its
// last step — which is what used to take the "Downloading" badge with it. A row is also read
// without touching the disk, so listing the Unmatched screen no longer stats a file per torrent.
func (r *Repository) SaveTorrentMetadataRecord(torrentName string, metadata TorrentMetadata) error {
	if strings.TrimSpace(torrentName) == "" {
		return errors.New("torrent name is required")
	}
	if r.database == nil {
		return errors.New("database unavailable, cannot save torrent metadata")
	}

	data, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	if err := r.database.UpsertUnmatchedTorrentMetadata(metadataKey(torrentName), metadata.AnimeID, data); err != nil {
		return fmt.Errorf("failed to save torrent metadata: %w", err)
	}

	r.metadataMu.Lock()
	r.metadataByTorrent[metadataKey(torrentName)] = &metadata
	r.metadataMu.Unlock()

	r.logger.Debug().
		Str("torrent", torrentName).
		Int("animeId", metadata.AnimeID).
		Str("title", metadata.AnimeTitleRomaji).
		Int("episodeTitles", len(metadata.EpisodeTitles)).
		Msg("unmatched: Saved torrent metadata")
	return nil
}

// metadataKey normalises a torrent name into the key its record is stored under — the same
// spelling the download folder is created with, so a lookup by torrent name and a lookup by
// staging folder name find the same record.
func metadataKey(torrentName string) string {
	return sanitizeNamePreserveWhitespace(strings.TrimSpace(torrentName))
}

// MetadataKey is metadataKey for callers that write records without going through the repository.
func MetadataKey(torrentName string) string { return metadataKey(torrentName) }

// DeleteTorrentMetadata drops a torrent's record. Called when the download is deleted, so a later
// re-download of the same release does not inherit the old anime.
func (r *Repository) DeleteTorrentMetadata(torrentName string) {
	key := metadataKey(torrentName)

	r.metadataMu.Lock()
	delete(r.metadataByTorrent, key)
	r.metadataMu.Unlock()

	if r.database == nil {
		return
	}
	if err := r.database.DeleteUnmatchedTorrentMetadata(key); err != nil {
		r.logger.Debug().Err(err).Str("torrent", torrentName).Msg("unmatched: Could not delete torrent metadata")
	}
}

// EnrichMetadata fills in everything a match will need that is not already known — the episode
// titles above all — so the match itself is pure file work with no network call in the middle.
//
// This is what makes the call at download time worth making: the media page already knows exactly
// what is being downloaded, and the answer is the same whenever it is asked. Best-effort: metadata
// that cannot be fetched now is simply fetched at match time as before.
func (r *Repository) EnrichMetadata(metadata *TorrentMetadata) {
	if metadata == nil || metadata.AnimeID <= 0 {
		return
	}

	animeMeta, err := r.fetchAnimeMetadata(metadata.AnimeID)
	if err != nil || animeMeta == nil {
		r.logger.Warn().Err(err).Int("animeId", metadata.AnimeID).
			Msg("unmatched: Could not fetch episode metadata while queueing, it will be fetched when matching")
		return
	}

	titles := make(map[string]string, len(animeMeta.Episodes))
	for key, ep := range animeMeta.Episodes {
		if ep == nil {
			continue
		}
		if title := firstNonEmpty(ep.TvdbTitle, ep.AnidbTitle); title != "" {
			titles[key] = title
		}
	}
	if len(titles) > 0 {
		metadata.EpisodeTitles = titles
	}

	// AniList's own values are kept where the caller supplied them: they describe the exact entry
	// being downloaded, whereas the Animap map also covers sibling seasons and specials.
	metadata.AnimeTitleRomaji = firstNonEmpty(metadata.AnimeTitleRomaji, animeMeta.Title)
	if metadata.AnimeFormat == "" {
		metadata.AnimeFormat = animeMeta.Type
	}
	if metadata.AnimeStartYear == 0 && len(animeMeta.StartDate) >= 4 {
		if year, convErr := strconv.Atoi(animeMeta.StartDate[:4]); convErr == nil {
			metadata.AnimeStartYear = year
		}
	}
	if metadata.AnimeExpectedEpisodes == 0 {
		metadata.AnimeExpectedEpisodes = animeMeta.MainEpisodeCount()
	}
	metadata.MetadataFetchedAt = time.Now().UTC().Format(time.RFC3339)
}

// EpisodeTitle returns the stored title for an episode, if the metadata carries one.
func (m *TorrentMetadata) EpisodeTitle(episodeNum int) string {
	if m == nil || len(m.EpisodeTitles) == 0 || episodeNum <= 0 {
		return ""
	}
	return m.EpisodeTitles[strconv.Itoa(episodeNum)]
}

// CoversMatch reports whether the stored metadata already holds everything a match of animeID
// needs, so the match can skip fetching it again.
func (m *TorrentMetadata) CoversMatch(animeID int) bool {
	if m == nil || animeID <= 0 || m.AnimeID != animeID {
		return false
	}
	// Episode titles are the part that is expensive to get and impossible to derive, so their
	// presence is what marks a record as complete. A movie has no episode titles worth having,
	// hence the format check standing in for them.
	return len(m.EpisodeTitles) > 0 || strings.EqualFold(m.AnimeFormat, "MOVIE")
}

// writeMetadataToDestination writes the torrent's metadata sidecar into the anime
// folder its episodes were moved into. Paired with the staging cleanup, this is
// what moves the metadata out of Unmatched and into the anime's own folder.
//
// A missing sidecar is not an error: torrents added before the metadata existed,
// or matched entirely by hand, simply have nothing to carry over.
func (r *Repository) writeMetadataToDestination(torrentName, destination string) error {
	metadata := r.GetTorrentMetadata(torrentName)
	if metadata == nil {
		return nil
	}

	info, err := os.Stat(destination)
	if err != nil {
		return fmt.Errorf("destination unavailable: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("destination is not a directory: %s", destination)
	}

	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	metadataPath := filepath.Join(destination, metadataFileName)
	if err := os.WriteFile(metadataPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write metadata: %w", err)
	}

	r.logger.Debug().
		Str("torrent", torrentName).
		Str("path", metadataPath).
		Int("animeId", metadata.AnimeID).
		Msg("unmatched: Moved torrent metadata to anime folder")
	return nil
}

// GetTorrentMetadata loads the stored metadata for a torrent by name, or nil if absent.
//
// The database is the source of truth. The sidecar file is still read as a fallback so downloads
// queued before the move to the database — and the ones the auto-downloader still writes beside
// their files — keep their anime.
func (r *Repository) GetTorrentMetadata(torrentName string) *TorrentMetadata {
	if metadata := r.storedMetadata(torrentName); metadata != nil {
		return metadata
	}
	return r.loadTorrentMetadata(DestinationFor(torrentName))
}

// storedMetadata reads a torrent's record from the database, memoised for the process.
//
// The listing path asks for this once per torrent on every refresh, and the Unmatched screen
// polls; the record only changes when a download is queued, matched or deleted, and every one of
// those paths updates the memo.
func (r *Repository) storedMetadata(torrentName string) *TorrentMetadata {
	key := metadataKey(torrentName)
	if key == "" {
		return nil
	}

	r.metadataMu.Lock()
	if cached, ok := r.metadataByTorrent[key]; ok {
		r.metadataMu.Unlock()
		return cached
	}
	r.metadataMu.Unlock()

	if r.database == nil {
		return nil
	}

	record, err := r.database.GetUnmatchedTorrentMetadata(key)
	var metadata *TorrentMetadata
	if err == nil && record != nil {
		var decoded TorrentMetadata
		if jsonErr := json.Unmarshal(record.Value, &decoded); jsonErr == nil {
			metadata = &decoded
		} else {
			r.logger.Warn().Err(jsonErr).Str("torrent", torrentName).Msg("unmatched: Failed to parse stored torrent metadata")
		}
	}

	// A miss is memoised too — a torrent with no record is the common case for anything the user
	// dropped in by hand, and re-querying for it on every listing is pure overhead.
	r.metadataMu.Lock()
	r.metadataByTorrent[key] = metadata
	r.metadataMu.Unlock()

	return metadata
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

	// A bare file has no directory of its own to hold the sidecar, so the
	// metadata written when the torrent was added sits in a directory named
	// after the torrent. Adopt it so these are not stranded without an anime.
	r.applyMetadata(torrent, r.loadSingleFileMetadata(name))

	return torrent, nil
}

// loadSingleFileMetadata finds the metadata belonging to a bare video file in
// the unmatched root. The torrent name may or may not carry the file
// extension, so both spellings are tried.
func (r *Repository) loadSingleFileMetadata(fileName string) *TorrentMetadata {
	candidates := []string{
		fileName,
		strings.TrimSuffix(fileName, filepath.Ext(fileName)),
	}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if metadata := r.GetTorrentMetadata(candidate); metadata != nil {
			return metadata
		}
	}
	return nil
}

// applyMetadata copies stored anime metadata onto a torrent, filling in what it
// can from Animap. Safe to call with a nil metadata.
func (r *Repository) applyMetadata(torrent *UnmatchedTorrent, metadata *TorrentMetadata) {
	if torrent == nil || metadata == nil {
		return
	}

	torrent.AnimeID = metadata.AnimeID
	torrent.AnimeTitleRomaji = metadata.AnimeTitleRomaji
	torrent.AnimeTitleNative = metadata.AnimeTitleNative
	torrent.AnimeFormat = metadata.AnimeFormat
	torrent.AnimeStartYear = metadata.AnimeStartYear
	torrent.AnimeExpectedEpisodes = metadata.AnimeExpectedEpisodes
	torrent.AutoMatch = metadata.AutoMatch

	// A record written at queue time already carries the title and the episode count, so listing
	// the screen reads rows and stops there. Only a record from before that — or one whose
	// enrichment failed — falls through to the network, and it is the listing path, so that fetch
	// happens once per torrent shown.
	if metadata.AnimeID > 0 && metadata.AnimeTitleRomaji != "" && torrent.AnimeExpectedEpisodes > 0 {
		return
	}

	// Best-effort: fetch episode titles from Animap using AniList ID to name files
	if metadata.AnimeID > 0 {
		if animeMeta, err := r.fetchAnimeMetadata(metadata.AnimeID); err == nil && animeMeta != nil {
			torrent.AnimeTitleRomaji = firstNonEmpty(torrent.AnimeTitleRomaji, animeMeta.Title, animeMeta.Titles["romaji"], animeMeta.Titles["english"], animeMeta.Titles["native"])
			// Only a fallback — the sidecar's count comes from AniList and is exact for this
			// entry, whereas the Animap map counts specials and sibling seasons too.
			if torrent.AnimeExpectedEpisodes == 0 {
				torrent.AnimeExpectedEpisodes = animeMeta.MainEpisodeCount()
			}
		}
	}
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
