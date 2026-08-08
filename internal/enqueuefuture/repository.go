package enqueuefuture

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"seanime/internal/api/anilist"
	"seanime/internal/api/metadata_provider"
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"seanime/internal/events"
	"seanime/internal/platforms/platform"
	"seanime/internal/torrents/torrent"
	"seanime/internal/util"
	"seanime/internal/util/limiter"
)

// RateWindow and RateBurst set the pace of a run: RateBurst entries may go through in any
// RateWindow, which works out to a sustained 20 entries per minute with a burst of 10.
//
// The numbers are chosen against AniList's budget, not against how fast the queue could be filled.
// Each entry costs about two AniList requests (the details that also yield the next ring of
// recommendations, plus building the entry), so 20 entries/minute is ~40 requests/minute against a
// budget of about 90 — comfortably under, with room left for whatever you are doing in the app while
// this runs in the background.
//
// The burst is what makes short runs feel instant: enqueue one page's eight recommendations and all
// eight are prepared almost at once. Only a long recursive run ever settles to the sustained rate.
// Pushing harder is counterproductive — past the budget the backoff ladder stops being a safety
// valve and becomes the main loop, and the run finishes later than a polite one would while
// degrading everything else that talks to AniList.
const (
	RateWindow = 30 * time.Second
	RateBurst  = 10
)

type (
	// Repository owns the Enqueue Future queue and the single background worker that fills it.
	Repository struct {
		logger              *zerolog.Logger
		database            *db.Database
		platformRef         *util.Ref[platform.Platform]
		metadataProviderRef *util.Ref[metadata_provider.Provider]
		torrentRepository   *torrent.Repository
		wsEventManager      events.WSEventManagerInterface
		dataDir             string

		// Late-bound accessors, so the repository does not have to reach back into the app.
		animeCollectionFunc func() (*anilist.AnimeCollection, error)
		defaultProviderFunc func() string
		isSimulatedFunc     func() bool

		limiter *limiter.Limiter

		mu      sync.Mutex
		status  Status
		running bool
		cancel  context.CancelFunc
	}

	NewRepositoryOptions struct {
		Logger              *zerolog.Logger
		Database            *db.Database
		PlatformRef         *util.Ref[platform.Platform]
		MetadataProviderRef *util.Ref[metadata_provider.Provider]
		TorrentRepository   *torrent.Repository
		WSEventManager      events.WSEventManagerInterface
		// DataDir is where the progress file lives, so an interrupted run can be picked back up.
		DataDir             string
		AnimeCollectionFunc func() (*anilist.AnimeCollection, error)
		DefaultProviderFunc func() string
		IsSimulatedFunc     func() bool
	}
)

func NewRepository(opts *NewRepositoryOptions) *Repository {
	return &Repository{
		logger:              opts.Logger,
		database:            opts.Database,
		platformRef:         opts.PlatformRef,
		metadataProviderRef: opts.MetadataProviderRef,
		torrentRepository:   opts.TorrentRepository,
		wsEventManager:      opts.WSEventManager,
		dataDir:             opts.DataDir,
		animeCollectionFunc: opts.AnimeCollectionFunc,
		defaultProviderFunc: opts.DefaultProviderFunc,
		isSimulatedFunc:     opts.IsSimulatedFunc,
		limiter:             limiter.NewLimiter(RateWindow, RateBurst),
		status: Status{
			Cap:             MaxItemsPerRun,
			BackoffRungs:    len(backoffLadder),
			BackoffAttempts: MaxBackoffAttempts,
		},
	}
}

// SetTorrentRepository swaps in the torrent repository. It is created after this one and can be
// re-created when the settings change, so it is set rather than passed once.
func (r *Repository) SetTorrentRepository(repo *torrent.Repository) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.torrentRepository = repo
}

// attemptsFor reads back an item's persisted attempt count.
func (r *Repository) attemptsFor(profileID uint, mediaID int) (int, error) {
	item, err := r.database.GetEnqueueFutureItem(profileID, mediaID)
	if err != nil || item == nil {
		return 0, err
	}
	return item.Attempts, nil
}

// ResetStaleItems puts items claimed by a worker that no longer exists back on the queue. Call once
// at startup.
func (r *Repository) ResetStaleItems() {
	if err := r.database.ResetPreparingEnqueueFutureItems(); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to reset stale items")
	}
}

// Status returns a copy of the current run status.
func (r *Repository) Status() Status {
	r.mu.Lock()
	status := r.status
	r.mu.Unlock()

	// Only meaningful while stopped: a running job is not something to resume.
	if !status.Running {
		status.Resumable = r.loadProgress() != nil
	}
	return status
}

