package handlers

import (
	"context"
	"errors"
	"fmt"
	"seanime/internal/connectivity"
	"seanime/internal/core"
	"seanime/internal/enmasse"
	"seanime/internal/enqueuefuture"
	"seanime/internal/extension"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	onlinestream_download "seanime/internal/onlinestream/download"
	"seanime/internal/util/filecache"
	"strconv"
	"sync"
	"time"
)

// onlineProvider returns an online stream provider extension by id.
func (h *Handler) onlineProvider(id string) (hibikeonlinestream.Provider, error) {
	ext, ok := extension.GetExtension[extension.OnlinestreamProviderExtension](h.App.ExtensionBankRef.Get(), id)
	if !ok {
		return nil, fmt.Errorf("the %s extension is not installed", id)
	}
	return ext.GetProvider(), nil
}

// providerSearchHooks are the provider calls the en masse matcher needs.
func (h *Handler) providerSearchHooks() *enmasse.OnlineHooks {
	return &enmasse.OnlineHooks{
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			p, err := h.onlineProvider(provider)
			if err != nil {
				return nil, err
			}
			return p.Search(opts)
		},
		FindEpisodes: func(provider string, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			p, err := h.onlineProvider(provider)
			if err != nil {
				return nil, err
			}
			return p.FindEpisodes(id)
		},
	}
}

// saveProviderMapping records which provider entry an anime is, replacing an earlier one, and
// drops an episode list cached from an earlier automatic search.
func (h *Handler) saveProviderMapping(provider string, mediaId int, providerId string) error {
	_ = h.App.Database.DeleteOnlinestreamMapping(provider, mediaId)
	if err := h.App.Database.InsertOnlinestreamMapping(provider, mediaId, providerId); err != nil {
		return err
	}
	if h.App.FileCacher != nil {
		bucket := filecache.NewBucket("onlinestream_"+provider+"_episode-list_"+strconv.Itoa(mediaId), time.Hour)
		for _, dubbed := range []bool{false, true} {
			_ = h.App.FileCacher.Delete(bucket, fmt.Sprintf("%d$%s$%v", mediaId, provider, dubbed))
		}
	}
	return nil
}

// mapOnlineProvider makes sure a provider knows which of its entries an anime is, for a download
// falling back to it. A saved match is used as it is; otherwise the anime is searched the
// thorough en masse way (every title, synonym and spelling, checked against the title and the
// episode count) and the match saved.
func (h *Handler) mapOnlineProvider(ctx context.Context, provider string, mediaId int) error {
	if _, found := h.App.Database.GetOnlinestreamMapping(provider, mediaId); found {
		return nil
	}
	media, err := h.App.OnlinestreamRepository.GetMedia(ctx, mediaId)
	if err != nil {
		return err
	}
	id, title, err := enmasse.MatchOnProvider(ctx, h.App.Logger, h.providerSearchHooks(), provider, media)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		// A provider refusing the server, or the network failing, says nothing about whether it
		// has the series: only a search that ran and found nothing counts as "not on the provider".
		if errors.Is(err, enmasse.ErrProviderBlocked) || connectivity.IsNetworkError(err) {
			return err
		}
		return fmt.Errorf("%w: %v", onlinestream_download.ErrNotOnProvider, err)
	}
	h.App.Logger.Info().Int("mediaId", mediaId).Str("provider", provider).Str("match", title).
		Msg("onlinestream download: Matched the series on the fallback provider")
	return h.saveProviderMapping(provider, mediaId, id)
}

// wireEnMasseOnline connects the anime en masse downloader to the online stream downloader: it
// searches a streaming provider for series the library does not have and queues them whole,
// and the online downloader saves and matches every episode.
func (h *Handler) wireEnMasseOnline(app *core.App) {
	if app.EnMasseDownloader == nil || app.OnlinestreamDownloader == nil {
		return
	}
	m := app.OnlinestreamDownloader

	search := h.providerSearchHooks()

	takeovers := newTorrentTakeovers(app, h)
	defer h.resumeEnMasseAfterRestart(app)

	app.EnMasseDownloader.SetOnlineHooks(&enmasse.OnlineHooks{
		TorrentSeries:    takeovers.TorrentSeries,
		TakeOverTorrents: takeovers.TakeOver,
		HasTorrent:       takeovers.HasTorrent,
		TorrentStalled:   takeovers.TorrentStalled,
		InLibrary: func(mediaId int) bool {
			return len(h.libraryEpisodeFiles(mediaId)) > 0
		},
		InDownloadQueue: m.HasActive,
		TorrentFallback: func(ctx context.Context, mediaId int, progress func(string)) (string, string, error) {
			if app.EnqueueFutureRepository == nil {
				return "", "", errors.New("the torrent fallback is not available")
			}
			pick, err := app.EnqueueFutureRepository.TorrentOne(enqueuefuture.WithProgress(ctx, progress), mediaId)
			if err != nil {
				return "", "", err
			}
			if pick.Torrent == nil {
				return "", pick.Reason, nil
			}
			torrentSources.Store(mediaId, pick.Source)
			return pick.Torrent.Name, "", nil
		},
		TorrentSource: func(mediaId int) string {
			if v, ok := torrentSources.LoadAndDelete(mediaId); ok {
				return v.(string)
			}
			return ""
		},
		WaitingEpisodes: m.WaitingEnMasseEpisodes,
		WaitingSeries:   m.WaitingEnMasseSeries,
		Search:          search.Search,
		FindEpisodes:    search.FindEpisodes,
		SaveMapping:     h.saveProviderMapping,
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			have := h.libraryEpisodeFiles(mediaId)
			res, err := m.EnqueueSeries(ctx, onlinestream_download.Request{
				MediaId:  mediaId,
				Provider: provider,
				Queue:    onlinestream_download.QueueEnMasse,
			}, func(ep int) bool { return len(have[ep]) > 0 }, nil)
			if err != nil {
				return 0, err
			}
			return len(res.Queued), nil
		},
	})
}

// resumeEnMasseAfterRestart picks the anime en masse run back up when the server stopped in the
// middle of it. It waits for the provider extension to load first, so the run does not start
// with searches that cannot work and file every series as not found.
func (h *Handler) resumeEnMasseAfterRestart(app *core.App) {
	if !app.EnMasseDownloader.WasInterrupted() {
		return
	}
	go func() {
		deadline := time.Now().Add(10 * time.Minute)
		for time.Now().Before(deadline) {
			if _, err := h.onlineProvider(enmasse.OnlineProvider); err == nil {
				break
			}
			time.Sleep(5 * time.Second)
		}
		time.Sleep(10 * time.Second) // let the rest of startup settle
		if err := app.EnMasseDownloader.ResumeIfInterrupted(); err != nil {
			app.Logger.Error().Err(err).Msg("enmasse-anime: Could not resume after the restart")
		}
	}()
}

// torrentSources remembers, per anime, where the en masse torrent fallback's last pick came from.
var torrentSources sync.Map
