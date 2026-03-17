package manga

import (
	"cmp"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/extension"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/hook"
	chapter_downloader "seanime/internal/manga/downloader"
	manga_providers "seanime/internal/manga/providers"
	"slices"
	"strconv"
	"strings"

	"github.com/goccy/go-json"
)

// GetDownloadedMangaChapterContainers retrieves downloaded chapter containers for a specific manga ID.
// It filters the complete set of downloaded chapters to return only those matching the provided manga ID.
func (r *Repository) GetDownloadedMangaChapterContainers(mId int, mangaCollection *anilist.MangaCollection) (ret []*ChapterContainer, err error) {

	containers, err := r.GetDownloadedChapterContainers(mangaCollection)
	if err != nil {
		return nil, err
	}

	// Check if this AniList ID is mapped from a synthetic ID
	// If so, we need to look for containers with the synthetic ID
	searchIds := []int{mId}
	if mId > 0 && r.db != nil {
		if syntheticID, found := r.db.GetReverseMangaIDMapping(mId); found {
			searchIds = append(searchIds, syntheticID)
			r.logger.Debug().
				Int("anilistID", mId).
				Int("syntheticID", syntheticID).
				Msg("manga: Using synthetic ID for downloaded chapter lookup via reverse mapping")
		} else {
			r.logger.Debug().
				Int("anilistID", mId).
				Msg("manga: No reverse mapping found for this AniList ID")
		}
	}
	
	r.logger.Debug().
		Int("mediaId", mId).
		Ints("searchIds", searchIds).
		Int("totalContainers", len(containers)).
		Msg("manga: Searching for downloaded chapters")

	for _, container := range containers {
		for _, searchId := range searchIds {
			if container.MediaId == searchId {
				// If this container has a synthetic ID that's mapped to an AniList ID,
				// update the container to use the AniList ID for presentation
				containerToAdd := container
				if container.MediaId < 0 && r.db != nil {
					if anilistID, found := r.db.GetMangaIDMapping(container.MediaId); found {
						// Create a copy with the AniList ID
						containerToAdd = &ChapterContainer{
							MediaId:  anilistID,
							Provider: container.Provider,
							Chapters: container.Chapters,
						}
						r.logger.Debug().
							Int("syntheticID", container.MediaId).
							Int("anilistID", anilistID).
							Msg("manga: Presenting downloaded container with AniList ID")
					}
				}
				ret = append(ret, containerToAdd)
				break
			}
		}
	}

	return ret, nil
}

