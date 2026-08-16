package enqueuefuture

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

		pacer *pacer

		// backfillOnce guards the one-time repair of seeder totals for items prepared before that
		// figure was recorded. See backfillSeedersOnce.
		backfillOnce sync.Once

		// registerBadgedOnce guards the one-time sweep that puts already-downloaded anime into the
		// queue. See RegisterBadgedAnime.
		registerBadgedOnce sync.Once

		mu      sync.Mutex
		status  Status
		running bool
		cancel  context.CancelFunc
		// workerDone is closed when the goroutine behind the current run exits, so Stop can tell a
		// worker that is winding down from one that is not there at all.
		workerDone chan struct{}

		// pendingRootsMu guards the on-disk list of anime waiting for their turn. See pending_roots.go.
		pendingRootsMu sync.Mutex
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
		pacer:               newPacer(ItemsPerMinute, RateBurst),
		status: Status{
			Cap:             MaxFamiliesPerRun,
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
func (r *Repository) attemptsFor(mediaID int) (int, error) {
	item, err := r.database.GetEnqueueFutureItem(mediaID)
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
	// What is queued behind this run, so the screen can say "3 waiting" rather than looking idle
	// while three anime sit on a list nobody can see.
	status.PendingRootList = r.PendingRoots()
	status.PendingRoots = len(status.PendingRootList)
	return status
}

// Enqueue starts a run rooted at an anime: its recommendations seed the queue, and each item's own
// recommendations extend it as that item is prepared, up to MaxFamiliesPerRun franchises.
//
// Returns immediately — the run is the point of the feature, and it has to outlive the page you
// started it from.
func (r *Repository) Enqueue(rootMediaID int, rootTitle string, profileID uint) (Status, error) {
	// Busy? Then this one waits its turn rather than being refused.
	//
	// Only one run happens at a time on purpose — the pacing is what keeps it inside AniList's
	// budget, and two runs would halve each other's rate while doubling the refusals. But "come back
	// in half an hour and start the next one by hand" is not a workflow, so the ask is remembered
	// and started automatically when the current run ends. See pending_roots.go.
	r.mu.Lock()
	running := r.running
	r.mu.Unlock()
	if running {
		waiting, added := r.queueRoot(pendingRoot{
			MediaID:   rootMediaID,
			Title:     rootTitle,
			ProfileID: profileID,
			QueuedAt:  time.Now(),
		})
		if !added {
			status := r.Status()
			status.PendingRoots = waiting
			return status, fmt.Errorf(
				"there are already %d anime waiting to be walked — let some of them through before queueing more", MaxPendingRoots)
		}
		r.logger.Info().
			Int("rootMediaId", rootMediaID).
			Str("title", rootTitle).
			Int("waiting", waiting).
			Msg("enqueuefuture: A run is already going, queued this one behind it")

		status := r.Status()
		status.PendingRoots = waiting
		return status, nil
	}

	return r.startRoot(pendingRoot{MediaID: rootMediaID, Title: rootTitle, ProfileID: profileID})
}

// startRoot launches a run for one anime. Shared by Enqueue and by the hand-off from the waiting
// list, so a queued run is started exactly the same way as one you pressed the button for.
func (r *Repository) startRoot(root pendingRoot) (Status, error) {
	// A fresh run starts from nothing walked and nothing seen but the root itself, which is never
	// queued — you are already on its page.
	return r.start(&RunProgress{
		RootMediaID: root.MediaID,
		RootTitle:   root.Title,
		ProfileID:   root.ProfileID,
		Seen:        []int{root.MediaID},
		Depths:      map[int]int{root.MediaID: 0},
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
		// Nothing was mid-run, but something may have been waiting behind one that finished just
		// before the process went away. The waiting list is on disk for exactly this: a crash
		// between one run ending and the next starting must not quietly drop the rest of the queue.
		go r.startNextPendingRoot()
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
		Cap:             MaxFamiliesPerRun,
		BackoffRungs:    len(backoffLadder),
		BackoffAttempts: MaxBackoffAttempts,
		StartedAt:       progress.StartedAt,
	}
	status := r.status
	r.mu.Unlock()

	// Written before the worker starts, so a process that dies on the very first request is still
	// resumable rather than having lost the fact that a run was ever asked for.
	r.saveProgress(progress)

	// The channel is what lets Stop tell "the worker is finishing up" from "there is no worker" —
	// the second being the state that used to leave the feature permanently unusable.
	done := make(chan struct{})
	r.mu.Lock()
	r.workerDone = done
	r.mu.Unlock()

	go func() {
		defer close(done)
		r.run(ctx, progress)
	}()

	return status, nil
}

// StopGracePeriod is how long Stop waits for the worker to notice before clearing the run anyway.
//
// Everything the worker blocks on now takes the context — the pacing, the backoff, the upstream
// calls — so a live worker stops well inside this. Waiting at all is only to let it finish tidily.
const StopGracePeriod = 5 * time.Second

// Stop cancels a running run. Everything already prepared stays in the queue, and the progress file
// is deliberately left behind so the run can be picked up again later.
//
// Always leaves the run cleared, even if the worker is already gone. A run flagged as running with
// nothing behind it is the worst state this feature can be in: Stop appears to do nothing, every
// Enqueue is refused, and the only way out is restarting the server.
func (r *Repository) Stop() Status {
	r.mu.Lock()
	if r.cancel != nil {
		r.cancel()
	}
	done := r.workerDone
	running := r.running
	r.mu.Unlock()

	if !running {
		return r.Status()
	}

	if done == nil {
		// Flagged as running with no worker ever recorded — nothing is coming to clear it.
		r.finish("stopped")
		return r.Status()
	}

	select {
	case <-done:
	case <-time.After(StopGracePeriod):
		r.logger.Warn().Msg("enqueuefuture: Worker did not stop in time, clearing the run anyway")
		r.finish("stopped")
	}

	return r.Status()
}

// run is the worker. One at a time, rate limited, until the frontier empties or the cap is hit.
func (r *Repository) run(ctx context.Context, progress *RunProgress) {
	// Two guards, because a run that exits without clearing its flag wedges the feature for good:
	// every later Enqueue is refused as "already in progress" and the button silently does nothing
	// until the server is restarted. finish is idempotent, so the explicit calls below still stand.
	defer r.finish("")
	defer util.HandlePanicInModuleThen("enqueuefuture/run", func() {
		r.finish("the run stopped unexpectedly")
	})

	rootMediaID := progress.RootMediaID
	profileID := progress.ProfileID

	r.logger.Info().Int("rootMediaId", rootMediaID).Msg("enqueuefuture: Starting run")

	// Clear out the PVs, CMs and other promotional entries queued before they were filtered at
	// discovery, so a run does not hand back a queue of things nobody wants to work through.
	r.purgeJunkItems()

	// frontier holds anime discovered but not yet inserted; seen guards against walking in circles,
	// which a recommendation graph does constantly. Both are restored from the progress record on a
	// resumed run, so it carries on walking rather than rediscovering what it already decided about.
	// Two frontiers, drained on different terms: familyFrontier empties completely on every pass,
	// recFrontier gives up RecommendationSpread at a time. See drainFrontier.
	familyFrontier := make([]recommendation, 0, MaxFamiliesPerRun)
	recFrontier := make([]recommendation, 0, MaxFamiliesPerRun)
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

	// Guards against the run getting stuck retrying one anime — see the failure path below.
	lastFailedID := 0
	consecutiveFailures := 0

	// Called after every decision so the run is never more than one item ahead of what is on disk.
	checkpoint := func() {
		r.refreshCounts(rootMediaID)
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
			item, err := r.database.GetNextPendingEnqueueFutureItem()
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
				_ = r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusFailed,
					"gave up after "+strconv.Itoa(item.Attempts)+" attempts")
				continue
			}
			_ = r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusPreparing, "")
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
						_ = r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusPending, "rate limited")
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
					_ = r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusPending, "rate limited")
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

			_ = r.database.IncrementEnqueueFutureItemAttempts(mediaID, err.Error())

			// Counted here as well as in the database, and the stricter of the two wins.
			//
			// The persisted counter is what survives a restart, but relying on it alone means that
			// if the write ever fails, the item goes back on the queue as pending, comes straight
			// back as the oldest pending item, and the run spends the rest of its life retrying one
			// anime — looking, from outside, exactly like a run that has hung.
			if mediaID == lastFailedID {
				consecutiveFailures++
			} else {
				lastFailedID = mediaID
				consecutiveFailures = 1
			}

			attempts, readErr := r.attemptsFor(mediaID)
			if readErr != nil {
				attempts = consecutiveFailures
			}
			if attempts < consecutiveFailures {
				attempts = consecutiveFailures
			}

			if attempts < MaxItemAttempts {
				// A dropped connection or a provider having a bad minute should not cost an anime
				// its place in the queue, so give it a couple more tries before writing it off.
				_ = r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusPending, err.Error())
				continue
			}

			r.logger.Warn().Int("mediaId", mediaID).Int("attempts", attempts).
				Msg("enqueuefuture: Giving up on this anime")
			_ = r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusFailed, err.Error())
			continue
		}

		bo.reset()

		// The root has no row — it was never queued, only walked for its recommendations.
		if !rootPending {
			if result.tetheredOVA {
				// Dropped rather than marked skipped, so it gives its slot back: the cap should be
				// spent on anime worth downloading, not on extras filtered out along the way.
				r.logger.Debug().Int("mediaId", mediaID).Msg("enqueuefuture: Dropping OVA tied to a parent series")
				_ = r.database.DeleteEnqueueFutureItem(mediaID)
				r.bumpSkipped()
			} else {
				r.storeSnapshot(mediaID, result)
				// One line per anime, so a long run can be watched from the log rather than only
				// through the screen — the difference between "slow" and "stuck" has to be visible
				// somewhere.
				torrents := 0
				if result.snapshot != nil && result.snapshot.SearchData != nil {
					torrents = len(result.snapshot.SearchData.Torrents)
				}
				r.logger.Info().
					Int("mediaId", mediaID).
					Str("title", result.title).
					Int("torrents", torrents).
					Msg("enqueuefuture: Prepared")
			}
		}

		// Family edges are held apart from recommendations, because they are queued on different
		// terms: every family edge waiting goes in before the next spread of recommendations does.
		// Since each member's own relations are discovered when it is prepared, and those jump ahead
		// too, the relation tree is exhausted transitively — every season, every side story, however
		// deep the chain runs — before the walk widens out again.
		//
		// They inherit the family and the depth of the anime they came from, because a sequel is not
		// one step further from what you asked for; it is the same show.
		for _, rel := range result.relations {
			if seen[rel.mediaID] {
				// Already queued. It stays exactly where it is in the queue — but the fact that this
				// anime is related to it is new information, and it is the only place that connection
				// is ever known. Thrown away, the two halves of one story keep separate family ids and
				// the queue screen draws the same franchise as two unrelated groups pages apart.
				//
				// So the families are folded together into whichever sits higher up, and nothing moves
				// in the queue itself: only the grouping changes, and it changes towards the half the
				// user has already been shown.
				_ = r.database.LinkEnqueueFutureFamilies(rel.mediaID, familyID)
				continue
			}
			seen[rel.mediaID] = true
			depths[rel.mediaID] = depth
			rel.familyID = familyID
			rel.isFamily = true
			familyFrontier = append(familyFrontier, rel)
		}

		// Then what it recommends, each starting a family of its own.
		for _, rec := range result.recommendations {
			if seen[rec.mediaID] {
				continue
			}
			seen[rec.mediaID] = true
			depths[rec.mediaID] = depth + 1
			rec.familyID = rec.mediaID
			recFrontier = append(recFrontier, rec)
		}

		wasRoot := rootPending
		if rootPending {
			rootPending = false
		}

		// Insert as much of the frontier as the cap allows, then drop the rest: past the cap there
		// is no point holding on to anime that will never be queued.
		familyFrontier, recFrontier = r.drainFrontier(profileID, rootMediaID, familyFrontier, recFrontier, depths)

		// A root that produces nothing is a dead end worth naming. It is the one case that leaves
		// the screen reading "0 of 0" with no explanation, and it has real causes — an anime with
		// no recommendations and no relations, or one whose every neighbour you already own.
		if wasRoot {
			counts, _ := r.database.GetEnqueueFutureRunCounts(rootMediaID)
			if counts.Items == 0 {
				r.logger.Warn().
					Int("rootMediaId", rootMediaID).
					Int("recommendations", len(result.recommendations)).
					Int("relations", len(result.relations)).
					Msg("enqueuefuture: Nothing to queue from this anime — everything it leads to was filtered out")
				r.clearProgress()
				r.finish("nothing to queue from this anime — everything it leads to was already in your library, already downloading, or not out yet")
				return
			}
		}

		checkpoint()
	}
}

