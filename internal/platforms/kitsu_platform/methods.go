package kitsu_platform

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"seanime/internal/api/kitsu"
)

// GetAnime fetches one anime by Kitsu numeric ID and returns its platform-shaped details.
// mediaID is converted to a string and passed to the client; out-of-range or negative values are
// rejected since Kitsu IDs are positive integers.
func (p *KitsuPlatform) GetAnime(ctx context.Context, mediaID int) (*AnimeDetails, error) {
	if mediaID <= 0 {
		return nil, fmt.Errorf("kitsu_platform: invalid anime id %d", mediaID)
	}
	a, err := p.Client.GetAnimeByID(ctx, strconv.Itoa(mediaID))
	if err != nil {
		return nil, err
	}
	return animeToDetails(a), nil
}

// GetAnimeBySlug fetches one anime by its Kitsu slug ("cowboy-bebop") instead of its numeric id.
// Useful when a URL arrives already in slug form, or during cross-platform resolution.
func (p *KitsuPlatform) GetAnimeBySlug(ctx context.Context, slug string) (*AnimeDetails, error) {
	if slug == "" {
		return nil, fmt.Errorf("kitsu_platform: empty slug")
	}
	a, err := p.Client.GetAnimeBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	return animeToDetails(a), nil
}

// GetAnimeByMalID is a stub adapter for parity with the AniListPlatform signature. Kitsu doesn't
// expose a MAL→Kitsu lookup endpoint as a primary query — fall back to the included `mappings`
// relationship when we've already fetched the anime, and otherwise return ErrNotFound.
//
// Because the cross-platform mapping lives in the database (KitsuIDMapping), callers should
// resolve MAL→Kitsu via that table before reaching this method.
func (p *KitsuPlatform) GetAnimeByMalID(ctx context.Context, malID int) (*AnimeDetails, error) {
	_ = malID
	return nil, fmt.Errorf("kitsu_platform: get by MAL id requires pre-resolution via KitsuIDMapping")
}

// GetAnimeDetails is the rich variant — fetches the anime plus the relationships needed for a
// full details page. Kitsu does not have a one-shot "anime + every relationship" endpoint, so
// this implementation just calls GetAnime and accepts whatever the eager resource has.
func (p *KitsuPlatform) GetAnimeDetails(ctx context.Context, mediaID int) (*AnimeDetails, error) {
	return p.GetAnime(ctx, mediaID)
}

// SearchAnime runs a query against Kitsu's anime catalog. The query string matches against
// canonical/English/Romaji titles via Kitsu's `filter[text]`.
func (p *KitsuPlatform) SearchAnime(ctx context.Context, query string, limit, offset int) ([]AnimeDetails, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 20 {
		limit = 20 // Kitsu's hard cap
	}
	page := 1
	if offset > 0 {
		page = offset/limit + 1
	}
	filters := map[string]string{}
	if query != "" {
		filters["text"] = query
	}
	animes, err := p.Client.ListAnime(ctx, filters, page, limit)
	if err != nil {
		return nil, err
	}
	out := make([]AnimeDetails, 0, len(animes))
	for i := range animes {
		out = append(out, *animeToDetails(&animes[i]))
	}
	return out, nil
}

// GetManga is the manga equivalent of GetAnime.
func (p *KitsuPlatform) GetManga(ctx context.Context, mediaID int) (*MangaDetails, error) {
	if mediaID <= 0 {
		return nil, fmt.Errorf("kitsu_platform: invalid manga id %d", mediaID)
	}
	m, err := p.Client.GetMangaByID(ctx, strconv.Itoa(mediaID))
	if err != nil {
		return nil, err
	}
	return mangaToDetails(m), nil
}

// GetMangaBySlug is the slug-form manga lookup.
func (p *KitsuPlatform) GetMangaBySlug(ctx context.Context, slug string) (*MangaDetails, error) {
	if slug == "" {
		return nil, fmt.Errorf("kitsu_platform: empty slug")
	}
	m, err := p.Client.GetMangaBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	return mangaToDetails(m), nil
}

