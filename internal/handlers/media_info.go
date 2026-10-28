package handlers

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"time"

	"seanime/internal/api/anilist"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/singleflight"
)

// Details-page data the generated AniList queries don't carry: the whole franchise of a media, and
// the metadata the details pages show beyond the base fields (source, favourites, links, staff…).
// Both go through the same gate and pacer as every other AniList request (CustomQueryCtx), in the
// background lane, so a details page never holds up anything the user is waiting on elsewhere.

const (
	familyCacheTTL = 24 * time.Hour
	familyMaxNodes = 150
	infoCacheTTL   = 6 * time.Hour
)

type familyCacheEntry struct {
	graph *anilist.FamilyGraph
	at    time.Time
}

var (
	familyMu     sync.Mutex
	familyCache  = map[int]*familyCacheEntry{} // every member id → its franchise
	familyFlight singleflight.Group

	infoMu     sync.Mutex
	infoCache  = map[int]*infoCacheEntry{}
	infoFlight singleflight.Group
)

type infoCacheEntry struct {
	data json.RawMessage
	at   time.Time
}

const familyNodeFields = `
	id type format status isAdult meanScore episodes chapters season seasonYear bannerImage
	title { userPreferred romaji english native }
	coverImage { extraLarge large medium color }
	startDate { year month day }
	relations { edges { relationType(version: 2) node { id } } }
`

// MediaFamilyResponse is the franchise of a media as seen from it.
type MediaFamilyResponse struct {
	Members   []*anilist.FamilyMember `json:"members"`
	Truncated bool                    `json:"truncated"`
}

// HandleGetMediaFamily
//
//	@summary returns every media in the franchise of a media, oldest first.
//	@desc Walks the relation graph (all relations but CHARACTER) breadth first, up to 150 media.
//	@desc Each member says how the requested media relates to it, directly or through the walk.
//	@returns handlers.MediaFamilyResponse
//	@param id - int - true - "The AniList media ID"
//	@route /api/v1/anilist/media/{id}/family [GET]
func (h *Handler) HandleGetMediaFamily(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return h.RespondWithError(c, errors.New("invalid media id"))
	}

	familyMu.Lock()
	cached := familyCache[id]
	familyMu.Unlock()
	if cached != nil && time.Since(cached.at) < familyCacheTTL {
		return h.RespondWithData(c, MediaFamilyResponse{Members: cached.graph.MembersFrom(id), Truncated: cached.graph.Truncated})
	}

	// Detached from the request: a walk that has started is worth finishing even if this page is
	// left, since the next visit to any member of the franchise reads it from the cache.
	ch := familyFlight.DoChan(strconv.Itoa(id), func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		graph, err := anilist.WalkMediaFamily(ctx, id, familyMaxNodes, h.fetchFamilyNodes)
		if err != nil {
			return nil, err
		}
		entry := &familyCacheEntry{graph: graph, at: time.Now()}
		familyMu.Lock()
		for memberID := range graph.Nodes {
			familyCache[memberID] = entry
		}
		familyMu.Unlock()
		return graph, nil
	})

	select {
	case res := <-ch:
		if res.Err != nil {
			return h.RespondWithError(c, res.Err)
		}
		graph := res.Val.(*anilist.FamilyGraph)
		return h.RespondWithData(c, MediaFamilyResponse{Members: graph.MembersFrom(id), Truncated: graph.Truncated})
	case <-c.Request().Context().Done():
		return c.Request().Context().Err()
	}
}

func (h *Handler) fetchFamilyNodes(ctx context.Context, ids []int) ([]*anilist.FamilyNode, error) {
	body, err := json.Marshal(map[string]any{
		"query":     `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ` + familyNodeFields + ` } } }`,
		"variables": map[string]any{"ids": ids},
	})
	if err != nil {
		return nil, err
	}
	data, err := anilist.CustomQueryCtx(ctx, body, h.App.Logger)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Page struct {
			Media []*anilist.FamilyNode `json:"media"`
		} `json:"Page"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	return parsed.Page.Media, nil
}

const mediaInfoQuery = `query ($id: Int) { Media(id: $id) {
	id idMal type format status source(version: 3) favourites hashtag trending popularity averageScore meanScore
	episodes duration chapters volumes countryOfOrigin isAdult isLicensed synonyms season seasonYear siteUrl
	startDate { year month day } endDate { year month day }
	externalLinks { id site url type icon color language }
	studios { edges { isMain node { id name isAnimationStudio siteUrl } } }
	staff(perPage: 16, sort: [RELEVANCE]) { edges { role node { id name { full native } image { medium } siteUrl } } }
	rankings { id rank type allTime season year context format }
	tags { id name rank category isMediaSpoiler isGeneralSpoiler }
	trailer { id site thumbnail }
	nextAiringEpisode { episode airingAt timeUntilAiring }
	stats { statusDistribution { status amount } scoreDistribution { score amount } }
} }`

// HandleGetMediaInfo
//
//	@summary returns the extended AniList metadata shown on a details page.
//	@desc Source, favourites, hashtag, trending, external links, studios, staff with images, every
//	@desc ranking, tags, status and score distributions. Anime and manga alike. Cached for 6 hours.
//	@returns any
//	@param id - int - true - "The AniList media ID"
//	@route /api/v1/anilist/media/{id}/info [GET]
func (h *Handler) HandleGetMediaInfo(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return h.RespondWithError(c, errors.New("invalid media id"))
	}

	infoMu.Lock()
	cached := infoCache[id]
	infoMu.Unlock()
	if cached != nil && time.Since(cached.at) < infoCacheTTL {
		return h.RespondWithData(c, cached.data)
	}

	ch := infoFlight.DoChan(strconv.Itoa(id), func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		body, err := json.Marshal(map[string]any{"query": mediaInfoQuery, "variables": map[string]any{"id": id}})
		if err != nil {
			return nil, err
		}
		data, err := anilist.CustomQueryCtx(ctx, body, h.App.Logger)
		if err != nil {
			return nil, err
		}
		m, _ := data.(map[string]any)
		raw, err := json.Marshal(m["Media"])
		if err != nil {
			return nil, err
		}
		infoMu.Lock()
		infoCache[id] = &infoCacheEntry{data: raw, at: time.Now()}
		infoMu.Unlock()
		return json.RawMessage(raw), nil
	})

	select {
	case res := <-ch:
		if res.Err != nil {
			// A stale copy beats an error on a page that only decorates with this.
			if cached != nil {
				return h.RespondWithData(c, cached.data)
			}
			return h.RespondWithError(c, res.Err)
		}
		return h.RespondWithData(c, res.Val)
	case <-c.Request().Context().Done():
		return c.Request().Context().Err()
	}
}
