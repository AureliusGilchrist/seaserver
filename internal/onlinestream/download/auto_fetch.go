package onlinestream_download

import (
	"context"
	"errors"
	"fmt"
	"seanime/internal/onlinestream"
	"time"
)

// fetchCooldown is how long a series is left alone after it was looked for new episodes.
const fetchCooldown = 20 * time.Minute

// canFetch tells if the series can be looked for new episodes, and remembers that it was.
func (m *Manager) canFetch(mediaId int) bool {
	m.fetchMu.Lock()
	defer m.fetchMu.Unlock()
	if m.lastFetch == nil {
		m.lastFetch = map[int]time.Time{}
	}
	last, ok := m.lastFetch[mediaId]
	if ok && time.Since(last) < fetchCooldown {
		return false
	}
	m.lastFetch[mediaId] = time.Now()
	return true
}

// FetchNewEpisodes queues the episodes a provider has released that are neither in the library nor
// in the queue. It is what the auto downloader calls for the rules that download straight from an
// online streaming provider instead of a torrent.
// It returns how many episodes were queued.
//
// A rule covers a whole series, so the whole series is fetched: the episodes the library is
// missing are queued, whether the series is still airing or already over.
func (m *Manager) FetchNewEpisodes(ctx context.Context, provider string, mediaId int, dubbed bool) (int, error) {
	// The providers are asked for a fresh list of episodes every time, which is a lot of requests
	// for a series checked over and over: a series is looked for once every fetchCooldown.
	if !m.canFetch(mediaId) {
		m.logger.Debug().Int("mediaId", mediaId).Msg("onlinestream download: Skipped the new episodes check, too soon")
		return 0, nil
	}

	media, err := m.opts.Repository.GetMedia(ctx, mediaId)
	if err != nil {
		return 0, err
	}

	providers := []string{provider}
	if provider == "" || provider == "auto" {
		providers = FallbackProviders
	}

	var lastErr error
	for _, p := range providers {
		if p == "" {
			continue
		}
		// The thorough match (every title, synonym and spelling) first: it saves which of the
		// provider's entries the anime is.
		if m.opts.MapProvider != nil {
			if mapErr := m.opts.MapProvider(ctx, p, mediaId); mapErr != nil {
				if ctx.Err() != nil {
					return 0, ctx.Err()
				}
				if errors.Is(mapErr, ErrNotOnProvider) {
					// The provider does not have the series: the next one gets its turn.
					lastErr = mapErr
					continue
				}
				// The provider could not be asked (it refused, the network failed): the listing
				// below still tries, and the downloads retry on their own.
				m.logger.Debug().Err(mapErr).Str("provider", p).Int("mediaId", mediaId).
					Msg("onlinestream download: Could not match the anime with the provider")
			}
		}

		// The list is fetched fresh: the cached one lives for a day and would never show a new
		// episode.
		episodes, err := m.opts.Repository.GetMediaEpisodesFresh(p, media, dubbed)
		if err != nil {
			if ctx.Err() != nil {
				return 0, ctx.Err()
			}
			lastErr = err
			continue
		}
		if len(episodes) == 0 {
			lastErr = fmt.Errorf("%s lists no episodes for this anime", ProviderLabel(p))
			continue
		}

		return m.queueNewEpisodes(ctx, mediaId, p, episodes, dubbed), nil
	}

	if lastErr == nil {
		lastErr = errors.New("no provider has this series")
	}
	return 0, lastErr
}

// queueNewEpisodes queues the episodes the provider lists that the library does not have yet and
// that are not in the queue already.
// It returns how many were queued.
//
// Every released episode is a candidate, not only the ones after the ones the library already has:
// a rule covers a whole series, so the series is downloaded whole. A series that is still airing
// simply has no provider episode for what has not aired yet, and those come later.
func (m *Manager) queueNewEpisodes(ctx context.Context, mediaId int, provider string, episodes []*onlinestream.Episode, dubbed bool) int {
	inLibrary := m.libraryEpisodes(mediaId, episodes)

	m.mu.Lock()
	queued := make(map[int]bool)
	for _, it := range m.items {
		if it.MediaId != mediaId {
			continue
		}
		// A waiting episode is being downloaded already.
		if !it.finished() {
			queued[it.EpisodeNumber] = true
		}
	}
	m.mu.Unlock()

	reqs := make([]Request, 0, len(episodes))
	titles := make(map[int]string, len(episodes))
	for _, ep := range episodes {
		if ep == nil || ep.Number <= 0 || queued[ep.Number] || inLibrary[ep.Number] {
			continue
		}
		reqs = append(reqs, Request{
			MediaId:       mediaId,
			EpisodeNumber: ep.Number,
			Provider:      provider,
			Dubbed:        dubbed,
			Queue:         QueuePersonal,
		})
		titles[ep.Number] = ep.Title
	}
	if len(reqs) == 0 {
		return 0
	}

	items, err := m.enqueueMany(ctx, reqs, titles)
	if err != nil {
		m.logger.Error().Err(err).Int("mediaId", mediaId).Str("provider", provider).
			Msg("onlinestream download: Could not queue the new episodes")
		return 0
	}
	m.logger.Info().Int("mediaId", mediaId).Str("provider", provider).Int("episodes", len(items)).
		Msg("onlinestream download: Queued the new episodes of the series")
	return len(items)
}

// libraryEpisodes lists the episodes the library has for an anime, by episode number.
func (m *Manager) libraryEpisodes(mediaId int, episodes []*onlinestream.Episode) map[int]bool {
	out := make(map[int]bool)
	if m.opts.LibraryEpisodes != nil {
		return m.opts.LibraryEpisodes(mediaId)
	}
	// Without the bulk listing, the episodes are asked for one by one.
	if m.opts.EpisodeFiles == nil {
		return out
	}
	for _, ep := range episodes {
		if ep == nil {
			continue
		}
		if len(m.opts.EpisodeFiles(mediaId, ep.Number)) > 0 {
			out[ep.Number] = true
		}
	}
	return out
}
