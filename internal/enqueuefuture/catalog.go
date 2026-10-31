package enqueuefuture

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"seanime/internal/api/anilist"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/util"
)

// The graph walk only reaches what recommendations and relations connect to, which leaves most of
// AniList out. The catalog scan queues the rest.
//
// AniList makes this awkward: a Page stops at 5000 entries however it is sorted, and media has no
// id_greater filter to page past that with. What does work is id_in, so the scan walks the ID space
// a window at a time. A window can never reach the cap, IDs are stable, and the next ID to look at
// is the only thing a restart needs to know. IDs are shared with manga, so most of them come back
// as nothing, which is why one request can cover a thousand of them.
//
// Scanning is cheap and fast; preparing what it finds is what takes weeks. Catalog rows therefore
// wait behind everything else: a walk you ask for never touches them, unless it reaches one, and
// the worker only gets to them when nothing you asked for is left. See the root check in run.

const (
	catalogStateFileName = "enqueue-future-catalog.json"
	catalogRootTitle     = "All of AniList"
	catalogWindow        = 1000
	catalogPerPage       = 50
	// catalogRequestInterval keeps the scan to a sliver of the background lane. Around 600 requests
	// cover the whole catalog, so this finishes in five hours and is invisible beside the walk.
	catalogRequestInterval = 30 * time.Second
	// catalogRetryInterval is how long the scan waits after AniList refuses. It holds its place, so
	// a long outage only delays it.
	catalogRetryInterval = 5 * time.Minute
)

// catalogState is the on-disk record of a scan. A file for the same reason the progress file is one:
// it is one number rewritten constantly, and it means nothing once the scan is over.
type catalogState struct {
	// Enabled is whether the scan and the worker should be going. Stopping leaves everything else.
	Enabled   bool      `json:"enabled"`
	NextID    int       `json:"nextId"`
	MaxID     int       `json:"maxId"`
	Queued    int       `json:"queued"`
	Done      bool      `json:"done"`
	LastError string    `json:"lastError,omitempty"`
	StartedAt time.Time `json:"startedAt"`
}

// CatalogStatus is the scan of the whole AniList catalog, as the frontend sees it.
type CatalogStatus struct {
	Active bool `json:"active"`
	// Done means every ID has been looked at; Waiting may still have weeks of work in it.
	Done   bool `json:"done"`
	NextID int  `json:"nextId"`
	MaxID  int  `json:"maxId"`
	// Queued is how many this scan has added, and Waiting how many rows are yet to be prepared.
	Queued    int    `json:"queued"`
	Waiting   int    `json:"waiting"`
	LastError string `json:"lastError,omitempty"`
}

func (r *Repository) catalogStatePath() string {
	return filepath.Join(r.dataDir, catalogStateFileName)
}

func (r *Repository) loadCatalogState() *catalogState {
	if r.dataDir == "" {
		return nil
	}
	data, err := os.ReadFile(r.catalogStatePath())
	if err != nil {
		return nil
	}
	var state catalogState
	if err := json.Unmarshal(data, &state); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Discarding unreadable catalog state")
		return nil
	}
	return &state
}

func (r *Repository) saveCatalogState(state *catalogState) {
	if r.dataDir == "" {
		return
	}
	data, err := json.Marshal(state)
	if err != nil {
		return
	}
	if err := util.WriteFileCrashSafe(r.catalogStatePath(), data, 0o644); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not save the catalog state")
	}
}

func (r *Repository) catalogStatus() *CatalogStatus {
	state := r.loadCatalogState()
	if state == nil {
		return nil
	}
	waiting, _ := r.database.CountPendingEnqueueFutureCatalogItems()
	return &CatalogStatus{
		Active:    state.Enabled,
		Done:      state.Done,
		NextID:    state.NextID,
		MaxID:     state.MaxID,
		Queued:    state.Queued,
		Waiting:   waiting,
		LastError: state.LastError,
	}
}

// StartCatalogWalk starts the scan, carrying on from where a stopped one left off. A finished scan
// starts over, which is how entries added to AniList since are picked up.
func (r *Repository) StartCatalogWalk() {
	r.catalogMu.Lock()
	state := r.loadCatalogState()
	if state == nil || state.Done {
		state = &catalogState{NextID: 1, StartedAt: time.Now()}
	}
	state.Enabled = true
	state.LastError = ""
	r.saveCatalogState(state)
	r.catalogMu.Unlock()

	r.resumeCatalogScan()
}

// StopCatalogWalk stops the scan and takes the worker off catalog rows. Everything queued stays.
func (r *Repository) StopCatalogWalk() {
	r.catalogMu.Lock()
	if state := r.loadCatalogState(); state != nil {
		state.Enabled = false
		r.saveCatalogState(state)
	}
	if r.catalogCancel != nil {
		r.catalogCancel()
	}
	r.catalogMu.Unlock()

	r.mu.Lock()
	onCatalog := r.running && r.status.RootMediaID == db.EnqueueFutureCatalogRootID
	r.mu.Unlock()
	if onCatalog {
		r.Stop()
		r.clearProgress()
	}
}

