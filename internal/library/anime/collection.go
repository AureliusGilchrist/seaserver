package anime

import (
	"cmp"
	"context"
	"path/filepath"
	"seanime/internal/api/anilist"
	"seanime/internal/api/metadata_provider"
	"seanime/internal/hook"
	"seanime/internal/platforms/platform"
	"seanime/internal/util"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/samber/lo"
	lop "github.com/samber/lo/parallel"
	"github.com/sourcegraph/conc/pool"
)

const MediaListStatusLocal anilist.MediaListStatus = "LOCAL"

// localEntryMedia is the last good description of an anime that exists only as local files.
//
// The platform caches successful lookups, but nothing remembers them across a failure: a rate-limited
// or cancelled fetch returned an error, the collection fell back to a bare ID, and the card went blank
// — art, title and all — while the files sat there perfectly fine. That is a display of the fetch,
// not of the library. So the last answer is kept and reused whenever a later fetch cannot better it.
//
// Held for the life of the process. It is at most a few hundred small structs, and it describes
// something that does not change.
var localEntryMedia = struct {
	sync.Mutex
	byID map[int]*anilist.BaseAnime
}{byID: make(map[int]*anilist.BaseAnime)}

func rememberLocalEntryMedia(mediaID int, media *anilist.BaseAnime) {
	if mediaID <= 0 || media == nil {
		return
	}
	localEntryMedia.Lock()
	defer localEntryMedia.Unlock()
	localEntryMedia.byID[mediaID] = media
}

func recallLocalEntryMedia(mediaID int) *anilist.BaseAnime {
	localEntryMedia.Lock()
	defer localEntryMedia.Unlock()
	return localEntryMedia.byID[mediaID]
}

// folderTitleForLocalFiles names an anime after the directory holding its files, for when nothing
// else is known about it.
func folderTitleForLocalFiles(lfs []*LocalFile) string {
	for _, lf := range lfs {
		if lf == nil || lf.Path == "" {
			continue
		}
		if dir := filepath.Base(filepath.Dir(lf.GetPath())); dir != "" && dir != "." && dir != string(filepath.Separator) {
			return dir
		}
	}
	return ""
}