// Enqueue starts a run rooted at an anime: its recommendations seed the queue, and each item's own
// recommendations extend it as that item is prepared, up to MaxItemsPerRun.
//
// Returns immediately — the run is the point of the feature, and it has to outlive the page you
// started it from.
func (r *Repository) Enqueue(rootMediaID int, rootTitle string, profileID uint) (Status, error) {
	// A fresh run starts from nothing walked and nothing seen but the root itself, which is never
	// queued — you are already on its page.
	return r.start(&RunProgress{
		RootMediaID: rootMediaID,
		RootTitle:   rootTitle,
		ProfileID:   profileID,
		Seen:        []int{rootMediaID},
		Depths:      map[int]int{rootMediaID: 0},
		StartedAt:   time.Now(),
	})
}

// Resume picks an interrupted run back up from its saved progress.
//
// The queue and every snapshot are in the database already; what this restores is the walk — which
// anime have been seen and how far out they were found — so the run carries on rather than starting
// the graph over and rediscovering everything it had already decided about.
func (r *Repository) Resume() (Status, error) {
	progress := r.loadProgress()
	if progress == nil {
		return r.Status(), errors.New("there is nothing to resume")
	}
	return r.start(progress)
}

// ResumeIfInterrupted restarts a run that was cut off by the process going away. Call once at
// startup: a run is meant to survive being closed, and the only way it can is to come back by itself.
func (r *Repository) ResumeIfInterrupted() {
	progress := r.loadProgress()
	if progress == nil {
		return
	}

	r.logger.Info().
		Int("rootMediaId", progress.RootMediaID).
		Int("prepared", progress.Prepared).
		Int("discovered", progress.Discovered).
		Msg("enqueuefuture: Resuming an interrupted run")

	if _, err := r.start(progress); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Could not resume")
	}
}

// CanResume reports whether an interrupted run is waiting to be picked up.
func (r *Repository) CanResume() bool {
	return r.loadProgress() != nil
}

// start launches the worker from a progress record, fresh or restored.
func (r *Repository) start(progress *RunProgress) (Status, error) {
	r.mu.Lock()
	if r.running {
		status := r.status
		r.mu.Unlock()
		return status, errors.New("a run is already in progress")
	}

	ctx, cancel := context.WithCancel(context.Background())
	r.cancel = cancel
	r.running = true
	r.status = Status{
		Running:         true,
		RootMediaID:     progress.RootMediaID,
		RootTitle:       progress.RootTitle,
		Discovered:      progress.Discovered,
		Prepared:        progress.Prepared,
		Failed:          progress.Failed,
		Skipped:         progress.Skipped,
		Cap:             MaxItemsPerRun,
		BackoffRungs:    len(backoffLadder),
		BackoffAttempts: MaxBackoffAttempts,
		StartedAt:       progress.StartedAt,
	}
	status := r.status
	r.mu.Unlock()

	// Written before the worker starts, so a process that dies on the very first request is still
	// resumable rather than having lost the fact that a run was ever asked for.
	r.saveProgress(progress)

	go r.run(ctx, progress)

	return status, nil
}

// Stop cancels a running run. Everything already prepared stays in the queue, and the progress file
// is deliberately left behind so the run can be picked up again later.
func (r *Repository) Stop() Status {
	r.mu.Lock()
	if r.cancel != nil {
		r.cancel()
	}
	status := r.status
	r.mu.Unlock()
	return status
}