// Families are folded together wherever a franchise is reached a second time, by
// Database.LinkEnqueueFutureFamilies — see the two call sites above.
//
// This does not move anything in the queue: positions are untouched, so no row changes place and
// nothing the user has already worked past shifts under them. All that changes is which family id
// the rows carry, and it always changes towards the half that is higher up the queue, so the screen
// gathers the franchise at the point the user has already seen rather than somewhere below them.

// drainFrontier inserts discovered anime into the queue, applying the skip rules and the per-run
// franchise cap. Returns whatever it could not insert.
//
// Insertion order is the order the queue is walked, so this is where "family, then a spread of
// recommendations, then family again" is decided. The family frontier is drained completely on every
// pass; the recommendation frontier gives up at most RecommendationSpread. Whatever recommendations
// are left over wait for the next pass, by which time the family edges discovered from this one have
// already gone in ahead of them.
//
// The cap is spent on franchises, not anime. A candidate joining a family that is already queued
// goes in regardless of how full the run is — the alternative is a queue holding season 1 and season
// 3 of something because a counter ran out between them, which is worse than not holding it at all.
// Only a candidate that would start a *new* franchise has to pay.
func (r *Repository) drainFrontier(
	profileID uint,
	rootMediaID int,
	familyFrontier []recommendation,
	recFrontier []recommendation,
	depths map[int]int,
) ([]recommendation, []recommendation) {
	families, err := r.database.CountEnqueueFutureFamiliesForRoot(rootMediaID)
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to count queued franchises")
		return familyFrontier, recFrontier
	}

	full := false

	// The whole family first, however long the chain is, then a bounded spread of recommendations.
	batch := make([]recommendation, 0, len(familyFrontier)+RecommendationSpread)
	batch = append(batch, familyFrontier...)
	familyFrontier = familyFrontier[:0]

	spread := RecommendationSpread
	if spread > len(recFrontier) {
		spread = len(recFrontier)
	}
	batch = append(batch, recFrontier[:spread]...)
	recFrontier = recFrontier[spread:]

	for len(batch) > 0 {
		rec := batch[0]
		batch = batch[1:]

		familyID := rec.familyID
		if familyID == 0 {
			familyID = rec.mediaID
		}

		// Draining continues past the cap rather than stopping, because later entries in the
		// frontier may well belong to franchises already taken on — those still have to get in.
		isNewFamily := !r.database.HasEnqueueFutureFamily(familyID)

		// Family edges never pay. A member joining a franchise already queued was always free, but a
		// family edge whose family has no row yet was not — and that is exactly the root's own
		// sequels and prequels, since the root itself is never queued. With a full cap that split the
		// franchise you started from, which is the one thing the run must never do. Family edges
		// inherit their parent's family, so the only new family reachable this way is the root's own:
		// the exemption cannot be used to walk past the cap indefinitely.
		if isNewFamily && !rec.isFamily && families >= MaxFamiliesPerRun {
			if !full {
				full = true
				r.logger.Info().
					Int("cap", MaxFamiliesPerRun).
					Msg("enqueuefuture: Reached the per-run franchise cap, only completing what is already queued")
			}
			continue
		}

		// A family edge landing on something a previous run already queued is the same second sighting
		// the relations loop handles, reached the other way round — the row exists but this run never
		// saw it, so `seen` says nothing about it. Fold the two families together before the skip below
		// discards the edge, or the connection is lost with it.
		if rec.isFamily && r.database.HasEnqueueFutureItem(rec.mediaID) {
			_ = r.database.LinkEnqueueFutureFamilies(rec.mediaID, familyID)
		}

		if skip, reason := r.shouldSkip(rec); skip {
			r.logger.Debug().Int("mediaId", rec.mediaID).Str("reason", reason).Msg("enqueuefuture: Skipping")
			r.bumpSkipped()
			continue
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

		if isNewFamily {
			families++
		}
	}

	return familyFrontier, recFrontier
}

