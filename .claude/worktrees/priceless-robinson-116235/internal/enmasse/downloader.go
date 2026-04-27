package enmasse

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"hash/fnv"

	"seanime/internal/api/anilist"
	"seanime/internal/events"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/extension"
	"seanime/internal/platforms/platform"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/torrents/torrent"
	"seanime/internal/unmatched"
	"seanime/internal/util"

	"github.com/5rahim/habari"
	"github.com/rs/zerolog"
)

// Progress helpers
func (d *Downloader) clearProgress() {
	os.Remove(AnimeProgressFilePath)
}

func (d *Downloader) clearProgressUnlocked() {
	os.Remove(AnimeProgressFilePath)
}

func (d *Downloader) setStatus(status string) {
	d.mu.Lock()
	d.status = status
	d.mu.Unlock()
	d.sendStatusUpdate()
}

func (d *Downloader) sendStatusUpdate() {
	defer util.HandlePanicInModuleThen("enmasse-anime/sendStatusUpdate", func() {})
	d.wsEventManager.SendEvent("enMasseAnimeDownloaderStatus", d.GetStatus())
}

// primarySearchQuery picks the first non-empty sanitized variant to use as the main query.
func (d *Downloader) primarySearchQuery(animeItem *AnilistMinifiedItem) string {
	variants := d.generateSearchVariants(animeItem)
	if len(variants) == 0 {
		return ""
	}
	return variants[0]
}

func (d *Downloader) saveCurrentProgress(lastIndex int) {
	progress := &DownloaderProgress{
		LastIndex:       lastIndex,
		DownloadedAnime: d.downloadedAnime,
		FailedAnime:     d.failedAnime,
	}

	data, err := json.Marshal(progress)
	if err != nil {
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to marshal progress")
		return
	}

	if err := os.WriteFile(AnimeProgressFilePath, data, 0644); err != nil {
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to save progress")
	}
}

func (d *Downloader) loadProgress() *DownloaderProgress {
	data, err := os.ReadFile(AnimeProgressFilePath)
	if err != nil {
		return nil
	}
	var progress DownloaderProgress
	if err := json.Unmarshal(data, &progress); err != nil {
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to unmarshal progress")
		return nil
	}

	progress.DownloadedAnime = uniqueStringsOrdered(progress.DownloadedAnime)
	progress.FailedAnime = uniqueStringsOrdered(progress.FailedAnime)
	return &progress
}

func uniqueStringsOrdered(values []string) []string {
	if len(values) == 0 {
		return values
	}

	seen := make(map[string]struct{}, len(values))
	ret := make([]string, 0, len(values))
	for _, v := range values {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		ret = append(ret, v)
	}

	return ret
}

// minifyBaseAnime converts AniList BaseAnime to AnilistMinifiedItem
func (d *Downloader) minifyBaseAnime(media *anilist.BaseAnime) *AnilistMinifiedItem {
	if media == nil {
		return nil
	}

	romaji := ""
	english := ""
	if media.Title != nil {
		if media.Title.Romaji != nil {
			romaji = *media.Title.Romaji
		}
		if media.Title.English != nil {
			english = *media.Title.English
		}
	}

	episodes := 0
	if media.Episodes != nil {
		episodes = *media.Episodes
	}

	status := "UNKNOWN"
	if media.Status != nil {
		status = string(*media.Status)
	}

	isAdult := false
	if media.IsAdult != nil {
		isAdult = *media.IsAdult
	}

	format := "UNKNOWN"
	if media.Format != nil {
		format = string(*media.Format)
	}

	syns := make([]string, 0)
	for _, s := range media.Synonyms {
		if s != nil {
			syns = append(syns, *s)
		}
	}

	return &AnilistMinifiedItem{
		ID:           media.GetID(),
		Title:        romaji,
		TitleRomaji:  romaji,
		TitleEnglish: english,
		Episodes:     episodes,
		Status:       status,
		Format:       format,
		IsAdult:      isAdult,
		Synonyms:     syns,
	}
}

// generateTitleVariants returns possible title strings for AniList search
func (d *Downloader) generateTitleVariants(animeItem *AnimeOfflineItem) []string {
	variants := make([]string, 0, 4)

	add := func(val string) {
		val = strings.TrimSpace(val)
		if val == "" {
			return
		}
		if d.containsVariant(variants, val) {
			return
		}
		variants = append(variants, val)
	}

	add(animeItem.Title)
	if animeItem.Title != "" {
		add(strings.ReplaceAll(animeItem.Title, "/", " "))
	}

	for i, syn := range animeItem.Synonyms {
		if i >= 2 {
			break
		}
		add(syn)
	}

	return variants
}

// searchProviderWithVariants searches a provider using all available search variants
func (d *Downloader) searchProviderWithVariants(ctx context.Context, providerID string, baseAnime *anilist.BaseAnime, searchVariants []string, isSmart bool) ([]*hibiketorrent.AnimeTorrent, bool) {
	var allProviderTorrents []*hibiketorrent.AnimeTorrent
	seen := make(map[string]struct{}) // Deduplicate within provider
	hadTimeout := false

	d.logger.Debug().
		Str("provider", providerID).
		Int("variants", len(searchVariants)).
		Bool("smart", isSmart).
		Msg("enmasse-anime: Starting provider search with variants")

	if isSmart {
		// For smart search providers, try smart search first with primary query
		if len(searchVariants) > 0 {
			primaryQuery := searchVariants[0]
			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.Phase = "searching"
				details.Step = "smart search (primary variant)"
				details.CurrentProvider = providerID
				details.CurrentQuery = primaryQuery
				details.VariantIndex = 1
				details.VariantsTotal = len(searchVariants)
			})
			d.logger.Debug().
				Str("provider", providerID).
				Str("query", primaryQuery).
				Msg("enmasse-anime: Trying smart search with primary query")
			torrents, err := d.performSmartSearch(ctx, providerID, baseAnime, primaryQuery)
			if err != nil {
				if d.isProviderSearchTimeoutError(err) {
					hadTimeout = true
					d.logger.Warn().Err(err).Str("provider", providerID).Str("query", primaryQuery).Msg("enmasse-anime: Provider timed out during smart search")
				}
				torrents = []*hibiketorrent.AnimeTorrent{}
			}
			d.logger.Debug().
				Str("provider", providerID).
				Str("query", primaryQuery).
				Int("found", len(torrents)).
				Msg("enmasse-anime: Smart search results")
			for _, t := range torrents {
				key := t.InfoHash
				if key == "" {
					key = t.Name
				}
				if _, exists := seen[key]; !exists {
					seen[key] = struct{}{}
					allProviderTorrents = append(allProviderTorrents, t)
				}
			}
		}

		// If smart search on primary query was insufficient, keep using smart search on more variants.
		if len(allProviderTorrents) < 3 && len(searchVariants) > 1 { // Reduced threshold from 5 to 3
			d.logger.Debug().
				Str("provider", providerID).
				Int("current", len(allProviderTorrents)).
				Msg("enmasse-anime: Smart search insufficient, trying additional smart variants")

			maxVariants := 5 // Limit to 5 variants for speed
			if len(searchVariants[1:]) < maxVariants {
				maxVariants = len(searchVariants[1:])
			}

			for i, variant := range searchVariants[1 : maxVariants+1] {
				if len(allProviderTorrents) >= 8 { // Reduced limit from 20 to 8
					break
				}

				d.updateDetails(func(details *AnimeDownloaderDetails) {
					details.Phase = "searching"
					details.Step = "smart search (variant)"
					details.CurrentProvider = providerID
					details.CurrentQuery = variant
					details.VariantIndex = i + 2
					details.VariantsTotal = len(searchVariants)
				})

				d.logger.Debug().
					Str("provider", providerID).
					Str("variant", variant).
					Int("index", i+1).
					Msg("enmasse-anime: Trying smart variant search")

				torrents, err := d.performSmartSearch(ctx, providerID, baseAnime, variant)
				if err != nil {
					if d.isProviderSearchTimeoutError(err) {
						hadTimeout = true
						d.logger.Warn().Err(err).Str("provider", providerID).Str("query", variant).Msg("enmasse-anime: Provider timed out during smart variant search")
					}
					torrents = []*hibiketorrent.AnimeTorrent{}
				}

				d.logger.Debug().
					Str("provider", providerID).
					Str("variant", variant).
					Int("found", len(torrents)).
					Msg("enmasse-anime: Smart variant search results")

				for _, t := range torrents {
					key := t.InfoHash
					if key == "" {
						key = t.Name
					}
					if _, exists := seen[key]; !exists {
						seen[key] = struct{}{}
						allProviderTorrents = append(allProviderTorrents, t)
					}
				}

				// No delay — rate limiters handle safety
			}
		}

		// If smart search still didn't yield enough results, try simple search with variants (fallback)
		if len(allProviderTorrents) < 3 && len(searchVariants) > 1 { // Reduced threshold from 5 to 3
			d.logger.Debug().
				Str("provider", providerID).
				Int("current", len(allProviderTorrents)).
				Msg("enmasse-anime: Smart search insufficient after variants, trying limited simple variant searches")
			
			maxVariants := 5 // Limit to 5 variants for speed
			if len(searchVariants[1:]) < maxVariants {
				maxVariants = len(searchVariants[1:])
			}
			
			for i, variant := range searchVariants[1:maxVariants+1] {
				if len(allProviderTorrents) >= 8 { // Reduced limit from 20 to 8
					break
				}
				d.updateDetails(func(details *AnimeDownloaderDetails) {
					details.Phase = "searching"
					details.Step = "simple fallback search (variant)"
					details.CurrentProvider = providerID
					details.CurrentQuery = variant
					details.VariantIndex = i + 2
					details.VariantsTotal = len(searchVariants)
				})
				d.logger.Debug().
					Str("provider", providerID).
					Str("variant", variant).
					Int("index", i+1).
					Msg("enmasse-anime: Trying variant search")
				torrents, err := d.performSimpleSearch(ctx, providerID, baseAnime, variant)
				if err != nil {
					if d.isProviderSearchTimeoutError(err) {
						hadTimeout = true
						d.logger.Warn().Err(err).Str("provider", providerID).Str("query", variant).Msg("enmasse-anime: Provider timed out during simple fallback search")
					}
					torrents = []*hibiketorrent.AnimeTorrent{}
				}
				d.logger.Debug().
					Str("provider", providerID).
					Str("variant", variant).
					Int("found", len(torrents)).
					Msg("enmasse-anime: Variant search results")
				for _, t := range torrents {
					key := t.InfoHash
					if key == "" {
						key = t.Name
					}
					if _, exists := seen[key]; !exists {
						seen[key] = struct{}{}
						allProviderTorrents = append(allProviderTorrents, t)
					}
				}
				time.Sleep(50 * time.Millisecond) // Reduced delay for faster processing
			}
		}
	} else {
		// For simple search providers, try limited variants for speed
		maxVariants := 8 // Limit to first 8 variants for speed
		if len(searchVariants) < maxVariants {
			maxVariants = len(searchVariants)
		}
		
		for i, variant := range searchVariants[:maxVariants] {
			if len(allProviderTorrents) >= 10 { // Reduced limit per provider from 20 to 10 for speed
				break
			}
			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.Phase = "searching"
				details.Step = "simple search (variant)"
				details.CurrentProvider = providerID
				details.CurrentQuery = variant
				details.VariantIndex = i + 1
				details.VariantsTotal = maxVariants
			})
			d.logger.Debug().
				Str("provider", providerID).
				Str("variant", variant).
				Int("index", i).
				Msg("enmasse-anime: Trying simple search variant")
			torrents, err := d.performSimpleSearch(ctx, providerID, baseAnime, variant)
			if err != nil {
				if d.isProviderSearchTimeoutError(err) {
					hadTimeout = true
					d.logger.Warn().Err(err).Str("provider", providerID).Str("query", variant).Msg("enmasse-anime: Provider timed out during simple search")
				}
				torrents = []*hibiketorrent.AnimeTorrent{}
			}
			d.logger.Debug().
				Str("provider", providerID).
				Str("variant", variant).
				Int("found", len(torrents)).
				Msg("enmasse-anime: Simple search results")
			for _, t := range torrents {
				key := t.InfoHash
				if key == "" {
					key = t.Name
				}
				if _, exists := seen[key]; !exists {
					seen[key] = struct{}{}
					allProviderTorrents = append(allProviderTorrents, t)
				}
			}
		}
	}

	d.logger.Debug().
		Str("provider", providerID).
		Int("total", len(allProviderTorrents)).
		Msg("enmasse-anime: Completed provider search")

	return allProviderTorrents, hadTimeout
}

