package achievement

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// MediaExtras is what the list query does not carry and a third of the achievements need: who made
// a series, where it came from, what it is related to, and how it ranks.
//
// Fetched in small batches on the background lane (it never competes with anything a person is
// waiting on), kept on disk and shared by every profile — a series' studio is the same whoever
// watched it. Refetched after extrasMaxAge, since popularity and rankings move.
type MediaExtras struct {
	FetchedAt   int64      `json:"fetchedAt"`
	Popularity  int        `json:"popularity"`
	Favourites  int        `json:"favourites"`
	Source      string     `json:"source"`
	Studios     []int      `json:"studios"`
	Staff       []staffRef `json:"staff"`
	VoiceActors []int      `json:"voiceActors"`
	Relations   []relation `json:"relations"`
	// PopularRank and RatedRank are the all-time ranks (0 = outside AniList's lists).
	PopularRank int `json:"popularRank"`
	RatedRank   int `json:"ratedRank"`
}

type staffRef struct {
	ID   int    `json:"id"`
	Role string `json:"role"`
}

type relation struct {
	Type   string `json:"type"` // SEQUEL, PREQUEL, SIDE_STORY, ADAPTATION, SOURCE, …
	ID     int    `json:"id"`
	Anime  bool   `json:"anime"`
	Format string `json:"format"`
}

const (
	extrasMaxAge    = 14 * 24 * time.Hour
	extrasBatchSize = 10
)

// ExtrasQueryFunc runs a raw GraphQL request (the AniList client's CustomQueryCtx, on a background
// context) and returns the decoded "data" object.
type ExtrasQueryFunc func(ctx context.Context, body []byte) (interface{}, error)

// ExtrasCache holds MediaExtras by media id and fills the gaps in the background.
type ExtrasCache struct {
	mu      sync.Mutex
	path    string
	items   map[int]*MediaExtras
	pending map[int]bool
	running bool
	// failedAt holds off retries for a while after a failed batch.
	failedAt time.Time
	query    ExtrasQueryFunc
	logger   *zerolog.Logger
	// onFilled is called after a batch lands, so profiles can be re-evaluated with the new data.
	onFilled func()
}

func NewExtrasCache(dir string, query ExtrasQueryFunc, logger *zerolog.Logger) *ExtrasCache {
	c := &ExtrasCache{
		items:   map[int]*MediaExtras{},
		pending: map[int]bool{},
		query:   query,
		logger:  logger,
	}
	if dir != "" {
		c.path = filepath.Join(dir, "achievement_media_extras.json")
		if b, err := os.ReadFile(c.path); err == nil {
			_ = json.Unmarshal(b, &c.items)
		}
	}
	return c
}

// Get returns what is known for these ids right now, and queues the missing or stale ones.
func (c *ExtrasCache) Get(ids []int) map[int]*MediaExtras {
	if c == nil {
		return map[int]*MediaExtras{}
	}
	c.mu.Lock()
	out := make(map[int]*MediaExtras, len(ids))
	stale := time.Now().Add(-extrasMaxAge).Unix()
	queued := false
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if ex, ok := c.items[id]; ok {
			out[id] = ex
			if ex.FetchedAt >= stale {
				continue
			}
		}
		if !c.pending[id] {
			c.pending[id] = true
			queued = true
		}
	}
	_ = queued
	start := len(c.pending) > 0 && !c.running && c.query != nil && time.Since(c.failedAt) > 2*time.Minute
	if start {
		c.running = true
	}
	c.mu.Unlock()
	if start {
		go c.fill()
	}
	return out
}

func (c *ExtrasCache) fill() {
	defer func() {
		c.mu.Lock()
		c.running = false
		c.mu.Unlock()
	}()
	for {
		c.mu.Lock()
		batch := make([]int, 0, extrasBatchSize)
		for id := range c.pending {
			batch = append(batch, id)
			if len(batch) == extrasBatchSize {
				break
			}
		}
		c.mu.Unlock()
		if len(batch) == 0 {
			return
		}

		got, err := c.fetch(batch)
		c.mu.Lock()
		if err != nil {
			c.failedAt = time.Now()
			c.mu.Unlock()
			if c.logger != nil {
				c.logger.Debug().Err(err).Int("count", len(batch)).Msg("achievement: Could not fetch media extras, will retry later")
			}
			// Leave them queued and stop; the next Get starts again.
			return
		}
		now := time.Now().Unix()
		for _, id := range batch {
			delete(c.pending, id)
			if ex, ok := got[id]; ok {
				ex.FetchedAt = now
				c.items[id] = ex
			} else {
				// Not on AniList any more: remember that, so it is not asked for again soon.
				c.items[id] = &MediaExtras{FetchedAt: now}
			}
		}
		c.saveLocked()
		cb := c.onFilled
		c.mu.Unlock()
		if cb != nil {
			cb()
		}
	}
}