type (
	// LibraryCollection holds the main data for the library collection.
	// It consists of:
	//  - ContinueWatchingList: a list of Episode for the "continue watching" feature.
	//  - Lists: a list of LibraryCollectionList (one for each status).
	//  - UnmatchedLocalFiles: a list of unmatched local files (Media id == 0). "Resolve unmatched" feature.
	//  - UnmatchedGroups: a list of UnmatchedGroup instances. Like UnmatchedLocalFiles, but grouped by directory. "Resolve unmatched" feature.
	//  - IgnoredLocalFiles: a list of ignored local files. (DEVNOTE: Unused for now)
	//  - UnknownGroups: a list of UnknownGroup instances. Group of files whose media is not in the user's AniList "Resolve unknown media" feature.
	LibraryCollection struct {
		ContinueWatchingList []*Episode               `json:"continueWatchingList"`
		Lists                []*LibraryCollectionList `json:"lists"`
		UnmatchedLocalFiles  []*LocalFile             `json:"unmatchedLocalFiles"`
		UnmatchedGroups      []*UnmatchedGroup        `json:"unmatchedGroups"`
		IgnoredLocalFiles    []*LocalFile             `json:"ignoredLocalFiles"`
		UnknownGroups        []*UnknownGroup          `json:"unknownGroups"`
		Stats                *LibraryCollectionStats  `json:"stats"`
		Stream               *StreamCollection        `json:"stream,omitempty"` // Hydrated by the route handler
	}

	StreamCollection struct {
		ContinueWatchingList []*Episode             `json:"continueWatchingList"`
		Anime                []*anilist.BaseAnime   `json:"anime"`
		ListData             map[int]*EntryListData `json:"listData"`
	}

	LibraryCollectionListType string

	// LibraryCollectionStats is the readout above the library.
	//
	// Two populations, and the distinction matters: TotalFiles and TotalSize describe what is on disk,
	// while TotalEntries and the format breakdown describe what the library can actually show you.
	// Everything counted as an entry is something you can click on below; anything on disk that never
	// became one is counted as unresolved instead of quietly inflating the totals.
	LibraryCollectionStats struct {
		// TotalEntries and the three format counts only ever include entries with local files, so they
		// match the grid underneath. Planning entries you do not have are not part of your library.
		TotalEntries  int    `json:"totalEntries"`
		TotalFiles    int    `json:"totalFiles"`
		TotalShows    int    `json:"totalShows"`
		TotalMovies   int    `json:"totalMovies"`
		TotalSpecials int    `json:"totalSpecials"`
		TotalSize     string `json:"totalSize"`
		// UnresolvedItems is what the scanner found and the library cannot show: anime matched to a
		// media that is not in your AniList collection, plus folders that matched nothing at all. Each
		// one is roughly one show's worth of files sitting invisible, which is the thing worth knowing
		// when the grid looks emptier than the drive does.
		UnresolvedItems int `json:"unresolvedItems"`
		// UnresolvedFiles is how many files those items account for.
		UnresolvedFiles int `json:"unresolvedFiles"`
	}

	LibraryCollectionList struct {
		Type    anilist.MediaListStatus   `json:"type"`
		Status  anilist.MediaListStatus   `json:"status"`
		Entries []*LibraryCollectionEntry `json:"entries"`
	}

	// LibraryCollectionEntry holds the data for a single entry in a LibraryCollectionList.
	// It is a slimmed down version of Entry. It holds the media, media id, library data, and list data.
	LibraryCollectionEntry struct {
		Media                  *anilist.BaseAnime      `json:"media"`
		MediaId                int                     `json:"mediaId"`
		EntryLibraryData       *EntryLibraryData       `json:"libraryData"`                 // Library data
		NakamaEntryLibraryData *NakamaEntryLibraryData `json:"nakamaLibraryData,omitempty"` // Library data from Nakama
		EntryListData          *EntryListData          `json:"listData"`                    // AniList list data
	}

	// UnmatchedGroup holds the data for a group of unmatched local files.
	UnmatchedGroup struct {
		Dir         string               `json:"dir"`
		LocalFiles  []*LocalFile         `json:"localFiles"`
		Suggestions []*anilist.BaseAnime `json:"suggestions"`
	}
	// UnknownGroup holds the data for a group of local files whose media is not in the user's AniList.
	// The client will use this data to suggest media to the user, so they can add it to their AniList.
	UnknownGroup struct {
		MediaId    int          `json:"mediaId"`
		LocalFiles []*LocalFile `json:"localFiles"`
	}
)

type (
	// NewLibraryCollectionOptions is a struct that holds the data needed for creating a new LibraryCollection.
	NewLibraryCollectionOptions struct {
		AnimeCollection     *anilist.AnimeCollection
		LocalFiles          []*LocalFile
		PlatformRef         *util.Ref[platform.Platform]
		MetadataProviderRef *util.Ref[metadata_provider.Provider]
	}
)