// performSmartSearch performs a smart search on a provider
func (d *Downloader) performSmartSearch(ctx context.Context, providerID string, baseAnime *anilist.BaseAnime, query string) ([]*hibiketorrent.AnimeTorrent, error) {
	opts := torrent.AnimeSearchOptions{
		Provider:      providerID,
		Type:          torrent.AnimeSearchTypeSmart,
		Media:         baseAnime,
		Query:         query,
		Batch:         true,
		EpisodeNumber: 0,
		BestReleases:  true,
		Resolution:    "1080",
		SkipPreviews:  true,
		IncludeSpecialProviders: true,
	}

	res, err := d.torrentRepository.SearchAnime(ctx, opts)
	if err != nil || res == nil {
		// Try fallback without batch/best releases
		opts.Batch = false
		opts.BestReleases = false
		res, err = d.torrentRepository.SearchAnime(ctx, opts)
		if err != nil || res == nil {
			if err != nil {
				return nil, err
			}
			return []*hibiketorrent.AnimeTorrent{}, nil
		}
	}

	return res.Torrents, nil
}

// performSimpleSearch performs a simple search on a provider
func (d *Downloader) performSimpleSearch(ctx context.Context, providerID string, baseAnime *anilist.BaseAnime, query string) ([]*hibiketorrent.AnimeTorrent, error) {
	opts := torrent.AnimeSearchOptions{
		Provider:      providerID,
		Type:          torrent.AnimeSearchTypeSimple,
		Media:         baseAnime,
		Query:         query,
		Batch:         true,
		Resolution:    "1080",
	}

	res, err := d.torrentRepository.SearchAnime(ctx, opts)
	if err != nil || res == nil {
		if err != nil {
			return nil, err
		}
		return []*hibiketorrent.AnimeTorrent{}, nil
	}

	return res.Torrents, nil
}

// addToDownloaded adds an anime title to the downloaded list, keeping only the last MaxAnimeLogEntries
func (d *Downloader) addToDownloaded(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, existing := range d.downloadedAnime {
		if existing == title {
			return
		}
	}
	d.downloadedAnime = append(d.downloadedAnime, title)
	if len(d.downloadedAnime) > MaxAnimeLogEntries {
		d.downloadedAnime = d.downloadedAnime[len(d.downloadedAnime)-MaxAnimeLogEntries:]
	}
}

// addToFailed adds an anime title to the failed list, keeping only the last MaxAnimeLogEntries
func (d *Downloader) addToFailed(title string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, existing := range d.failedAnime {
		if existing == title {
			return
		}
	}
	d.failedAnime = append(d.failedAnime, title)
	if len(d.failedAnime) > MaxAnimeLogEntries {
		d.failedAnime = d.failedAnime[len(d.failedAnime)-MaxAnimeLogEntries:]
	}
}

// filterOutSeasonEpisodePattern skips torrents that look like single-episode season/episode (e.g., S01E02)
// when the media only has one episode. Allows ranges (e.g., S01E01-E12).
func (d *Downloader) filterOutSeasonEpisodePattern(torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	seasonEpisodeRe := regexp.MustCompile(`(?i)S\d{2}E\d{2,8}`)
	rangeRe := regexp.MustCompile(`(?i)S\d{2}E\d{2,8}\s*-?E\d{2,8}`)
	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))
	for _, t := range torrents {
		if t == nil {
			continue
		}
		matches := seasonEpisodeRe.FindAllString(t.Name, -1)
		if len(matches) == 1 && !rangeRe.MatchString(t.Name) {
			d.logger.Debug().Str("torrent", t.Name).Msg("enmasse-anime: Skipping season/episode formatted torrent for single-episode media")
			continue
		}
		filtered = append(filtered, t)
	}
	return filtered
}

const (
	GlobalAnimeOfflineDatabasePath = "/aeternae/Soul/Otaku Media/Databases/anime-offline-database-minified.json"
	AnimeProgressFilePath   = "/aeternae/Soul/Otaku Media/Databases/enmasse-anime-progress.json"
	MaxConcurrentSearches   = 6
	DelayBetweenAnime       = 500 * time.Millisecond
	DelayBetweenSearches    = 300 * time.Millisecond
	TorrentClientRetryDelay = 5 * time.Second
	MaxAnimeLogEntries      = 300
	AniListRateLimitBackoff = 60 * time.Second
)

type (
	Downloader struct {
		logger                     *zerolog.Logger
		torrentRepository          *torrent.Repository
		torrentClientRepositoryRef *util.Ref[*torrent_client.Repository]
		wsEventManager             events.WSEventManagerInterface
		platformRef                *util.Ref[platform.Platform]
		unmatchedRepository        *unmatched.Repository

		OnAnimeQueued func(mediaId int) // Called when an anime torrent is added to the download queue

		mu              sync.Mutex
		isRunning       bool
		isPaused        bool
		cancelFunc      context.CancelFunc
		currentAnime    *AnilistMinifiedItem
		processedCount  int
		totalCount      int
		downloadedAnime []string
		failedAnime     []string
		status          string
		details         AnimeDownloaderDetails
		// Rate limiting semaphore
		searchSemaphore chan struct{}
	}

	NewDownloaderOptions struct {
		Logger                     *zerolog.Logger
		TorrentRepository          *torrent.Repository
		TorrentClientRepositoryRef *util.Ref[*torrent_client.Repository]
		WSEventManager             events.WSEventManagerInterface
		PlatformRef                *util.Ref[platform.Platform]
		UnmatchedRepository        *unmatched.Repository
	}

	DownloaderStatus struct {
		IsRunning        bool     `json:"isRunning"`
		IsPaused         bool     `json:"isPaused"`
		CurrentAnime     string   `json:"currentAnime"`
		CurrentAnimeId   int      `json:"currentAnimeId"`
		ProcessedCount   int      `json:"processedCount"`
		TotalCount       int      `json:"totalCount"`
		DownloadedAnime  []string `json:"downloadedAnime"`
		FailedAnime      []string `json:"failedAnime"`
		Status           string   `json:"status"`
		Details          AnimeDownloaderDetails `json:"details"`
		HasSavedProgress bool     `json:"hasSavedProgress"`
	}

	AnimeDownloaderDetails struct {
		Phase              string `json:"phase"`
		Step               string `json:"step"`
		CurrentAnimeIndex  int    `json:"currentAnimeIndex"`
		CurrentAnimeTotal  int    `json:"currentAnimeTotal"`
		CurrentProvider    string `json:"currentProvider"`
		ProvidersDone      int    `json:"providersDone"`
		ProvidersTotal     int    `json:"providersTotal"`
		CurrentQuery       string `json:"currentQuery"`
		VariantIndex       int    `json:"variantIndex"`
		VariantsTotal      int    `json:"variantsTotal"`
		TorrentsCollected  int    `json:"torrentsCollected"`
		SelectedTorrent    string `json:"selectedTorrent"`
		Destination        string `json:"destination"`
		ExpectedEpisodes   int    `json:"expectedEpisodes"`
		DownloadedCount    int    `json:"downloadedCount"`
		FailedCount        int    `json:"failedCount"`
		LastError          string `json:"lastError"`
	}

	DownloaderProgress struct {
		LastIndex       int      `json:"last_index"`
		DownloadedAnime []string `json:"downloaded_anime"`
		FailedAnime     []string `json:"failed_anime"`
	}

	// AnimeOfflineDatabase represents the offline JSON structure
	AnimeOfflineDatabase struct {
		Data []*AnimeOfflineItem `json:"data"`
	}

	// AnimeOfflineItem represents an entry from anime-offline-database
	AnimeOfflineItem struct {
		Sources     []string `json:"sources"`
		Title       string   `json:"title"`
		Type        string   `json:"type"`
		Episodes    int      `json:"episodes"`
		Status      string   `json:"status"`
		AnimeSeason *struct {
			Season string `json:"season"`
			Year   int    `json:"year"`
		} `json:"animeSeason"`
		Picture   string   `json:"picture"`
		Thumbnail string   `json:"thumbnail"`
		Synonyms  []string `json:"synonyms"`
		Studios   []string `json:"studios"`
		Tags      []string `json:"tags"`
		// Parsed IDs
		AnilistID int `json:"-"`
		MalID     int `json:"-"`
	}

	AnilistMinifiedItem struct {
		ID           int      `json:"id"`
		Title        string   `json:"title"`
		TitleRomaji  string   `json:"title_romaji"`
		TitleEnglish string   `json:"title_english,omitempty"`
		Episodes     int      `json:"episodes"`
		Status       string   `json:"status"`
		Format       string   `json:"format"`
		IsAdult      bool     `json:"is_adult"`
		Synonyms     []string `json:"synonyms,omitempty"`
	}
)