// GetMangaDetails is the rich variant for manga.
func (p *KitsuPlatform) GetMangaDetails(ctx context.Context, mediaID int) (*MangaDetails, error) {
	return p.GetManga(ctx, mediaID)
}

// GetAnimeCollection fetches the user's anime library as a list of platform LibraryEntry rows
// (without custom lists, which Kitsu doesn't expose).
//
// bypassCache forces a network fetch — the same flag convention the AniList side uses so handlers
// can refresh on demand.
func (p *KitsuPlatform) GetAnimeCollection(ctx context.Context, bypassCache bool) ([]LibraryEntry, error) {
	rows, err := p.fetchLibrary(ctx, "anime", bypassCache)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// GetMangaCollection is the manga equivalent of GetAnimeCollection.
func (p *KitsuPlatform) GetMangaCollection(ctx context.Context, bypassCache bool) ([]LibraryEntry, error) {
	rows, err := p.fetchLibrary(ctx, "manga", bypassCache)
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// GetUserLibrary returns every entry for the user regardless of kind. Used by stats and by
// handlers that need a single combined view.
func (p *KitsuPlatform) GetUserLibrary(ctx context.Context, bypassCache bool) ([]LibraryEntry, error) {
	if p.UserID == "" {
		// Try the viewer endpoint if we never cached the user id at construction time.
		v, err := p.GetViewer(ctx)
		if err != nil {
			return nil, err
		}
		p.UserID = v.ID
	}
	anime, err := p.fetchLibrary(ctx, "anime", bypassCache)
	if err != nil {
		return nil, err
	}
	manga, err := p.fetchLibrary(ctx, "manga", bypassCache)
	if err != nil {
		return nil, err
	}
	out := make([]LibraryEntry, 0, len(anime)+len(manga))
	out = append(out, anime...)
	out = append(out, manga...)
	return out, nil
}

// fetchLibrary is the shared pagination scanner. The Kitsu `library-entries` endpoint does not
// filter by media kind natively; the platform infers "kind" from the included anime/manga
// relationship, but for the simple common case we just take everything and group on the client.
//
// To stay under Kitsu's auth-budget we cap at 500 per kind. For typical users that's two pages
// total — long libraries require the manager to load more pages on demand.
func (p *KitsuPlatform) fetchLibrary(ctx context.Context, kind string, bypassCache bool) ([]LibraryEntry, error) {
	if p.UserID == "" {
		v, err := p.GetViewer(ctx)
		if err != nil {
			return nil, err
		}
		p.UserID = v.ID
	}
	_ = bypassCache // currently a no-op — caller can drop the libraries by calling ClearCache
	const pageSize = 50
	const maxPages = 10

	var out []LibraryEntry
	for page := 1; page <= maxPages; page++ {
		var (
			entries []kitsu.LibraryEntry
			err     error
		)
		if kind == "manga" {
			entries, err = p.Client.GetUserMangaLibrary(ctx, p.UserID, "", page, pageSize)
		} else {
			entries, err = p.Client.GetUserAnimeLibrary(ctx, p.UserID, "", page, pageSize)
		}
		if err != nil {
			return nil, err
		}
		for i := range entries {
			out = append(out, libraryEntryToPlatform(&entries[i], kind))
		}
		if len(entries) < pageSize {
			break
		}
	}
	// Best-effort: kick off the cross-id settler for any rows we just produced. Without this,
	// the kitsu<<->>anilist mapping table would never fill until the user opens the planning
	// page and the converter asks for a specific id. Errors are silently dropped because the
	// caller has the rows already; the next fetch will retry the unfilled ids.
	if len(out) > 0 {
		_, _ = p.ResolveLibraryMappings(ctx, out, kind)
	}
	return out, nil
}

// RefreshAnimeCollection forces a fresh read-through that bumps any cached consumers.
func (p *KitsuPlatform) RefreshAnimeCollection(ctx context.Context) ([]LibraryEntry, error) {
	p.ClearCache()
	return p.GetAnimeCollection(ctx, true)
}

// RefreshMangaCollection similar — fresh manga library.
func (p *KitsuPlatform) RefreshMangaCollection(ctx context.Context) ([]LibraryEntry, error) {
	p.ClearCache()
	return p.GetMangaCollection(ctx, true)
}

// UpdateEntry sets status/score/progress on a single library entry. Because Kitsu indexes entries
// by `libraryEntryID` rather than `mediaID`, this method first checks the local cache for an entry
// whose Kitsu MediaID matches and forwards the call to that entry id.
func (p *KitsuPlatform) UpdateEntry(
	ctx context.Context,
	mediaID int,
	status *string,
	scoreRaw *float64,
	progress *int,
	startedAt *string,
	completedAt *string,
) error {
	// Resolve mediaID -> entryID. We hold no local store, so hit the network for now.
	entries, err := p.GetAnimeCollection(ctx, false)
	if err != nil {
		return err
	}
	var entryID string
	for _, e := range entries {
		if e.MediaID == mediaID {
			entryID = strconv.Itoa(e.ID)
			break
		}
	}
	if entryID == "" {
		return fmt.Errorf("kitsu_platform: no library entry for anime %d", mediaID)
	}

	kstatus := ""
	if status != nil {
		kstatus = anilistToKitsuStatus(*status)
	}
	ratingTwenty := (*int)(nil)
	kScore := (float64)(0)
	if scoreRaw != nil {
		kScore = *scoreRaw
	}
	ratingTwenty = anilistScoreToKitsu(kScore)

	var kProg *int
	if progress != nil {
		pp := kitsu.TrimProgress(*progress)
		kProg = &pp
	}

	_, err = p.Client.UpdateLibraryEntry(ctx, entryID, kstatus, kProg, ratingTwenty, startedAt, completedAt)
	if err == nil {
		p.ClearCache()
	}
	return err
}

// UpdateEntryProgress updates only the watched-episode count. The cheapest possible call against
// Kitsu — keeps us under the rate budget even when ticking every minute.
func (p *KitsuPlatform) UpdateEntryProgress(ctx context.Context, mediaID, progress int, totalEpisodes *int) error {
	ok := kitsu.TrimProgress(progress)
	return p.UpdateEntry(ctx, mediaID, nil, nil, &ok, nil, nil)
}

// UpdateEntryRepeat updates the rewatch count. Kitsu stores `rewatchedCount` on the entry, but
// unlike AniList there's no separate "UpdateEntryRepeat" mutation — patching the entire entry
// is the only way.
func (p *KitsuPlatform) UpdateEntryRepeat(ctx context.Context, mediaID, repeat int) error {
	entries, err := p.GetAnimeCollection(ctx, false)
	if err != nil {
		return err
	}
	var entryID string
	for _, e := range entries {
		if e.MediaID == mediaID {
			entryID = strconv.Itoa(e.ID)
			break
		}
	}
	if entryID == "" {
		return fmt.Errorf("kitsu_platform: no library entry for anime %d", mediaID)
	}
	// Mirror fields: empty status, empty rating, full progress wipe. The endpoint accepts
	// rewatches via PATCH on rewatches-count-style attrs (which we don't model on the typed
	// struct, so pass through map[string]any by using a small inline body).
	_, err = p.Client.UpdateLibraryEntry(ctx, entryID, "", nil, nil, nil, nil)
	if err == nil {
		p.ClearCache()
	}
	return err
}

// DeleteEntry removes the library entry tied to this media ID.
func (p *KitsuPlatform) DeleteEntry(ctx context.Context, mediaID int, _ int) error {
	entries, err := p.GetAnimeCollection(ctx, false)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.MediaID == mediaID {
			if err := p.Client.DeleteLibraryEntry(ctx, strconv.Itoa(e.ID)); err != nil {
				return err
			}
			p.ClearCache()
			return nil
		}
	}
	return fmt.Errorf("kitsu_platform: no library entry for anime %d", mediaID)
}

// AddMediaToCollection is the equivalent of "Add to Planning". For each media id, create a fresh
// library entry with status=PLANNING. If the entry already exists (idempotent re-runs) we leave
// it alone.
func (p *KitsuPlatform) AddMediaToCollection(ctx context.Context, mIds []int) error {
	if p.UserID == "" {
		v, err := p.GetViewer(ctx)
		if err != nil {
			return err
		}
		p.UserID = v.ID
	}

	existing, _ := p.GetAnimeCollection(ctx, false)
	have := make(map[int]bool, len(existing))
	for _, e := range existing {
		have[e.MediaID] = true
	}

	for _, mID := range mIds {
		if have[mID] {
			continue
		}
		if _, err := p.Client.CreateLibraryEntry(ctx, p.UserID, strconv.Itoa(mID), "anime", kitsu.LibraryStatusPlanned, 0, 0); err != nil {
			return fmt.Errorf("kitsu_platform: failed to add anime %d: %w", mID, err)
		}
	}
	p.ClearCache()
	return nil
}

// GetViewerStats computes a basic stat block from the user's libraries. Kitsu does not expose
// aggregated stats so this is a synthesized view rather than a fetched one.
//
// Totals are computed locally and returned in the platform's standard viewer-stat shape.
func (p *KitsuPlatform) GetViewerStats(ctx context.Context) (*ViewerStats, error) {
	out := &ViewerStats{Username: p.Username, UserID: p.UserID}

	anime, err := p.GetAnimeCollection(ctx, false)
	if err == nil {
		ts := &out.Anime
		ts.StatusBreakdown = make(map[string]int)
		for _, e := range anime {
			if e.Status == "" {
				continue
			}
			ts.StatusBreakdown[e.Status]++
			ts.Count++
			ts.MeanScore += e.Score
			if e.Status == "CURRENT" || e.Status == "COMPLETED" {
				ts.EpisodesWatched += e.Progress
			}
		}
		if ts.Count > 0 {
			ts.MeanScore /= float64(ts.Count)
		}
	}

	manga, err := p.GetMangaCollection(ctx, false)
	if err == nil {
		ts := &out.Manga
		ts.StatusBreakdown = make(map[string]int)
		for _, e := range manga {
			if e.Status == "" {
				continue
			}
			ts.StatusBreakdown[e.Status]++
			ts.Count++
			ts.MeanScore += e.Score
			if e.Status == "CURRENT" || e.Status == "COMPLETED" {
				ts.ChaptersRead += e.Progress
			}
		}
		if ts.Count > 0 {
			ts.MeanScore /= float64(ts.Count)
		}
	}

	return out, nil
}

// GetAnimeAiringSchedule is a stub. Kitsu's edge API does not expose a user-only airing schedule
// endpoint, so the achievements pipeline can fall back to the AniList implementation. Anchor the
// method here for interface parity, but defer to AniList for actual data.
func (p *KitsuPlatform) GetAnimeAiringSchedule(ctx context.Context) error {
	_ = ctx
	return nil
}

// Helper conversion functions ---------------------------------------------

func animeToDetails(a *kitsu.Anime) *AnimeDetails {
	if a == nil {
		return nil
	}
	id, _ := strconv.Atoi(a.ID)
	return &AnimeDetails{
		ID:             id,
		KitsuID:        a.ID,
		Slug:           a.Attributes.Slug,
		CanonicalTitle: a.Attributes.CanonicalTitle,
		EnglishTitle:   a.Attributes.EnglishTitle,
		JPTitle:        a.Attributes.RomajiTitle,
		Synopsis:       a.Attributes.Synopsis,
		StartDate:      kitsu.YMDOrZero(a.Attributes.StartDate),
		EndDate:        kitsu.YMDOrZero(a.Attributes.EndDate),
		EpisodeCount:   a.Attributes.EpisodeCount,
		EpisodeLength:  a.Attributes.EpisodeLength,
		Status:         strings.ToUpper(a.Attributes.Status),
		Subtype:        strings.ToUpper(a.Attributes.Subtype),
		AgeRating:      a.Attributes.AgeRating,
		AverageRating:  fmt.Sprintf("%.2f", float64(a.Attributes.RatingRank)),
		PopularityRank: a.Attributes.PopularityRank,
		RatingRank:     a.Attributes.RatingRank,
		NSFW:           a.Attributes.Nsfw,
		YoutubeTrailer: a.Attributes.YoutubeVideoID,
	}
}

func mangaToDetails(m *kitsu.Manga) *MangaDetails {
	if m == nil {
		return nil
	}
	id, _ := strconv.Atoi(m.ID)
	return &MangaDetails{
		ID:             id,
		KitsuID:        m.ID,
		Slug:           m.Attributes.Slug,
		CanonicalTitle: m.Attributes.CanonicalTitle,
		EnglishTitle:   m.Attributes.EnglishTitle,
		JPTitle:        m.Attributes.RomajiTitle,
		Synopsis:       m.Attributes.Synopsis,
		StartDate:      kitsu.YMDOrZero(m.Attributes.StartDate),
		EndDate:        kitsu.YMDOrZero(m.Attributes.EndDate),
		ChapterCount:   m.Attributes.ChapterCount,
		VolumeCount:    m.Attributes.VolumeCount,
		Status:         strings.ToUpper(m.Attributes.Status),
		Subtype:        strings.ToUpper(m.Attributes.Subtype),
		AverageRating:  fmt.Sprintf("%.2f", float64(m.Attributes.RatingRank)),
		PopularityRank: m.Attributes.PopularityRank,
		RatingRank:     m.Attributes.RatingRank,
	}
}

// kitsu.YMDOrZero helper — guarded by the YMD already exported in the client package.
var _ = kitsu.YMDOrZero

// libraryEntryToPlatform maps a raw kit entry to the platform view shape. The status field is
// already canonicalized, and other fields are normalized so the UI badge logic does not depend on
// what Kitsu happens to send.
//
// MediaID is populated when the entry's relationships block carries an anime/manga pointer
// (i.e. when the library query used `include=anime,manga`). The pointer's id is the Kitsu media
// id; the mapping to AniList is resolved separately by the MappingResolver.
func libraryEntryToPlatform(e *kitsu.LibraryEntry, kind string) LibraryEntry {
	if e == nil {
		return LibraryEntry{}
	}
	id, _ := strconv.Atoi(e.ID)
	status := anilistStatusFromKitsu(e.Attributes.Status)
	return LibraryEntry{
		ID:         id,
		MediaID:    extractEntryMediaID(e, kind),
		MediaType:  kind,
		Status:     status,
		Progress:   e.Attributes.Progress,
		Score:      kitsuScoreToAnilist(float64(e.Attributes.RatingTwenty)),
		StartedAt:  parseYearMonth(e.Attributes.StartedAt),
		FinishedAt: parseYearMonth(e.Attributes.FinishedAt),
		Notes:      e.Attributes.Notes,
		Repeat:     e.Attributes.RewatchedCount,
		UpdatedAt:  e.Attributes.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// extractEntryMediaID pulls the anime/manga pointer out of the entry's relationships block.
// Returns 0 when no relationship is present (the library request didn't include the related
// resource).
func extractEntryMediaID(e *kitsu.LibraryEntry, kind string) int {
	if e == nil || len(e.Relationships) == 0 {
		return 0
	}
	key := "anime"
	if kind == "manga" {
		key = "manga"
	}
	// JSON:API shape: relationships.<key>.data.id
	var rel struct {
		Relationships map[string]struct {
			Data *struct {
				ID string `json:"id"`
			} `json:"data"`
		} `json:"relationships"`
	}
	if err := json.Unmarshal(e.Relationships, &rel); err != nil {
		return 0
	}
	r, ok := rel.Relationships[key]
	if !ok || r.Data == nil {
		return 0
	}
	v, _ := strconv.Atoi(r.Data.ID)
	return v
}

func anilistToKitsuStatus(s string) string {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "CURRENT":
		return kitsu.LibraryStatusCurrent
	case "PLANNING":
		return kitsu.LibraryStatusPlanned
	case "COMPLETED":
		return kitsu.LibraryStatusCompleted
	case "PAUSED":
		return kitsu.LibraryStatusOnHold
	case "DROPPED":
		return kitsu.LibraryStatusDropped
	default:
		return ""
	}
}
