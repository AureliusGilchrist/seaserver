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
// when to stop branching or it never will. What it counts is franchises, not anime, and it counts
// only the *branching*: a franchise already taken on is completed in full, however many entries that
// turns out to be. See the cap check in drainFrontier — a family edge is never refused, whatever the
// count is at.
//
// That is what makes the number smaller than it looks. A franchise is one slot whether it is a
// single film or a fifteen-entry saga with every OVA and side story, so the item count a run
// produces is a multiple of this and not a bound on it.
//
// To say the important half plainly: this caps how far a run branches *outward* into franchises it
// has not seen. It is not a cap on anime, and it is emphatically not a cap on a family. Once a
// franchise is taken on it is followed to its ends — every sequel, prequel, side story, OVA and
// spin-off — however many entries that turns out to be, and a family edge is never refused for
// being over the count. See the cap check in drainFrontier.
//
// The queue survives restarts and resumes on its own, so this is about how much is worth having
// waiting for you rather than about what a run can finish in one go.
const MaxFamiliesPerRun = 750

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
	TotalSeeders int `json:"totalSeeders"`
	// AiredAt is the entry's place in its franchise's running order — year*10 + season index, or 0
	// when unknown. The queue sorts a family by it so a franchise reads as the story ran.
	AiredAt int `json:"airedAt"`
	// RelationType and ParentMediaID are how this entry relates to the one it was discovered from.
	// The queue screen indents by them. Empty for anything walked before they were recorded.
	RelationType  string    `json:"relationType,omitempty"`
	ParentMediaID int       `json:"parentMediaId,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	Snapshot      *Snapshot `json:"snapshot,omitempty"`
	// DownloadState is what has already happened to this anime outside the queue: "downloading",
	// "downloaded", "matched", or empty for one nothing has been done with yet.
	//
	// These used to be removed from the queue outright, which loses something worth keeping: the
	// queue is a record of a walk, and an entry vanishing because you dealt with it is indistinguish-
	// able from one that was never found. So they stay, and the screen greys them out — visible,
	// still countable as part of their franchise, but not something you can pick a torrent for. The
	// only actions left on one are skip and ignore, which are ways of saying "I am done with this".
	DownloadState string `json:"downloadState,omitempty"`
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
	// PendingRoots is how many anime are queued behind this run, each waiting to be walked in turn.
	PendingRoots int `json:"pendingRoots,omitempty"`
	// PendingRootList is that queue itself, in the order it will be walked — so the screen can show
	// what is coming rather than only how much of it there is.
	PendingRootList []PendingRootInfo `json:"pendingRootList,omitempty"`
	// RewalkBacklog is how many franchises are queued to be walked again. Kept apart from the list
	// above because it is a different kind of instruction: hundreds of automatic entries would bury
	// the handful you chose by hand. It is only drawn from when that list is empty.
	RewalkBacklog int `json:"rewalkBacklog,omitempty"`
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
