package handlers

import (
	"context"
	"fmt"
	"seanime/internal/core"
	"seanime/internal/enmasse"
	"seanime/internal/extension"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	onlinestream_download "seanime/internal/onlinestream/download"
	"seanime/internal/util/filecache"
	"strconv"
	"time"
)

// wireEnMasseOnline connects the anime en masse downloader to the online stream downloader: it
// searches a streaming provider for series the library does not have and queues them whole,
// and the online downloader saves and matches every episode.
func (h *Handler) wireEnMasseOnline(app *core.App) {
	if app.EnMasseDownloader == nil || app.OnlinestreamDownloader == nil {
		return
	}
	m := app.OnlinestreamDownloader

	providerFor := func(id string) (hibikeonlinestream.Provider, error) {
		ext, ok := extension.GetExtension[extension.OnlinestreamProviderExtension](app.ExtensionBankRef.Get(), id)
		if !ok {
			return nil, fmt.Errorf("the %s extension is not installed", id)
		}
		return ext.GetProvider(), nil
	}

	takeovers := newTorrentTakeovers(app, h)

	app.EnMasseDownloader.SetOnlineHooks(&enmasse.OnlineHooks{
		TorrentSeries:    takeovers.TorrentSeries,
		TakeOverTorrents: takeovers.TakeOver,
		HasTorrent:       takeovers.HasTorrent,
		TorrentStalled:   takeovers.TorrentStalled,
		InLibrary: func(mediaId int) bool {
			return len(h.libraryEpisodeFiles(mediaId)) > 0
		},
		InDownloadQueue: m.HasActive,
		WaitingEpisodes: m.WaitingCount,
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			p, err := providerFor(provider)
			if err != nil {
				return nil, err
			}
			return p.Search(opts)
		},
		FindEpisodes: func(provider string, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			p, err := providerFor(provider)
			if err != nil {
				return nil, err
			}
			return p.FindEpisodes(id)
		},
		SaveMapping: func(provider string, mediaId int, providerId string) error {
			// One mapping per anime and provider: replace any earlier one.
			_ = app.Database.DeleteOnlinestreamMapping(provider, mediaId)
			if err := app.Database.InsertOnlinestreamMapping(provider, mediaId, providerId); err != nil {
				return err
			}
			// Drop an episode list cached from an earlier automatic search, which may be a
			// different entry than the one just checked.
			if app.FileCacher != nil {
				bucket := filecache.NewBucket("onlinestream_"+provider+"_episode-list_"+strconv.Itoa(mediaId), time.Hour)
				for _, dubbed := range []bool{false, true} {
					_ = app.FileCacher.Delete(bucket, fmt.Sprintf("%d$%s$%v", mediaId, provider, dubbed))
				}
			}
			return nil
		},
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			have := h.libraryEpisodeFiles(mediaId)
			res, err := m.EnqueueSeries(ctx, onlinestream_download.Request{
				MediaId:  mediaId,
				Provider: provider,
			}, func(ep int) bool { return len(have[ep]) > 0 }, nil)
			if err != nil {
				return 0, err
			}
			return len(res.Queued), nil
		},
	})
}
