package kitsu_platform

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	"seanime/internal/api/kitsu"
	"seanime/internal/database/models"
)

// MappingResolver populates the KitsuIDMapping table on demand. The model is cache-first: every
// lookup hits SQLite, and on miss we fall back to the upstream Kitsu /mappings endpoint, persist
// the result, and re-read. Repeat hits within a single session go through an in-memory map so
// second-pass conversions don't re-hit the database.
//
// The resolver is concurrency-safe — multiple Goroutines can call Resolve at once. We rely on
// SQLite for the cross-process safety: a duplicate upsert is a no-op (the existing-row branch
// only overwrites fields that arrived non-empty).
type MappingResolver struct {
	once  sync.Once
	mu    sync.RWMutex
	hit   map[string]mappingCacheRow
	clock func() time.Time
}

type mappingCacheRow struct {
	AnilistID int
	MalID     int
	Slug      string
	Title     string
}


// NewMappingResolver constructs an empty resolver. Use InstallMappingLookup to wire it.
func NewMappingResolver() *MappingResolver {
	return &MappingResolver{
		hit:   make(map[string]mappingCacheRow),
		clock: time.Now,
	}
}

// Install wires the package-level lookup variable so future generations of convert/anilist
// conversions can resolve Kitsu ids without each caller rebuilding the resolver. Calling it
// multiple times is safe — the latest resolver wins.
func (r *MappingResolver) Install() {
	if r == nil {
		lookupKitsuMapping = func(string) MappingSnapshot { return MappingSnapshot{} }
		return
	}
	lookupKitsuMapping = r.snapshot
}

// snapshot returns the cached mapping for a Kitsu id without touching the database. Used by the
// synchronous kitsu_to_anilist helpers that already pay for the lookup at app start; they don't
// want to re-resolve via the network during a render.
func (r *MappingResolver) snapshot(kitsuID string) MappingSnapshot {
	if r == nil {
		return MappingSnapshot{}
	}
	r.mu.RLock()
	row, ok := r.hit[kitsuID]
	r.mu.RUnlock()
	if ok {
		return MappingSnapshot{
			AnilistID:      row.AnilistID,
			KitsuSlug:      row.Slug,
			CanonicalTitle: row.Title,
		}
	}
	return MappingSnapshot{}
}

// SourceDB is the slice of the *db.Database methods MappingResolver needs. Defined as an
// interface so tests can inject a fake without wiring SQLite.
type SourceDB interface {
	GetKitsuMappingByKitsuID(kitsuID string) (*models.KitsuIDMapping, error)
	UpsertKitsuIDMapping(m *models.KitsuIDMapping) (*models.KitsuIDMapping, error)
}

// MappingFetcher is the slice of *kitsu.Client methods MappingResolver needs.
type MappingFetcher interface {
	GetAnimeMappings(ctx context.Context, animeID string) ([]kitsu.Mapping, error)
	GetMangaMappings(ctx context.Context, mangaID string) ([]kitsu.Mapping, error)
	GetAnimeByID(ctx context.Context, id string) (*kitsu.Anime, error)
	GetMangaByID(ctx context.Context, id string) (*kitsu.Manga, error)
}

// ResolveAnime finds or refreshes the Kitsu<<->>AniList mapping for a given anime. Returns the
// mapping row when known and (nil, nil) when Kitsu itself has no mapping for that anime — a
// legitimate outcome (e.g. very recent entries may not yet have an AniList cross-link).
//
// `kind` is "anime" or "manga" — the MediaType stored on the row. Use ResolveAnime / ResolveManga
// for the typed variants below rather than passing kind by hand.
func (r *MappingResolver) ResolveAnime(ctx context.Context, db SourceDB, cli MappingFetcher, kitsuID string) (*models.KitsuIDMapping, error) {
	return r.resolve(ctx, db, cli, kitsuID, "anime", func(ctx context.Context, id string) ([]kitsu.Mapping, error) {
		return cli.GetAnimeMappings(ctx, id)
	}, func(ctx context.Context, id string) (slug, title string, err error) {
		a, e := cli.GetAnimeByID(ctx, id)
		if e != nil {
			return "", "", e
		}
		if a == nil {
			return "", "", errors.New("nil anime")
		}
		return a.Attributes.Slug, a.Attributes.CanonicalTitle, nil
	})
}