// NewLightLibraryCollection creates a LibraryCollection from AniList data only,
// without local file matching, continue watching, or unmatched groups.
// This is the fast path for initial page rendering.
func NewLightLibraryCollection(animeCollection *anilist.AnimeCollection) *LibraryCollection {
	lc := &LibraryCollection{
		ContinueWatchingList: make([]*Episode, 0),
		UnmatchedLocalFiles:  make([]*LocalFile, 0),
		UnmatchedGroups:      make([]*UnmatchedGroup, 0),
		IgnoredLocalFiles:    make([]*LocalFile, 0),
		UnknownGroups:        make([]*UnknownGroup, 0),
		Stats:                &LibraryCollectionStats{},
	}

	if animeCollection == nil {
		lc.Lists = make([]*LibraryCollectionList, 0)
		return lc
	}

	aniLists := animeCollection.GetMediaListCollection().GetLists()

	for _, list := range aniLists {
		if list.Status == nil {
			continue
		}

		entries := list.GetEntries()
		collectionEntries := make([]*LibraryCollectionEntry, 0, len(entries))
		for _, entry := range entries {
			collectionEntries = append(collectionEntries, &LibraryCollectionEntry{
				MediaId:          entry.Media.ID,
				Media:            entry.Media,
				EntryLibraryData: nil,
				EntryListData: &EntryListData{
					Progress:    entry.GetProgressSafe(),
					Score:       entry.GetScoreSafe(),
					Status:      entry.Status,
					Repeat:      entry.GetRepeatSafe(),
					StartedAt:   anilist.ToEntryStartDate(entry.StartedAt),
					CompletedAt: anilist.ToEntryCompletionDate(entry.CompletedAt),
				},
			})
		}
		sort.Slice(collectionEntries, func(i, j int) bool {
			return collectionEntries[i].Media.GetTitleSafe() < collectionEntries[j].Media.GetTitleSafe()
		})

		lc.Lists = append(lc.Lists, &LibraryCollectionList{
			Type:    getLibraryCollectionEntryFromListStatus(*list.Status),
			Status:  *list.Status,
			Entries: collectionEntries,
		})
	}

	// Merge repeating into current
	repeatingList, ok := lo.Find(lc.Lists, func(item *LibraryCollectionList) bool {
		return item.Status == anilist.MediaListStatusRepeating
	})
	if ok {
		currentList, ok := lo.Find(lc.Lists, func(item *LibraryCollectionList) bool {
			return item.Status == anilist.MediaListStatusCurrent
		})
		if len(repeatingList.Entries) > 0 && ok {
			currentList.Entries = append(currentList.Entries, repeatingList.Entries...)
		} else if len(repeatingList.Entries) > 0 {
			newCurrentList := repeatingList
			newCurrentList.Type = anilist.MediaListStatusCurrent
			lc.Lists = append(lc.Lists, newCurrentList)
		}
		lc.Lists = lo.Filter(lc.Lists, func(item *LibraryCollectionList, _ int) bool {
			return item.Status != anilist.MediaListStatusRepeating
		})
	}

	if lc.Lists == nil {
		lc.Lists = make([]*LibraryCollectionList, 0)
	}

	return lc
}

// NewLibraryCollection creates a new LibraryCollection.
func NewLibraryCollection(ctx context.Context, opts *NewLibraryCollectionOptions) (lc *LibraryCollection, err error) {
	defer util.HandlePanicInModuleWithError("entities/collection/NewLibraryCollection", &err)
	lc = new(LibraryCollection)

	reqEvent := &AnimeLibraryCollectionRequestedEvent{
		AnimeCollection:   opts.AnimeCollection,
		LocalFiles:        opts.LocalFiles,
		LibraryCollection: lc,
	}
	err = hook.GlobalHookManager.OnAnimeLibraryCollectionRequested().Trigger(reqEvent)
	if err != nil {
		return nil, err
	}
	opts.AnimeCollection = reqEvent.AnimeCollection // Override the anime collection
	opts.LocalFiles = reqEvent.LocalFiles           // Override the local files
	lc = reqEvent.LibraryCollection                 // Override the library collection

	if reqEvent.DefaultPrevented {
		event := &AnimeLibraryCollectionEvent{
			LibraryCollection: lc,
		}
		err = hook.GlobalHookManager.OnAnimeLibraryCollection().Trigger(event)
		if err != nil {
			return nil, err
		}

		return event.LibraryCollection, nil
	}

	// Get lists from collection
	aniLists := opts.AnimeCollection.GetMediaListCollection().GetLists()

	// Create lists
	lc.hydrateCollectionLists(
		ctx,
		opts.LocalFiles,
		aniLists,
		opts.PlatformRef,
	)

	// Add Continue Watching list
	lc.hydrateContinueWatchingList(
		ctx,
		opts.LocalFiles,
		opts.AnimeCollection,
		opts.PlatformRef,
		opts.MetadataProviderRef,
	)

	lc.UnmatchedLocalFiles = lo.Filter(opts.LocalFiles, func(lf *LocalFile, index int) bool {
		return lf.MediaId == 0 && !lf.Ignored
	})

	lc.IgnoredLocalFiles = lo.Filter(opts.LocalFiles, func(lf *LocalFile, index int) bool {
		return lf.Ignored == true
	})

	slices.SortStableFunc(lc.IgnoredLocalFiles, func(i, j *LocalFile) int {
		return cmp.Compare(i.GetPath(), j.GetPath())
	})

	lc.hydrateUnmatchedGroups()

	lc.hydrateUnknownGroups(opts.LocalFiles, opts.AnimeCollection)

	// Last, because it counts the unmatched and unknown groups hydrated just above.
	lc.hydrateStats(opts.LocalFiles)

	// Event
	event := &AnimeLibraryCollectionEvent{
		LibraryCollection: lc,
	}
	_ = hook.GlobalHookManager.OnAnimeLibraryCollection().Trigger(event)
	lc = event.LibraryCollection

	return
}

