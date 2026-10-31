package enqueuefuture

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db_bridge"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/library/anime"
	"seanime/internal/torrents/torrent"
)

// prepared is what preparing one item produced: the snapshot to store, and the recommendations that
// anime makes, which are the next ring of the graph for discovery to consume.
type prepared struct {
	snapshot   *Snapshot
	title      string
	coverImage string
	// relations are this anime's own family — sequels, prequels, side stories. Kept apart from
	// recommendations because they are queued differently: same family, same depth, ahead of the
	// merely-similar shows.
	relations       []recommendation
	recommendations []recommendation
	// tetheredOVA marks an OVA that belongs to a parent series. Its recommendations are still
	// worth walking — they were paid for — but it does not stay in the queue itself.
	tetheredOVA bool
}

// recommendation is one edge out of an anime, reduced to what discovery actually decides on.
type recommendation struct {
	mediaID int
	title   string
	// episodes is the total AniList knows about, used to tell "you have all of this already" from
	// "you have the first three".
	episodes int
	// familyID is the group this belongs to once queued — set by the walker, not by AniList.
	familyID int
	// notYetReleased is read from the recommendation itself so an unreleased anime can be rejected
	// without spending a request finding out it has nothing to download.
	notYetReleased bool
	// isFamily marks an edge that continues the same story rather than merely resembling it. Family
	// edges are queued ahead of every recommendation and never cost a franchise slot.
	isFamily bool
	// relationType is how AniList relates this entry to the one it was found from — SEQUEL, PREQUEL,
	// SIDE_STORY, OTHER and the rest. Kept because it is the only place the shape of a franchise is
	// ever known: the queue screen indents a side branch under the entry it hangs off, and a
	// straight run of seasons stays level.
	relationType string
	// parentMediaID is the anime this was discovered from. Empty for a root.
	parentMediaID int
}

// hasFullLibraryCopy reports whether every episode of an anime is already on disk.
//
// Deliberately strict: a partially downloaded series is exactly the kind of thing worth queueing,
// so only a complete copy is a reason to skip. An anime with local files but no known episode count
// counts as complete — there is no number to fall short of, and you evidently have it.
func (r *Repository) hasFullLibraryCopy(rec recommendation) bool {
	// GetLocalFiles is served from an in-memory cache, so calling it per recommendation is cheap.
	localFiles, _, err := db_bridge.GetLocalFiles(r.database)
	if err != nil || len(localFiles) == 0 {
		return false
	}

	owned := make(map[int]struct{})
	for _, lf := range anime.GetLocalFilesFromMediaId(localFiles, rec.mediaID) {
		if lf == nil || !lf.IsMain() {
			continue
		}
		owned[lf.GetEpisodeNumber()] = struct{}{}
	}

	if len(owned) == 0 {
		return false
	}
	if rec.episodes <= 0 {
		return true
	}
	return len(owned) >= rec.episodes
}

// discover fetches only what the graph walk needs: an anime's recommendations.
//
// Used for the anime a run starts from, which is never queued — you are already on its page and it
// has its own download button. Everything a full preparation would add for it is work nobody will
// ever look at, and at the rate this runs, a request not made is worth having.
func (r *Repository) discover(ctx context.Context, mediaID int) (*prepared, error) {
	platform := r.platformRef.Get()
	if platform == nil {
		return nil, errors.New("anilist platform is unavailable")
	}

	if err := r.pacer.wait(ctx); err != nil {
		return nil, err
	}

	details, err := platform.GetAnimeDetails(ctx, mediaID)
	if err != nil {
		return nil, err
	}
	if details == nil {
		return nil, errors.New("no details returned")
	}

	return &prepared{
		relations:       relationsFrom(details),
		recommendations: recommendationsFrom(details),
	}, nil
}

