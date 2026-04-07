package manga

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/hook"
	chapter_downloader "seanime/internal/manga/downloader"
	manga_providers "seanime/internal/manga/providers"
	"seanime/internal/platforms/platform"
	"seanime/internal/util"
	"seanime/internal/util/filecache"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

func NewDownloader(opts *NewDownloaderOptions) *Downloader {
	_ = os.MkdirAll(opts.DownloadDir, os.ModePerm)
	filecacher, _ := filecache.NewCacher(opts.DownloadDir)

	d := &Downloader{
		logger:         opts.Logger,
		wsEventManager: opts.WSEventManager,
		database:       opts.Database,
		downloadDir:    opts.DownloadDir,
		repository:     opts.Repository,
		mediaMap:       new(MediaMap),
		filecacher:     filecacher,
		isOfflineRef:   opts.IsOfflineRef,
	}

	d.chapterDownloader = chapter_downloader.NewDownloader(&chapter_downloader.NewDownloaderOptions{
		Logger:         opts.Logger,
		WSEventManager: opts.WSEventManager,
		Database:       opts.Database,
		DownloadDir:    opts.DownloadDir,
	})

	go d.hydrateMediaMap()

	return d
}

// CountChaptersByTitles scans downloadDir for the provided title candidates and returns the best matching
// title folder and how many chapters it contains.
// It only matches exact folder names (case sensitive on POSIX), callers should provide multiple normalized variants.
func (d *Downloader) CountChaptersByTitles(titles []string) (string, int) {
	bestTitle := ""
	bestCount := 0

	for _, title := range titles {
		if title == "" {
			continue
		}

		mediaDir := filepath.Join(d.downloadDir, title)
		
		// Try new format: series-level registry.json
		seriesRegistry, err := chapter_downloader.LoadSeriesRegistry(mediaDir, d.logger)
		if err == nil && len(seriesRegistry.Chapters) > 0 {
			count := len(seriesRegistry.Chapters)
			if count > bestCount {
				bestCount = count
				bestTitle = title
			}
			continue
		}
		
		// Fallback: old format with per-chapter registry.json
		entries, err := os.ReadDir(mediaDir)
		if err != nil {
			continue
		}

		count := 0
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			registryPath := filepath.Join(mediaDir, entry.Name(), "registry.json")
			if _, err := os.Stat(registryPath); err == nil {
				count++
			}
		}

		if count > bestCount {
			bestCount = count
			bestTitle = title
		}
	}

	return bestTitle, bestCount
}

// IsSeriesFullyDownloadedByChapterIDs checks whether every chapter ID exists in the
// series-level registry for a given media title folder.
//
// This is a fast path used by en masse flows to skip series that are already fully
// downloaded without performing per-chapter provider calls.
func (d *Downloader) IsSeriesFullyDownloadedByChapterIDs(mediaTitle string, provider string, chapterIDs []string) bool {
	mediaTitle = strings.TrimSpace(mediaTitle)
	if mediaTitle == "" || len(chapterIDs) == 0 {
		return false
	}

	seriesDir := filepath.Join(d.downloadDir, mediaTitle)
	seriesRegistry, err := chapter_downloader.LoadSeriesRegistry(seriesDir, d.logger)
	if err != nil || len(seriesRegistry.Chapters) == 0 {
		return false
	}

	downloadedIDs := make(map[string]struct{}, len(seriesRegistry.Chapters))
	for _, entry := range seriesRegistry.Chapters {
		if entry == nil || entry.ChapterId == "" {
			continue
		}

		if provider != "" {
			if entry.Provider != "" && entry.Provider != provider && seriesRegistry.Provider != provider {
				continue
			}
		}

		downloadedIDs[entry.ChapterId] = struct{}{}
	}

	if len(downloadedIDs) == 0 {
		return false
	}

	for _, chapterID := range chapterIDs {
		if chapterID == "" {
			continue
		}
		if _, ok := downloadedIDs[chapterID]; !ok {
			return false
		}
	}

	return true
}