func NewDownloader(opts *NewDownloaderOptions) *Downloader {
	return &Downloader{
		logger:                     opts.Logger,
		torrentRepository:          opts.TorrentRepository,
		torrentClientRepositoryRef: opts.TorrentClientRepositoryRef,
		wsEventManager:             opts.WSEventManager,
		platformRef:                opts.PlatformRef,
		unmatchedRepository:        opts.UnmatchedRepository,
		status:                     "Idle",
		downloadedAnime:            make([]string, 0, MaxAnimeLogEntries),
		failedAnime:                make([]string, 0, MaxAnimeLogEntries),
		details: AnimeDownloaderDetails{
			Phase: "idle",
			Step:  "idle",
		},
		searchSemaphore:            make(chan struct{}, MaxConcurrentSearches),
	}
}

func (d *Downloader) GetStatus() *DownloaderStatus {
	d.mu.Lock()
	defer d.mu.Unlock()

	currentAnime := ""
	currentAnimeId := 0
	if d.currentAnime != nil {
		currentAnime = d.currentAnime.TitleRomaji
		if currentAnime == "" {
			currentAnime = d.currentAnime.Title
		}
		currentAnimeId = d.currentAnime.ID
	}

	return &DownloaderStatus{
		IsRunning:        d.isRunning,
		IsPaused:         d.isPaused,
		CurrentAnime:     currentAnime,
		CurrentAnimeId:   currentAnimeId,
		ProcessedCount:   d.processedCount,
		TotalCount:       d.totalCount,
		DownloadedAnime:  d.downloadedAnime,
		FailedAnime:      d.failedAnime,
		Status:           d.status,
		Details: AnimeDownloaderDetails{
			Phase:             d.details.Phase,
			Step:              d.details.Step,
			CurrentAnimeIndex: d.details.CurrentAnimeIndex,
			CurrentAnimeTotal: d.details.CurrentAnimeTotal,
			CurrentProvider:   d.details.CurrentProvider,
			ProvidersDone:     d.details.ProvidersDone,
			ProvidersTotal:    d.details.ProvidersTotal,
			CurrentQuery:      d.details.CurrentQuery,
			VariantIndex:      d.details.VariantIndex,
			VariantsTotal:     d.details.VariantsTotal,
			TorrentsCollected: d.details.TorrentsCollected,
			SelectedTorrent:   d.details.SelectedTorrent,
			Destination:       d.details.Destination,
			ExpectedEpisodes:  d.details.ExpectedEpisodes,
			DownloadedCount:   len(d.downloadedAnime),
			FailedCount:       len(d.failedAnime),
			LastError:         d.details.LastError,
		},
		HasSavedProgress: d.hasSavedProgress(),
	}
}

func (d *Downloader) updateDetails(updateFn func(*AnimeDownloaderDetails)) {
	d.mu.Lock()
	if updateFn != nil {
		updateFn(&d.details)
	}
	d.mu.Unlock()
	d.sendStatusUpdate()
}

func (d *Downloader) hasSavedProgress() bool {
	_, err := os.Stat(AnimeProgressFilePath)
	return err == nil
}

func (d *Downloader) Start(resume bool) error {
	d.mu.Lock()
	if d.isRunning {
		d.mu.Unlock()
		return fmt.Errorf("anime en masse downloader is already running")
	}
	d.isRunning = true
	d.isPaused = false

	// Only resume when explicitly requested; otherwise start fresh even if progress exists
	autoResume := resume
	if !autoResume && d.hasSavedProgress() {
		d.logger.Info().Msg("enmasse-anime: Saved progress found but resume not enabled; starting from scratch")
	}

	if !autoResume {
		d.processedCount = 0
		d.downloadedAnime = make([]string, 0, MaxAnimeLogEntries)
		d.failedAnime = make([]string, 0, MaxAnimeLogEntries)
		d.clearProgress()
	}
	d.status = "Starting..."
	d.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	d.cancelFunc = cancel

	go d.run(ctx, autoResume)

	return nil
}

func (d *Downloader) Stop(saveProgress bool) {
	d.mu.Lock()

	if d.cancelFunc != nil {
		d.cancelFunc()
	}

	if saveProgress {
		d.isPaused = true
		d.status = "Paused"
	} else {
		d.clearProgressUnlocked()
		d.isPaused = false
		d.status = "Stopped"
	}

	d.isRunning = false
	d.mu.Unlock()

	d.sendStatusUpdate()
}

func (d *Downloader) run(ctx context.Context, resume bool) {
	defer func() {
		d.mu.Lock()
		d.isRunning = false
		d.currentAnime = nil
		d.mu.Unlock()
		d.sendStatusUpdate()
	}()

	d.setStatus("Loading anime database...")
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "loading"
		details.Step = "loading anime offline database"
		details.CurrentAnimeTotal = 0
		details.CurrentAnimeIndex = 0
		details.CurrentProvider = ""
		details.ProvidersDone = 0
		details.ProvidersTotal = 0
		details.CurrentQuery = ""
		details.VariantIndex = 0
		details.VariantsTotal = 0
		details.TorrentsCollected = 0
		details.SelectedTorrent = ""
		details.Destination = ""
		details.ExpectedEpisodes = 0
		details.LastError = ""
	})

	// Load anime list from offline database
	animeList, err := d.loadAnimeList()
	if err != nil {
		d.setStatus(fmt.Sprintf("Error loading anime list: %v", err))
		d.logger.Error().Err(err).Msg("enmasse-anime: Failed to load anime list")
		return
	}

	d.mu.Lock()
	d.totalCount = len(animeList)
	d.details.CurrentAnimeTotal = len(animeList)
	d.mu.Unlock()

	d.logger.Info().Int("count", len(animeList)).Msg("enmasse-anime: Loaded anime list")
	d.setStatus(fmt.Sprintf("Loaded %d anime entries", len(animeList)))

	// Load progress if resuming (index-based, starts 2 before last)
	startIndex := 0
	if resume {
		if progress := d.loadProgress(); progress != nil {
			// Start 2 entries before the last processed index
			startIndex = progress.LastIndex - 2
			if startIndex < 0 {
				startIndex = 0
			}
			d.mu.Lock()
			d.downloadedAnime = progress.DownloadedAnime
			d.failedAnime = progress.FailedAnime
			d.processedCount = startIndex
			d.mu.Unlock()
			d.logger.Info().Int("resumeAt", startIndex).Int("lastIndex", progress.LastIndex).Msg("enmasse-anime: Resumed from saved progress")
			d.setStatus(fmt.Sprintf("Resumed: starting at %d/%d", startIndex, len(animeList)))
		}
	}

	d.setStatus("Starting torrent client...")
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "startup"
		details.Step = "starting torrent client"
	})

	if err := d.waitForTorrentClient(ctx, "starting downloader"); err != nil {
		d.setStatus("Stopped")
		d.logger.Warn().Err(err).Msg("enmasse-anime: Stopped while waiting for torrent client")
		return
	}

	// Process each anime starting from startIndex
	for i := startIndex; i < len(animeList); i++ {
		animeItem := animeList[i]

		select {
		case <-ctx.Done():
			d.saveCurrentProgress(i)
			d.setStatus("Stopped")
			return
		default:
		}

		// Rate limit: anime en masse 12 per minute
		if err := acquireAnimeEnMasse(ctx); err != nil {
			d.logger.Warn().Err(err).Msg("enmasse-anime: Rate limiter blocked, aborting")
			d.saveCurrentProgress(i)
			d.setStatus("Stopped")
			return
		}

		d.mu.Lock()
		d.currentAnime = &AnilistMinifiedItem{Title: animeItem.Title}
		d.processedCount = i + 1
		d.status = fmt.Sprintf("Processing %d/%d: %s", i+1, len(animeList), animeItem.Title)
		d.details.Phase = "processing"
		d.details.Step = "starting anime processing"
		d.details.CurrentAnimeIndex = i + 1
		d.details.CurrentAnimeTotal = len(animeList)
		d.details.CurrentProvider = ""
		d.details.ProvidersDone = 0
		d.details.ProvidersTotal = 0
		d.details.CurrentQuery = ""
		d.details.VariantIndex = 0
		d.details.VariantsTotal = 0
		d.details.TorrentsCollected = 0
		d.details.SelectedTorrent = ""
		d.details.Destination = ""
		d.details.ExpectedEpisodes = animeItem.Episodes
		d.details.LastError = ""
		d.mu.Unlock()
		d.sendStatusUpdate()

		d.logger.Info().Str("title", animeItem.Title).Int("index", i).Msg("enmasse-anime: Processing anime")

		err := d.processAnime(ctx, animeItem)

		if err != nil {
			if ctx.Err() != nil {
				d.saveCurrentProgress(i)
				d.setStatus("Stopped")
				return
			}
			if d.isProviderSearchTimeoutError(err) {
				d.setStatus(fmt.Sprintf("Provider timeout on %s, skipping", animeItem.Title))
			}
			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.Phase = "processing"
				details.Step = "anime failed"
				details.LastError = err.Error()
			})
			d.logger.Error().Err(err).Str("title", animeItem.Title).Msg("enmasse-anime: Failed to process anime")
			d.addToFailed(animeItem.Title)
		} else {
			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.Phase = "processing"
				details.Step = "anime queued successfully"
				details.LastError = ""
			})
			d.addToDownloaded(animeItem.Title)
		}

		// Save progress after every anime for reliable resume
		d.saveCurrentProgress(i)

		// Delay between anime
		time.Sleep(DelayBetweenAnime)
	}

	d.clearProgress()
	d.setStatus("Completed! Redirecting to unmatched...")
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "completed"
		details.Step = "all anime processed"
		details.CurrentProvider = ""
		details.CurrentQuery = ""
		details.VariantIndex = 0
		details.VariantsTotal = 0
	})
	d.sendStatusUpdate()

	d.wsEventManager.SendEvent(events.InfoToast, "Anime En Masse Download completed!")
}