// prepare does the whole per-item job: fetch the details, build the entry, search for torrents.
//
// Every upstream call goes through the rate limiter before it is made, so the "entries per minute"
// figure is honest about the requests it causes rather than counting only the first one.
func (r *Repository) prepare(ctx context.Context, mediaID int) (*prepared, error) {
	platform := r.platformRef.Get()
	if platform == nil {
		return nil, errors.New("anilist platform is unavailable")
	}

	// +---------------------+
	// |       Details       |
	// +---------------------+

	// Paced once for the whole item rather than per call. The three requests below belong to one
	// anime and are made back to back; charging each of them separately made a run take three times
	// as long as the rate it claimed to run at.
	if err := r.pacer.wait(ctx); err != nil {
		return nil, err
	}

	// This is also where the next ring of recommendations comes from, which is why discovery is
	// driven by preparation rather than running ahead of it: one request answers both questions.
	details, err := platform.GetAnimeDetails(ctx, mediaID)
	if err != nil {
		return nil, err
	}
	if details == nil {
		return nil, errors.New("no details returned")
	}

	// +---------------------+
	// |        Entry        |
	// +---------------------+

	localFiles, _, err := db_bridge.GetLocalFiles(r.database)
	if err != nil {
		// An anime not in the library has no local files anyway, and that is the normal case here.
		// Losing the list means losing library data on the entry, not the entry itself.
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to read local files, continuing without them")
		localFiles = nil
	}

	animeCollection, err := r.animeCollectionFunc()
	if err != nil || animeCollection == nil {
		// NewEntry refuses a nil collection outright, and an empty one is correct for what this is:
		// almost everything a recommendation chain finds is not on any of your lists.
		animeCollection = &anilist.AnimeCollection{
			MediaListCollection: &anilist.AnimeCollection_MediaListCollection{
				Lists: []*anilist.AnimeCollection_MediaListCollection_Lists{},
			},
		}
	}

	entry, err := anime.NewEntry(ctx, &anime.NewEntryOptions{
		MediaId:             mediaID,
		LocalFiles:          localFiles,
		AnimeCollection:     animeCollection,
		PlatformRef:         r.platformRef,
		MetadataProviderRef: r.metadataProviderRef,
		IsSimulated:         r.isSimulatedFunc(),
	})
	if err != nil {
		return nil, err
	}
	if entry == nil || entry.Media == nil {
		return nil, errors.New("no entry could be built")
	}

	// +---------------------+
	// |   Torrent search    |
	// +---------------------+

	// Decided before searching, so a tethered OVA does not cost a provider request on its way out.
	if tetheredOVA(details, entry.Media.Format) {
		return &prepared{
			title:           entryTitle(entry),
			coverImage:      entryCoverImage(entry),
			relations:       relationsFrom(details),
			recommendations: recommendationsFrom(details),
			tetheredOVA:     true,
		}, nil
	}

	// SeaDex first, regardless of what the settings page has saved — there the saved provider is
	// the fallback, not the primary. One hit is a successful search: SeaDex is a curated list and
	// often answers with a single best release. Only an empty answer moves the search on to the
	// configured provider, which keeps the titles SeaDex has never heard of queueing something.
	providerID := r.queueProvider()
	if providerID == "" {
		return nil, errors.New("no torrent provider is configured")
	}

	params, err := r.searchParamsFor(entry, providerID)
	if err != nil {
		return nil, err
	}

	// No repository means no search happened, which must not read as a search that found nothing:
	// that answer deletes the row. An error leaves it on the queue to be tried again.
	if r.torrentRepository == nil {
		return nil, errors.New("the torrent repository is unavailable")
	}

	var searchData *torrent.SearchData
	{
		search := func(params SearchParams) (*torrent.SearchData, error) {
			return r.torrentRepository.SearchAnime(ctx, torrent.AnimeSearchOptions{
				Provider:      params.Provider,
				Type:          torrent.AnimeSearchType(params.Type),
				Media:         entry.Media,
				Query:         params.Query,
				Batch:         params.Batch,
				EpisodeNumber: params.EpisodeNumber,
				BestReleases:  params.BestRelease,
				Resolution:    params.Resolution,
			})
		}

		searchData, err = search(params)
		if err != nil {
			return nil, err
		}

		// A provider error fails the item as before — the run retries it. An empty result is not
		// an error, and for SeaDex it is the normal answer for anything outside its list, so the
		// search is repeated against another provider before the item is stored with nothing in it.
		// A fallback that errors is returned too: only a provider that answered can say there is
		// nothing to download, and a bad minute at one must not cost the anime its place.
		if len(searchData.Torrents) == 0 {
			if fallbackID, ok := r.fallbackQueueProvider(providerID); ok {
				fallbackParams, fbErr := r.searchParamsFor(entry, fallbackID)
				if fbErr != nil {
					return nil, fbErr
				}
				fallbackData, fbErr := search(fallbackParams)
				if fbErr != nil {
					return nil, fbErr
				}
				if len(fallbackData.Torrents) > 0 {
					params = fallbackParams
					searchData = fallbackData
				}
			}
		}
	}

	snapshot := &Snapshot{
		Entry:        entry,
		SearchData:   searchData,
		SearchParams: params,
		ProviderID:   params.Provider,
		PreparedAt:   time.Now(),
	}

	return &prepared{
		snapshot:        snapshot,
		title:           entryTitle(entry),
		coverImage:      entryCoverImage(entry),
		relations:       relationsFrom(details),
		recommendations: recommendationsFrom(details),
	}, nil
}