type (
	Downloader struct {
		logger            *zerolog.Logger
		wsEventManager    events.WSEventManagerInterface
		database          *db.Database
		downloadDir       string
		chapterDownloader *chapter_downloader.Downloader
		repository        *Repository

		OnMangaQueued func(mediaId int) // Called when a manga chapter is queued for download
		filecacher        *filecache.Cacher

		mediaMap   *MediaMap // Refreshed on start and after each download
		mediaMapMu sync.RWMutex

		chapterDownloadedCh chan chapter_downloader.DownloadID
		readingDownloadDir  bool
		isOfflineRef        *util.Ref[bool]
	}

	// MediaMap is created after reading the download directory.
	// It is used to store all downloaded chapters for each media.
	// The key is the media ID and the value is a map of provider to a list of chapters.
	//
	//	e.g., downloadDir/comick_1234_abc_13/
	//	      downloadDir/comick_1234_def_13.5/
	// -> { 1234: { "comick": [ { "chapterId": "abc", "chapterNumber": "13" }, { "chapterId": "def", "chapterNumber": "13.5" } ] } }
	MediaMap map[int]ProviderDownloadMap

	// ProviderDownloadMap is used to store all downloaded chapters for a specific media and provider.
	// The key is the provider and the value is a list of chapters.
	ProviderDownloadMap map[string][]ProviderDownloadMapChapterInfo

	ProviderDownloadMapChapterInfo struct {
		ChapterID     string `json:"chapterId"`
		ChapterNumber string `json:"chapterNumber"`
	}

	MediaDownloadData struct {
		Downloaded ProviderDownloadMap `json:"downloaded"`
		Queued     ProviderDownloadMap `json:"queued"`
	}
)

type (
	NewDownloaderOptions struct {
		Database       *db.Database
		Logger         *zerolog.Logger
		WSEventManager events.WSEventManagerInterface
		DownloadDir    string
		Repository     *Repository
		IsOfflineRef   *util.Ref[bool]
	}

	DownloadChapterOptions struct {
		Provider   string
		MediaId    int
		ChapterId  string
		StartNow   bool
		MediaTitle string // Romaji title for folder naming (optional, will be fetched if empty)
	}
)

// Start is called once to start the Chapter downloader 's main goroutine.
func (d *Downloader) Start() {
	// Run migration on start to convert old format to new format
	go d.migrateToNewFormat()
	
	d.chapterDownloader.Start()
	// Ensure the download queue is not active on startup — user must start it explicitly
	d.chapterDownloader.Stop()
	go func() {
		for {
			select {
			// Listen for downloaded chapters
			case downloadId := <-d.chapterDownloader.ChapterDownloaded():
				if d.isOfflineRef.Get() {
					continue
				}

				// When a chapter is downloaded, fetch the chapter container from the file cache
				// and store it in the permanent bucket.
				// DEVNOTE: This will be useful to avoid re-fetching the chapter container when the cache expires.
				// This is deleted when a chapter is deleted.
				go func() {
					chapterContainerKey := getMangaChapterContainerCacheKey(downloadId.Provider, downloadId.MediaId)
					chapterContainer, found := d.repository.getChapterContainerFromFilecache(downloadId.Provider, downloadId.MediaId)
					if found {
						// Store the chapter container in the permanent bucket
						permBucket := getPermanentChapterContainerCacheBucket(downloadId.Provider, downloadId.MediaId)
						_ = d.filecacher.SetPerm(permBucket, chapterContainerKey, chapterContainer)
					}
				}()

				// Refresh the media map when a chapter is downloaded
				d.hydrateMediaMap()
			}
		}
	}()
}

type MigrationProgressPayload struct {
	Running       bool   `json:"running"`
	CurrentSeries int    `json:"currentSeries"`
	TotalSeries   int    `json:"totalSeries"`
	Migrated      int    `json:"migrated"`
	Failed        int    `json:"failed"`
	Percentage    int    `json:"percentage"`
	SeriesDir     string `json:"seriesDir,omitempty"`
	Status        string `json:"status"`
}

// The bucket for storing downloaded chapter containers.
// e.g. manga_downloaded_comick_chapters_1234
// The key is the chapter ID.
func getPermanentChapterContainerCacheBucket(provider string, mId int) filecache.PermanentBucket {
	return filecache.NewPermanentBucket(fmt.Sprintf("manga_downloaded_%s_chapters_%d", provider, mId))
}