func (d *Downloader) processAnime(ctx context.Context, animeItem *AnimeOfflineItem) error {
	// Acquire semaphore then provider rate limiter (excluding torrent client)
	d.searchSemaphore <- struct{}{}
	defer func() { <-d.searchSemaphore }()

	if err := acquireProvider(ctx); err != nil {
		return err
	}

	// Resolve AniList (fallback MAL) using title/synonyms
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "processing"
		details.Step = "resolving AniList metadata"
	})
	resolved, err := d.resolveAniList(ctx, animeItem)
	if err != nil {
		return fmt.Errorf("failed to resolve AniList: %w", err)
	}

	// Build a BaseAnime from the resolved item for torrent search
	baseAnime := d.buildBaseAnime(resolved)

	// Aggregate results from ALL attached extensions (including NSFW/Adult)
	primaryQuery := d.primarySearchQuery(resolved)
	if primaryQuery == "" {
		d.logger.Warn().Str("title", resolved.TitleRomaji).Msg("enmasse-anime: No valid query for search; skipping")
		return fmt.Errorf("torrent search failed: no valid query for search")
	}

	// Gather provider extensions (adult-aware ordering)
	providerIDs := d.getProviderIDsForAnime(resolved)
	if len(providerIDs) == 0 {
		return fmt.Errorf("no torrent provider extensions available")
	}

	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Phase = "searching"
		details.Step = "searching providers"
		details.ProvidersTotal = len(providerIDs)
		details.ProvidersDone = 0
		details.CurrentProvider = ""
		details.CurrentQuery = ""
	})

	// Comprehensive torrent collection using ALL search variants
	d.logger.Info().Str("title", resolved.TitleRomaji).Int("providers", len(providerIDs)).Msg("enmasse-anime: Starting comprehensive torrent collection")

	var allTorrents []*hibiketorrent.AnimeTorrent
	var mu sync.Mutex
	hadProviderTimeout := false

	// Generate all search variants once for this anime
	searchVariants := d.generateSearchVariants(resolved)
	if len(searchVariants) == 0 {
		d.logger.Warn().Str("title", resolved.TitleRomaji).Msg("enmasse-anime: No search variants generated")
		return fmt.Errorf("no search variants generated for %s", resolved.TitleRomaji)
	}
	d.logger.Info().Str("title", resolved.TitleRomaji).Int("variants", len(searchVariants)).Msg("enmasse-anime: Generated search variants")
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.VariantsTotal = len(searchVariants)
		details.VariantIndex = 0
	})

	// Concurrent search across all providers with all variants (OPTIMIZED)
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10) // High concurrency — rate limiters handle safety

	for _, pid := range providerIDs {
		wg.Add(1)
		go func(providerID string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.CurrentProvider = providerID
				details.Step = "searching provider torrents"
			})

			ext, ok := d.torrentRepository.GetAnimeProviderExtension(providerID)
			if !ok {
				d.logger.Warn().Str("provider", providerID).Msg("enmasse-anime: Provider not found during comprehensive search")
				return
			}

			canSmart := ext.GetProvider().GetSettings().CanSmartSearch
			var providerTorrents []*hibiketorrent.AnimeTorrent
			var timedOut bool

			if canSmart {
				// For smart search providers, try primary query first, then variants if needed
				providerTorrents, timedOut = d.searchProviderWithVariants(ctx, providerID, baseAnime, searchVariants, true)
			} else {
				// For simple search providers, use all variants
				providerTorrents, timedOut = d.searchProviderWithVariants(ctx, providerID, baseAnime, searchVariants, false)
			}

			if timedOut {
				mu.Lock()
				hadProviderTimeout = true
				mu.Unlock()
			}

			if len(providerTorrents) > 0 {
				mu.Lock()
				beforeCount := len(allTorrents)
				allTorrents = append(allTorrents, providerTorrents...)
				afterCount := len(allTorrents)
				mu.Unlock()
				d.updateDetails(func(details *AnimeDownloaderDetails) {
					details.TorrentsCollected = afterCount
				})
				d.logger.Debug().
					Str("provider", providerID).
					Int("found", len(providerTorrents)).
					Int("before", beforeCount).
					Int("after", afterCount).
					Msg("enmasse-anime: Collected torrents from provider")
			} else {
				d.logger.Debug().Str("provider", providerID).Msg("enmasse-anime: No torrents found from provider")
			}

			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.ProvidersDone++
			})
		}(pid)
	}
	wg.Wait()

	d.logger.Info().Str("title", resolved.TitleRomaji).Int("total", len(allTorrents)).Msg("enmasse-anime: Completed comprehensive torrent collection")

	if len(allTorrents) == 0 {
		if hadProviderTimeout {
			d.updateDetails(func(details *AnimeDownloaderDetails) {
				details.LastError = "provider timeout while searching torrents"
				details.Step = "provider timeout while searching torrents"
			})
			return fmt.Errorf("provider timeout while searching torrents")
		}
		return fmt.Errorf("no torrents found across any providers with all search variants")
	}

	d.logger.Debug().Int("before_dedup", len(allTorrents)).Msg("enmasse-anime: Starting deduplication")
	seen := make(map[string]struct{})
	deduped := make([]*hibiketorrent.AnimeTorrent, 0, len(allTorrents))
	duplicates := 0
	for _, t := range allTorrents {
		if t == nil {
			d.logger.Debug().Msg("enmasse-anime: Skipping nil torrent during deduplication")
			continue
		}
		key := t.Name
		if t.InfoHash != "" {
			key = t.InfoHash
		}
		if _, exists := seen[key]; !exists {
			seen[key] = struct{}{}
			deduped = append(deduped, t)
		} else {
			duplicates++
			d.logger.Debug().
				Str("name", t.Name).
				Str("hash", t.InfoHash).
				Msg("enmasse-anime: Skipping duplicate torrent")
		}
	}
	d.logger.Debug().
		Int("after_dedup", len(deduped)).
		Int("duplicates", duplicates).
		Msg("enmasse-anime: Completed deduplication")
	searchData := &torrent.SearchData{Torrents: deduped}
	d.logger.Info().Str("title", resolved.TitleRomaji).Int("total", len(allTorrents)).Int("deduped", len(deduped)).Msg("enmasse-anime: Aggregated torrents from all providers")

	if searchData == nil || len(searchData.Torrents) == 0 {
		return fmt.Errorf("no torrents found")
	}

	// Filter out music collections, soundtracks, OSTs, and non-anime content
	searchData.Torrents = d.filterOutMusicCollections(searchData.Torrents)

	// Filter torrents that lack video content indicators (no codec, no resolution)
	searchData.Torrents = d.filterRequireVideoContent(searchData.Torrents)

	// Filter out single-episode torrents for series (movies are exempt)
	searchData.Torrents = d.filterMultiEpisodeTorrents(baseAnime, searchData.Torrents)

	// Prefer torrents that meet or exceed expected episode count for non-movies (enforce >=2 for all non-movie formats)
	expectedEpisodes := animeItem.Episodes
	searchData.Torrents = d.filterByEpisodeMinimum(baseAnime, expectedEpisodes, searchData.Torrents)

	// Only apply season/episode pattern drop to single-episode movies (non-movies are forced to expect >=2)
	if (baseAnime == nil || baseAnime.IsMovie()) && expectedEpisodes <= 1 {
		searchData.Torrents = d.filterOutSeasonEpisodePattern(searchData.Torrents)
	}

	// Select best torrent (first one after sorting by seeders/best release) with season preference
	selectedTorrent := d.selectBestTorrent(searchData.Torrents, animeItem)
	if selectedTorrent == nil {
		d.logger.Warn().Str("title", resolved.TitleRomaji).Msg("enmasse-anime: No suitable torrent after filtering across all providers")
		return fmt.Errorf("no suitable torrent found")
	}
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Step = "selected best torrent"
		details.SelectedTorrent = selectedTorrent.Name
	})
	// Final safety: ensure selected torrent meets expected episode count
	if !d.torrentMeetsEpisodeMinimum(baseAnime, expectedEpisodes, selectedTorrent) {
		return fmt.Errorf("selected torrent does not meet episode minimum")
	}

	d.logger.Info().
		Str("title", resolved.TitleRomaji).
		Str("torrent", selectedTorrent.Name).
		Int("seeders", selectedTorrent.Seeders).
		Msg("enmasse-anime: Selected best torrent across all providers")

	// Get magnet link from the provider that supplied the selected torrent
	// Find the provider extension that supplied this torrent (by provider field in torrent metadata or fallback to any)
	var providerExt extension.AnimeTorrentProviderExtension
	var found bool
	if selectedTorrent.Provider != "" {
		providerExt, found = d.torrentRepository.GetAnimeProviderExtension(selectedTorrent.Provider)
	}
	if !found || providerExt == nil {
		// Fallback: try any provider that can fetch magnet
		providerIDs := d.torrentRepository.GetAllAnimeProviderExtensionIds()
		for _, pid := range providerIDs {
			if ext, ok := d.torrentRepository.GetAnimeProviderExtension(pid); ok {
				providerExt = ext
				found = true
				break
			}
		}
	}
	if !found {
		return fmt.Errorf("no provider available to fetch magnet link")
	}
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Step = "fetching magnet link"
		if providerExt != nil {
			details.CurrentProvider = providerExt.GetID()
		}
	})
	magnet, err := providerExt.GetProvider().GetTorrentMagnetLink(selectedTorrent)
	if err != nil {
		return fmt.Errorf("failed to get magnet link: %w", err)
	}
	if magnet == "" {
		// Fallback to info hash if available
		if selectedTorrent.InfoHash != "" {
			magnet = fmt.Sprintf("magnet:?xt=urn:btih:%s", selectedTorrent.InfoHash)
			if magnet == "magnet:?xt=urn:btih:" {
				return fmt.Errorf("empty magnet and info hash; cannot add torrent")
			}
		} else {
			return fmt.Errorf("empty magnet link and no info hash; cannot add torrent")
		}
	}

	// Download to unmatched directory
	destination := d.unmatchedRepository.GetUnmatchedDestination(selectedTorrent.Name)
	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Step = "adding magnet to torrent client"
		details.Destination = destination
	})

	torrentClientRepo := d.torrentClientRepositoryRef.Get()
	if err := d.waitForTorrentClient(ctx, "adding torrent"); err != nil {
		return err
	}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		torrentClientRepo = d.torrentClientRepositoryRef.Get()
		if torrentClientRepo == nil {
			if err := d.waitForTorrentClient(ctx, "adding torrent"); err != nil {
				return err
			}
			continue
		}

		d.logger.Debug().Str("destination", destination).Str("magnet", magnet).Str("infoHash", selectedTorrent.InfoHash).Msg("enmasse-anime: adding torrent to client")
		err = torrentClientRepo.AddMagnets([]string{magnet}, destination)
		if err == nil {
			break
		}

		if !d.isTorrentClientUnavailableError(err) {
			return fmt.Errorf("failed to add torrent: %w", err)
		}

		d.logger.Warn().Err(err).Msg("enmasse-anime: Torrent client unavailable while adding torrent, waiting to retry")
		if err := d.waitForTorrentClient(ctx, "adding torrent"); err != nil {
			return err
		}
	}

	// Save metadata for later matching
	romajiTitle := resolved.TitleRomaji
	if romajiTitle == "" {
		romajiTitle = resolved.Title
	}
	nativeTitle := ""
	format := resolved.Format
	startYear := baseAnime.GetStartYearSafe()
	if startYear == 0 && animeItem.AnimeSeason != nil {
		startYear = animeItem.AnimeSeason.Year
	}
	if err := d.unmatchedRepository.SaveTorrentMetadata(selectedTorrent.Name, resolved.ID, romajiTitle, nativeTitle, format, startYear); err != nil {
		d.logger.Warn().Err(err).Str("torrent", selectedTorrent.Name).Msg("enmasse-anime: Failed to save torrent metadata")
	}

	d.logger.Info().
		Str("title", resolved.TitleRomaji).
		Str("destination", destination).
		Msg("enmasse-anime: Added torrent to download queue")

	// Auto-track anime for offline library
	if d.OnAnimeQueued != nil {
		go d.OnAnimeQueued(resolved.ID)
	}

	d.updateDetails(func(details *AnimeDownloaderDetails) {
		details.Step = "queued in torrent client"
		details.LastError = ""
	})

	return nil
}

