// Package synthetic_id is the lightweight indexing layer the user asked for. Anything that needs
// to map a platform-specific identifier (AniList int, Kitsu slug, MAL int) onto a single
// stable internal ID routes through Resolver.
//
// The internal IDs are negative integers: -1, -2, -3, ... — they live well outside AniList's
// positive-id range, so the consumer side never confuses them.
package synthetic_id

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"seanime/internal/database/db"
	"seanime/internal/database/models"
)

// Platform identifies which external naming the caller is using. "Auto" accepts any of them and
// tries to detect from the raw id's shape.
type Platform string

const (
	PlatformAniList Platform = "anilist"
	PlatformKitsu   Platform = "kitsu"
	PlatformMAL     Platform = "mal"
	PlatformAuto    Platform = "auto"
)

// MediaKind is just "anime" or "manga" — duplicates the constant in models to avoid a cycle.
type MediaKind string

const (
	MediaAnime MediaKind = "anime"
	MediaManga MediaKind = "manga"
)

// Resolved is the answer a handler cares about: synthetic id, name, and the cross-platform ids we
// already know about.
type Resolved struct {
	SyntheticID int    `json:"syntheticId"`
	Name        string `json:"name"`
	CoverImage  string `json:"coverImage,omitempty"`
	MediaType   string `json:"mediaType"`
	KitsuID     string `json:"kitsuId"`
	KitsuSlug   string `json:"kitsuSlug"`
	AnilistID   int    `json:"anilistId"`
	MalID       int    `json:"malId"`
	Source      string `json:"source"`
}

// Resolver is the front door. One instance per process — it carries an in-memory LRU on top of
// the SQLite-backed SyntheticIDIndex table so repeat lookups never touch the database.
type Resolver struct {
	DB *db.Database

	mu    sync.RWMutex
	cache map[string]*Resolved // keyed by `${platform}:${raw}`
}

// New constructs an empty resolver. Callers typically keep one on the App struct and call
// SetDatabase once the database handle is allocated.
func New() *Resolver {
	return &Resolver{cache: make(map[string]*Resolved)}
}

// SetDatabase attaches the SQLite-backed database. The resolver reads through the db.Database
// handle rather than a global so callers don't have to depend on the lifespan of `db.Get`.
func (r *Resolver) SetDatabase(d *db.Database) {
	r.DB = d
}

// Resolve fetches the synthetic id, allocating one if the platform id is brand-new.
//
// The platform argument tells us how to interpret `raw`. For "auto" we treat leading digits as
// AniList (positive int) and a leading "kit" or kebab-case string as Kitsu slug.
func (r *Resolver) Resolve(platform Platform, raw string, hintKind MediaKind) (*Resolved, error) {
	if raw == "" {
		return nil, errors.New("synthetic_id: empty raw id")
	}

	if platform == "" {
		platform = PlatformAuto
	}

	key := string(platform) + ":" + raw
	r.mu.RLock()
	if hit, ok := r.cache[key]; ok && hit != nil {
		r.mu.RUnlock()
		return hit, nil
	}
	r.mu.RUnlock()

	res, err := r.resolveFromDB(platform, raw, hintKind)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	r.cache[key] = res
	r.mu.Unlock()
	return res, nil
}

func (r *Resolver) resolveFromDB(platform Platform, raw string, hintKind MediaKind) (*Resolved, error) {
	if r.DB == nil {
		return nil, errors.New("synthetic_id: db not ready")
	}

	// 1. Kitsu slug path: cheap direct lookup.
	if platform == PlatformKitsu || strings.Contains(raw, "-") {
		if m, _ := r.DB.GetSyntheticIDByKitsuSlug(raw); m != nil {
			if hintKind == "" || m.MediaType == "" || m.MediaType == string(hintKind) {
				return rowToResolved(m, "kitsu:"+raw), nil
			}
		}
	}

	// 2. AniList path.
	if platform == PlatformAniList || platform == PlatformAuto {
		if v := parsePositiveInt(raw); v > 0 {
			if m, _ := r.DB.GetSyntheticIDByAnilistID(v); m != nil {
				return rowToResolved(m, "anilist:"+raw), nil
			}
		}
	}

	// Nothing on file — allocate a fresh synthetic id and record the cross-platform link.
	return r.register(platform, raw, hintKind)
}

func (r *Resolver) register(platform Platform, raw string, hintKind MediaKind) (*Resolved, error) {
	if r.DB == nil {
		return nil, errors.New("synthetic_id: db not ready")
	}

	synID, err := r.DB.NextSyntheticID()
	if err != nil {
		return nil, fmt.Errorf("synthetic_id: alloc failed: %w", err)
	}

	row := &models.SyntheticIDIndex{
		SyntheticID: synID,
		MediaType:   string(hintKind),
		Source:      string(platform) + ":" + raw,
	}

	switch platform {
	case PlatformKitsu:
		row.KitsuSlug = raw
	case PlatformAniList:
		row.AnilistID = parsePositiveInt(raw)
	case PlatformMAL:
		row.MalID = parsePositiveInt(raw)
	case PlatformAuto:
		// If raw parses as a positive int, treat as AniList; otherwise as a Kitsu slug.
		if v := parsePositiveInt(raw); v > 0 {
			row.AnilistID = v
		} else {
			row.KitsuSlug = raw
		}
	}

	// Avoid persisting an empty row — the cross-platform id column is what makes the index useful.
	if row.KitsuSlug == "" && row.AnilistID == 0 && row.MalID == 0 {
		return nil, errors.New("synthetic_id: refused to register empty row")
	}

	if _, err := r.DB.UpsertSyntheticIDIndex(row); err != nil {
		return nil, err
	}

	return rowToResolved(row, row.Source), nil
}

// ClearCache wipes the in-memory layer. Used by tests and by the reconciliation job in front of
// a fresh DB scan.
func (r *Resolver) ClearCache() {
	r.mu.Lock()
	r.cache = make(map[string]*Resolved)
	r.mu.Unlock()
}

func parsePositiveInt(s string) int {
	v, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil || v <= 0 {
		return 0
	}
	return v
}

func rowToResolved(m *models.SyntheticIDIndex, source string) *Resolved {
	return &Resolved{
		SyntheticID: m.SyntheticID,
		Name:        m.Name,
		CoverImage:  m.CoverImage,
		MediaType:   m.MediaType,
		KitsuID:     m.KitsuID,
		KitsuSlug:   m.KitsuSlug,
		AnilistID:   m.AnilistID,
		MalID:       m.MalID,
		Source:      source,
	}
}

// Note: timestamps in the index row are not exported over the wire. _ = time.Now keeps the import
// used in case a future revision adds expiry tracking.
var _ = time.Now