// relationsFrom flattens every relation edge that points at an anime.
//
// This is what makes enqueueing a show also queue its later seasons: recommendations are what other
// people also watched, which is a different question from what continues the story, and a sequel
// frequently does not show up among them at all.
//
// The relation *type* is not filtered. AniList's labelling is loose enough that the debatable ones
// still turn out to be worth watching — CHARACTER is how a lot of crossovers and shared-universe
// entries are filed, OTHER is the bucket for everything AniList cannot name, and ADAPTATION/SOURCE
// point at a different medium only most of the time. What matters is that the thing on the other end
// is an anime, so that is the only test: isAnime below, which demands both an ANIME media type and a
// real anime format, plus the junk filter that drops the PVs and the music videos.
func relationsFrom(details *anilist.AnimeDetailsById_Media) []recommendation {
	if details == nil || details.Relations == nil {
		return nil
	}

	out := make([]recommendation, 0, len(details.Relations.Edges))
	for _, edge := range details.Relations.Edges {
		if edge == nil || edge.RelationType == nil || edge.Node == nil || edge.Node.ID == 0 {
			continue
		}

		node := edge.Node
		// The one thing that is still filtered. Every relation type is walked, so the ADAPTATION and
		// SOURCE edges hanging off a series point straight at its manga — this is what keeps those,
		// and anything else that is not an anime, out of the queue.
		if !isAnime(node.Type, node.Format) {
			continue
		}

		episodes := 0
		if node.Episodes != nil {
			episodes = *node.Episodes
		}
		title := enqueueTitle(node.GetTitle())
		notYetReleased := node.Status != nil && *node.Status == anilist.MediaStatusNotYetReleased

		// A franchise's relations are where the PVs and CMs live: they hang off the series as
		// side stories and specials, so this is the path that was queueing most of them.
		if reason := rejectReason(title, node.Format, episodes, node.Status); reason != "" {
			continue
		}

		out = append(out, recommendation{
			mediaID:        node.ID,
			title:          title,
			episodes:       episodes,
			notYetReleased: notYetReleased,
			isFamily:       true,
			relationType:   string(*edge.RelationType),
		})
	}
	return out
}

// tetheredOVA reports whether an OVA belongs to a parent series rather than standing on its own.
//
// This is why the check cannot happen at discovery: a recommendation node carries the format but not
// the relations, and "is this OVA a thing in itself" is entirely a question about its relations. By
// the time the details have been fetched — the first thing preparation does anyway — the answer is
// free, so nothing extra is spent finding out.
//
// An OVA hanging off a TV series is a bundle of extras that belongs with that series' download, not
// a separate queue entry. One with no parent series is its own work and stays.
func tetheredOVA(details *anilist.AnimeDetailsById_Media, format *anilist.MediaFormat) bool {
	if format == nil || *format != anilist.MediaFormatOva {
		return false
	}
	if details == nil || details.Relations == nil {
		return false
	}

	for _, edge := range details.Relations.Edges {
		if edge == nil || edge.RelationType == nil || edge.Node == nil {
			continue
		}

		// Only relations to a full series tether it. An OVA related to another OVA, or adapted from
		// a manga, is still a standalone piece of animation.
		nodeFormat := edge.Node.GetFormat()
		if nodeFormat == nil {
			continue
		}
		switch *nodeFormat {
		case anilist.MediaFormatTv, anilist.MediaFormatTvShort, anilist.MediaFormatOna:
		default:
			continue
		}

		switch *edge.RelationType {
		case anilist.MediaRelationParent,
			anilist.MediaRelationPrequel,
			anilist.MediaRelationSequel,
			anilist.MediaRelationSideStory,
			anilist.MediaRelationAlternative,
			anilist.MediaRelationSummary,
			anilist.MediaRelationCompilation:
			return true
		}
	}

	return false
}