func (d *Downloader) getProviderIDsForAnime(item *AnilistMinifiedItem) []string {
	providerIDs := d.torrentRepository.GetAllAnimeProviderExtensionIds()
	if len(providerIDs) == 0 {
		return providerIDs
	}

	if item == nil || !item.IsAdult {
		return providerIDs
	}

	adultProviders := make([]string, 0, len(providerIDs))
	nonAdultProviders := make([]string, 0, len(providerIDs))

	for _, pid := range providerIDs {
		ext, ok := d.torrentRepository.GetAnimeProviderExtension(pid)
		if !ok || ext == nil {
			nonAdultProviders = append(nonAdultProviders, pid)
			continue
		}

		settings := ext.GetProvider().GetSettings()
		// NSFW-specific providers are usually marked as special type.
		// Keep them in the same pool as adult-capable providers.
		if settings.SupportsAdult || settings.Type == hibiketorrent.AnimeProviderTypeSpecial {
			adultProviders = append(adultProviders, pid)
		} else {
			nonAdultProviders = append(nonAdultProviders, pid)
		}
	}

	if len(adultProviders) == 0 {
		d.logger.Warn().Msg("enmasse-anime: NSFW anime detected but no NSFW/adult-capable providers are installed")
		return providerIDs
	}

	ordered := make([]string, 0, len(providerIDs))
	ordered = append(ordered, adultProviders...)
	ordered = append(ordered, nonAdultProviders...)
	return ordered
}

func (d *Downloader) waitForTorrentClient(ctx context.Context, action string) error {
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		torrentClientRepo := d.torrentClientRepositoryRef.Get()
		if torrentClientRepo != nil && torrentClientRepo.Start() {
			return nil
		}

		d.setStatus(fmt.Sprintf("Waiting for torrent client (%s)...", action))
		d.updateDetails(func(details *AnimeDownloaderDetails) {
			details.Phase = "waiting"
			details.Step = fmt.Sprintf("waiting for torrent client (%s)", action)
		})
		d.logger.Warn().Str("action", action).Dur("retryIn", TorrentClientRetryDelay).Msg("enmasse-anime: Torrent client unavailable, retrying")

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(TorrentClientRetryDelay):
		}
	}
}

func (d *Downloader) isTorrentClientUnavailableError(err error) bool {
	if err == nil {
		return false
	}

	errStr := strings.ToLower(err.Error())

	return strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "no route to host") ||
		strings.Contains(errStr, "network is unreachable") ||
		strings.Contains(errStr, "dial tcp") ||
		strings.Contains(errStr, "i/o timeout") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "eof") ||
		strings.Contains(errStr, "qbittorrent") ||
		strings.Contains(errStr, "forbidden") ||
		strings.Contains(errStr, "unauthorized")
}

func (d *Downloader) isProviderSearchTimeoutError(err error) bool {
	if err == nil {
		return false
	}

	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "search timeout") ||
		strings.Contains(errStr, "smart search timeout") ||
		strings.Contains(errStr, "promise timed out")
}

func (d *Downloader) buildBaseAnime(item *AnilistMinifiedItem) *anilist.BaseAnime {
	// Build a BaseAnime struct from the minified item
	status := anilist.MediaStatus(item.Status)
	format := anilist.MediaFormat(item.Format)
	episodes := item.Episodes
	isAdult := item.IsAdult

	var englishTitle *string
	if item.TitleEnglish != "" {
		englishTitle = &item.TitleEnglish
	}

	romajiTitle := item.TitleRomaji
	if romajiTitle == "" {
		if item.TitleEnglish != "" {
			romajiTitle = item.TitleEnglish
		} else {
			romajiTitle = item.Title
		}
	}
	if englishTitle == nil && item.Title != "" {
		t := item.Title
		englishTitle = &t
	}

	// Convert []string to []*string for Synonyms
	synonyms := make([]*string, len(item.Synonyms))
	for i := range item.Synonyms {
		synonyms[i] = &item.Synonyms[i]
	}

	return &anilist.BaseAnime{
		ID: item.ID,
		Title: &anilist.BaseAnime_Title{
			Romaji:  &romajiTitle,
			English: englishTitle,
		},
		Status:   &status,
		Format:   &format,
		Episodes: &episodes,
		IsAdult:  &isAdult,
		Synonyms: synonyms,
	}
}

func (d *Downloader) selectBestTorrent(torrents []*hibiketorrent.AnimeTorrent, animeItem *AnimeOfflineItem) *hibiketorrent.AnimeTorrent {
	if len(torrents) == 0 {
		return nil
	}

	d.logger.Info().Int("candidates", len(torrents)).Msg("enmasse-anime: Ranking torrents with advanced system")

	// Rank torrents using the comprehensive scoring system
	rankedTorrents := d.rankTorrents(torrents, animeItem)
	
	if len(rankedTorrents) == 0 {
		return nil
	}

	best := rankedTorrents[0]
	d.logger.Info().
		Str("selected", best.Name).
		Str("provider", best.Provider).
		Int("seeders", best.Seeders).
		Msg("enmasse-anime: Selected best torrent")

	return best
}

// rankTorrents implements the advanced ranking system with user-specified priorities
func (d *Downloader) rankTorrents(torrents []*hibiketorrent.AnimeTorrent, animeItem *AnimeOfflineItem) []*hibiketorrent.AnimeTorrent {
	type TorrentScore struct {
		torrent *hibiketorrent.AnimeTorrent
		score   int
		details map[string]int
	}

	var scoredTorrents []TorrentScore

	for _, t := range torrents {
		if t == nil {
			continue
		}

		// Hard filter: minimum 1 seeder required
		if t.Seeders < 1 {
			d.logger.Debug().
				Str("torrent", t.Name).
				Int("seeders", t.Seeders).
				Msg("enmasse-anime: Skipping torrent - insufficient seeders (minimum 1 required)")
			continue
		}

		scoreDetails := make(map[string]int)
		totalScore := 0

		// Priority 1: Completeness (preferred but optional)
		completenessScore := d.calculateCompletenessScore(t, animeItem)
		scoreDetails["completeness"] = completenessScore
		totalScore += completenessScore * 100 // Bonus for completeness, not a hard requirement

		// Priority 2: Audio Quality
		audioScore := d.calculateAudioScore(t)
		scoreDetails["audio"] = audioScore
		totalScore += audioScore * 500 // Audio is second priority

		// Priority 3: Resolution (balanced with seeders)
		resolutionScore := d.calculateResolutionScore(t)
		scoreDetails["resolution"] = resolutionScore
		totalScore += resolutionScore * 100

		// Priority 4: Seeder Health
		seederScore := d.calculateSeederScore(t)
		scoreDetails["seeders"] = seederScore
		totalScore += seederScore * 50

		// Priority 5: Release Quality
		releaseScore := d.calculateReleaseScore(t)
		scoreDetails["release"] = releaseScore
		totalScore += releaseScore * 25

		// Priority 6: Title Relevance
		titleScore := d.calculateTitleRelevance(t, animeItem)
		scoreDetails["title"] = titleScore
		totalScore += titleScore * 10

		scoredTorrents = append(scoredTorrents, TorrentScore{
			torrent: t,
			score:   totalScore,
			details: scoreDetails,
		})

		d.logger.Debug().
			Str("torrent", t.Name).
			Int("total", totalScore).
			Int("completeness", completenessScore).
			Int("audio", audioScore).
			Int("resolution", resolutionScore).
			Int("seeders", seederScore).
			Msg("enmasse-anime: Torrent score breakdown")
	}

	// Sort by score (descending)
	sort.Slice(scoredTorrents, func(i, j int) bool {
		return scoredTorrents[i].score > scoredTorrents[j].score
	})

	// Return only the torrents
	var result []*hibiketorrent.AnimeTorrent
	for _, st := range scoredTorrents {
		result = append(result, st.torrent)
	}

	return result
}