//----------------------------------------------------------------------------------------------------------------------

func (lc *LibraryCollection) hydrateCollectionLists(
	ctx context.Context,
	localFiles []*LocalFile,
	aniLists []*anilist.AnimeCollection_MediaListCollection_Lists,
	platformRef *util.Ref[platform.Platform],
) {

	// Group local files by media id
	groupedLfs := GroupLocalFilesByMediaID(localFiles)
	// Get slice of media ids from local files
	mIds := GetMediaIdsFromLocalFiles(localFiles)
	foundIds := make([]int, 0)

	for _, list := range aniLists {
		entries := list.GetEntries()
		for _, entry := range entries {
			foundIds = append(foundIds, entry.Media.ID)
		}
	}

	// Create a new LibraryCollectionList for each list
	// This is done in parallel
	p := pool.NewWithResults[*LibraryCollectionList]()
	for _, list := range aniLists {
		p.Go(func() *LibraryCollectionList {
			// If the list has no status, return nil
			// This occurs when there are custom lists (DEVNOTE: This shouldn't occur because we remove custom lists when the collection is fetched)
			if list.Status == nil {
				return nil
			}

			// For each list, get the entries
			entries := list.GetEntries()

			// For each entry, check if the media id is in the local files
			// If it is, create a new LibraryCollectionEntry with the associated local files
			p2 := pool.NewWithResults[*LibraryCollectionEntry]()
			for _, entry := range entries {
				p2.Go(func() *LibraryCollectionEntry {
					if slices.Contains(mIds, entry.Media.ID) {

						entryLfs, _ := groupedLfs[entry.Media.ID]
						libraryData, _ := NewEntryLibraryData(&NewEntryLibraryDataOptions{
							EntryLocalFiles: entryLfs,
							MediaId:         entry.Media.ID,
							CurrentProgress: entry.GetProgressSafe(),
						})

						return &LibraryCollectionEntry{
							MediaId:          entry.Media.ID,
							Media:            entry.Media,
							EntryLibraryData: libraryData,
							EntryListData: &EntryListData{
								Progress:    entry.GetProgressSafe(),
								Score:       entry.GetScoreSafe(),
								Status:      entry.Status,
								Repeat:      entry.GetRepeatSafe(),
								StartedAt:   anilist.ToEntryStartDate(entry.StartedAt),
								CompletedAt: anilist.ToEntryCompletionDate(entry.CompletedAt),
							},
						}
					} else if *list.Status == anilist.MediaListStatusPlanning {
						// Include all user's planning entries even without local files
						return &LibraryCollectionEntry{
							MediaId:          entry.Media.ID,
							Media:            entry.Media,
							EntryLibraryData: nil,
							EntryListData: &EntryListData{
								Progress:    entry.GetProgressSafe(),
								Score:       entry.GetScoreSafe(),
								Status:      entry.Status,
								Repeat:      entry.GetRepeatSafe(),
								StartedAt:   anilist.ToEntryStartDate(entry.StartedAt),
								CompletedAt: anilist.ToEntryCompletionDate(entry.CompletedAt),
							},
						}
					} else {
						return nil
					}
				})
			}

			r := p2.Wait()
			// Filter out nil entries
			r = lo.Filter(r, func(item *LibraryCollectionEntry, index int) bool {
				return item != nil
			})
			// Sort by title
			sort.Slice(r, func(i, j int) bool {
				return r[i].Media.GetTitleSafe() < r[j].Media.GetTitleSafe()
			})

			// Return a new LibraryEntries struct
			return &LibraryCollectionList{
				Type:    getLibraryCollectionEntryFromListStatus(*list.Status),
				Status:  *list.Status,
				Entries: r,
			}

		})
	}

	// Get the lists from the pool
	lists := p.Wait()
	// Filter out nil entries
	lists = lo.Filter(lists, func(item *LibraryCollectionList, index int) bool {
		return item != nil
	})

	// Merge repeating to current (no need to show repeating as a separate list)
	repeatingList, ok := lo.Find(lists, func(item *LibraryCollectionList) bool {
		return item.Status == anilist.MediaListStatusRepeating
	})
	if ok {
		currentList, ok := lo.Find(lists, func(item *LibraryCollectionList) bool {
			return item.Status == anilist.MediaListStatusCurrent
		})
		if len(repeatingList.Entries) > 0 && ok {
			currentList.Entries = append(currentList.Entries, repeatingList.Entries...)
		} else if len(repeatingList.Entries) > 0 {
			newCurrentList := repeatingList
			newCurrentList.Type = anilist.MediaListStatusCurrent
			lists = append(lists, newCurrentList)
		}
		// Remove repeating from lists
		lists = lo.Filter(lists, func(item *LibraryCollectionList, index int) bool {
			return item.Status != anilist.MediaListStatusRepeating
		})
	}


	// Build a Local list containing every local file group, including unmatched files (MediaId == 0)
	existingIds := make(map[int]struct{})
	for _, l := range lists {
		for _, e := range l.Entries {
			existingIds[e.MediaId] = struct{}{}
		}
	}

	localEntries := make([]*LibraryCollectionEntry, 0)

	// Only add unmatched files (MediaId == 0) as generic entries
	unmatchedGroups := lop.GroupBy(lo.Filter(localFiles, func(lf *LocalFile, _ int) bool {
		return lf.MediaId == 0 && !lf.Ignored
	}), func(lf *LocalFile) string {
		return filepath.Dir(lf.GetPath())
	})

	for dir, files := range unmatchedGroups {
		if len(files) == 0 {
			continue
		}
		// Use folder name as title
		title := filepath.Base(dir)
		media := &anilist.BaseAnime{ID: 0, Title: &anilist.BaseAnime_Title{UserPreferred: lo.ToPtr(title), Romaji: lo.ToPtr(title), English: lo.ToPtr(title), Native: lo.ToPtr(title)}}
		libraryData, _ := NewEntryLibraryData(&NewEntryLibraryDataOptions{
			EntryLocalFiles: files,
			MediaId:         0,
			CurrentProgress: 0,
		})
		localEntries = append(localEntries, &LibraryCollectionEntry{
			MediaId:          0,
			Media:            media,
			EntryLibraryData: libraryData,
			EntryListData:    nil,
		})
	}

	// For matched files (MediaId > 0 and not already in AniList lists), hydrate with AniList data.
	//
	// These are the entries nothing else describes: not on any list, so the collection carries no
	// title, no cover and no format for them, and every one of those has to be fetched by ID. It is
	// also the largest group on a server that downloads a lot, which is what makes the details below
	// matter — done naively this is where a library turns into a wall of blank cards.
	type localCandidate struct {
		mediaID int
		lfs     []*LocalFile
	}
	candidates := make([]localCandidate, 0, len(groupedLfs))
	for mId, entryLfs := range groupedLfs {
		if mId == 0 {
			continue // already handled above
		}
		if _, ok := existingIds[mId]; ok {
			continue // already in AniList lists
		}
		candidates = append(candidates, localCandidate{mediaID: mId, lfs: entryLfs})
	}

	if len(candidates) > 0 {
		// Detached from the request. This collection is polled every few seconds, so the request's
		// context is cancelled routinely and often before a few dozen rate-limited AniList lookups
		// can finish — and a cancelled lookup used to mean a permanently blank card, because the
		// failure cached nothing and the next poll started from the same place. Fetching on a context
		// of its own means the work survives the request that triggered it and lands in the platform's
		// cache, so the following poll is served from memory.
		fetchCtx, cancelFetch := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancelFetch()

		p3 := pool.NewWithResults[*LibraryCollectionEntry]().WithMaxGoroutines(8)
		for _, candidate := range candidates {
			p3.Go(func() *LibraryCollectionEntry {
				libraryData, _ := NewEntryLibraryData(&NewEntryLibraryDataOptions{
					EntryLocalFiles: candidate.lfs,
					MediaId:         candidate.mediaID,
					CurrentProgress: 0,
				})

				var media *anilist.BaseAnime
				if platformRef != nil {
					if plat := platformRef.Get(); plat != nil {
						if ba, err := plat.GetAnime(fetchCtx, candidate.mediaID); err == nil && ba != nil {
							media = ba
							rememberLocalEntryMedia(candidate.mediaID, ba)
						}
					}
				}
				// A lookup that failed this time does not undo one that succeeded earlier. Without
				// this, one rate-limited fetch replaced a fully described anime with a bare ID —
				// a card with no art and no title — until the server was restarted.
				if media == nil {
					media = recallLocalEntryMedia(candidate.mediaID)
				}
				// Nothing known at all: name it after the folder its files are in, the same way an
				// unmatched group is named. An anime you can read the name of is worth more than an
				// anime-shaped hole, and it tells you which folder to go and look at.
				if media == nil {
					media = &anilist.BaseAnime{ID: candidate.mediaID}
					if title := folderTitleForLocalFiles(candidate.lfs); title != "" {
						media.Title = &anilist.BaseAnime_Title{
							UserPreferred: lo.ToPtr(title),
							Romaji:        lo.ToPtr(title),
							English:       lo.ToPtr(title),
							Native:        lo.ToPtr(title),
						}
					}
				}

				return &LibraryCollectionEntry{
					MediaId:          candidate.mediaID,
					Media:            media,
					EntryLibraryData: libraryData,
					EntryListData:    nil,
				}
			})
		}
		localEntries = append(localEntries, p3.Wait()...)
	}

	if len(localEntries) > 0 {
		sort.Slice(localEntries, func(i, j int) bool {
			return localEntries[i].Media.GetTitleSafe() < localEntries[j].Media.GetTitleSafe()
		})
		lists = append([]*LibraryCollectionList{{
			Type:    MediaListStatusLocal,
			Status:  MediaListStatusLocal,
			Entries: localEntries,
		}}, lists...)
	}

	// Lists
	lc.Lists = lists

	if lc.Lists == nil {
		lc.Lists = make([]*LibraryCollectionList, 0)
	}

	return
}