// searchParamsFor reproduces exactly what the download drawer would have searched with, so a queued
// item shows the same results as opening that anime's page and clicking "Download N episodes".
//
// See seanime-web/src/app/(main)/entry/_containers/torrent-search: the drawer searches for a batch
// by default in this fork, but only when the provider offers the batch filter — for one that does
// not, the switch is hidden and forced off, and the search narrows to the first episode to download
// instead. The prepared results only get shown when they answer the question the drawer is asking,
// so both shapes must match here too. A batch search must not carry an episode number either way:
// providers append it to the query and come back with single episodes only.
func (r *Repository) searchParamsFor(entry *anime.Entry, providerID string) (SearchParams, error) {
	if providerID == "" || providerID == torrent.ProviderNone {
		return SearchParams{}, errors.New("no torrent provider is configured")
	}

	// Smart search is what the drawer prefers, but it falls back to a plain title search when the
	// provider cannot do it or the media is adult — mirror both rules rather than sending a smart
	// search the provider will reject.
	searchType := torrent.AnimeSearchTypeSmart
	// Batch until the provider says otherwise: a provider without the batch filter gets the first
	// episode, exactly as the drawer's hidden switch would have it.
	batch := true
	if r.torrentRepository != nil {
		if ext, found := r.torrentRepository.GetAnimeProviderExtension(providerID); found {
			settings := ext.GetProvider().GetSettings()
			if !settings.CanSmartSearch {
				searchType = torrent.AnimeSearchTypeSimple
			}
			batch = slices.Contains(settings.SmartSearchFilters, hibiketorrent.AnimeProviderSmartSearchFilterBatch)
		}
	}
	if entry.Media.IsAdult != nil && *entry.Media.IsAdult {
		searchType = torrent.AnimeSearchTypeSimple
	}

	// A simple search is nothing but the query, so it needs the title the drawer prefills.
	query := ""
	if searchType == torrent.AnimeSearchTypeSimple {
		query = strings.ToLower(strings.TrimSpace(entry.Media.GetRomajiTitleSafe()))
	}

	absoluteOffset := 0
	// What the drawer searches when the batch switch is off: the first episode still to download.
	episodeNumber := 0
	if entry.EntryDownloadInfo != nil {
		absoluteOffset = entry.EntryDownloadInfo.AbsoluteOffset
		if !batch && len(entry.EntryDownloadInfo.EpisodesToDownload) > 0 {
			episodeNumber = entry.EntryDownloadInfo.EpisodesToDownload[0].EpisodeNumber
		}
	}

	return SearchParams{
		Type:     string(searchType),
		Provider: providerID,
		Query:    query,
		// Zero whenever Batch is true: see the comment above, and torrent.SearchAnime strips it
		// anyway for anything that is not a movie or a single episode.
		EpisodeNumber:  episodeNumber,
		Batch:          batch,
		AbsoluteOffset: absoluteOffset,
		Resolution:     "",
		BestRelease:    false,
	}, nil
}

// preferredQueueProvider is the provider a preparation searches first when it is installed — this
// deployment's primary, which the settings value may not reflect yet.
const preferredQueueProvider = "seadex"