// resetCatalogWalk forgets the scan altogether, for when the queue it filled is being cleared.
func (r *Repository) resetCatalogWalk() {
	r.StopCatalogWalk()
	if r.dataDir != "" {
		_ = os.Remove(r.catalogStatePath())
	}
}

// resumeCatalogScan starts the scan's goroutine if there is a scan to do and it is not going already.
func (r *Repository) resumeCatalogScan() {
	r.catalogMu.Lock()
	defer r.catalogMu.Unlock()

	state := r.loadCatalogState()
	if state == nil || !state.Enabled || state.Done || r.catalogRunning {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	r.catalogRunning = true
	r.catalogCancel = cancel
	go func() {
		defer util.HandlePanicInModuleThen("enqueuefuture/catalogScan", func() {})
		defer func() {
			r.catalogMu.Lock()
			r.catalogRunning = false
			r.catalogCancel = nil
			r.catalogMu.Unlock()
			cancel()
		}()
		r.catalogScan(ctx)
	}()
}

// catalogScan walks the ID space until it reaches the newest anime on AniList.
func (r *Repository) catalogScan(ctx context.Context) {
	sleep := func(d time.Duration) bool {
		select {
		case <-ctx.Done():
			return false
		case <-time.After(d):
			return true
		}
	}
	// Written under the lock and re-read each time, so a stop that lands mid-window is not undone by
	// this goroutine saving its own older copy over it.
	update := func(fn func(state *catalogState)) bool {
		r.catalogMu.Lock()
		defer r.catalogMu.Unlock()
		state := r.loadCatalogState()
		if state == nil || !state.Enabled {
			return false
		}
		fn(state)
		r.saveCatalogState(state)
		return true
	}
	fail := func(err error) bool {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Catalog scan refused, waiting before trying again")
		update(func(state *catalogState) { state.LastError = err.Error() })
		return sleep(catalogRetryInterval)
	}

	maxID := 0
	for maxID == 0 {
		id, err := r.fetchCatalogMaxID(ctx)
		if err != nil {
			if !fail(err) {
				return
			}
			continue
		}
		maxID = id
	}
	update(func(state *catalogState) { state.MaxID = maxID })

	for {
		state := r.loadCatalogState()
		if state == nil || !state.Enabled {
			return
		}
		if state.NextID > maxID {
			update(func(state *catalogState) { state.Done = true })
			r.logger.Info().Int("queued", state.Queued).Msg("enqueuefuture: Catalog scan finished")
			r.ensureCatalogRun()
			return
		}

		queued := 0
		for page := 1; ; {
			if !sleep(catalogRequestInterval) {
				return
			}
			media, hasNext, err := r.fetchCatalogWindow(ctx, state.NextID, page)
			if err != nil {
				if ctx.Err() != nil || !fail(err) {
					return
				}
				continue
			}
			for _, m := range media {
				if r.queueCatalogMedia(m) {
					queued++
				}
			}
			if !hasNext {
				break
			}
			page++
		}

		// Only once the whole window is in: a restart repeats at most this one, and a row that is
		// already queued is passed over.
		update(func(state *catalogState) {
			state.NextID += catalogWindow
			state.Queued += queued
			state.LastError = ""
		})
		r.ensureCatalogRun()
	}
}

// queueCatalogMedia puts one anime on the queue, applying the same filters as the walk. Family rules
// apply to the skip, so an anime you already own still appears, greyed out, instead of going missing.
func (r *Repository) queueCatalogMedia(m catalogMedia) bool {
	if !isAnime(m.Type, m.Format) {
		return false
	}
	title := m.title()
	episodes := 0
	if m.Episodes != nil {
		episodes = *m.Episodes
	}
	if rejectReason(title, m.Format, episodes, m.Status) != "" {
		return false
	}
	if r.database.HasEnqueueFutureDroppedItem(m.ID) {
		return false
	}
	if skip, _ := r.shouldSkip(recommendation{mediaID: m.ID, title: title, episodes: episodes, isFamily: true}); skip {
		return false
	}

	inserted, err := r.database.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
		MediaID:     m.ID,
		RootMediaID: db.EnqueueFutureCatalogRootID,
		FamilyID:    m.ID,
		Status:      db.EnqueueFutureStatusPending,
		Title:       title,
	})
	return err == nil && inserted
}

// ensureCatalogRun gives the worker to the catalog if it is on, has rows waiting and nothing else
// wants the worker. A saved progress record means something else does, and the supervisor resumes it.
func (r *Repository) ensureCatalogRun() {
	state := r.loadCatalogState()
	if state == nil || !state.Enabled || r.CanResume() || r.PendingRootCount() > 0 || r.RewalkBacklogCount() > 0 {
		return
	}
	if waiting, err := r.database.CountPendingEnqueueFutureCatalogItems(); err != nil || waiting == 0 {
		return
	}

	r.mu.Lock()
	running := r.running
	r.mu.Unlock()
	if running {
		return
	}

	if _, err := r.start(&RunProgress{
		RootMediaID: db.EnqueueFutureCatalogRootID,
		RootTitle:   catalogRootTitle,
		RootWalked:  true,
		Depths:      map[int]int{},
		StartedAt:   time.Now(),
	}); err != nil {
		r.logger.Debug().Err(err).Msg("enqueuefuture: Could not start preparing the catalog")
	}
}

