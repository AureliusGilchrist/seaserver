package core

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/api/metadata"
	"seanime/internal/connectivity"
	"seanime/internal/database/db_bridge"
	proxies "seanime/internal/util/proxies"
)

const (
	artworkCacheInterval = 6 * time.Hour
	artworkCacheDelay    = 2 * time.Minute
	artworkCacheWorkers  = 6
)

var artworkCacheRunning atomic.Bool

// StartArtworkCache keeps artwork and metadata for everything on disk stored locally, so the library
// looks and opens the same with no internet.
func (a *App) StartArtworkCache(ctx context.Context) {
	go func() {
		timer := time.NewTimer(artworkCacheDelay)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				a.CacheLibraryArtwork(ctx)
				timer.Reset(artworkCacheInterval)
			}
		}
	}()
}

// CacheLibraryArtwork pins what the library needs. Anything already pinned costs one file check, so
// it's safe to run often, and a run stopped by losing the connection carries on from where it was.
func (a *App) CacheLibraryArtwork(ctx context.Context) {
	if a.ImageCache == nil || !artworkCacheRunning.CompareAndSwap(false, true) {
		return
	}
	defer artworkCacheRunning.Store(false)

	animeIDs := a.mediaIDsOnDisk()
	urls := map[string]struct{}{}
	add := func(rawURL string) {
		if rawURL != "" && proxies.IsCacheableImageURL(rawURL) && !a.ImageCache.IsPinned(rawURL) {
			urls[rawURL] = struct{}{}
		}
	}

	for _, media := range a.knownAnime(ctx) {
		if _, onDisk := animeIDs[media.GetID()]; onDisk {
			add(media.GetCoverImageSafe())
			add(media.GetBannerImageSafe())
		}
	}
	for _, rawURL := range a.knownMangaArtwork() {
		add(rawURL)
	}

	// Reading this also saves it to disk, which is what entry pages need offline.
	if provider := a.MetadataProviderRef; provider != nil && provider.IsPresent() {
		for id := range animeIDs {
			if ctx.Err() != nil || !connectivity.IsAniListAllowed() {
				break
			}
			animeMetadata, err := provider.Get().GetAnimeMetadata(metadata.AnilistPlatform, id)
			if err != nil || animeMetadata == nil {
				continue
			}
			for _, episode := range animeMetadata.Episodes {
				if episode != nil {
					add(episode.Image)
				}
			}
		}
	}

	if len(urls) == 0 {
		return
	}
	a.Logger.Info().Int("images", len(urls)).Msg("artwork cache: Saving library artwork")

	queue := make(chan string)
	var pinned atomic.Int64
	var workers sync.WaitGroup
	for range artworkCacheWorkers {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for rawURL := range queue {
				if a.ImageCache.Pin(rawURL) == nil {
					pinned.Add(1)
				}
			}
		}()
	}
	for rawURL := range urls {
		if ctx.Err() != nil || connectivity.IsOffline() {
			break
		}
		queue <- rawURL
	}
	close(queue)
	workers.Wait()

	a.Logger.Info().Int64("saved", pinned.Load()).Int("found", len(urls)).Msg("artwork cache: Finished")
}

func (a *App) mediaIDsOnDisk() map[int]struct{} {
	ids := map[int]struct{}{}
	files, _, err := db_bridge.GetLocalFiles(a.Database)
	if err != nil {
		return ids
	}
	for _, file := range files {
		if file != nil && file.MediaId != 0 {
			ids[file.MediaId] = struct{}{}
		}
	}
	return ids
}

// knownAnime is every anime any collection knows about: the server's, its shared planning account's,
// and each profile's, because files can be matched to something on only one of them.
func (a *App) knownAnime(ctx context.Context) []*anilist.BaseAnime {
	var all []*anilist.BaseAnime
	addCollection := func(collection *anilist.AnimeCollection) {
		if collection != nil {
			all = append(all, collection.GetAllAnime()...)
		}
	}

	if collection, err := a.GetAnimeCollection(false); err == nil {
		addCollection(collection)
	}
	if collection, err := a.GetPlanningSlutAnimeCollection(ctx, false); err == nil {
		addCollection(collection)
	}
	if a.ProfileManager != nil && a.AnilistClientManager != nil {
		if profiles, err := a.ProfileManager.GetAllProfiles(); err == nil {
			for _, profile := range profiles {
				if collection, err := a.AnilistClientManager.GetAnimeCollection(profile.ID); err == nil {
					addCollection(collection)
				}
			}
		}
	}
	return all
}

func (a *App) knownMangaArtwork() []string {
	var urls []string
	if downloaded, err := a.Database.GetAllDownloadedMangaMetadata(); err == nil {
		for _, manga := range downloaded {
			urls = append(urls, manga.CoverImage)
		}
	}
	addCollection := func(collection *anilist.MangaCollection) {
		if collection == nil || collection.MediaListCollection == nil {
			return
		}
		for _, list := range collection.MediaListCollection.Lists {
			if list == nil {
				continue
			}
			for _, entry := range list.Entries {
				if entry != nil && entry.Media != nil {
					urls = append(urls, entry.Media.GetCoverImageSafe(), entry.Media.GetBannerImageSafe())
				}
			}
		}
	}
	if a.ProfileManager != nil && a.AnilistClientManager != nil {
		if profiles, err := a.ProfileManager.GetAllProfiles(); err == nil {
			for _, profile := range profiles {
				if collection, err := a.AnilistClientManager.GetMangaCollection(profile.ID); err == nil {
					addCollection(collection)
				}
			}
		}
	}
	return urls
}