// getChapterContainerFromFilecache returns the chapter container from the temporary file cache.
func (r *Repository) getChapterContainerFromFilecache(provider string, mId int) (*ChapterContainer, bool) {
	// Find chapter container in the file cache
	chapterBucket := r.getFcProviderBucket(provider, mId, bucketTypeChapter)

	chapterContainerKey := getMangaChapterContainerCacheKey(provider, mId)

	var chapterContainer *ChapterContainer
	// Get the key-value pair in the bucket
	if found, _ := r.fileCacher.Get(chapterBucket, chapterContainerKey, &chapterContainer); !found {
		// If the chapter container is not found, return an error
		// since it means that it wasn't fetched (for some reason) -- This shouldn't happen
		return nil, false
	}

	return chapterContainer, true
}

// getChapterContainerFromPermanentFilecache returns the chapter container from the permanent file cache.
func (r *Repository) getChapterContainerFromPermanentFilecache(provider string, mId int) (*ChapterContainer, bool) {
	permBucket := getPermanentChapterContainerCacheBucket(provider, mId)

	chapterContainerKey := getMangaChapterContainerCacheKey(provider, mId)

	var chapterContainer *ChapterContainer
	// Get the key-value pair in the bucket
	if found, _ := r.fileCacher.GetPerm(permBucket, chapterContainerKey, &chapterContainer); !found {
		// If the chapter container is not found, return an error
		// since it means that it wasn't fetched (for some reason) -- This shouldn't happen
		return nil, false
	}

	return chapterContainer, true
}

// DownloadChapter is called by the client to download a chapter.
// It fetches the chapter pages by using Repository.GetMangaPageContainer
// and invokes the chapter_downloader.Downloader 'Download' method to add the chapter to the download queue.
func (d *Downloader) DownloadChapter(opts DownloadChapterOptions) error {

	if d.isOfflineRef.Get() {
		return errors.New("manga downloader: Manga downloader is in offline mode")
	}

	chapterContainer, found := d.repository.getChapterContainerFromFilecache(opts.Provider, opts.MediaId)
	if !found {
		return errors.New("chapters not found")
	}

	// Find the chapter in the chapter container
	// e.g. Wind-Breaker$0062
	chapter, ok := chapterContainer.GetChapter(opts.ChapterId)
	if !ok {
		return errors.New("chapter not found")
	}

	// Fetch the chapter pages
	pageContainer, err := d.repository.GetMangaPageContainer(opts.Provider, opts.MediaId, opts.ChapterId, false, util.NewRef(false))
	if err != nil {
		return err
	}

	// Add the chapter to the download queue
	normalizedChapterNumber := manga_providers.GetNormalizedChapter(chapter.Chapter)
	err = d.chapterDownloader.AddToQueue(chapter_downloader.DownloadOptions{
		DownloadID: chapter_downloader.DownloadID{
			Provider:      opts.Provider,
			MediaId:       opts.MediaId,
			ChapterId:     opts.ChapterId,
			ChapterNumber: normalizedChapterNumber,
			ChapterTitle:  chapter.Title,
			MediaTitle:    opts.MediaTitle,
		},
		Pages: pageContainer.Pages,
	})
	if err == nil && d.OnMangaQueued != nil {
		go d.OnMangaQueued(opts.MediaId)
	}
	return err
}

// DownloadChapterDirectOptions contains options for direct chapter download
type DownloadChapterDirectOptions struct {
	Provider      string
	MediaId       int
	ChapterId     string
	ChapterNumber string
	ChapterTitle  string
	MediaTitle    string
	Pages         []*hibikemanga.ChapterPage
	StartNow      bool
}