// shouldSkip applies the discovery filters: nothing already queued, already in the library, already
// on its way down, or not out yet.
func (r *Repository) shouldSkip(rec recommendation) (bool, string) {
	if rec.notYetReleased {
		return true, "not yet released"
	}
	if r.database.HasEnqueueFutureItem(rec.mediaID) {
		return true, "already in the queue"
	}
	// A season you already own does not end its franchise.
	//
	// This is what was cutting families short. The walk only extends through anime it queues: an
	// entry that is skipped is never prepared, its details are never fetched, and its own sequels and
	// prequels are therefore never discovered. So one season sitting in your library — or one you had
	// already downloaded — terminated the chain, and everything behind it went missing. A franchise
	// you are halfway through is exactly the one where that happens, and exactly the one you wanted
	// the rest of.
	//
	// Family edges are therefore queued regardless of whether you already have them. They arrive
	// greyed out with their badge, which is what the queue now does with anything already dealt with,
	// and their relations get walked like anything else. Recommendations — merely similar shows — are
	// still skipped when you own them: those are suggestions, and a suggestion you have already acted
	// on is not one worth making again.
	if !rec.isFamily && r.hasFullLibraryCopy(rec) {
		return true, "already in the library"
	}
	// A staged download record exists from the moment a torrent is queued until its files are
	// matched into the library, so this covers "downloading right now" and "downloaded but not
	// filed yet" in one check.
	if !rec.isFamily {
		if count, err := r.database.CountUnmatchedTorrentMetadataByAnimeID(rec.mediaID); err == nil && count > 0 {
			return true, "already downloading"
		}
	}
	// Deliberately no check on the download badge here. An anime you have downloaded or matched is
	// still walked and still queued — it just arrives greyed out, carrying its state, because a
	// franchise is easier to read with all of its seasons in it than with the ones you have already
	// dealt with silently missing. See Item.DownloadState.
	return false, ""
}

