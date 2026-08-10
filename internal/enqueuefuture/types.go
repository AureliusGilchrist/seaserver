package enqueuefuture

import (
	"time"

	"seanime/internal/library/anime"
	"seanime/internal/torrents/torrent"
)

// MaxFamiliesPerRun is how many distinct franchises a single Enqueue Future run will take on before
// it stops branching out into new ones.
//
// The graph is effectively unbounded — every anime recommends eight more — so a run has to be told
// when to stop or it never will. What it counts is franchises, not anime: a show and everything
// AniList relates to it as the same story costs one slot between them, whether that is one entry or
// fifteen. Once a franchise is in, the rest of it comes in free and the cap does not apply, because
// a queue holding seasons 1 and 3 of something is worse than not holding it at all.
//
// The queue survives restarts and resumes on its own, so this is about how much is worth having
// waiting for you rather than about what a run can finish in one go.
const MaxFamiliesPerRun = 350

// RecommendationSpread is how many recommendations are queued between one franchise and the next.
//
// The queue is walked in the order things are inserted, so insertion order is the reading order. Every
// family edge waiting goes in first — the family spread is unbounded, because half a franchise is
// worse than none of it — and then a spread of this many recommendations, over and over: family,
// spread, family, spread. That is what keeps a franchise together and adjacent while still widening
// out into new shows at a steady rate, rather than emptying the entire recommendation ring of one
// anime before the next franchise gets a look in.
const RecommendationSpread = 12

// SearchParams are the torrent search settings a snapshot was produced with.
//
// This is deliberately only the scalars, not the media object: the queue screen compares these
// against what its search UI is currently asking for, to decide whether the stored results still
// answer the question. Media never varies within an item, so including it would only make an
// expensive comparison out of a cheap one.
type SearchParams struct {
	Type           string `json:"type"`
	Provider       string `json:"provider"`
	Query          string `json:"query"`
	EpisodeNumber  int    `json:"episodeNumber"`
	Batch          bool   `json:"batch"`
	AbsoluteOffset int    `json:"absoluteOffset"`
	Resolution     string `json:"resolution"`
	BestRelease    bool   `json:"bestRelease"`
}

// Snapshot is everything the download screen for one queued anime needs, prepared in advance.
//
// It is stored as a JSON blob rather than as columns because none of it is ever queried on — the
// queue looks items up by media ID and hands the whole thing to the frontend untouched.
type Snapshot struct {
	// Entry is the same structure the anime details page is built from, so the download UI behaves
	// identically to opening that page and clicking through by hand — including the episode counts
	// that drive "Download N episodes" and the absolute offset smart search needs.
	Entry *anime.Entry `json:"entry"`
	// SearchData is the torrent search result: names, links, seeders, batch flags, previews.
	SearchData *torrent.SearchData `json:"searchData"`
	// SearchParams is what produced SearchData. The frontend seeds its search cache with SearchData
	// only while its own parameters still match these.
	SearchParams SearchParams `json:"searchParams"`
	ProviderID   string       `json:"providerId"`
	PreparedAt   time.Time    `json:"preparedAt"`
}

// Item is one queue row as the frontend sees it. The snapshot is only present on the single-item
// endpoint; the list endpoint leaves it nil.
type Item struct {
	MediaID     int `json:"mediaId"`
	RootMediaID int `json:"rootMediaId"`
	// FamilyID groups a show with its own sequels and prequels. The queue screen bundles items
	// sharing one rather than listing three seasons of the same show as three unrelated entries.
	FamilyID   int    `json:"familyId"`
	Position   int    `json:"position"`
	Depth      int    `json:"depth"`
	Status     string `json:"status"`
	Attempts   int    `json:"attempts"`
	LastError  string `json:"lastError"`
	Title      string `json:"title"`
	CoverImage string `json:"coverImage"`
	// TotalSeeders is every seeder across every torrent found for this anime, added together — the
	// popularity the queue screen orders itself by. Zero until the item has been prepared.
	TotalSeeders int       `json:"totalSeeders"`
	CreatedAt    time.Time `json:"createdAt"`
	Snapshot     *Snapshot `json:"snapshot,omitempty"`
}

// Status is the progress of a running (or the last) Enqueue Future run.
type Status struct {
	Running bool `json:"running"`
	// Resumable means a run was interrupted and is waiting to be picked back up. The server does
	// that by itself on startup; this covers the case where it was stopped by hand.
	Resumable   bool   `json:"resumable"`
	RootMediaID int    `json:"rootMediaId"`
	RootTitle   string `json:"rootTitle"`
	// Discovered counts everything this run has put in the queue, Prepared how many of those have
	// their snapshot, Failed how many gave up.
	Discovered int `json:"discovered"`
	Prepared   int `json:"prepared"`
	Failed     int `json:"failed"`
	Skipped    int `json:"skipped"`
	// Families is how many distinct franchises are queued, which is what Cap limits — a show and
	// all of its seasons count as one between them.
	Families int `json:"families"`
	Cap      int `json:"cap"`
	// CurrentTitle is the anime being prepared right now, for the progress readout.
	CurrentTitle string `json:"currentTitle"`
	// RateLimited and the fields below describe a run that is parked on the backoff ladder.
	RateLimited     bool      `json:"rateLimited"`
	RetryAt         time.Time `json:"retryAt,omitempty"`
	BackoffRung     int       `json:"backoffRung"`
	BackoffRungs    int       `json:"backoffRungs"`
	BackoffAttempt  int       `json:"backoffAttempt"`
	BackoffAttempts int       `json:"backoffAttempts"`
	LastError       string    `json:"lastError"`
	StartedAt       time.Time `json:"startedAt,omitempty"`
	FinishedAt      time.Time `json:"finishedAt,omitempty"`
}