// DownloadChapterDirect is called to download a chapter with pre-fetched pages.
// This bypasses the cache lookup and uses the provided pages directly.
// Used by the en masse downloader which fetches pages directly from the provider.
func (d *Downloader) DownloadChapterDirect(opts DownloadChapterDirectOptions) error {
	if d.isOfflineRef.Get() {
		return errors.New("manga downloader: Manga downloader is in offline mode")
	}

	if len(opts.Pages) == 0 {
		return errors.New("manga downloader: No pages provided")
	}

	// Add the chapter to the download queue
	normalizedChapterNumber := manga_providers.GetNormalizedChapter(opts.ChapterNumber)
	err := d.chapterDownloader.AddToQueue(chapter_downloader.DownloadOptions{
		DownloadID: chapter_downloader.DownloadID{
			Provider:      opts.Provider,
			MediaId:       opts.MediaId,
			ChapterId:     opts.ChapterId,
			ChapterNumber: normalizedChapterNumber,
			ChapterTitle:  opts.ChapterTitle,
			MediaTitle:    opts.MediaTitle,
		},
		Pages:    opts.Pages,
		StartNow: opts.StartNow,
	})
	if err == nil && d.OnMangaQueued != nil {
		go d.OnMangaQueued(opts.MediaId)
	}
	return err
}
}

// IsChapterAlreadyDownloaded checks if a chapter is already downloaded
// for the given direct download options. This is used by the en masse downloader to avoid
// re-queuing chapters that are already on disk.
func (d *Downloader) IsChapterAlreadyDownloaded(opts DownloadChapterDirectOptions) bool {
	if opts.MediaTitle == "" {
		return false
	}
	
	seriesDir := filepath.Join(d.downloadDir, opts.MediaTitle)
	
	// Try new format: check series-level registry
	seriesRegistry, err := chapter_downloader.LoadSeriesRegistry(seriesDir, d.logger)
	if err == nil && len(seriesRegistry.Chapters) > 0 {
		_, _, found := seriesRegistry.GetChapterByID(opts.ChapterId)
		if found {
			return true
		}
	}
	
	// Fallback: check old format (per-chapter registry.json)
	chapterDir := chapter_downloader.FormatChapterDirName(opts.Provider, opts.MediaId, opts.ChapterId, opts.ChapterNumber)
	registryPath := filepath.Join(seriesDir, chapterDir, "registry.json")
	if _, err := os.Stat(registryPath); err == nil {
		return true
	}

	return false
}

// DeleteChapter is called by the client to delete a downloaded chapter.
func (d *Downloader) DeleteChapter(provider string, mediaId int, chapterId string, chapterNumber string) (err error) {
	err = d.chapterDownloader.DeleteChapter(chapter_downloader.DownloadID{
		Provider:      provider,
		MediaId:       mediaId,
		ChapterId:     chapterId,
		ChapterNumber: chapterNumber,
	})
	if err != nil {
		return err
	}

	permBucket := getPermanentChapterContainerCacheBucket(provider, mediaId)
	_ = d.filecacher.DeletePerm(permBucket, chapterId)

	d.hydrateMediaMap()

	return nil
}

// DeleteChapters is called by the client to delete downloaded chapters.
func (d *Downloader) DeleteChapters(ids []chapter_downloader.DownloadID) (err error) {
	for _, id := range ids {
		err = d.chapterDownloader.DeleteChapter(chapter_downloader.DownloadID{
			Provider:      id.Provider,
			MediaId:       id.MediaId,
			ChapterId:     id.ChapterId,
			ChapterNumber: id.ChapterNumber,
		})

		permBucket := getPermanentChapterContainerCacheBucket(id.Provider, id.MediaId)
		_ = d.filecacher.DeletePerm(permBucket, id.ChapterId)
	}
	if err != nil {
		return err
	}

	d.hydrateMediaMap()

	return nil
}

func (d *Downloader) GetMediaDownloads(mediaId int, cached bool) (ret MediaDownloadData, err error) {
	defer util.HandlePanicInModuleWithError("manga/GetMediaDownloads", &err)

	if !cached {
		d.hydrateMediaMap()
	}

	return d.mediaMap.getMediaDownload(mediaId, d.database)
}

// GetMediaMap returns a copy of the current media map
func (d *Downloader) GetMediaMap() map[int]ProviderDownloadMap {
	d.mediaMapMu.RLock()
	defer d.mediaMapMu.RUnlock()
	
	if d.mediaMap == nil {
		return make(map[int]ProviderDownloadMap)
	}
	
	// Return a copy to avoid concurrent access issues
	result := make(map[int]ProviderDownloadMap)
	for k, v := range *d.mediaMap {
		result[k] = v
	}
	return result
}