// MinSeeders is the seeder count the best torrent for an anime has to beat for the entry to be worth
// keeping.
//
// Below this a download is not really available: it either never starts or crawls for days, so putting
// the entry in front of you is asking you to make a decision about nothing.
const MinSeeders = 5

// bestSeeders returns the seeder count of the healthiest torrent found, and how many were found.
func bestSeeders(data *torrent.SearchData) (best int, count int) {
	if data == nil {
		return 0, 0
	}
	for _, t := range data.Torrents {
		if t == nil {
			continue
		}
		count++
		if t.Seeders > best {
			best = t.Seeders
		}
	}
	return best, count
}

// totalSeeders adds up every seeder across every torrent the search found.
//
// This is the popularity the queue screen sorts on, and it is deliberately a different number from
// bestSeeders above, which is the availability gate. The healthiest torrent says whether a download
// will actually run; the sum says how much of the world is currently sharing this show at all, over
// however many releases and groups it has. A well-known series has both a busy torrent and thirty
// others behind it, and only the sum can tell that apart from one lucky release.
func totalSeeders(data *torrent.SearchData) int {
	if data == nil {
		return 0
	}
	total := 0
	for _, t := range data.Torrents {
		if t == nil {
			continue
		}
		// Providers do return negatives for "unknown", and one of those must not quietly subtract
		// from a franchise's total when the members are added together.
		if t.Seeders > 0 {
			total += t.Seeders
		}
	}
	return total
}