// run is the worker. One at a time, rate limited, until the frontier empties or the cap is hit.
func (r *Repository) run(ctx context.Context, progress *RunProgress) {
	defer util.HandlePanicInModuleThen("enqueuefuture/run", func() {
		r.finish("the run stopped unexpectedly")
	})

	rootMediaID := progress.RootMediaID
	profileID := progress.ProfileID

	r.logger.Info().Int("rootMediaId", rootMediaID).Msg("enqueuefuture: Starting run")

	// frontier holds anime discovered but not yet inserted; seen guards against walking in circles,
	// which a recommendation graph does constantly. Both are restored from the progress record on a
	// resumed run, so it carries on walking rather than rediscovering what it already decided about.
	frontier := make([]recommendation, 0, MaxItemsPerRun)
	seen := make(map[int]bool, len(progress.Seen))
	for _, id := range progress.Seen {
		seen[id] = true
	}
	seen[rootMediaID] = true

	depths := progress.Depths
	if depths == nil {
		depths = map[int]int{}
	}
	depths[rootMediaID] = 0

	// The root itself is never queued — you are already on its page, and it has its own download
	// button. It is only walked to get its recommendations and its own family.
	rootPending := !progress.RootWalked

	bo := &backoff{}

	// Called after every decision so the run is never more than one item ahead of what is on disk.
	checkpoint := func() {
		status := r.Status()
		progress.Seen = progress.Seen[:0]
		for id := range seen {
			progress.Seen = append(progress.Seen, id)
		}
		progress.Depths = depths
		progress.RootWalked = !rootPending
		progress.Discovered = status.Discovered
		progress.Prepared = status.Prepared
		progress.Failed = status.Failed
		progress.Skipped = status.Skipped
		r.saveProgress(progress)
	}

	for {
		if ctx.Err() != nil {
			// Stopped by hand rather than finished, so the progress file stays put — this is
			// exactly the state that has to be resumable.
			r.logger.Info().Msg("enqueuefuture: Run cancelled")
			checkpoint()
			r.finish("")
			return
		}

		var mediaID int
		var depth int
		var familyID int

		if rootPending {
			mediaID = rootMediaID
			depth = 0
			// The root anchors its own family, so its sequels and prequels bundle under it.
			familyID = rootMediaID
		} else {
			// Take the next item that is actually in the queue rather than trusting the in-memory
			// frontier, so a restart or a second enqueue does not lose or duplicate work.
			item, err := r.database.GetNextPendingEnqueueFutureItem(profileID)
			if err != nil {
				r.logger.Error().Err(err).Msg("enqueuefuture: Failed to read the queue")
				r.finish(err.Error())
				return
			}
			if item == nil {
				// Finished on its own terms: nothing left to resume, so the record goes away.
				r.logger.Info().Msg("enqueuefuture: Run finished, nothing left to prepare")
				r.clearProgress()
				r.finish("")
				return
			}
			mediaID = item.MediaID
			depth = item.Depth
			familyID = item.FamilyID
			// Guards against a poisoned item outliving a restart: attempts are persisted, so an
			// entry that has already used up its tries is failed rather than retried forever.
			if item.Attempts >= MaxItemAttempts {
				_ = r.database.SetEnqueueFutureItemStatus(profileID, mediaID, db.EnqueueFutureStatusFailed,
					"gave up after "+strconv.Itoa(item.Attempts)+" attempts")
				r.bumpFailed()
				continue
			}
			_ = r.database.SetEnqueueFutureItemStatus(profileID, mediaID, db.EnqueueFutureStatusPreparing, "")
			r.setCurrentTitle(item.Title)
		}

		// The root is only walked for its recommendations, so it gets the cheap path: one details
		// request, no entry hydration and no torrent search for results nobody will ever see.
		var result *prepared
		var err error
		if rootPending {
			var discovered *prepared
			discovered, err = r.discover(ctx, mediaID)
			result = discovered
		} else {
			result, err = r.prepare(ctx, mediaID)
		}

		if err != nil {
			if ctx.Err() != nil {
				r.finish("")
				return
			}

			// A rate limit is about the upstream budget, not this anime, so the whole run waits.
			// The item is left where it is and tried again — not consumed, not failed.
			if isRateLimitErr(err) {
				delay, rung, attemptInRung, ok := bo.next()
				if !ok {
					r.logger.Error().Msg("enqueuefuture: Giving up, rate limited through the whole ladder")
					if !rootPending {
						_ = r.database.SetEnqueueFutureItemStatus(profileID, mediaID, db.EnqueueFutureStatusPending, "rate limited")
					}
					r.finish("rate limited: gave up after " + strconv.Itoa(MaxBackoffAttempts) + " attempts")
					return
				}

				r.logger.Warn().
					Str("delay", delay.String()).
					Int("rung", rung).
					Int("attempt", attemptInRung).
					Msgf("enqueuefuture: Rate limited, backing off %s (rung %d/%d, attempt %d/%d)",
						delay, rung, len(backoffLadder), attemptInRung, attemptsPerRung)

				// The item's own attempt counter is deliberately left alone. Being rate limited says
				// nothing about this anime, and spending its retries on the upstream's mood would
				// have a run that hit a wall mark a stretch of perfectly good entries as failed.
				// The ladder above is what bounds this.
				if !rootPending {
					_ = r.database.SetEnqueueFutureItemStatus(profileID, mediaID, db.EnqueueFutureStatusPending, "rate limited")
				}

				r.setRateLimited(delay, rung, attemptInRung, err.Error())

				select {
				case <-ctx.Done():
					r.finish("")
					return
				case <-time.After(delay):
				}

				r.clearRateLimited()
				continue
			}

			// Anything else is this entry's own problem. The root failing is fatal to the run —
			// there is nothing to walk from — but a single bad recommendation is not.
			r.logger.Warn().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Failed to prepare")
			if rootPending {
				r.finish(err.Error())
				return
			}

			_ = r.database.IncrementEnqueueFutureItemAttempts(profileID, mediaID, err.Error())

			// A dropped connection or a provider having a bad minute should not cost an anime its
			// place in the queue, so give it a couple more tries before writing it off. The next
			// one is paced by the rate limiter like everything else, so this cannot spin.
			if attempts, readErr := r.attemptsFor(profileID, mediaID); readErr == nil && attempts < MaxItemAttempts {
				_ = r.database.SetEnqueueFutureItemStatus(profileID, mediaID, db.EnqueueFutureStatusPending, err.Error())
				continue
			}

			_ = r.database.SetEnqueueFutureItemStatus(profileID, mediaID, db.EnqueueFutureStatusFailed, err.Error())
			r.bumpFailed()
			continue
		}

		bo.reset()

		// The root has no row — it was never queued, only walked for its recommendations.
		if !rootPending {
			if result.tetheredOVA {
				// Dropped rather than marked skipped, so it gives its slot back: the cap should be
				// spent on anime worth downloading, not on extras filtered out along the way.
				r.logger.Debug().Int("mediaId", mediaID).Msg("enqueuefuture: Dropping OVA tied to a parent series")
				_ = r.database.DeleteEnqueueFutureItem(profileID, mediaID)
				r.dropDiscovered()
			} else {
				r.storeSnapshot(profileID, mediaID, result)
			}
		}

		// This anime's own family comes first — its sequels, prequels and side stories are the
		// things most likely to be wanted alongside it, and queueing them behind a hundred
		// recommendations would bury them. They inherit its family and its depth, because a sequel
		// is not one step further from what you asked for; it is the same show.
		for _, rel := range result.relations {
			if seen[rel.mediaID] {
				// Already queued under some other family — pull that whole family in with this one,
				// which is what makes a franchise discovered from two directions end up as one
				// bundle instead of two.
				r.mergeFamilies(profileID, rel.mediaID, familyID)
				continue
			}
			seen[rel.mediaID] = true
			depths[rel.mediaID] = depth
			rel.familyID = familyID
			frontier = append(frontier, rel)
		}

		// Then what it recommends, each starting a family of its own.
		for _, rec := range result.recommendations {
			if seen[rec.mediaID] {
				continue
			}
			seen[rec.mediaID] = true
			depths[rec.mediaID] = depth + 1
			rec.familyID = rec.mediaID
			frontier = append(frontier, rec)
		}

		if rootPending {
			rootPending = false
		}

		// Insert as much of the frontier as the cap allows, then drop the rest: past the cap there
		// is no point holding on to anime that will never be queued.
		frontier = r.drainFrontier(profileID, rootMediaID, frontier, depths)

		checkpoint()
	}
}