// queueProvider returns the provider a preparation searches first. Two modes, on the user's
// "default provider only" switch:
//
//   - Off (the default): SeaDex when installed, the configured default otherwise. SeaDex is this
//     deployment's primary, and the settings value may not reflect that yet.
//   - On: the configured default, whatever it is — SeaDex if that is what is saved, AnimeTosho if
//     not. The queue searches that provider and nothing else.
func (r *Repository) queueProvider() string {
	if r.useConfiguredProviderFunc != nil && r.useConfiguredProviderFunc() {
		return strings.TrimSpace(r.defaultProviderFunc())
	}
	if r.torrentRepository != nil {
		if _, found := r.torrentRepository.GetAnimeProviderExtension(preferredQueueProvider); found {
			return preferredQueueProvider
		}
	}
	return strings.TrimSpace(r.defaultProviderFunc())
}

// queueFallbackProviders are tried, in order, when the configured default cannot serve as a fallback
// because it is the provider that just came back empty.
var queueFallbackProviders = []string{"animetosho", "nyaa"}

// fallbackQueueProvider returns the provider to retry with when the first search comes back empty.
// The configured default, unless the user asked for it alone — on that switch, one provider means
// one provider.
//
// With SeaDex as the saved default there used to be no fallback at all, so a curated list was the
// only search, and everything outside it was dropped as undownloadable.
func (r *Repository) fallbackQueueProvider(tried string) (string, bool) {
	if r.useConfiguredProviderFunc != nil && r.useConfiguredProviderFunc() {
		return "", false
	}
	configured := strings.TrimSpace(r.defaultProviderFunc())
	if configured != "" && configured != torrent.ProviderNone && configured != tried {
		return configured, true
	}
	if r.torrentRepository != nil {
		for _, id := range queueFallbackProviders {
			if id == tried {
				continue
			}
			if _, found := r.torrentRepository.GetAnimeProviderExtension(id); found {
				return id, true
			}
		}
	}
	return "", false
}

// recommendationsFrom flattens the recommendation edges of a details payload.
func recommendationsFrom(details *anilist.AnimeDetailsById_Media) []recommendation {
	if details == nil || details.Recommendations == nil {
		return nil
	}

	out := make([]recommendation, 0, len(details.Recommendations.Edges))
	for _, edge := range details.Recommendations.Edges {
		if edge == nil || edge.Node == nil || edge.Node.MediaRecommendation == nil {
			continue
		}
		rec := edge.Node.MediaRecommendation
		if rec.ID == 0 {
			continue
		}
		// Anything that is not anime cannot be downloaded as one — the graph does cross over into
		// manga adaptations.
		if !isAnime(rec.Type, rec.Format) {
			continue
		}

		title := enqueueTitle(rec.Title)

		episodes := 0
		if rec.Episodes != nil {
			episodes = *rec.Episodes
		}
		notYetReleased := rec.Status != nil && *rec.Status == anilist.MediaStatusNotYetReleased

		if reason := rejectReason(title, rec.Format, episodes, rec.Status); reason != "" {
			continue
		}

		out = append(out, recommendation{
			mediaID:        rec.ID,
			title:          title,
			episodes:       episodes,
			notYetReleased: notYetReleased,
		})
	}
	return out
}

func entryTitle(entry *anime.Entry) string {
	if entry == nil || entry.Media == nil {
		return ""
	}
	return enqueueTitle(entry.Media.GetTitle())
}

// enqueueTitle is the title the queue stores and shows, from any of AniList's title objects:
// English first, romaji behind it. The user's AniList title preference is deliberately not honoured
// here — it is the library's setting, and a queue is a list of shows to recognise: the romaji title
// of a first season is a name you have to sound out before it matches anything, while its English
// title is usually the one the rest of the app already showed you.
func enqueueTitle(title interface {
	GetEnglish() *string
	GetRomaji() *string
}) string {
	if title == nil {
		return ""
	}
	if english := title.GetEnglish(); english != nil && *english != "" {
		return *english
	}
	if romaji := title.GetRomaji(); romaji != nil && *romaji != "" {
		return *romaji
	}
	return ""
}

func entryCoverImage(entry *anime.Entry) string {
	if entry == nil || entry.Media == nil || entry.Media.CoverImage == nil {
		return ""
	}
	if entry.Media.CoverImage.ExtraLarge != nil && *entry.Media.CoverImage.ExtraLarge != "" {
		return *entry.Media.CoverImage.ExtraLarge
	}
	if entry.Media.CoverImage.Large != nil {
		return *entry.Media.CoverImage.Large
	}
	return ""
}