// backfillSeedersOnce runs the seeder backfill the first time the queue is actually looked at, and
// never again for the life of the process.
//
// Deliberately not on the startup path. It reads back every stored snapshot — hundreds of kilobytes
// apiece — and writes a row for each, which on a server whose database lives on network storage is
// real I/O at exactly the moment everything else is competing for it. Nothing needs it until the
// queue screen is open, and the screen polls, so the rows fill in under it within a poll or two of
// arriving.
func (r *Repository) backfillSeedersOnce() {
	r.backfillOnce.Do(func() {
		go r.BackfillSeederTotals()
	})
}

// BackfillSeederTotals fills in the popularity figure for items prepared before it was recorded.
//
// Without this, an existing queue opens sorted entirely by a column of zeroes — every row already in
// it ranked below every row prepared after the upgrade. The numbers are all recoverable from the
// snapshots that are already stored, so nothing has to be searched for again.
//
// Exported so it can be triggered deliberately; the ordinary path is backfillSeedersOnce above.
func (r *Repository) BackfillSeederTotals() {
	// Runs on a goroutine of its own, where a panic would otherwise take the server down with it.
	defer util.HandlePanicInModuleThen("enqueuefuture/BackfillSeederTotals", func() {})

	filled := 0
	err := r.database.ForEachEnqueueFutureItemMissingSeeders(func(mediaID int, value []byte) {
		var snapshot Snapshot
		if err := json.Unmarshal(value, &snapshot); err != nil {
			// Nothing to recover, and nothing to do about it — the row still works, it simply sorts
			// as unknown. GetItem logs the same failure when the screen actually asks for it.
			return
		}
		total := totalSeeders(snapshot.SearchData)
		if total <= 0 {
			return
		}
		if err := r.database.SetEnqueueFutureItemSeeders(mediaID, total); err != nil {
			r.logger.Warn().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Failed to backfill seeders")
			return
		}
		filled++
	})
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to backfill seeder totals")
		return
	}
	if filled > 0 {
		r.logger.Info().Int("items", filled).Msg("enqueuefuture: Filled in seeder totals for items prepared earlier")
	}
}