// catalogMedia is the little the scan needs to know about an anime.
type catalogMedia struct {
	ID       int                  `json:"id"`
	Type     *anilist.MediaType   `json:"type"`
	Format   *anilist.MediaFormat `json:"format"`
	Status   *anilist.MediaStatus `json:"status"`
	Episodes *int                 `json:"episodes"`
	Title    struct {
		English *string `json:"english"`
		Romaji  *string `json:"romaji"`
	} `json:"title"`
}

func (m catalogMedia) title() string {
	if m.Title.English != nil && *m.Title.English != "" {
		return *m.Title.English
	}
	if m.Title.Romaji != nil {
		return *m.Title.Romaji
	}
	return ""
}

const catalogWindowQuery = `query ($ids: [Int], $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, id_in: $ids, sort: ID) {
      id type format status episodes
      title { english romaji }
    }
  }
}`

const catalogMaxIDQuery = `query {
  Page(page: 1, perPage: 1) {
    media(type: ANIME, sort: ID_DESC) { id }
  }
}`

type catalogPage struct {
	Page struct {
		PageInfo struct {
			HasNextPage bool `json:"hasNextPage"`
		} `json:"pageInfo"`
		Media []catalogMedia `json:"media"`
	} `json:"Page"`
}

// catalogQuery goes through CustomQueryCtx, so every request takes its slot in the background lane.
// No token: the catalog is public, and it is the same for every profile.
func (r *Repository) catalogQuery(ctx context.Context, query string, variables map[string]any) (*catalogPage, error) {
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return nil, err
	}
	data, err := anilist.CustomQueryCtx(ctx, body, r.logger)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	var page catalogPage
	if err := json.Unmarshal(encoded, &page); err != nil {
		return nil, err
	}
	return &page, nil
}

func (r *Repository) fetchCatalogMaxID(ctx context.Context) (int, error) {
	page, err := r.catalogQuery(ctx, catalogMaxIDQuery, nil)
	if err != nil {
		return 0, err
	}
	if len(page.Page.Media) == 0 {
		return 0, nil
	}
	return page.Page.Media[0].ID, nil
}

func catalogWindowIDs(start int) []int {
	ids := make([]int, catalogWindow)
	for i := range ids {
		ids[i] = start + i
	}
	return ids
}

func (r *Repository) fetchCatalogWindow(ctx context.Context, start int, page int) ([]catalogMedia, bool, error) {
	res, err := r.catalogQuery(ctx, catalogWindowQuery, map[string]any{
		"ids":     catalogWindowIDs(start),
		"page":    page,
		"perPage": catalogPerPage,
	})
	if err != nil {
		return nil, false, err
	}
	return res.Page.Media, res.Page.PageInfo.HasNextPage, nil
}

const seaDexDropsRequeuedFileName = "enqueue-future-seadex-drops-requeued"

// requeueSeaDexDropsOnce gives one more chance to everything dropped while SeaDex was the only
// search. Those records say nothing about whether an anime can be downloaded, only that it is not on
// a curated list. Waits until a fallback provider is really there: extensions load after startup.
func (r *Repository) requeueSeaDexDropsOnce() {
	if r.dataDir == "" {
		return
	}
	marker := filepath.Join(r.dataDir, seaDexDropsRequeuedFileName)
	if _, err := os.Stat(marker); err == nil {
		return
	}
	if _, ok := r.fallbackQueueProvider(preferredQueueProvider); !ok {
		return
	}

	records, err := r.database.GetEnqueueFutureDroppedItems()
	if err != nil {
		return
	}

	requeued := 0
	for _, record := range records {
		if record.Torrents > 0 || record.ProviderID != preferredQueueProvider {
			continue
		}
		if _, err := r.database.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID:     record.ProfileID,
			MediaID:       record.MediaID,
			RootMediaID:   record.RootMediaID,
			FamilyID:      record.FamilyID,
			Depth:         record.Depth,
			Status:        db.EnqueueFutureStatusPending,
			Title:         record.Title,
			CoverImage:    record.CoverImage,
			RelationType:  record.RelationType,
			ParentMediaID: record.ParentMediaID,
		}); err != nil {
			continue
		}
		_ = r.database.DeleteEnqueueFutureDroppedItem(record.MediaID)
		requeued++
	}

	_ = os.WriteFile(marker, []byte(time.Now().Format(time.RFC3339)), 0o644)
	if requeued > 0 {
		r.logger.Info().Int("requeued", requeued).Msg("enqueuefuture: Requeued anime dropped while SeaDex was the only search")
		go r.startNextPendingRoot()
	}
}
