package kitsu_platform

import (
	"context"
	"sync"
	"time"

	"seanime/internal/api/kitsu"
	"seanime/internal/database/models"
)

// MappingPopulator is the surface a host application hands to the platform so that library
// fetches can resolve Kitsu<<->>AniList entries on demand and persist them via upsert. Decoupled
// from `*db.Database` so this package doesn't have to import the database package directly.
type MappingPopulator interface {
	ResolveAnime(ctx context.Context, kitsuID string) (*models.KitsuIDMapping, error)
	ResolveManga(ctx context.Context, kitsuID string) (*models.KitsuIDMapping, error)
}

// MappingSource ties a *kitsu.Client to a SourceDB and a MappingResolver helper. The host app
// constructs this once at App init and passes it to the KitsuPlatform via SetMappingSource.
//
// Constructing the MappingResolver inline keeps the platform package self-contained; the host
// does not need to know about it.
type MappingSource struct {
	DB       SourceDB
	Client   *kitsu.Client
	Resolver *MappingResolver
}

// SetMappingSource attaches the source on the platform; subsequent library fetches trigger
// resolution for any entry whose KitsuID lacks a stored mapping. Calling it once is enough; the
// caller is responsible for not concurrently setting the source.
func (p *KitsuPlatform) SetMappingSource(src *MappingSource) {
	if p == nil {
		return
	}
	p.mappingSrc = src
}

// ResolveLibraryMappings walks a slice of platform LibraryEntry and resolves the mapping for each
// unique MediaID. The actual network and DB work is done by the configured MappingSource —
// passing nil here is a no-op (returns immediately).
//
// Returned errors are aggregated so a single broken Kitsu id does not collapse the whole batch.
// The first non-nil error wins because callers only log.
func (p *KitsuPlatform) ResolveLibraryMappings(ctx context.Context, entries []LibraryEntry, kind string) (int, error) {
	if p == nil || p.mappingSrc == nil || p.mappingSrc.Resolver == nil {
		return 0, nil
	}
	resolver := p.mappingSrc.Resolver
	var (
		wg   sync.WaitGroup
		mu   sync.Mutex
		done int
		err  error
	)
	seen := make(map[string]struct{})
	for _, e := range entries {
		if e.MediaID <= 0 {
			continue
		}
		kid := itoa(e.MediaID)
		if _, ok := seen[kid]; ok {
			continue
		}
		seen[kid] = struct{}{}
		wg.Add(1)
		go func(kitsuID string, kind string) {
			defer wg.Done()
			defer func() { _ = recover() }()
			// Hard budget per call: keep a flaky network from stalling the goroutine forever. We
			// proceed background-only; callers don't want a single bad id to break the batch.
			cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
			defer cancel()
			var (
				m   *models.KitsuIDMapping
				berr error
			)
			if kind == "manga" {
				m, berr = resolver.ResolveManga(cctx, p.mappingSrc.DB, p.mappingSrc.Client, kitsuID)
			} else {
				m, berr = resolver.ResolveAnime(cctx, p.mappingSrc.DB, p.mappingSrc.Client, kitsuID)
			}
			mu.Lock()
			defer mu.Unlock()
			if m != nil {
				done++
			}
			if berr != nil && err == nil {
				err = berr
			}
		}(kid, kind)
	}
	wg.Wait()
	return done, err
}

// itoa is a tiny no-allocation ascii integer formatter for the small cache keys we use here.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