// storeSnapshot writes a prepared item and marks it ready — or drops it from the queue entirely when
// the search found nothing downloadable.
func (r *Repository) storeSnapshot(mediaID int, result *prepared) {
	value, err := json.Marshal(result.snapshot)
	if err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Failed to encode snapshot")
		_ = r.database.SetEnqueueFutureItemStatus(mediaID, db.EnqueueFutureStatusFailed, err.Error())
		return
	}

	var searchData *torrent.SearchData
	if result.snapshot != nil {
		searchData = result.snapshot.SearchData
	}
	best, count := bestSeeders(searchData)

	// Nothing to download and nothing to decide about, so the row goes rather than lingering as one
	// more thing to scroll past. Deleted rather than marked, the same way a tethered OVA is: it gives
	// its franchise slot back, and if a later run finds the anime again the search will have moved on
	// anyway. There is nothing here worth remembering.
	if count == 0 || best < MinSeeders {
		reason := "no torrents found"
		if count > 0 {
			reason = "best torrent has " + strconv.Itoa(best) + " seeders"
		}
		r.logger.Debug().
			Int("mediaId", mediaID).
			Int("torrents", count).
			Int("bestSeeders", best).
			Str("title", result.title).
			Str("reason", reason).
			Msg("enqueuefuture: Nothing downloadable, dropping it from the queue")
		if err := r.database.DeleteEnqueueFutureItem(mediaID); err != nil {
			r.logger.Warn().Err(err).Int("mediaId", mediaID).
				Msg("enqueuefuture: Could not drop an entry with nothing downloadable")
		}
		r.bumpSkipped()
		return
	}

	if err := r.database.SaveEnqueueFutureItemSnapshot(
		mediaID, db.EnqueueFutureStatusReady, result.title, result.coverImage, totalSeeders(searchData),
		airedAtOf(result), value,
	); err != nil {
		r.logger.Error().Err(err).Int("mediaId", mediaID).Msg("enqueuefuture: Failed to store snapshot")
		return
	}
}