// mergeFamilies re-points every item of one family onto another, so a franchise found from two
// directions ends up as a single bundle rather than two halves.
func (r *Repository) mergeFamilies(profileID uint, mediaID int, intoFamilyID int) {
	if intoFamilyID == 0 {
		return
	}
	item, err := r.database.GetEnqueueFutureItem(profileID, mediaID)
	if err != nil || item == nil || item.FamilyID == intoFamilyID || item.FamilyID == 0 {
		return
	}
	if err := r.database.MergeEnqueueFutureFamily(profileID, item.FamilyID, intoFamilyID); err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to merge families")
	}
}

// drainFrontier inserts discovered anime into the queue until the run's cap is reached, applying the
// skip rules. Returns whatever it could not insert yet.
func (r *Repository) drainFrontier(profileID uint, rootMediaID int, frontier []recommendation, depths map[int]int) []recommendation {
	count, err := r.database.CountEnqueueFutureItemsForRoot(profileID, rootMediaID)
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to count queued items")
		return frontier
	}

	for len(frontier) > 0 {
		if count >= MaxItemsPerRun {
			r.logger.Info().Int("cap", MaxItemsPerRun).Msg("enqueuefuture: Reached the per-run cap, stopping discovery")
			return nil
		}

		rec := frontier[0]
		frontier = frontier[1:]

		if skip, reason := r.shouldSkip(profileID, rec); skip {
			r.logger.Debug().Int("mediaId", rec.mediaID).Str("reason", reason).Msg("enqueuefuture: Skipping")
			r.bumpSkipped()
			continue
		}

		familyID := rec.familyID
		if familyID == 0 {
			familyID = rec.mediaID
		}

		inserted, err := r.database.InsertEnqueueFutureItem(&models.EnqueueFutureItem{
			ProfileID:   profileID,
			MediaID:     rec.mediaID,
			RootMediaID: rootMediaID,
			FamilyID:    familyID,
			Depth:       depths[rec.mediaID],
			Status:      db.EnqueueFutureStatusPending,
			Title:       rec.title,
		})
		if err != nil || !inserted {
			continue
		}

		count++
		r.bumpDiscovered()
	}

	return frontier
}

