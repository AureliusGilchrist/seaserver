package autodownloader

import (
	"context"
	"slices"
	"strconv"
	"strings"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db_bridge"
	"seanime/internal/library/anime"
	"seanime/internal/util"
)

// checkSeriesCompletion takes the series a rule manages out of the user's "currently watching"
// list once the series is over and the library holds every one of its episodes.
//
// Both have to be true, and this is the point: a series that has finished airing but is still
// missing episodes is still something to watch for — the auto downloader is still fetching it, and
// the user is still following it. It leaves the watching list only when there is nothing left to
// air and nothing left to download, which is when the series is genuinely over for them.
//
// The entries that are paused, planned or already completed are left alone: only an entry that is
// being watched is the one being taken off the watching list.
func (ad *AutoDownloader) checkSeriesCompletion(ctx context.Context, ruleIDs ...uint) {
	defer util.HandlePanicInModuleThen("autodownloader/checkSeriesCompletion", func() {})

	if ad == nil {
		return
	}

	ad.mu.Lock()
	updater := ad.listStatusUpdater
	ad.mu.Unlock()
	if updater == nil {
		return
	}

	ac, ok := ad.animeCollection.Get()
	if !ok || ac == nil {
		return
	}

	rules, err := db_bridge.GetAutoDownloaderRules(ad.database)
	if err != nil {
		ad.logger.Error().Err(err).Msg("autodownloader: Could not fetch the rules while checking for finished series")
		return
	}

	// The library, by media id: which episodes of each series are here. Read once for the whole
	// pass rather than once per rule.
	library := ad.libraryEpisodes()

	for _, rule := range rules {
		if rule == nil || !rule.Enabled || rule.MediaId == 0 {
			continue
		}
		if len(ruleIDs) > 0 && !slices.Contains(ruleIDs, rule.DbID) {
			continue
		}
		if !ad.isSeriesComplete(ac, rule.MediaId, library[rule.MediaId]) {
			continue
		}

		changed, err := updater.CompleteWatching(ctx, rule.MediaId)
		if err != nil {
			ad.logger.Error().Err(err).Int("mediaId", rule.MediaId).
				Msg("autodownloader: Could not take the finished series out of the watching list")
			continue
		}
		if changed {
			ad.logger.Info().Int("mediaId", rule.MediaId).
				Msg("autodownloader: Series finished and fully downloaded, taken out of the watching list")
		}
	}
}

// isSeriesComplete tells if the series has finished airing and every one of its episodes is in the
// library.
func (ad *AutoDownloader) isSeriesComplete(ac *anilist.AnimeCollection, mediaId int, episodes map[int]bool) bool {
	if ac == nil {
		return false
	}
	media, found := ac.FindAnime(mediaId)
	if !found || media == nil || media.Status == nil {
		return false
	}
	// Everything has to have aired. A series that is still releasing, or that has not started, has
	// episodes the library cannot have yet.
	if *media.Status != anilist.MediaStatusFinished {
		return false
	}
	// How many episodes there are. Without a count there is no way to tell a complete series from
	// one that is missing half of them, so nothing is done.
	total := media.GetCurrentEpisodeCount()
	if total <= 0 {
		return false
	}
	return hasEveryEpisode(episodes, total)
}

// hasEveryEpisode tells if the library holds each of the episodes 1 to total.
func hasEveryEpisode(episodes map[int]bool, total int) bool {
	for ep := 1; ep <= total; ep++ {
		if !episodes[ep] {
			return false
		}
	}
	return true
}

// libraryEpisodes lists the library's episodes for every series it holds, by media id.
func (ad *AutoDownloader) libraryEpisodes() map[int]map[int]bool {
	out := make(map[int]map[int]bool)

	lfs, _, err := db_bridge.GetLocalFiles(ad.database)
	if err != nil {
		ad.logger.Error().Err(err).Msg("autodownloader: Could not read the library while checking for finished series")
		return out
	}

	for _, lf := range lfs {
		if lf == nil || lf.MediaId <= 0 {
			continue
		}
		ep := libraryEpisodeNumber(lf)
		if ep <= 0 {
			continue
		}
		if out[lf.MediaId] == nil {
			out[lf.MediaId] = make(map[int]bool)
		}
		out[lf.MediaId][ep] = true
	}

	return out
}

// libraryEpisodeNumber is the episode a library file is, or 0 when it is not a main episode of one.
//
// A file that was matched to an anime but never had its episode details filled in is read from its
// file name, the same way the download queue reads it. Counting such a file as missing would keep a
// series that is entirely downloaded out of the completed list for good.
func libraryEpisodeNumber(lf *anime.LocalFile) int {
	if lf == nil {
		return 0
	}
	if lf.Metadata != nil && lf.Metadata.Type == anime.LocalFileTypeMain && lf.Metadata.Episode > 0 {
		return lf.Metadata.Episode
	}
	// No details: the file name is the only thing that says which episode it is, and only when it
	// names exactly one.
	if lf.Metadata == nil || (lf.Metadata.Type == "" && lf.Metadata.Episode <= 0) {
		if lf.ParsedData == nil {
			return 0
		}
		n, err := strconv.Atoi(strings.TrimSpace(lf.ParsedData.Episode))
		if err != nil || n <= 0 {
			return 0
		}
		return n
	}
	return 0
}