// calculateCompletenessScore implements the completeness priority logic
func (d *Downloader) calculateCompletenessScore(t *hibiketorrent.AnimeTorrent, animeItem *AnimeOfflineItem) int {
	nameLower := strings.ToLower(t.Name)
	score := 0

	// "Complete" gets highest priority
	if strings.Contains(nameLower, "complete") {
		score += 100
	}

	// Count "+" indicators for season completeness (more pluses = better)
	plusCount := strings.Count(nameLower, "+")
	if plusCount > 0 {
		score += plusCount * 25 // Each plus adds significant value
	}

	// Multi-season detection - prioritize more comprehensive collections
	multiSeasonPatterns := []string{
		"season 1+2+3+4", "s01+s02+s03+s04", "1+2+3+4", "season 1+2+3", "s01+s02+s03", "1+2+3",
		"season 1+2", "s01+s02", "1+2",
	}
	for i, pattern := range multiSeasonPatterns {
		if strings.Contains(nameLower, pattern) {
			// Higher score for more comprehensive collections
			score += 80 - (i * 10)
			break
		}
	}

	// Additional completeness indicators
	completenessIndicators := []string{
		"all episodes", "full series", "entire series", "complete series",
		"batch", "all seasons", "full collection",
	}
	for _, indicator := range completenessIndicators {
		if strings.Contains(nameLower, indicator) {
			score += 40
			break
		}
	}

	// OVA/Movie inclusion bonus (but must meet minimum episode count)
	if (strings.Contains(nameLower, "ova") || strings.Contains(nameLower, "movie")) && animeItem.Episodes > 1 {
		score += 30
	}

	// Batch bonus
	if t.IsBatch {
		score += 40
	}

	// Episode count verification against expected episodes
	if animeItem.Episodes > 0 {
		if d.torrentMeetsEpisodeMinimum(nil, animeItem.Episodes, t) {
			score += 50
		}
	}

	// Bonus for torrents that explicitly mention episode counts matching expected
	if animeItem.Episodes > 0 {
		epCountStr := strconv.Itoa(animeItem.Episodes)
		if strings.Contains(nameLower, epCountStr+" episodes") || 
		   strings.Contains(nameLower, epCountStr+" eps") ||
		   strings.Contains(nameLower, "ep "+epCountStr) {
			score += 35
		}
	}

	return score
}

// calculateAudioScore implements the audio quality priority logic
func (d *Downloader) calculateAudioScore(t *hibiketorrent.AnimeTorrent) int {
	nameLower := strings.ToLower(t.Name)
	score := 0

	// Explicit "Dual Audio" gets highest priority
	if strings.Contains(nameLower, "dual audio") {
		score += 100
	} else if strings.Contains(nameLower, "dual") {
		score += 80
	}

	// "Multi Audio" gets second priority
	if strings.Contains(nameLower, "multi audio") {
		score += 90
	} else if strings.Contains(nameLower, "multi") {
		score += 70
	}

	// Lossless audio indicators (only reward if torrent also has video codec indicators)
	hasVideoCodec := strings.Contains(nameLower, "x264") || strings.Contains(nameLower, "x265") ||
		strings.Contains(nameLower, "h264") || strings.Contains(nameLower, "h265") ||
		strings.Contains(nameLower, "hevc") || strings.Contains(nameLower, "avc") ||
		strings.Contains(nameLower, "h.264") || strings.Contains(nameLower, "h.265") ||
		strings.Contains(nameLower, "av1") || strings.Contains(nameLower, "vp9") ||
		strings.Contains(nameLower, "mkv") || strings.Contains(nameLower, "mp4")
	if hasVideoCodec {
		losslessIndicators := []string{"flac", "truehd", "dts-hd", "lossless"}
		for _, indicator := range losslessIndicators {
			if strings.Contains(nameLower, indicator) {
				score += 20
				break
			}
		}
	}

	return score
}

// calculateResolutionScore implements the resolution priority with seeder balance
func (d *Downloader) calculateResolutionScore(t *hibiketorrent.AnimeTorrent) int {
	nameLower := strings.ToLower(t.Name)
	score := 0

	// Base resolution scores
	if strings.Contains(nameLower, "2160p") || strings.Contains(nameLower, "4k") {
		score = 100
	} else if strings.Contains(nameLower, "1440p") || strings.Contains(nameLower, "2k") {
		score = 80
	} else if strings.Contains(nameLower, "1080p") || t.Resolution == "1080p" {
		score = 60
	} else if strings.Contains(nameLower, "720p") || t.Resolution == "720p" {
		score = 40
	} else if strings.Contains(nameLower, "480p") || t.Resolution == "480p" {
		score = 20
	}

	// Balance with seeder count - prefer slightly lower resolution with more seeders
	seederBonus := 0
	if t.Seeders > 100 {
		seederBonus = 20
	} else if t.Seeders > 50 {
		seederBonus = 15
	} else if t.Seeders > 20 {
		seederBonus = 10
	} else if t.Seeders > 10 {
		seederBonus = 5
	}

	// Reduce resolution score slightly if very few seeders
	if t.Seeders == 1 && score > 40 {
		score -= 5 // Smaller penalty for having exactly 1 seeder
	}

	return score + seederBonus
}

// calculateSeederScore implements the seeder health priority
func (d *Downloader) calculateSeederScore(t *hibiketorrent.AnimeTorrent) int {
	seeders := t.Seeders
	
	// Minimum 1 seeder required
	if seeders < 1 {
		return 0
	}
	
	// Diminishing returns for very high seeder counts
	if seeders > 1000 {
		return 100
	} else if seeders > 500 {
		return 90
	} else if seeders > 200 {
		return 80
	} else if seeders > 100 {
		return 70
	} else if seeders > 50 {
		return 60
	} else if seeders > 20 {
		return 50
	} else if seeders > 10 {
		return 40
	} else if seeders > 5 {
		return 35
	} else if seeders > 2 {
		return 30
	} else if seeders >= 1 {
		return 25 // Minimum 1 seeder gets base score
	}
	
	return 0
}

// calculateReleaseScore implements the release quality priority
func (d *Downloader) calculateReleaseScore(t *hibiketorrent.AnimeTorrent) int {
	score := 0

	// Best release status
	if t.IsBestRelease {
		score += 50
	}

	// Known quality indicators
	nameLower := strings.ToLower(t.Name)
	qualityIndicators := []string{"bluray", "bd", "web-dl", "webrip"}
	for _, indicator := range qualityIndicators {
		if strings.Contains(nameLower, indicator) {
			score += 20
			break
		}
	}

	// Release group tag bonus — good anime torrents have [GroupName] at the start
	if strings.HasPrefix(strings.TrimSpace(t.Name), "[") {
		score += 15
	}

	// Video codec presence bonus — confirms this is actual video content
	videoCodecIndicators := []string{"x264", "x265", "h264", "h265", "h.264", "h.265", "hevc", "avc", "av1", "10bit", "10-bit"}
	for _, codec := range videoCodecIndicators {
		if strings.Contains(nameLower, codec) {
			score += 10
			break
		}
	}

	// Proper naming conventions
	if !strings.Contains(nameLower, "re-encode") {
		score += 5
	}

	return score
}

// calculateTitleRelevance implements title matching priority with proper season handling
func (d *Downloader) calculateTitleRelevance(t *hibiketorrent.AnimeTorrent, animeItem *AnimeOfflineItem) int {
	if animeItem == nil {
		return 0
	}

	nameLower := strings.ToLower(t.Name)
	score := 0

	// Check if this is a "complete" or multi-season torrent using regex patterns (supports any season numbers)
	hasPlusSign := strings.Contains(nameLower, "+")
	isCompleteOrMulti := regexp.MustCompile(`\bcomplete\b|\bseason\s*\d+\+\d+\b|\bs\d+\+s\d+\b`).MatchString(nameLower)

	// Check for title matches
	titles := []string{animeItem.Title}
	titles = append(titles, animeItem.Synonyms...)
	
	for _, title := range titles {
		titleLower := strings.ToLower(title)
		if strings.Contains(nameLower, titleLower) {
			score += 30
			break
		}
	}
	
	// If there's a + sign, skip season matching entirely - these are always acceptable
	if hasPlusSign {
		score += 20 // Bonus for multi-season torrents
		d.logger.Debug().
			Str("torrent", t.Name).
			Int("score", score).
			Msg("enmasse-anime: Multi-season torrent (+ detected) - season matching skipped")
	} else if isCompleteOrMulti {
		// Other complete/multi-season torrents are also acceptable
		score += 15 // Bonus for completeness
		d.logger.Debug().
			Str("torrent", t.Name).
			Int("score", score).
			Msg("enmasse-anime: Complete/multi-season torrent accepted")
	} else {
		// Only do season matching for non-multi-season torrents
		// Extract season number from torrent name
		torrentSeason := d.extractSeasonNumber(nameLower)
		
		// Determine the anime's likely season number based on available data
		animeSeasonNum := d.determineAnimeSeasonNumber(animeItem, nameLower)
		
		// Debug logging for season matching
		d.logger.Debug().
			Str("torrent", t.Name).
			Int("torrent_season", torrentSeason).
			Int("anime_season", animeSeasonNum).
			Bool("complete_multi", isCompleteOrMulti).
			Msg("enmasse-anime: Season matching analysis")
		
		if torrentSeason > 0 {
			// Torrent explicitly specifies a season
			if animeSeasonNum == 0 || torrentSeason == animeSeasonNum {
				// Perfect season match or we can't determine the anime season
				score += 25
				d.logger.Debug().
					Str("torrent", t.Name).
					Int("score", score).
					Msg("enmasse-anime: Perfect season match")
			} else {
				// Wrong season - penalize heavily
				score -= 30
				d.logger.Debug().
					Str("torrent", t.Name).
					Int("score", score).
					Msg("enmasse-anime: Wrong season - penalized")
			}
		} else {
			// Torrent doesn't specify season
			if animeSeasonNum <= 1 {
				// Season 1 or unknown - no season specified in torrent is acceptable
				score += 10
				d.logger.Debug().
					Str("torrent", t.Name).
					Int("score", score).
					Msg("enmasse-anime: No season specified - acceptable for season 1")
			} else {
				// Season 2+ but torrent doesn't specify season - slight penalty
				score -= 5
				d.logger.Debug().
					Str("torrent", t.Name).
					Int("score", score).
					Msg("enmasse-anime: No season specified - slight penalty for season 2+")
			}
		}
	}

	// Year matching (bonus but not critical)
	if animeItem.AnimeSeason != nil && animeItem.AnimeSeason.Year > 0 {
		yearStr := strconv.Itoa(animeItem.AnimeSeason.Year)
		if strings.Contains(nameLower, yearStr) {
			score += 10
		}
	}

	return score
}