// shouldSkip applies the discovery filters: nothing already queued, already in the library, already
// on its way down, or not out yet.
func (r *Repository) shouldSkip(profileID uint, rec recommendation) (bool, string) {
	if rec.notYetReleased {
		return true, "not yet released"
	}
	if r.database.HasEnqueueFutureItem(profileID, rec.mediaID) {
		return true, "already in the queue"
	}
	if r.hasFullLibraryCopy(rec) {
		return true, "already in the library"
	}
	// A staged download record exists from the moment a torrent is queued until its files are
	// matched into the library, so this covers "downloading right now" and "downloaded but not
	// filed yet" in one check.
	if count, err := r.database.CountUnmatchedTorrentMetadataByAnimeID(rec.mediaID); err == nil && count > 0 {
		return true, "already downloading"
	}
	return false, ""
}

// storeSnapshot writes a prepared item, marking it ready — or no_results when the search came back
// empty, which is worth distinguishing: those are worth revisiting with a different provider rather
// than being a failure.
func (r *Repository) storeSnapshot(profileID uint, mediaID int, result *prepared) {
	value, err := json.Marshal(result.snapshot)
	if err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Failed to encode snapshot")
		_ = r.database.SetEnqueueFutureItemStatus(profileID, mediaID, db.EnqueueFutureStatusFailed, err.Error())
		r.bumpFailed()
		return
	}

	status := db.EnqueueFutureStatusReady
	if result.snapshot.SearchData == nil || len(result.snapshot.SearchData.Torrents) == 0 {
		status = db.EnqueueFutureStatusNoResults
	}

	if err := r.database.SaveEnqueueFutureItemSnapshot(
		profileID, mediaID, status, result.title, result.coverImage, value,
	); err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Failed to store snapshot")
		r.bumpFailed()
		return
	}

	r.bumpPrepared()
}

// +---------------------+
// |   Status plumbing   |
// +---------------------+

// Every status change is broadcast, so the button on the anime page and the queue screen both see a
// run progress without polling for it.

func (r *Repository) broadcast() {
	if r.wsEventManager == nil {
		return
	}
	defer util.HandlePanicInModuleThen("enqueuefuture/broadcast", func() {})
	r.wsEventManager.SendEvent("enqueueFutureStatus", r.Status())
}

func (r *Repository) update(fn func(s *Status)) {
	r.mu.Lock()
	fn(&r.status)
	r.mu.Unlock()
	r.broadcast()
}

func (r *Repository) bumpDiscovered() { r.update(func(s *Status) { s.Discovered++ }) }
func (r *Repository) bumpPrepared()   { r.update(func(s *Status) { s.Prepared++ }) }
func (r *Repository) bumpFailed()     { r.update(func(s *Status) { s.Failed++ }) }
func (r *Repository) bumpSkipped()    { r.update(func(s *Status) { s.Skipped++ }) }

// dropDiscovered accounts for an item that was queued and then removed once preparation revealed it
// did not belong, so the counters still add up.
func (r *Repository) dropDiscovered() {
	r.update(func(s *Status) {
		if s.Discovered > 0 {
			s.Discovered--
		}
		s.Skipped++
	})
}

func (r *Repository) setCurrentTitle(title string) {
	r.update(func(s *Status) { s.CurrentTitle = title })
}

func (r *Repository) setRateLimited(delay time.Duration, rung int, attemptInRung int, lastError string) {
	r.update(func(s *Status) {
		s.RateLimited = true
		s.RetryAt = time.Now().Add(delay)
		s.BackoffRung = rung
		s.BackoffAttempt = attemptInRung
		s.LastError = lastError
	})
}

func (r *Repository) clearRateLimited() {
	r.update(func(s *Status) {
		s.RateLimited = false
		s.RetryAt = time.Time{}
		s.BackoffRung = 0
		s.BackoffAttempt = 0
	})
}

func (r *Repository) finish(lastError string) {
	r.mu.Lock()
	r.running = false
	r.cancel = nil
	r.status.Running = false
	r.status.RateLimited = false
	r.status.CurrentTitle = ""
	r.status.FinishedAt = time.Now()
	if lastError != "" {
		r.status.LastError = lastError
	}
	r.mu.Unlock()
	r.broadcast()
}