//----------------------------------------------------------------------------------------------------------------------

// hydrateStats counts the library. Call it after the unmatched and unknown groups are hydrated —
// it reports those too.
//
// Only entries that actually have local files are counted. The lists this walks are not purely a
// picture of your library: hydrateCollectionLists deliberately carries every Planning entry, files or
// no files, so the planning shelf can be browsed from here. Counting those made the readout describe
// an AniList account rather than a drive — a library of forty shows reading "403 TV Shows" because
// the other 363 were things the user had only ever meant to watch.
func (lc *LibraryCollection) hydrateStats(lfs []*LocalFile) {
	stats := &LibraryCollectionStats{
		TotalFiles:    len(lfs),
		TotalEntries:  0,
		TotalShows:    0,
		TotalMovies:   0,
		TotalSpecials: 0,
		TotalSize:     "", // Will be set by the route handler
	}

	// An anime holds one list status at a time, so this cannot double count today; it is here so that
	// a future list which repeats an entry cannot make the library look bigger than it is.
	counted := make(map[int]struct{}, len(lc.Lists))

	for _, list := range lc.Lists {
		for _, entry := range list.Entries {
			// No local files, no place in the count. Non-nil is the right test rather than a main file
			// count: an entry held entirely in specials is still something you have.
			if entry.EntryLibraryData == nil {
				continue
			}
			if _, ok := counted[entry.MediaId]; ok {
				continue
			}
			counted[entry.MediaId] = struct{}{}

			stats.TotalEntries++
			if entry.Media.Format != nil {
				if *entry.Media.Format == anilist.MediaFormatMovie {
					stats.TotalMovies++
				} else if *entry.Media.Format == anilist.MediaFormatSpecial || *entry.Media.Format == anilist.MediaFormatOva {
					stats.TotalSpecials++
				} else {
					stats.TotalShows++
				}
			}
		}
	}

	// What the scan found and the library cannot show. Unknown groups are one media each and unmatched
	// groups one directory each, so both count as roughly one show's worth of files.
	stats.UnresolvedItems = len(lc.UnknownGroups) + len(lc.UnmatchedGroups)
	for _, group := range lc.UnknownGroups {
		stats.UnresolvedFiles += len(group.LocalFiles)
	}
	for _, group := range lc.UnmatchedGroups {
		stats.UnresolvedFiles += len(group.LocalFiles)
	}

	lc.Stats = stats
}