// determineAnimeSeasonNumber tries to determine which season number this anime is
func (d *Downloader) determineAnimeSeasonNumber(animeItem *AnimeOfflineItem, torrentName string) int {
	// If we can't determine, default to 1 (most anime are season 1)
	if animeItem == nil {
		return 1
	}
	
	// Regex pattern to extract any season number from anime titles/synonyms
	seasonPattern := `\bseason\s*(\d+)\b|\bs(\d+)\b|\b(\d+)th\s*season\b|\b(\d+)(?:st|nd|rd|th)\s*season\b`
	
	// Check title for season indicators
	titleLower := strings.ToLower(animeItem.Title)
	if matches := regexp.MustCompile(seasonPattern).FindStringSubmatch(titleLower); len(matches) > 1 {
		for i := 1; i < len(matches); i++ {
			if matches[i] != "" {
				if seasonNum, err := strconv.Atoi(matches[i]); err == nil && seasonNum > 0 {
					return seasonNum
				}
			}
		}
	}
	
	// Check synonyms for season indicators
	for _, synonym := range animeItem.Synonyms {
		synLower := strings.ToLower(synonym)
		if matches := regexp.MustCompile(seasonPattern).FindStringSubmatch(synLower); len(matches) > 1 {
			for i := 1; i < len(matches); i++ {
				if matches[i] != "" {
					if seasonNum, err := strconv.Atoi(matches[i]); err == nil && seasonNum > 0 {
						return seasonNum
					}
				}
			}
		}
	}
	
	// If no clear season indicators, assume season 1
	return 1
}

// extractSeasonNumber extracts season number from torrent name using regex (supports any season number)
func (d *Downloader) extractSeasonNumber(name string) int {
	name = strings.ToLower(name)
	
	// Regex pattern to extract any season number from torrent names
	seasonPattern := `\bseason\s*(\d+)\b|\bs(\d+)\b|\b(\d+)th\s*season\b|\b(\d+)(?:st|nd|rd|th)\s*season\b`
	
	re := regexp.MustCompile(seasonPattern)
	if matches := re.FindStringSubmatch(name); len(matches) > 1 {
		// Find the first non-empty capture group that contains a valid number
		for i := 1; i < len(matches); i++ {
			if matches[i] != "" {
				if seasonNum, err := strconv.Atoi(matches[i]); err == nil && seasonNum > 0 {
					return seasonNum
				}
			}
		}
	}
	
	return 0 // No season found
}

// torrentMeetsEpisodeMinimum rechecks episode count for the chosen torrent.
// Movies with single episode are exempt.
func (d *Downloader) torrentMeetsEpisodeMinimum(media *anilist.BaseAnime, expectedEpisodes int, t *hibiketorrent.AnimeTorrent) bool {
	if t == nil {
		return true
	}
	if media != nil && media.IsMovie() {
		return true
	}

	// Non-movie media must have at least 2 episodes to avoid single-file picks
	requiredEpisodes := expectedEpisodes
	if requiredEpisodes < 2 {
		requiredEpisodes = 2
	}

	// Treat batches as valid
	if t.IsBatch {
		return true
	}

	// Parse name for maximum episode
	parsed := habari.Parse(t.Name)
	maxEp := 0
	for _, epStr := range parsed.EpisodeNumber {
		val := util.StringToIntMust(epStr)
		if val > maxEp {
			maxEp = val
		}
	}
	return maxEp >= requiredEpisodes
}

// filterMultiEpisodeTorrents removes single-episode torrents when the media is a series.
// Movies are exempt and retain all torrents.
func (d *Downloader) filterMultiEpisodeTorrents(media *anilist.BaseAnime, torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	// Only movies keep single-episode torrents
	if media != nil && media.IsMovie() {
		return torrents
	}

	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))

	for _, t := range torrents {
		if t == nil {
			continue
		}

		// Keep batches early
		if t.IsBatch {
			filtered = append(filtered, t)
			continue
		}

		// Parse name to detect episode span
		parsed := habari.Parse(t.Name)
		episodesParsed := len(parsed.EpisodeNumber)

		// Keep torrents that clearly include multiple episodes
		if episodesParsed > 1 {
			filtered = append(filtered, t)
			continue
		}

		// At this point, single-episode only — skip for series
		d.logger.Debug().
			Str("torrent", t.Name).
			Msg("enmasse-anime: Skipping single-episode torrent for series")
	}

	return filtered
}

// filterByEpisodeMinimum keeps torrents that meet or exceed the expected episode count for TV/OVA.
// Movies are exempt. If expectedEpisodes <= 0, returns original slice.
func (d *Downloader) filterByEpisodeMinimum(media *anilist.BaseAnime, expectedEpisodes int, torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	if media != nil && media.IsMovie() {
		return torrents
	}

	// Non-movie media must expect at least 2 episodes to avoid single-file torrents
	requiredEpisodes := expectedEpisodes
	if requiredEpisodes < 2 {
		requiredEpisodes = 2
	}

	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))

	for _, t := range torrents {
		if t == nil {
			continue
		}

		// Treat batches as valid
		if t.IsBatch {
			filtered = append(filtered, t)
			continue
		}

		// Use provider episode number only when flagged as batch
		if t.IsBatch && t.EpisodeNumber >= requiredEpisodes {
			filtered = append(filtered, t)
			continue
		}

		// Parse name for episode span
		parsed := habari.Parse(t.Name)
		if len(parsed.EpisodeNumber) > 0 {
			maxEp := 0
			for _, epStr := range parsed.EpisodeNumber {
				val := util.StringToIntMust(epStr)
				if val > maxEp {
					maxEp = val
				}
			}
			if maxEp >= requiredEpisodes {
				filtered = append(filtered, t)
				continue
			}
		}
	}

	return filtered
}

// filterOutMusicCollections removes torrents that are music collections, soundtracks, OSTs,
// manga archives, audio-only releases, or other non-anime content.
func (d *Downloader) filterOutMusicCollections(torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	musicPatterns := []string{
		"music collection", "soundtrack", "original soundtrack", "sound track",
		" ost ", " ost]", " ost)", "[ost", "(ost",
		"insert song", "character song", "vocal collection",
		"opening theme", "ending theme", "theme song",
		"drama cd", "audio drama", "radio cd",
	}

	// Non-anime content patterns
	nonAnimePatterns := []string{
		"manga archive", "manga collection", "manga pack",
		"light novel", "visual novel",
		"artbook", "art book", "art collection",
		"j-core", "j-pop", "j-rock", "j-music",
		"doujin",
	}

	// Audio-only format indicators (no video)
	audioOnlyFormats := []string{"vorbis", "ogg", "mp3", "aac", "opus", "wav", "alac", "ape", "wma"}

	// Video codec/container indicators that confirm video content
	videoIndicators := []string{
		"x264", "x265", "h264", "h265", "h.264", "h.265",
		"hevc", "avc", "av1", "vp9", "xvid", "divx",
		"mkv", "mp4", "avi", "10bit", "10-bit", "8bit", "8-bit",
		"1080p", "720p", "480p", "2160p", "4k", "1440p",
		"bluray", "bd", "web-dl", "webrip", "dvdrip", "bdrip",
	}

	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))
	for _, t := range torrents {
		if t == nil {
			continue
		}
		nameLower := strings.ToLower(t.Name)

		isJunk := false

		// Check music patterns
		for _, pattern := range musicPatterns {
			if strings.Contains(nameLower, pattern) {
				isJunk = true
				break
			}
		}

		// Check non-anime patterns
		if !isJunk {
			for _, pattern := range nonAnimePatterns {
				if strings.Contains(nameLower, pattern) {
					isJunk = true
					break
				}
			}
		}

		// Check for audio-only formats without video indicators
		if !isJunk {
			hasAudioOnly := false
			for _, fmt := range audioOnlyFormats {
				if strings.Contains(nameLower, fmt) {
					hasAudioOnly = true
					break
				}
			}
			if hasAudioOnly {
				hasVideo := false
				for _, vi := range videoIndicators {
					if strings.Contains(nameLower, vi) {
						hasVideo = true
						break
					}
				}
				if !hasVideo {
					isJunk = true
				}
			}
		}

		// Flag FLAC-only torrents with no video codec indicators
		if !isJunk && strings.Contains(nameLower, "flac") {
			hasVideo := false
			for _, vi := range videoIndicators {
				if strings.Contains(nameLower, vi) {
					hasVideo = true
					break
				}
			}
			if !hasVideo {
				isJunk = true
			}
		}

		// Reject director/studio compilations like "SHINICHIRO WATANABE Anime (1994-2019)"
		// These typically have a year range pattern and "anime" as a generic word
		if !isJunk {
			yearRangeRegex := regexp.MustCompile(`\(\d{4}[-–]\d{4}\)`)
			if yearRangeRegex.MatchString(nameLower) && strings.Contains(nameLower, "anime") {
				isJunk = true
			}
		}

		if isJunk {
			d.logger.Debug().Str("name", t.Name).Msg("enmasse-anime: Filtered out non-anime torrent")
			continue
		}
		filtered = append(filtered, t)
	}

	if len(filtered) == 0 {
		d.logger.Warn().Msg("enmasse-anime: All torrents filtered as non-anime, returning original list")
		return torrents
	}

	return filtered
}