// seasonOrder places the four seasons within a year, so a year and a season fold into one number
// that sorts the way a franchise actually ran.
var seasonOrder = map[string]int{"WINTER": 0, "SPRING": 1, "SUMMER": 2, "FALL": 3}

// airedAtOf reads the release year and season out of a prepared entry.
//
// Zero when the details carry no start date — an entry with nothing to place sorts to the end of its
// franchise rather than to the front of it, which is the safe end for something unknown to sit.
func airedAtOf(result *prepared) int {
	if result == nil || result.snapshot == nil || result.snapshot.Entry == nil || result.snapshot.Entry.Media == nil {
		return 0
	}
	media := result.snapshot.Entry.Media

	year := 0
	if media.GetStartDate() != nil && media.GetStartDate().GetYear() != nil {
		year = *media.GetStartDate().GetYear()
	}
	if year == 0 {
		return 0
	}

	season := 0
	if media.GetSeason() != nil {
		season = seasonOrder[string(*media.GetSeason())]
	}
	return year*10 + season
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

// Skipped is the one tally kept in memory: an anime rejected during discovery is never written to
// the queue at all, so there is no row for it to be counted from. Everything else comes from the
// database — see refreshCounts.
func (r *Repository) bumpSkipped() { r.update(func(s *Status) { s.Skipped++ }) }

// refreshCounts re-reads the run's progress from the queue.
//
// Called after every item, so the readout is whatever the database actually holds rather than a
// tally that drifts across a restart or a resume. Cheap next to the upstream calls it sits between.
func (r *Repository) refreshCounts(rootMediaID int) {
	counts, err := r.database.GetEnqueueFutureRunCounts(rootMediaID)
	if err != nil {
		r.logger.Warn().Err(err).Msg("enqueuefuture: Failed to read run counts")
		return
	}
	r.update(func(s *Status) {
		s.Discovered = counts.Items
		s.Prepared = counts.Prepared
		s.Failed = counts.Failed
		s.Families = counts.Families
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

// finish marks the run over. Idempotent, because it is called both explicitly on each exit path and
// from a deferred guard — and because a run left flagged as running is unrecoverable without a
// restart: every later Enqueue would be refused and the feature would simply stop responding.
func (r *Repository) finish(lastError string) {
	r.mu.Lock()
	if !r.running {
		r.mu.Unlock()
		return
	}
	r.running = false
	r.cancel = nil
	r.workerDone = nil
	r.status.Running = false
	r.status.RateLimited = false
	r.status.CurrentTitle = ""
	r.status.FinishedAt = time.Now()
	if lastError != "" {
		r.status.LastError = lastError
	}
	r.mu.Unlock()
	r.broadcast()

	// Straight on to the next anime somebody queued behind this one. In its own goroutine because
	// this is called from the worker that is finishing, and starting a run from inside it would have
	// the run own the goroutine that is meant to be ending.
	go r.startNextPendingRoot()
}