//----------------------------------------------------------------------------------------------------------------------

// hydrateContinueWatchingList creates a list of Episode for the "continue watching" feature.
// This should be called after the LibraryCollectionList's have been created.
func (lc *LibraryCollection) hydrateContinueWatchingList(
	ctx context.Context,
	localFiles []*LocalFile,
	animeCollection *anilist.AnimeCollection,
	platformRef *util.Ref[platform.Platform],
	metadataProviderRef *util.Ref[metadata_provider.Provider],
) {

	// Get currently watching list
	current, found := lo.Find(lc.Lists, func(item *LibraryCollectionList) bool {
		return item.Status == anilist.MediaListStatusCurrent
	})

	// If no currently watching list is found, return an empty slice
	if !found {
		lc.ContinueWatchingList = make([]*Episode, 0) // Set empty slice
		return
	}
	// Get media ids from current list
	mIds := make([]int, len(current.Entries))
	for i, entry := range current.Entries {
		mIds[i] = entry.MediaId
	}

	// Create a new Entry for each media id
	mEntryPool := pool.NewWithResults[*Entry]()
	for _, mId := range mIds {
		mEntryPool.Go(func() *Entry {
			me, _ := NewEntry(ctx, &NewEntryOptions{
				MediaId:             mId,
				LocalFiles:          localFiles,
				AnimeCollection:     animeCollection,
				PlatformRef:         platformRef,
				MetadataProviderRef: metadataProviderRef,
			})
			return me
		})
	}
	mEntries := mEntryPool.Wait()
	mEntries = lo.Filter(mEntries, func(item *Entry, index int) bool {
		return item != nil
	}) // Filter out nil entries

	// If there are no entries, return an empty slice
	if len(mEntries) == 0 {
		lc.ContinueWatchingList = make([]*Episode, 0) // Return empty slice
		return
	}

	// Sort by progress
	sort.Slice(mEntries, func(i, j int) bool {
		return mEntries[i].EntryListData.Progress > mEntries[j].EntryListData.Progress
	})

	// Remove entries the user has watched all episodes of
	mEntries = lop.Map(mEntries, func(mEntry *Entry, index int) *Entry {
		if !mEntry.HasWatchedAll() {
			return mEntry
		}
		return nil
	})
	mEntries = lo.Filter(mEntries, func(item *Entry, index int) bool {
		return item != nil
	})

	// Get the next episode for each media entry
	mEpisodes := lop.Map(mEntries, func(mEntry *Entry, index int) *Episode {
		ep, ok := mEntry.FindNextEpisode()
		if ok {
			return ep
		}
		return nil
	})
	mEpisodes = lo.Filter(mEpisodes, func(item *Episode, index int) bool {
		return item != nil
	})

	lc.ContinueWatchingList = mEpisodes
}