func (d *Downloader) RunChapterDownloadQueue() {
	d.chapterDownloader.Run()
}

func (d *Downloader) StopChapterDownloadQueue() {
	_ = d.database.ResetDownloadingChapterDownloadQueueItems()
	d.chapterDownloader.Stop()
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type (
	NewDownloadListOptions struct {
		MangaCollection *anilist.MangaCollection
		PlatformRef     *util.Ref[platform.Platform] // Optional: used to fetch metadata for manga not in collection
		Ctx             context.Context
	}

	DownloadListItem struct {
		MediaId int `json:"mediaId"`
		// Media will be nil if the manga is no longer in the user's collection.
		// The client should handle this case by displaying the download data without the media data.
		Media        *anilist.BaseManga   `json:"media"`
		DownloadData ProviderDownloadMap `json:"downloadData"`
		IsMapped     bool                 `json:"isMapped"` // True if this was a synthetic manga mapped to AniList
	}
)

// NewDownloadList returns a list of DownloadListItem for the client to display.
func (d *Downloader) NewDownloadList(opts *NewDownloadListOptions) (ret []*DownloadListItem, err error) {
	defer util.HandlePanicInModuleWithError("manga/NewDownloadList", &err)

	mm := d.mediaMap

	ret = make([]*DownloadListItem, 0)
	seen := make(map[int]bool) // Track seen media IDs to avoid duplicates

	for mId, data := range *mm {
		// Check if this is a synthetic manga (negative ID)
		if mId < 0 {
			syntheticManga, found := d.database.GetSyntheticManga(mId)
			if found {
				// Check if there's a mapping to an AniList ID
				if anilistID, found := d.database.GetMangaIDMapping(mId); found {
					// Skip if we've already seen this AniList ID
					if seen[anilistID] {
						continue
					}
					seen[anilistID] = true

					// Only add the AniList entry (hide the synthetic entry)
					listEntry, ok := opts.MangaCollection.GetListEntryFromMangaId(anilistID)
					if ok && listEntry.GetMedia() != nil {
						ret = append(ret, &DownloadListItem{
							MediaId:      anilistID,
							Media:        listEntry.GetMedia(),
							DownloadData: data,
							IsMapped:     true,
						})
					} else {
						// AniList entry not in collection, create from synthetic data with AniList ID
						anilistMedia := createBaseMangaFromSynthetic(syntheticManga, anilistID)
						ret = append(ret, &DownloadListItem{
							MediaId:      anilistID,
							Media:        anilistMedia,
							DownloadData: data,
							IsMapped:     true,
						})
					}
				} else {
					// Skip if we've already seen this synthetic ID
					if seen[mId] {
						continue
					}
					seen[mId] = true

					// No mapping exists, show the synthetic entry
					syntheticMedia := createBaseMangaFromSynthetic(syntheticManga, mId)
					ret = append(ret, &DownloadListItem{
						MediaId:      mId,
						Media:        syntheticMedia,
						DownloadData: data,
						IsMapped:     false,
					})
				}
			} else {
				// Skip if we've already seen this ID
				if seen[mId] {
					continue
				}
				seen[mId] = true

				// Synthetic manga not found in database
				ret = append(ret, &DownloadListItem{
					MediaId:      mId,
					Media:        nil,
					DownloadData: data,
					IsMapped:     false,
				})
			}
			continue
		}

		// Skip if we've already seen this media ID
		if seen[mId] {
			continue
		}
		seen[mId] = true

		listEntry, ok := opts.MangaCollection.GetListEntryFromMangaId(mId)
		if !ok {
			// Not in AniList collection, try to get stored metadata
			if storedMetadata, found := d.database.GetDownloadedMangaMetadata(mId); found {
				media := createBaseMangaFromStoredMetadata(storedMetadata)
				ret = append(ret, &DownloadListItem{
					MediaId:      mId,
					Media:        media,
					DownloadData: data,
				})
			} else {
				// No stored metadata, try to fetch from AniList API and store it
				media := d.fetchAndStoreMetadataFromAniList(opts, mId)
				ret = append(ret, &DownloadListItem{
					MediaId:      mId,
					Media:        media,
					DownloadData: data,
				})
			}
			continue
		}

		media := listEntry.GetMedia()
		if media == nil {
			// In collection but media is nil, try stored metadata
			if storedMetadata, found := d.database.GetDownloadedMangaMetadata(mId); found {
				media = createBaseMangaFromStoredMetadata(storedMetadata)
				ret = append(ret, &DownloadListItem{
					MediaId:      mId,
					Media:        media,
					DownloadData: data,
				})
			} else {
				// No stored metadata, try to fetch from AniList API and store it
				media := d.fetchAndStoreMetadataFromAniList(opts, mId)
				ret = append(ret, &DownloadListItem{
					MediaId:      mId,
					Media:        media,
					DownloadData: data,
				})
			}
			continue
		}

		item := &DownloadListItem{
			MediaId:      mId,
			Media:        media,
			DownloadData: data,
		}

		ret = append(ret, item)
	}

	return
}

// fetchAndStoreMetadataFromAniList fetches manga metadata from AniList API and stores it in the database
func (d *Downloader) fetchAndStoreMetadataFromAniList(opts *NewDownloadListOptions, mediaId int) *anilist.BaseManga {
	if opts.PlatformRef == nil || opts.Ctx == nil {
		return nil
	}

	mangaMedia, err := opts.PlatformRef.Get().GetManga(opts.Ctx, mediaId)
	if err != nil || mangaMedia == nil {
		return nil
	}

	// Extract title and cover image
	var title, coverImage string
	if mangaMedia.GetTitle() != nil {
		if mangaMedia.GetTitle().GetRomaji() != nil {
			title = *mangaMedia.GetTitle().GetRomaji()
		} else if mangaMedia.GetTitle().GetEnglish() != nil {
			title = *mangaMedia.GetTitle().GetEnglish()
		}
	}
	if mangaMedia.GetCoverImage() != nil {
		if mangaMedia.GetCoverImage().GetExtraLarge() != nil {
			coverImage = *mangaMedia.GetCoverImage().GetExtraLarge()
		} else if mangaMedia.GetCoverImage().GetLarge() != nil {
			coverImage = *mangaMedia.GetCoverImage().GetLarge()
		}
	}

	// Store metadata for future use
	if title != "" || coverImage != "" {
		_ = d.database.SaveDownloadedMangaMetadata(mediaId, title, coverImage, "")
	}

	return mangaMedia
}

// createBaseMangaFromSynthetic creates a BaseManga object from a SyntheticManga entry
// displayId is the ID to use in the media object (can be AniList ID if mapped, or synthetic ID if not)
func createBaseMangaFromSynthetic(sm *models.SyntheticManga, displayId int) *anilist.BaseManga {
	status := anilist.MediaStatusReleasing
	if sm.Status == "FINISHED" {
		status = anilist.MediaStatusFinished
	}

	format := anilist.MediaFormatManga

	return &anilist.BaseManga{
		ID: displayId,
		Title: &anilist.BaseManga_Title{
			Romaji:        &sm.Title,
			English:       &sm.Title,
			UserPreferred: &sm.Title,
		},
		CoverImage: &anilist.BaseManga_CoverImage{
			Large:      &sm.CoverImage,
			ExtraLarge: &sm.CoverImage,
			Medium:     &sm.CoverImage,
		},
		BannerImage: &sm.CoverImage,
		Status:      &status,
		Format:      &format,
		Chapters:    &sm.Chapters,
	}
}

// createBaseMangaFromStoredMetadata creates a BaseManga object from stored DownloadedMangaMetadata
func createBaseMangaFromStoredMetadata(metadata *models.DownloadedMangaMetadata) *anilist.BaseManga {
	status := anilist.MediaStatusReleasing
	format := anilist.MediaFormatManga

	return &anilist.BaseManga{
		ID: metadata.MediaID,
		Title: &anilist.BaseManga_Title{
			Romaji:        &metadata.Title,
			English:       &metadata.Title,
			UserPreferred: &metadata.Title,
		},
		CoverImage: &anilist.BaseManga_CoverImage{
			Large:      &metadata.CoverImage,
			ExtraLarge: &metadata.CoverImage,
			Medium:     &metadata.CoverImage,
		},
		BannerImage: &metadata.CoverImage,
		Status:      &status,
		Format:      &format,
	}
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Media map
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

func (mm *MediaMap) getMediaDownload(mediaId int, db *db.Database) (MediaDownloadData, error) {

	if mm == nil {
		return MediaDownloadData{}, errors.New("could not check downloaded chapters")
	}

	// Get all downloaded chapters for the media
	downloads, ok := (*mm)[mediaId]
	if !ok {
		downloads = make(map[string][]ProviderDownloadMapChapterInfo)
	}

	// Get all queued chapters for the media
	queued, err := db.GetMediaQueuedChapters(mediaId)
	if err != nil {
		queued = make([]*models.ChapterDownloadQueueItem, 0)
	}

	qm := make(ProviderDownloadMap)
	for _, item := range queued {
		if _, ok := qm[item.Provider]; !ok {
			qm[item.Provider] = []ProviderDownloadMapChapterInfo{
				{
					ChapterID:     item.ChapterID,
					ChapterNumber: item.ChapterNumber,
				},
			}
		} else {
			qm[item.Provider] = append(qm[item.Provider], ProviderDownloadMapChapterInfo{
				ChapterID:     item.ChapterID,
				ChapterNumber: item.ChapterNumber,
			})
		}
	}

	data := MediaDownloadData{
		Downloaded: downloads,
		Queued:     qm,
	}

	return data, nil

}

// hydrateMediaMap hydrates the MediaMap by reading the download directory.
func (d *Downloader) hydrateMediaMap() {

	if d.readingDownloadDir {
		return
	}

	d.mediaMapMu.Lock()
	defer d.mediaMapMu.Unlock()

	d.readingDownloadDir = true
	defer func() {
		d.readingDownloadDir = false
	}()

	d.logger.Debug().Msg("manga downloader: Reading download directory")

	ret := make(MediaMap)

	// Read top-level directories (series folders)
	mediaDirs, err := os.ReadDir(d.downloadDir)
	if err != nil {
		d.logger.Error().Err(err).Msg("manga downloader: Failed to read download directory")
	}

	mu := sync.Mutex{}
	wg := sync.WaitGroup{}
	
	for _, mediaDir := range mediaDirs {
		if !mediaDir.IsDir() {
			continue
		}

		mediaDirPath := filepath.Join(d.downloadDir, mediaDir.Name())
		
		// Try new format: series-level registry.json
		seriesRegistry, err := chapter_downloader.LoadSeriesRegistry(mediaDirPath, d.logger)
		if err == nil && len(seriesRegistry.Chapters) > 0 && seriesRegistry.MediaId != 0 {
			mu.Lock()
			if _, ok := ret[seriesRegistry.MediaId]; !ok {
				ret[seriesRegistry.MediaId] = make(map[string][]ProviderDownloadMapChapterInfo)
			}
			
			for _, entry := range seriesRegistry.Chapters {
				newMapInfo := ProviderDownloadMapChapterInfo{
					ChapterID:     entry.ChapterId,
					ChapterNumber: entry.ChapterNumber,
				}
				
				provider := entry.Provider
				if provider == "" {
					provider = seriesRegistry.Provider
				}
				
				if _, ok := ret[seriesRegistry.MediaId][provider]; !ok {
					ret[seriesRegistry.MediaId][provider] = []ProviderDownloadMapChapterInfo{newMapInfo}
				} else {
					ret[seriesRegistry.MediaId][provider] = append(ret[seriesRegistry.MediaId][provider], newMapInfo)
				}
			}
			mu.Unlock()
			continue
		}
		
		// Fallback: old format with per-chapter directories
		chapterDirs, err := os.ReadDir(mediaDirPath)
		if err != nil {
			d.logger.Error().Err(err).Str("mediaDir", mediaDir.Name()).Msg("manga downloader: Failed to read media directory")
			continue
		}

		for _, chapterDir := range chapterDirs {
			wg.Add(1)
			go func(chapterDir os.DirEntry) {
				defer wg.Done()

				if chapterDir.IsDir() {
					// e.g. comick_1234_abc_13.5 (old format)
					id, ok := chapter_downloader.ParseChapterDirName(chapterDir.Name())
					if !ok {
						return
					}

					mu.Lock()
					newMapInfo := ProviderDownloadMapChapterInfo{
						ChapterID:     id.ChapterId,
						ChapterNumber: id.ChapterNumber,
					}

					if _, ok := ret[id.MediaId]; !ok {
						ret[id.MediaId] = make(map[string][]ProviderDownloadMapChapterInfo)
						ret[id.MediaId][id.Provider] = []ProviderDownloadMapChapterInfo{newMapInfo}
					} else {
						if _, ok := ret[id.MediaId][id.Provider]; !ok {
							ret[id.MediaId][id.Provider] = []ProviderDownloadMapChapterInfo{newMapInfo}
						} else {
							ret[id.MediaId][id.Provider] = append(ret[id.MediaId][id.Provider], newMapInfo)
						}
					}
					mu.Unlock()
				}
			}(chapterDir)
		}
	}
	wg.Wait()

	// Trigger hook event
	ev := &MangaDownloadMapEvent{
		MediaMap: &ret,
	}
	_ = hook.GlobalHookManager.OnMangaDownloadMap().Trigger(ev) // ignore the error
	// make sure the media map is not nil
	if ev.MediaMap != nil {
		ret = *ev.MediaMap
	}

	d.mediaMap = &ret

	// When done refreshing, send a message to the client to refetch the download data
	d.wsEventManager.SendEvent(events.RefreshedMangaDownloadData, nil)
}

// migrateToNewFormat migrates all manga in the download directory to the new series registry format
func (d *Downloader) migrateToNewFormat() {
	d.logger.Info().Msg("manga downloader: Checking for chapters to migrate to new format")
	d.wsEventManager.SendEvent(events.MangaChapterMigrationProgress, &MigrationProgressPayload{
		Running:    true,
		Percentage: 0,
		Status:     "starting",
	})
	
	results, err := chapter_downloader.MigrateDownloadDirectoryWithProgress(
		d.downloadDir,
		d.logger,
		125*time.Millisecond,
		func(progress chapter_downloader.MigrationProgress) {
			percentage := 0
			if progress.TotalSeries > 0 {
				percentage = int((float64(progress.CurrentSeries) / float64(progress.TotalSeries)) * 100)
			}
			d.wsEventManager.SendEvent(events.MangaChapterMigrationProgress, &MigrationProgressPayload{
				Running:       progress.Status != "completed",
				CurrentSeries: progress.CurrentSeries,
				TotalSeries:   progress.TotalSeries,
				Migrated:      progress.Migrated,
				Failed:        progress.Failed,
				Percentage:    percentage,
				SeriesDir:     progress.SeriesDir,
				Status:        progress.Status,
			})
		},
	)
	if err != nil {
		d.logger.Error().Err(err).Msg("manga downloader: Failed to migrate download directory")
		d.wsEventManager.SendEvent(events.MangaChapterMigrationProgress, &MigrationProgressPayload{
			Running:    false,
			Percentage: 100,
			Status:     "error",
		})
		return
	}
	
	totalMigrated := 0
	totalFailed := 0
	totalSeriesErrors := 0
	for _, result := range results {
		totalMigrated += result.ChaptersMigrated
		totalFailed += result.ChaptersFailed
		if len(result.Errors) > 0 {
			totalSeriesErrors++
		}
		for _, errMsg := range result.Errors {
			d.logger.Warn().Str("seriesDir", result.SeriesDir).Msg(errMsg)
		}
	}

	d.logger.Info().
		Int("migrated", totalMigrated).
		Int("failed", totalFailed).
		Int("seriesWithErrors", totalSeriesErrors).
		Msg("manga downloader: Migration run completed")

	if totalMigrated > 0 || totalFailed > 0 || totalSeriesErrors > 0 {
		d.hydrateMediaMap()
	} else {
		d.logger.Info().
			Msg("manga downloader: Migration found no changes")
	}

	d.wsEventManager.SendEvent(events.MangaChapterMigrationProgress, &MigrationProgressPayload{
		Running:    false,
		Percentage: 100,
		Migrated:   totalMigrated,
		Failed:     totalFailed,
		Status:     "completed",
	})
}