// filterRequireVideoContent removes torrents that lack any video content indicators.
// Legitimate anime torrents almost always mention a video codec, resolution, or source.
// This catches garbage results that slip through other filters.
func (d *Downloader) filterRequireVideoContent(torrents []*hibiketorrent.AnimeTorrent) []*hibiketorrent.AnimeTorrent {
	videoIndicators := []string{
		// Codecs
		"x264", "x265", "h264", "h265", "h.264", "h.265",
		"hevc", "avc", "av1", "vp9", "xvid", "divx",
		// Bit depth
		"10bit", "10-bit", "8bit", "8-bit",
		// Containers
		"mkv", "mp4", "avi",
		// Resolution
		"1080p", "720p", "480p", "2160p", "4k", "1440p", "2k",
		// Source
		"bluray", "blu-ray", "bdrip", "bdrip", "dvdrip", "web-dl", "webrip", "hdtv",
		// Common anime torrent markers that imply video
		"dual audio", "multi-subs", "multi subs", "eng sub", "hardsub", "softsub",
		"batch",
	}

	filtered := make([]*hibiketorrent.AnimeTorrent, 0, len(torrents))
	for _, t := range torrents {
		if t == nil {
			continue
		}
		nameLower := strings.ToLower(t.Name)

		hasVideoIndicator := false
		for _, vi := range videoIndicators {
			if strings.Contains(nameLower, vi) {
				hasVideoIndicator = true
				break
			}
		}

		// Also accept if torrent has resolution field set from provider
		if !hasVideoIndicator && t.Resolution != "" {
			hasVideoIndicator = true
		}

		// Also accept batch-flagged torrents from provider
		if !hasVideoIndicator && t.IsBatch {
			hasVideoIndicator = true
		}

		if !hasVideoIndicator {
			d.logger.Debug().Str("name", t.Name).Msg("enmasse-anime: Filtered out torrent with no video content indicators")
			continue
		}
		filtered = append(filtered, t)
	}

	if len(filtered) == 0 {
		d.logger.Warn().Msg("enmasse-anime: All torrents filtered as non-video, returning original list")
		return torrents
	}

	return filtered
}

func (d *Downloader) loadAnimeList() ([]*AnimeOfflineItem, error) {
	file, err := os.Open(GlobalAnimeOfflineDatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open anime-offline-database: %w", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)

	var db AnimeOfflineDatabase
	if err := decoder.Decode(&db); err != nil {
		return nil, fmt.Errorf("failed to decode anime-offline-database: %w", err)
	}

	for _, item := range db.Data {
		d.parseSourceIDs(item)
	}

	if len(db.Data) == 0 {
		return nil, fmt.Errorf("no entries found in anime-offline-database")
	}

	return db.Data, nil
}

func (d *Downloader) parseSourceIDs(item *AnimeOfflineItem) {
	anilistRegex := regexp.MustCompile(`anilist\.co/anime/(\d+)`)
	malRegex := regexp.MustCompile(`myanimelist\.net/anime/(\d+)`)

	for _, source := range item.Sources {
		if matches := anilistRegex.FindStringSubmatch(source); len(matches) > 1 {
			item.AnilistID, _ = strconv.Atoi(matches[1])
		}
		if matches := malRegex.FindStringSubmatch(source); len(matches) > 1 {
			item.MalID, _ = strconv.Atoi(matches[1])
		}
	}
}

func (d *Downloader) resolveAniList(ctx context.Context, animeItem *AnimeOfflineItem) (*AnilistMinifiedItem, error) {
	plat := d.platformRef.Get()
	if plat == nil {
		return d.minifyOfflineItem(animeItem), nil
	}
	client := plat.GetAnilistClient()
	if client == nil {
		return d.minifyOfflineItem(animeItem), nil
	}

	// 1) Prefer direct AniList ID from sources
	if animeItem.AnilistID > 0 {
		base, err := client.BaseAnimeByID(ctx, &animeItem.AnilistID)
		if err == nil && base != nil && base.Media != nil {
			return d.minifyBaseAnime(base.Media), nil
		}
	}

	// 2) Fallback to MAL ID via AniList bridge
	if animeItem.MalID > 0 {
		base, err := client.BaseAnimeByMalID(ctx, &animeItem.MalID)
		if err == nil && base != nil && base.Media != nil {
			return d.minifyBaseAnime(base.Media), nil
		}
	}

	// 3) Search AniList by title/synonyms
	variants := d.generateTitleVariants(animeItem)
	page := 1
	perPage := 10
	for _, title := range variants {
		if title == "" {
			continue
		}
		// respect rate limits
		if err := acquireAniList(ctx, IsUserInitiated(ctx)); err != nil {
			d.logger.Debug().Err(err).Msg("enmasse-anime: AniList rate limit/acquire failed")
			continue
		}
		media := d.safeListAnime(ctx, client, &page, &title, &perPage)
		if media != nil {
			return d.minifyBaseAnime(media), nil
		}
		time.Sleep(DelayBetweenSearches)
	}

	return d.minifyOfflineItem(animeItem), nil
}

// safeListAnime wraps ListAnime and recovers from panics caused by client internals
func (d *Downloader) safeListAnime(ctx context.Context, client anilist.AnilistClient, page *int, title *string, perPage *int) *anilist.BaseAnime {
	defer func() {
		if r := recover(); r != nil {
			d.logger.Warn().Interface("panic", r).Msg("enmasse-anime: Recovered from AniList client panic during search")
		}
	}()

	res, err := client.ListAnime(ctx, page, title, perPage, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	if err != nil || res == nil || res.Page == nil || len(res.Page.Media) == 0 {
		if err != nil {
			d.logger.Debug().Err(err).Str("title", *title).Msg("enmasse-anime: AniList search variant failed")
		}
		return nil
	}
	return res.Page.Media[0]
}

// minifyOfflineItem builds a minimal AnilistMinifiedItem from offline data when AniList lookup fails
func (d *Downloader) minifyOfflineItem(item *AnimeOfflineItem) *AnilistMinifiedItem {
	format := item.Type
	status := item.Status
	id := -int(d.syntheticID(item.Title))
	return &AnilistMinifiedItem{
		ID:           id,
		Title:        item.Title,
		TitleRomaji:  item.Title,
		TitleEnglish: item.Title,
		Episodes:     item.Episodes,
		Status:       status,
		Format:       format,
		IsAdult:      false,
		Synonyms:     item.Synonyms,
	}
}

func (d *Downloader) syntheticID(title string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(title))
	return h.Sum32()
}
func (d *Downloader) generateSearchVariants(animeItem *AnilistMinifiedItem) []string {
	variants := make([]string, 0, 12) // Reduced from 20 to 12 for speed

	addVariant := func(val string) {
		if val == "" {
			return
		}
		s := d.sanitizeSearchQuery(val)
		if s == "" || d.containsVariant(variants, s) {
			return
		}
		variants = append(variants, s)
	}

	// Collect only essential base titles (English-first)
	titles := []string{}
	if animeItem.TitleEnglish != "" {
		titles = append(titles, animeItem.TitleEnglish)
	}
	if animeItem.TitleRomaji != "" && animeItem.TitleRomaji != animeItem.TitleEnglish {
		titles = append(titles, animeItem.TitleRomaji)
	}
	
	// Add only first 2 synonyms for speed (instead of all)
	synCount := 0
	for _, syn := range animeItem.Synonyms {
		if syn != "" && !d.containsVariant(titles, syn) && synCount < 2 {
			titles = append(titles, syn)
			synCount++
			if synCount >= 2 {
				break
			}
		}
	}

	// Generate focused variants for each title (OPTIMIZED)
	for _, title := range titles {
		// Variant 1: Original title (sanitized)
		addVariant(title)

		// Variant 2: Only try underscore separator (most common)
		separatedTitle := strings.ReplaceAll(title, " ", "_")
		addVariant(separatedTitle)

		// Variant 3: Title without special characters (essential)
		addVariant(d.removeSpecialCharacters(title))

		// Stop generating variants if we have enough
		if len(variants) >= 12 {
			break
		}
	}

	return variants
}

// generateSeasonVariants creates season-specific search variants
func (d *Downloader) generateSeasonVariants(title string) []string {
	variants := []string{}
	
	// Common season patterns
	seasonPatterns := []string{
		" S01", " S1", " Season 1", " 1st Season", " First Season",
		" S02", " S2", " Season 2", " 2nd Season", " Second Season",
		" S03", " S3", " Season 3", " 3rd Season", " Third Season",
		" S04", " S4", " Season 4", " 4th Season", " Fourth Season",
	}
	
	for _, pattern := range seasonPatterns {
		variants = append(variants, title+pattern)
	}
	
	return variants
}

// generateYearVariants creates year-specific search variants
func (d *Downloader) generateYearVariants(title string) []string {
	variants := []string{}
	
	// Common year patterns (recent years)
	years := []string{"2024", "2023", "2022", "2021", "2020", "2019", "2018"}
	
	for _, year := range years {
		variants = append(variants, title+" "+year)
		variants = append(variants, title+" "+year+"-"+year[2:])
		// For previous year
		if year != "2018" {
			prevYear := fmt.Sprintf("%d", util.StringToIntMust(year)-1)
			variants = append(variants, title+" "+prevYear+"-"+year[2:])
		}
	}
	
	return variants
}

// removeSpecialCharacters removes a comprehensive set of special characters
func (d *Downloader) removeSpecialCharacters(query string) string {
	// Extended set of special characters to remove
	specialChars := []string{
		":", "/", "\\", "?", "!", "\"", "'", "(", ")", "[", "]", "{", "}",
		"*", "&", "^", "%", "$", "#", "@", "+", "=", "~", "`", "|",
		"<", ">", ",", ";", ".", "_", "-",
	}
	
	result := query
	for _, char := range specialChars {
		result = strings.ReplaceAll(result, char, " ")
	}
	
	// Collapse multiple spaces
	for strings.Contains(result, "  ") {
		result = strings.ReplaceAll(result, "  ", " ")
	}
	
	return strings.TrimSpace(result)
}

// sanitizeSearchQuery cleans up a search query for torrent search
func (d *Downloader) sanitizeSearchQuery(query string) string {
	// Remove special characters that might cause issues
	query = strings.TrimSpace(query)
	query = strings.ReplaceAll(query, ":", " ")
	query = strings.ReplaceAll(query, "/", " ")
	query = strings.ReplaceAll(query, "\\", " ")
	query = strings.ReplaceAll(query, "?", "")
	query = strings.ReplaceAll(query, "!", "")
	query = strings.ReplaceAll(query, "\"", "")
	query = strings.ReplaceAll(query, "'", "")
	query = strings.ReplaceAll(query, "(", " ")
	query = strings.ReplaceAll(query, ")", " ")
	query = strings.ReplaceAll(query, "[", " ")
	query = strings.ReplaceAll(query, "]", " ")

	// Collapse multiple spaces
	for strings.Contains(query, "  ") {
		query = strings.ReplaceAll(query, "  ", " ")
	}

	return strings.TrimSpace(query)
}

// containsVariant checks if a variant already exists in the list
func (d *Downloader) containsVariant(variants []string, variant string) bool {
	variantLower := strings.ToLower(variant)
	for _, v := range variants {
		if strings.ToLower(v) == variantLower {
			return true
		}
	}
	return false
}
