package anime

import (
	"context"
	"seanime/internal/api/anilist"
	"seanime/internal/util/limiter"
	"seanime/internal/util/result"
)

type NormalizedMedia struct {
	*anilist.BaseAnime
}

type NormalizedMediaCache struct {
	*result.Cache[int, *NormalizedMedia]
}

func NewNormalizedMedia(m *anilist.BaseAnime) *NormalizedMedia {
	return &NormalizedMedia{
		BaseAnime: m,
	}
}

func NewNormalizedMediaCache() *NormalizedMediaCache {
	return &NormalizedMediaCache{result.NewCache[int, *NormalizedMedia]()}
}

// FetchNormalizedMedia ensures the complete anime data for the given media is fetched and cached.
func FetchNormalizedMedia(anilistClient anilist.AnilistClient, rl *limiter.Limiter, cache *anilist.CompleteAnimeCache, media *NormalizedMedia) error {
	if media == nil || media.BaseAnime == nil || anilistClient == nil {
		return nil
	}

	if _, ok := cache.Get(media.ID); ok {
		return nil
	}

	rl.Wait()
	res, err := anilistClient.CompleteAnimeByID(context.Background(), &media.ID)
	if err != nil {
		return err
	}
	cache.Set(media.ID, res.GetMedia())
	return nil
}
