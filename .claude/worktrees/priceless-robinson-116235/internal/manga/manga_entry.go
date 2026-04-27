package manga

import (
	"context"
	"errors"
	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/hook"
	"seanime/internal/platforms/platform"
	"seanime/internal/util"
	"seanime/internal/util/filecache"

	"github.com/rs/zerolog"
)

type (
	// Entry is fetched when the user goes to the manga entry page.
	Entry struct {
		MediaId       int                `json:"mediaId"`
		Media         *anilist.BaseManga `json:"media"`
		EntryListData *EntryListData     `json:"listData,omitempty"`
	}

	EntryListData struct {
		Progress    int                      `json:"progress,omitempty"`
		Score       float64                  `json:"score,omitempty"`
		Status      *anilist.MediaListStatus `json:"status,omitempty"`
		Repeat      int                      `json:"repeat,omitempty"`
		StartedAt   string                   `json:"startedAt,omitempty"`
		CompletedAt string                   `json:"completedAt,omitempty"`
	}
)

type (
	// NewEntryOptions is the options for creating a new manga entry.
	NewEntryOptions struct {
		MediaId         int
		Logger          *zerolog.Logger
		FileCacher      *filecache.Cacher
		MangaCollection *anilist.MangaCollection
		PlatformRef     *util.Ref[platform.Platform]
		Database        *db.Database
	}
)

// NewEntry creates a new manga entry.
func NewEntry(ctx context.Context, opts *NewEntryOptions) (entry *Entry, err error) {
	originalMediaId := opts.MediaId
	resolvedMediaId := opts.MediaId
	
	// Resolve ID mapping if it exists (conversion layer)
	if opts.MediaId < 0 && opts.Database != nil {
		if anilistID, found := opts.Database.GetMangaIDMapping(opts.MediaId); found {
			resolvedMediaId = anilistID
			opts.Logger.Debug().
				Int("syntheticID", opts.MediaId).
				Int("anilistID", anilistID).
				Msg("manga: Resolved synthetic ID to AniList ID via mapping")
		}
	}
	
	entry = &Entry{
		MediaId: resolvedMediaId,
	}

	// Handle synthetic manga (negative IDs) - only if no mapping exists
	if originalMediaId < 0 && resolvedMediaId < 0 && opts.Database != nil {
		syntheticManga, found := opts.Database.GetSyntheticManga(originalMediaId)
		if found {
			entry.Media = createBaseMangaFromSyntheticEntry(syntheticManga)
			// Synthetic manga doesn't have list data from AniList
			return entry, nil
		}
		return nil, errors.New("synthetic manga not found")
	}

	reqEvent := new(MangaEntryRequestedEvent)
	reqEvent.MediaId = opts.MediaId
	reqEvent.MangaCollection = opts.MangaCollection
	reqEvent.Entry = entry

	err = hook.GlobalHookManager.OnMangaEntryRequested().Trigger(reqEvent)
	if err != nil {
		return nil, err
	}
	opts.MediaId = reqEvent.MediaId                 // Override the media ID
	opts.MangaCollection = reqEvent.MangaCollection // Override the manga collection
	entry = reqEvent.Entry                          // Override the entry

	if reqEvent.DefaultPrevented {
		mangaEvent := new(MangaEntryEvent)
		mangaEvent.Entry = reqEvent.Entry
		err = hook.GlobalHookManager.OnMangaEntry().Trigger(mangaEvent)
		if err != nil {
			return nil, err
		}

		if mangaEvent.Entry == nil {
			return nil, errors.New("no entry was returned")
		}
		return mangaEvent.Entry, nil
	}

	anilistEntry, found := opts.MangaCollection.GetListEntryFromMangaId(opts.MediaId)

	// If the entry is not found, we fetch the manga from the Anilist API.
	if !found {
		media, err := opts.PlatformRef.Get().GetManga(ctx, opts.MediaId)
		if err != nil {
			return nil, err
		}
		entry.Media = media

	} else {
		// If the entry is found, we use the entry from the collection.
		mangaEvent := new(platform.GetMangaEvent)
		mangaEvent.Manga = anilistEntry.GetMedia()
		err := hook.GlobalHookManager.OnGetManga().Trigger(mangaEvent)
		if err != nil {
			return nil, err
		}
		entry.Media = mangaEvent.Manga
		entry.EntryListData = &EntryListData{
			Progress:    *anilistEntry.Progress,
			Score:       *anilistEntry.Score,
			Status:      anilistEntry.Status,
			Repeat:      anilistEntry.GetRepeatSafe(),
			StartedAt:   anilist.FuzzyDateToString(anilistEntry.StartedAt),
			CompletedAt: anilist.FuzzyDateToString(anilistEntry.CompletedAt),
		}
	}

	mangaEvent := new(MangaEntryEvent)
	mangaEvent.Entry = entry
	err = hook.GlobalHookManager.OnMangaEntry().Trigger(mangaEvent)
	if err != nil {
		return nil, err
	}

	return mangaEvent.Entry, nil
}

// createBaseMangaFromSyntheticEntry creates a BaseManga object from a SyntheticManga entry
func createBaseMangaFromSyntheticEntry(sm *models.SyntheticManga) *anilist.BaseManga {
	status := anilist.MediaStatusReleasing
	if sm.Status == "FINISHED" {
		status = anilist.MediaStatusFinished
	}

	format := anilist.MediaFormatManga

	return &anilist.BaseManga{
		ID: sm.SyntheticID,
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
		Description: &sm.Description,
		Status:      &status,
		Format:      &format,
		Chapters:    &sm.Chapters,
	}
}