func (c *ExtrasCache) saveLocked() {
	if c.path == "" {
		return
	}
	b, err := json.Marshal(c.items)
	if err != nil {
		return
	}
	tmp := c.path + ".tmp"
	if os.WriteFile(tmp, b, 0644) == nil {
		_ = os.Rename(tmp, c.path)
	}
}

const extrasQuery = `query ($ids: [Int], $n: Int) {
  Page(page: 1, perPage: $n) {
    media(id_in: $ids) {
      id
      popularity
      favourites
      source
      studios(isMain: true) { nodes { id } }
      staff(perPage: 8, sort: RELEVANCE) { edges { role node { id } } }
      characters(perPage: 4, sort: ROLE) { edges { voiceActors(language: JAPANESE) { id } } }
      relations { edges { relationType node { id type format } } }
      rankings { rank type allTime }
    }
  }
}`

func (c *ExtrasCache) fetch(ids []int) (map[int]*MediaExtras, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"query":     extrasQuery,
		"variables": map[string]interface{}{"ids": ids, "n": len(ids)},
	})
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	data, err := c.query(ctx, body)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Page struct {
			Media []struct {
				ID         int    `json:"id"`
				Popularity int    `json:"popularity"`
				Favourites int    `json:"favourites"`
				Source     string `json:"source"`
				Studios    struct {
					Nodes []struct {
						ID int `json:"id"`
					} `json:"nodes"`
				} `json:"studios"`
				Staff struct {
					Edges []struct {
						Role string `json:"role"`
						Node struct {
							ID int `json:"id"`
						} `json:"node"`
					} `json:"edges"`
				} `json:"staff"`
				Characters struct {
					Edges []struct {
						VoiceActors []struct {
							ID int `json:"id"`
						} `json:"voiceActors"`
					} `json:"edges"`
				} `json:"characters"`
				Relations struct {
					Edges []struct {
						RelationType string `json:"relationType"`
						Node         struct {
							ID     int    `json:"id"`
							Type   string `json:"type"`
							Format string `json:"format"`
						} `json:"node"`
					} `json:"edges"`
				} `json:"relations"`
				Rankings []struct {
					Rank    int    `json:"rank"`
					Type    string `json:"type"`
					AllTime bool   `json:"allTime"`
				} `json:"rankings"`
			} `json:"media"`
		} `json:"Page"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("decode media extras: %w", err)
	}
	out := make(map[int]*MediaExtras, len(parsed.Page.Media))
	for _, m := range parsed.Page.Media {
		ex := &MediaExtras{Popularity: m.Popularity, Favourites: m.Favourites, Source: m.Source}
		for _, s := range m.Studios.Nodes {
			ex.Studios = append(ex.Studios, s.ID)
		}
		for _, e := range m.Staff.Edges {
			ex.Staff = append(ex.Staff, staffRef{ID: e.Node.ID, Role: e.Role})
		}
		seenVA := map[int]bool{}
		for _, e := range m.Characters.Edges {
			for _, va := range e.VoiceActors {
				if !seenVA[va.ID] {
					seenVA[va.ID] = true
					ex.VoiceActors = append(ex.VoiceActors, va.ID)
				}
			}
		}
		for _, e := range m.Relations.Edges {
			ex.Relations = append(ex.Relations, relation{Type: e.RelationType, ID: e.Node.ID, Anime: e.Node.Type == "ANIME", Format: e.Node.Format})
		}
		for _, r := range m.Rankings {
			if !r.AllTime {
				continue
			}
			switch r.Type {
			case "POPULAR":
				ex.PopularRank = r.Rank
			case "RATED":
				ex.RatedRank = r.Rank
			}
		}
		out[m.ID] = ex
	}
	return out, nil
}