//----------------------------------------------------------------------------------------------------------------------

// hydrateUnmatchedGroups is a method of the LibraryCollection struct.
// It is responsible for grouping unmatched local files by their directory and creating UnmatchedGroup instances for each group.
func (lc *LibraryCollection) hydrateUnmatchedGroups() {

	groups := make([]*UnmatchedGroup, 0)

	// Group by directory
	groupedLfs := lop.GroupBy(lc.UnmatchedLocalFiles, func(lf *LocalFile) string {
		return filepath.Dir(lf.GetPath())
	})

	for key, value := range groupedLfs {
		groups = append(groups, &UnmatchedGroup{
			Dir:         key,
			LocalFiles:  value,
			Suggestions: make([]*anilist.BaseAnime, 0),
		})
	}

	slices.SortStableFunc(groups, func(i, j *UnmatchedGroup) int {
		return cmp.Compare(i.Dir, j.Dir)
	})

	// Assign the created groups
	lc.UnmatchedGroups = groups
}

//----------------------------------------------------------------------------------------------------------------------

// hydrateUnknownGroups identifies local files with valid MediaId that aren't in the user's AniList collection
// or the Local list and groups them by MediaId to create UnknownGroup entries for resolution.
func (lc *LibraryCollection) hydrateUnknownGroups(localFiles []*LocalFile, animeCollection *anilist.AnimeCollection) {
	
	// Get all media IDs that are in the user's AniList collection
	collectionMediaIds := make(map[int]struct{})
	for _, list := range animeCollection.GetMediaListCollection().GetLists() {
		for _, entry := range list.GetEntries() {
			collectionMediaIds[entry.GetMedia().GetID()] = struct{}{}
		}
	}

	// Also include media IDs already tracked in the library lists (e.g. the Local list)
	// so they don't appear as "unknown" needing resolution.
	for _, list := range lc.Lists {
		for _, entry := range list.Entries {
			if entry.MediaId > 0 {
				collectionMediaIds[entry.MediaId] = struct{}{}
			}
		}
	}

	// Filter local files that have MediaId > 0 but aren't in the collection
	unknownLocalFiles := lo.Filter(localFiles, func(lf *LocalFile, index int) bool {
		return lf.MediaId > 0 && !lf.Ignored
	})

	unknownLocalFiles = lo.Filter(unknownLocalFiles, func(lf *LocalFile, index int) bool {
		_, found := collectionMediaIds[lf.MediaId]
		return !found
	})

	// Group unknown local files by MediaId
	groupedUnknownFiles := lop.GroupBy(unknownLocalFiles, func(lf *LocalFile) int {
		return lf.MediaId
	})

	// Create UnknownGroup for each MediaId
	unknownGroups := make([]*UnknownGroup, 0)
	for mediaId, files := range groupedUnknownFiles {
		if len(files) > 0 {
			unknownGroups = append(unknownGroups, &UnknownGroup{
				MediaId:    mediaId,
				LocalFiles: files,
			})
		}
	}

	// Sort by MediaId for consistent ordering
	slices.SortStableFunc(unknownGroups, func(i, j *UnknownGroup) int {
		return cmp.Compare(i.MediaId, j.MediaId)
	})

	// Assign the created groups
	lc.UnknownGroups = unknownGroups
}

