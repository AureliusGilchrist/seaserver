package kitsu_platform

import (
	"context"
	"errors"
	"strconv"

	"seanime/internal/api/anilist"
)

// ToAnilistBaseAnime builds an `anilist.BaseAnime` from a Kitsu library entry.
//
// AniListID is filled from the KitsuIDMapping table when a mapping has been resolved already. The
// title fields are populated from the supplied raw title (caller knows the lib-entry media); the
// rest of the struct is left nil because AutoDownloader and EnMasse only branch on Title and ID.
//
// Returns `(nil, nil)` when kitsuID is empty; that is not an error, just a no-op for callers that
// filter by raw id afterwards.
func ToAnilistBaseAnime(kitsuID string, rawTitle string, episodes int) *anilist.BaseAnime {
	if kitsuID == "" {
		return nil
	}
	snap := lookupKitsuMapping(kitsuID)
	if snap.AnilistID == 0 {
		// No mapping yet — don't emit a stub that would mislead AutoDownloader's logic downstream.
		return nil
	}
	title := rawTitle
	if title == "" {
		title = snap.CanonicalTitle
	}
	base := &anilist.BaseAnime{
		ID:       snap.AnilistID,
		Episodes: ptrInt(episodes),
		Title: &anilist.BaseAnime_Title{
			UserPreferred: ptrStr(title),
			English:       ptrStr(title),
			Romaji:        ptrStr(title),
		},
	}
	if snap.KitsuSlug != "" {
		base.SiteURL = ptrStr("https://kitsu.app/anime/" + snap.KitsuSlug)
	}
	return base
}

// ConvertLibraryToAnilistList walks a Kitsu library collection and emits AniList-shaped entries.
// Empty entries (no resolved mapping) are skipped. The returned list is not deduplicated beyond
// the per-AniList-id uniqueness check, since the AutoDownloader downstream already runs its own
// dedup pass.
func ConvertLibraryToAnilistList(ctx context.Context, p *KitsuPlatform) ([]*anilist.BaseAnime, error) {
	if p == nil {
		return nil, errors.New("kitsu_to_anilist: nil platform")
	}
	entries, err := p.GetAnimeCollection(ctx, true)
	if err != nil {
		return nil, err
	}
	out := make([]*anilist.BaseAnime, 0, len(entries))
	seen := make(map[int]struct{})
	for _, e := range entries {
		anime := ToAnilistBaseAnime(strconv.Itoa(e.MediaID), "", 0)
		if anime == nil {
			continue
		}
		if _, dup := seen[anime.ID]; dup {
			continue
		}
		seen[anime.ID] = struct{}{}
		out = append(out, anime)
	}
	return out, nil
}

// MappingSnapshot is the minimal view of KitsuIDMapping this package needs. Decoupled from the
// gorm model so it can be produced cheaply from a function variable installed at startup.
type MappingSnapshot struct {
	AnilistID      int
	KitsuSlug      string
	CanonicalTitle string
}

// lookupKitsuMapping is a package-level indirection. The host installs a real lookup at startup
// (InstallMappingLookup); without one the conversion is a no-op for unmapped IDs.
var lookupKitsuMapping = func(kitsuID string) MappingSnapshot {
	return MappingSnapshot{}
}

// InstallMappingLookup wires a real function that resolves Kitsu mappings. Pass nil to restore the
// no-op default. The function must be safe for concurrent use — installed lookups run from a
// per-entry goroutine while the library page is being converted.
func InstallMappingLookup(fn func(kitsuID string) MappingSnapshot) {
	if fn == nil {
		lookupKitsuMapping = func(string) MappingSnapshot { return MappingSnapshot{} }
		return
	}
	lookupKitsuMapping = fn
}

func ptrInt(v int) *int { return &v }

func ptrStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