// GetDownloadedChapterContainers retrieves all downloaded manga chapter containers.
// It scans the download directory for chapter folders, matches them with manga collection entries,
// and collects chapter details from file cache or provider API when necessary.
//
// Ideally, the provider API should never be called assuming the chapter details are cached.
func (r *Repository) GetDownloadedChapterContainers(mangaCollection *anilist.MangaCollection) (ret []*ChapterContainer, err error) {
	ret = make([]*ChapterContainer, 0)

	// Trigger hook event
	reqEvent := &MangaDownloadedChapterContainersRequestedEvent{
		MangaCollection:   mangaCollection,
		ChapterContainers: ret,
	}
	err = hook.GlobalHookManager.OnMangaDownloadedChapterContainersRequested().Trigger(reqEvent)
	if err != nil {
		r.logger.Error().Err(err).Msg("manga: Exception occurred while triggering hook event")
		return nil, fmt.Errorf("manga: Error in hook, %w", err)
	}
	mangaCollection = reqEvent.MangaCollection

	// Default prevented, return the chapter containers
	if reqEvent.DefaultPrevented {
		ret = reqEvent.ChapterContainers
		if ret == nil {
			return nil, fmt.Errorf("manga: No chapter containers returned by hook event")
		}
		return ret, nil
	}

	// Read download directory (top-level contains media ID folders)
	mediaDirs, err := os.ReadDir(r.downloadDir)
	if err != nil {
		r.logger.Error().Err(err).Msg("manga: Failed to read download directory")
		return nil, err
	}

	// Get all chapter directories from nested media folders
	// Structure: downloadDir/{mediaId}/{provider}_{mediaId}_{chapterId}_{chapterNumber}
	chapterDirs := make([]string, 0)
	for _, mediaDir := range mediaDirs {
		if !mediaDir.IsDir() {
			continue
		}

		// Read chapter directories inside each media folder
		mediaDirPath := filepath.Join(r.downloadDir, mediaDir.Name())
		chapterFiles, err := os.ReadDir(mediaDirPath)
		if err != nil {
			r.logger.Error().Err(err).Str("mediaDir", mediaDir.Name()).Msg("manga: Failed to read media directory")
			continue
		}

		for _, chapterFile := range chapterFiles {
			if chapterFile.IsDir() {
				_, ok := chapter_downloader.ParseChapterDirName(chapterFile.Name())
				if !ok {
					continue
				}
				chapterDirs = append(chapterDirs, chapterFile.Name())
			}
		}
	}

	if len(chapterDirs) > 0 {

		// Now that we have all the chapter directories, we can get the chapter containers

		keys := make([]*chapter_downloader.DownloadID, 0)
		for _, dir := range chapterDirs {
			downloadId, ok := chapter_downloader.ParseChapterDirName(dir)
			if !ok {
				continue
			}
			keys = append(keys, &downloadId)
		}

		providerAndMediaIdPairs := make(map[struct {
			provider string
			mediaId  int
		}]bool)

		for _, key := range keys {
			providerAndMediaIdPairs[struct {
				provider string
				mediaId  int
			}{
				provider: key.Provider,
				mediaId:  key.MediaId,
			}] = true
		}

		// Get the chapter containers
		for pair := range providerAndMediaIdPairs {
			provider := pair.provider
			mediaId := pair.mediaId

			//// Get the manga from the collection
			//mangaEntry, ok := mangaCollection.GetListEntryFromMangaId(mediaId)
			//if !ok {
			//	r.logger.Warn().Int("mediaId", mediaId).Msg("manga: [GetDownloadedChapterContainers] Manga not found in collection")
			//	continue
			//}

			// Get the list of chapters for the manga
			// Check the permanent file cache
			container, found := r.getChapterContainerFromPermanentFilecache(provider, mediaId)
			if !found {
				// Check the temporary file cache
				container, found = r.getChapterContainerFromFilecache(provider, mediaId)
				if !found {
					continue
					//// Get the chapters from the provider
					//// This stays here for backwards compatibility, but ideally the method should not require an internet connection
					//// so this will fail if the chapters were not cached & with no internet
					//opts := GetMangaChapterContainerOptions{
					//	Provider: provider,
					//	MediaId:  mediaId,
					//	Titles:   mangaEntry.GetMedia().GetAllTitles(),
					//	Year:     mangaEntry.GetMedia().GetStartYearSafe(),
					//}
					//container, err = r.GetMangaChapterContainer(&opts)
					//if err != nil {
					//	r.logger.Error().Err(err).Int("mediaId", mediaId).Msg("manga: [GetDownloadedChapterContainers] Failed to retrieve cached list of manga chapters")
					//	continue
					//}
					//// Cache the chapter container in the permanent bucket
					//go func() {
					//	chapterContainerKey := getMangaChapterContainerCacheKey(provider, mediaId)
					//	chapterContainer, found := r.getChapterContainerFromFilecache(provider, mediaId)
					//	if found {
					//		// Store the chapter container in the permanent bucket
					//		permBucket := getPermanentChapterContainerCacheBucket(provider, mediaId)
					//		_ = r.fileCacher.SetPerm(permBucket, chapterContainerKey, chapterContainer)
					//	}
					//}()
				}
			} else {
				r.logger.Trace().Int("mediaId", mediaId).Msg("manga: Found chapter container in permanent bucket")
			}

			downloadedContainer := &ChapterContainer{
				MediaId:  container.MediaId,
				Provider: container.Provider,
				Chapters: make([]*hibikemanga.ChapterDetails, 0),
			}

			// Now that we have the container, we'll filter out the chapters that are not downloaded
			// Go through each chapter and check if it's downloaded
			for _, chapter := range container.Chapters {
				// Normalize chapter number to padded format
				normalizedChapterNum := manga_providers.GetNormalizedChapter(chapter.Chapter)
				
				// For each chapter, check if the chapter directory exists
				// Check both padded and unpadded formats for backward compatibility
				for _, dir := range chapterDirs {
					paddedDirName := chapter_downloader.FormatChapterDirName(provider, mediaId, chapter.ID, normalizedChapterNum)
					unpaddedDirName := chapter_downloader.FormatChapterDirName(provider, mediaId, chapter.ID, chapter.Chapter)
					
					if dir == paddedDirName || dir == unpaddedDirName {
						// Use normalized chapter number and keep original title
						normalizedChapter := *chapter
						normalizedChapter.Chapter = normalizedChapterNum
						downloadedContainer.Chapters = append(downloadedContainer.Chapters, &normalizedChapter)
						break
					}
				}
			}

			if len(downloadedContainer.Chapters) == 0 {
				continue
			}

			// Check if this synthetic ID is mapped to an AniList ID
			// If so, update the container to use the AniList ID for consistency with local provider containers
			if mediaId < 0 && r.db != nil {
				if anilistID, found := r.db.GetMangaIDMapping(mediaId); found {
					downloadedContainer.MediaId = anilistID
					r.logger.Debug().
						Int("syntheticID", mediaId).
						Int("anilistID", anilistID).
						Msg("manga: Updated provider container to use mapped AniList ID")
				}
			}

			ret = append(ret, downloadedContainer)
		}
	}

	// Add chapter containers from local provider
	// For downloaded chapters, create proper chapter entries with format: "ID - SyntheticID - Chapter XXXX"
	localProviderB, ok := extension.GetExtension[extension.MangaProviderExtension](r.extensionBankRef.Get(), manga_providers.LocalProvider)
	if ok {
		_, ok := localProviderB.GetProvider().(*manga_providers.Local)
		if ok {
			// Add containers for manga in AniList collection
			// This includes both regular AniList manga and mapped synthetic manga
			// (since correcting a match adds the manga to the AniList planning list)
			for _, list := range mangaCollection.MediaListCollection.GetLists() {
				for _, entry := range list.GetEntries() {
					media := entry.GetMedia()
					mediaId := media.GetID()
					
					// Check if this is a mapped AniList ID
					originalMediaId := mediaId
					if mediaId > 0 && r.db != nil {
						if synId, found := r.db.GetReverseMangaIDMapping(mediaId); found {
							originalMediaId = synId
						}
					}

					// Get the full chapter container from cache to extract chapter titles
					// We need the full container (not just downloaded chapters) to get all titles
					var providerContainer *ChapterContainer

					// Try to find a provider for this media from the already-built containers
					var containerProvider string
					for _, container := range ret {
						if container.MediaId == originalMediaId {
							containerProvider = container.Provider
							break
						}
					}

					if containerProvider != "" {
						// Try permanent cache first
						providerContainer, _ = r.getChapterContainerFromPermanentFilecache(containerProvider, originalMediaId)
						if providerContainer == nil {
							// Try temporary cache
							providerContainer, _ = r.getChapterContainerFromFilecache(containerProvider, originalMediaId)
						}
					}

					// Build chapters from downloaded folders
					// Use a map to deduplicate by chapter number
					chapterMap := make(map[string]*hibikemanga.ChapterDetails)
					for _, dir := range chapterDirs {
						downloadId, ok := chapter_downloader.ParseChapterDirName(dir)
						if !ok {
							continue
						}
						
						// Only include chapters for this media ID (check both AniList and synthetic)
						if downloadId.MediaId != mediaId && downloadId.MediaId != originalMediaId {
							continue
						}
						
						// Normalize chapter number to padded format for consistent matching
						chapterNum := manga_providers.GetNormalizedChapter(downloadId.ChapterNumber)
						
						// Skip if we already have this chapter number
						if _, exists := chapterMap[chapterNum]; exists {
							continue
						}
						
						// Try to get chapter title from folder name first (new format)
						var chapterTitle string
						if downloadId.ChapterTitle != "" {
							// New format: folder has the title, replace underscores with spaces
							chapterTitle = strings.ReplaceAll(downloadId.ChapterTitle, "_", " ")
						} else {
							// Legacy format: try to find title from provider container
							if providerContainer != nil {
								for _, ch := range providerContainer.Chapters {
									// Normalize provider chapter number to match padded format
									normalizedProviderChapter := manga_providers.GetNormalizedChapter(ch.Chapter)
									if normalizedProviderChapter == chapterNum {
										// Use the full title from the provider as-is
										chapterTitle = ch.Title
										break
									}
								}
							}
						}
						
						// Fallback if no title found
						if chapterTitle == "" {
							paddedChapter := fmt.Sprintf("%04s", chapterNum)
							if len(chapterNum) > 4 {
								paddedChapter = chapterNum
							}
							chapterTitle = fmt.Sprintf("Chapter %s", paddedChapter)
						}
						
						chapterMap[chapterNum] = &hibikemanga.ChapterDetails{
							Provider: manga_providers.LocalProvider,
							ID:       downloadId.ChapterId, // Just the chapter ID, not the full path
							Title:    chapterTitle,
							Chapter:  chapterNum, // Use padded chapter number for matching
							Index:    0,
						}
					}
					
					// Convert map to slice
					localChapters := make([]*hibikemanga.ChapterDetails, 0, len(chapterMap))
					for _, chapter := range chapterMap {
						localChapters = append(localChapters, chapter)
					}
					
					if len(localChapters) > 0 {
						// Sort by chapter number
						slices.SortFunc(localChapters, func(a, b *hibikemanga.ChapterDetails) int {
							chA, _ := strconv.ParseFloat(a.Chapter, 64)
							chB, _ := strconv.ParseFloat(b.Chapter, 64)
							return int(chA - chB)
						})
						
						// Set indexes
						for i, chapter := range localChapters {
							chapter.Index = uint(i)
						}
						
						ret = append(ret, &ChapterContainer{
							MediaId:  mediaId,
							Provider: manga_providers.LocalProvider,
							Chapters: localChapters,
						})
					}
				}
			}
		}
	}

	// Event
	ev := &MangaDownloadedChapterContainersEvent{
		ChapterContainers: ret,
	}
	err = hook.GlobalHookManager.OnMangaDownloadedChapterContainers().Trigger(ev)
	if err != nil {
		r.logger.Error().Err(err).Msg("manga: Exception occurred while triggering hook event")
		return nil, fmt.Errorf("manga: Error in hook, %w", err)
	}
	ret = ev.ChapterContainers

	return ret, nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// getDownloadedMangaPageContainer retrieves page information for a downloaded manga chapter.
// It reads the chapter directory and parses the registry file to build a PageContainer
// with details about each downloaded page including dimensions and file paths.
func (r *Repository) getDownloadedMangaPageContainer(
	provider string,
	mediaId int,
	chapterId string,
) (*PageContainer, error) {

	// Check if the chapter is downloaded
	found := false

	// Check if this is a mapped AniList ID that should use synthetic ID for file lookup
	originalMediaId := mediaId
	if mediaId > 0 && r.db != nil {
		if syntheticID, found := r.db.GetReverseMangaIDMapping(mediaId); found {
			originalMediaId = syntheticID
			r.logger.Debug().
				Int("anilistID", mediaId).
				Int("syntheticID", syntheticID).
				Msg("manga: Using synthetic ID for file lookup via reverse mapping")
		}
	}
	
	// Try multiple possible directory names:
	// 1. Numeric media ID (e.g., "12345" or "-12345")
	// 2. Sanitized title from synthetic manga database
	possibleMediaDirs := []string{fmt.Sprintf("%d", originalMediaId)}

	// For synthetic manga (negative IDs), also try looking up the title
	if originalMediaId < 0 && r.db != nil {
		syntheticManga, dbFound := r.db.GetSyntheticManga(originalMediaId)
		if dbFound && syntheticManga.Title != "" {
			possibleMediaDirs = append([]string{syntheticManga.Title}, possibleMediaDirs...)
		}
	}

	var mediaDirPath string
	var chapterFiles []os.DirEntry
	var err error
	var mediaDir string

	// Try each possible directory
	for _, dir := range possibleMediaDirs {
		mediaDirPath = filepath.Join(r.downloadDir, dir)
		chapterFiles, err = os.ReadDir(mediaDirPath)
		if err == nil {
			mediaDir = dir
			break
		}
	}

	if err != nil {
		// No media directory found
		return nil, ErrChapterNotDownloaded
	}

	r.logger.Debug().
		Str("provider", provider).
		Int("mediaId", mediaId).
		Int("originalMediaId", originalMediaId).
		Str("chapterId", chapterId).
		Str("mediaDir", mediaDir).
		Msg("manga: Looking for downloaded chapter")

	chapterDir := "" // e.g. comick_123_10010_13
	for _, file := range chapterFiles {
		if file.IsDir() {

			downloadId, ok := chapter_downloader.ParseChapterDirName(file.Name())
			if !ok {
				continue
			}

			// When provider is local-manga, accept chapters from any provider
			providerMatches := downloadId.Provider == provider || provider == manga_providers.LocalProvider
			
			if providerMatches &&
				downloadId.MediaId == originalMediaId &&
				downloadId.ChapterId == chapterId {
				found = true
				chapterDir = file.Name()
				r.logger.Debug().
					Str("chapterDir", chapterDir).
					Str("downloadProvider", downloadId.Provider).
					Msg("manga: Found matching chapter directory")
				break
			}
		}
	}

	if !found {
		r.logger.Debug().
			Str("provider", provider).
			Int("originalMediaId", originalMediaId).
			Str("chapterId", chapterId).
			Int("filesChecked", len(chapterFiles)).
			Msg("manga: Chapter not found in any directory")
		return nil, ErrChapterNotDownloaded
	}

	r.logger.Debug().Msg("manga: Found downloaded chapter directory")

	// Open registry file
	registryFile, err := os.Open(filepath.Join(mediaDirPath, chapterDir, "registry.json"))
	if err != nil {
		r.logger.Error().Err(err).Msg("manga: Failed to open registry file")
		return nil, err
	}
	defer registryFile.Close()

	r.logger.Debug().Str("chapterId", chapterId).Msg("manga: Reading registry file")

	// Read registry file
	var pageRegistry *chapter_downloader.Registry
	err = json.NewDecoder(registryFile).Decode(&pageRegistry)
	if err != nil {
		r.logger.Error().Err(err).Msg("manga: Failed to decode registry file")
		return nil, err
	}

	pageList := make([]*hibikemanga.ChapterPage, 0)
	pageDimensions := make(map[int]*PageDimension)

	// Get the downloaded pages
	for pageIndex, pageInfo := range *pageRegistry {
		pageList = append(pageList, &hibikemanga.ChapterPage{
			Index:    pageIndex,
			URL:      filepath.Join(mediaDir, chapterDir, pageInfo.Filename),
			Provider: provider,
		})
		pageDimensions[pageIndex] = &PageDimension{
			Width:  pageInfo.Width,
			Height: pageInfo.Height,
		}
	}

	slices.SortStableFunc(pageList, func(i, j *hibikemanga.ChapterPage) int {
		return cmp.Compare(i.Index, j.Index)
	})

	container := &PageContainer{
		MediaId:        mediaId,
		Provider:       provider,
		ChapterId:      chapterId,
		Pages:          pageList,
		PageDimensions: pageDimensions,
		IsDownloaded:   true,
	}

	r.logger.Debug().Str("chapterId", chapterId).Msg("manga: Found downloaded chapter")

	return container, nil
}