//----------------------------------------------------------------------------------------------------------------------

// getLibraryCollectionEntryFromListStatus maps anilist.MediaListStatus to LibraryCollectionListType.
func getLibraryCollectionEntryFromListStatus(st anilist.MediaListStatus) anilist.MediaListStatus {
	if st == anilist.MediaListStatusRepeating {
		return anilist.MediaListStatusCurrent
	}

	return st
}

// deriveLocalTitle extracts a reasonable display title from a slice of local files.
// Prefers the parent directory name; falls back to file name sans extension.
func deriveLocalTitle(lfs []*LocalFile) string {
	if len(lfs) == 0 {
		return "Local Entry"
	}
	lf := lfs[0]
	if lf == nil {
		return "Local Entry"
	}
	if lf.Path != "" {
		dir := filepath.Base(filepath.Dir(lf.Path))
		dir = strings.TrimSpace(dir)
		if dir != "" && dir != "." && dir != string(filepath.Separator) {
			return dir
		}
		base := filepath.Base(lf.Path)
		if base != "" {
			// Strip extension
			if idx := strings.LastIndex(base, "."); idx > 0 {
				base = base[:idx]
			}
			base = strings.TrimSpace(base)
			if base != "" {
				return base
			}
		}
	}
	return "Local Entry"
}