// ResolveManga is the manga counterpart to ResolveAnime.
func (r *MappingResolver) ResolveManga(ctx context.Context, db SourceDB, cli MappingFetcher, kitsuID string) (*models.KitsuIDMapping, error) {
	return r.resolve(ctx, db, cli, kitsuID, "manga", func(ctx context.Context, id string) ([]kitsu.Mapping, error) {
		return cli.GetMangaMappings(ctx, id)
	}, func(ctx context.Context, id string) (slug, title string, err error) {
		m, e := cli.GetMangaByID(ctx, id)
		if e != nil {
			return "", "", e
		}
		if m == nil {
			return "", "", errors.New("nil manga")
		}
		return m.Attributes.Slug, m.Attributes.CanonicalTitle, nil
	})
}

// resolve is the shared body for ResolveAnime / ResolveManga. The two callers differ in which
// Kitsu endpoint to call (`mappingFetcher`) and where to read the slug+title from (`mediaFetcher`).
func (r *MappingResolver) resolve(
	ctx context.Context,
	db SourceDB,
	cli MappingFetcher,
	kitsuID string,
	mediaType string,
	mappingFetcher func(ctx context.Context, id string) ([]kitsu.Mapping, error),
	mediaFetcher func(ctx context.Context, id string) (slug, title string, err error),
) (*models.KitsuIDMapping, error) {
	if kitsuID == "" {
		return nil, errors.New("mapping_resolver: empty Kitsu id")
	}
	if db == nil {
		return nil, errors.New("mapping_resolver: database not attached")
	}
	if cli == nil {
		return nil, errors.New("mapping_resolver: client not attached")
	}

	row, err := db.GetKitsuMappingByKitsuID(kitsuID)
	if err != nil {
		return nil, err
	}
	if row != nil && (row.AnilistID > 0 || row.MalID > 0) {
		// Already resolved — write to in-memory cache and skip the network.
		r.remember(kitsuID, row)
		return row, nil
	}

	// Cache miss — fetch from Kitsu. The endpoints below can be slow individually. We piggyback
	// the hash-basics collection work by grabbing the media item's slug+title in the same call.
	slug, title, err := mediaFetcher(ctx, kitsuID)
	if err != nil {
		return nil, err
	}

	mappings, err := mappingFetcher(ctx, kitsuID)
	if err != nil {
		return nil, err
	}

	row = &models.KitsuIDMapping{
		KitsuID:        kitsuID,
		KitsuSlug:      slug,
		CanonicalTitle: title,
		MediaType:      mediaType,
		LastResolvedAt: modelTimeNow(),
	}
	for _, m := range mappings {
		extID := m.Attributes.ExternalID
		if extID == "" {
			continue
		}
		switch m.Attributes.ExternalSite {
		case kitsu.ExternalSiteAniListAnime, kitsu.ExternalSiteAniListManga:
			if v, e := strconv.Atoi(extID); e == nil {
				row.AnilistID = v
			}
		case kitsu.ExternalSiteMALAnime, kitsu.ExternalSiteMALManga:
			if v, e := strconv.Atoi(extID); e == nil {
				row.MalID = v
			}
		}
	}

	if row.AnilistID == 0 && row.MalID == 0 && row.CanonicalTitle == "" {
		// Kitsu returned nothing useful — record the slug so we know not to re-query for a few hours.
		// We still cache this locally so a 1000-entry library doesn't hammer the API.
		r.remember(kitsuID, row)
		return nil, nil
	}

	saved, err := db.UpsertKitsuIDMapping(row)
	if err != nil {
		return nil, err
	}
	r.remember(kitsuID, saved)
	return saved, nil
}

func (r *MappingResolver) remember(kitsuID string, row *models.KitsuIDMapping) {
	if row == nil {
		return
	}
	r.mu.Lock()
	r.hit[kitsuID] = mappingCacheRow{
		AnilistID: row.AnilistID,
		MalID:     row.MalID,
		Slug:      row.KitsuSlug,
		Title:     row.CanonicalTitle,
	}
	r.mu.Unlock()
}

// modelTimeNow is a package-level indirection for tests. Production uses time.Now; tests can
// rewrite it via SetClock.
var modelTimeNow = func() time.Time { return time.Now() }

// SetClock lets tests install a deterministic clock without affecting time.Time fields outside
// of our model layers.
func (r *MappingResolver) SetClock(now func() time.Time) {
	if now == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clock = now
	modelTimeNow = now
}
