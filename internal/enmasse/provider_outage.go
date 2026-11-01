package enmasse

import (
	"context"
	"errors"
	"fmt"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"strings"
	"time"
)

const (
	// ProviderProbeQuery is what the health probe searches for. Any series the provider is certain to
	// carry will do; the probe only needs one with chapters and pages to walk.
	ProviderProbeQuery = "One Piece"
	// providerProbeCandidates is how many search results the probe tries, so that one broken series
	// at the top of the results does not read as the whole site being down.
	providerProbeCandidates = 3

	// Between probes of a provider that is down: starts short for a blip, settles at a pace that is
	// reasonable to keep up for hours against a site that is having a bad day.
	ProviderOutageMinBackoff = 30 * time.Second
	ProviderOutageMaxBackoff = 15 * time.Minute
	// ProviderOutageMaxWait is how long the run stays parked on one outage before it moves on. Long
	// enough to sit out a maintenance window, short of leaving an overnight run doing nothing.
	ProviderOutageMaxWait = 6 * time.Hour

	// ProviderTransientRetries is how many times one request is sent again after a server-side
	// failure while the rest of the site is fine. Cloudflare's 522 is the usual one: it hits a single
	// request and is gone by the time anything checks.
	ProviderTransientRetries = 3
)

// errProviderOutage means a series could not be processed because the provider is down, which says
// nothing about the series. It is never a verdict: the title stays unprocessed and comes back on the
// next resume.
var errProviderOutage = errors.New("provider is down")

// providerWait describes a wait in progress, for the status the UI shows.
type providerWait struct {
	Attempt   int
	StartedAt time.Time
	NextProbe time.Time
	GiveUpAt  time.Time
	Cause     error
}

// providerWatchdog decides what a failed provider request means, and sits out the failure if it
// means the provider is down.
//
// A status code cannot answer that. During a WeebCentral maintenance a series that exists and one
// that does not get the same 404, and the site's front page answers 200 with a picture of a closed
// sign, so asking the front page would report a healthy site. The only question with a useful answer
// is whether requests that normally work still do, which is what probeProvider asks.
//
// It belongs to one run and is only used from that run's goroutine.
type providerWatchdog struct {
	minBackoff time.Duration
	maxBackoff time.Duration
	maxWait    time.Duration

	now   func() time.Time
	sleep func(ctx context.Context, d time.Duration) error

	onWait    func(providerWait)
	onRecover func()
	onGiveUp  func(cause error)

	// gaveUp is set once an outage has used up maxWait, and holds until a probe passes. Without it
	// each of the thousands of titles left in the list would wait the full limit in turn, which is
	// the hang the limit exists to prevent.
	gaveUp bool

	// transientRetries counts retries of the current request; a success clears it.
	transientRetries int
}

func newProviderWatchdog() *providerWatchdog {
	return &providerWatchdog{
		minBackoff: ProviderOutageMinBackoff,
		maxBackoff: ProviderOutageMaxBackoff,
		maxWait:    ProviderOutageMaxWait,
		now:        time.Now,
		sleep:      sleepContext,
		onWait:     func(providerWait) {},
		onRecover:  func() {},
		onGiveUp:   func(error) {},
	}
}

func sleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// await is called with the error from a failed provider request and reports what to do about it.
//
//	(false, nil)   the provider is healthy, so the failure belongs to this series or chapter
//	(true, nil)    send the request again: the provider recovered, or the failure looks passing
//	(false, err)   errProviderOutage after giving up, or the context's error
func (w *providerWatchdog) await(ctx context.Context, provider hibikemanga.Provider, cause error) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}

	// A provider that said 429 asked for fewer requests, so it does not get three more straight away.
	if !isRateLimitError(cause) {
		probeErr := probeProvider(provider)
		if probeErr == nil {
			if w.gaveUp {
				// The failure may date from the outage, so the request earns one more try.
				w.gaveUp = false
				w.onRecover()
				return true, nil
			}
			if isTransientProviderError(cause) {
				return w.retryTransient(ctx, cause)
			}
			return false, nil
		}
		cause = probeErr
	}

	if w.gaveUp {
		return false, fmt.Errorf("%w: %v", errProviderOutage, cause)
	}

	startedAt := w.now()
	giveUpAt := startedAt.Add(w.maxWait)
	backoff := w.minBackoff

	for attempt := 1; ; attempt++ {
		remaining := giveUpAt.Sub(w.now())
		if remaining <= 0 {
			w.gaveUp = true
			w.onGiveUp(cause)
			return false, fmt.Errorf("%w: %v", errProviderOutage, cause)
		}

		delay := min(backoff, remaining)
		w.onWait(providerWait{
			Attempt:   attempt,
			StartedAt: startedAt,
			NextProbe: w.now().Add(delay),
			GiveUpAt:  giveUpAt,
			Cause:     cause,
		})
		if err := w.sleep(ctx, delay); err != nil {
			return false, err
		}

		probeErr := probeProvider(provider)
		if probeErr == nil {
			w.onRecover()
			return true, nil
		}
		cause = probeErr
		backoff = min(backoff*2, w.maxBackoff)
	}
}

// retryTransient spaces out another try of a request that failed server-side on a healthy provider.
// One that keeps failing is deferred, not skipped: a 5xx is the server's trouble and says nothing
// about whether the series exists.
func (w *providerWatchdog) retryTransient(ctx context.Context, cause error) (bool, error) {
	if w.transientRetries >= ProviderTransientRetries {
		w.transientRetries = 0
		return false, fmt.Errorf("%w: %v", errProviderOutage, cause)
	}
	w.transientRetries++

	nextProbe := w.now().Add(w.minBackoff)
	w.onWait(providerWait{
		Attempt:   w.transientRetries,
		StartedAt: w.now(),
		NextProbe: nextProbe,
		GiveUpAt:  w.now().Add(time.Duration(ProviderTransientRetries-w.transientRetries+1) * w.minBackoff),
		Cause:     cause,
	})
	if err := w.sleep(ctx, w.minBackoff); err != nil {
		return false, err
	}
	w.onRecover()
	return true, nil
}

// succeeded is called when a provider request comes back fine, which is the best health check of all.
func (w *providerWatchdog) succeeded() {
	w.transientRetries = 0
	if w.gaveUp {
		w.gaveUp = false
		w.onRecover()
	}
}

// retryThroughOutage runs a provider request, sitting out any outage it runs into. When the provider
// is healthy the request's own error comes back, so the caller handles it as it always has.
func retryThroughOutage[T any](ctx context.Context, watch *providerWatchdog, provider hibikemanga.Provider, request func() (T, error)) (T, error) {
	for {
		result, err := request()
		if err == nil {
			watch.succeeded()
			return result, nil
		}
		retry, waitErr := watch.await(ctx, provider, err)
		if waitErr != nil {
			var zero T
			return zero, waitErr
		}
		if !retry {
			return result, err
		}
	}
}

// isProviderWaitFailure reports whether err ended a title's processing without saying anything about
// the title: the outage limit ran out, or the run was paused while waiting.
func isProviderWaitFailure(ctx context.Context, err error) bool {
	return err != nil && (errors.Is(err, errProviderOutage) || ctx.Err() != nil)
}

// probeProvider walks the path a download takes, search to chapter list to pages, on a series the
// provider itself just listed. Every step is one that can fail alone: a site can serve search while
// its chapter lists are down, and a series the search just returned cannot be "missing".
func probeProvider(provider hibikemanga.Provider) error {
	results, err := provider.Search(hibikemanga.SearchOptions{Query: ProviderProbeQuery})
	if err != nil {
		return fmt.Errorf("search: %w", err)
	}

	var lastErr error
	tried := 0
	for _, result := range results {
		if result == nil || result.ID == "" {
			continue
		}
		if tried == providerProbeCandidates {
			break
		}
		tried++

		if lastErr = probeSeries(provider, result.ID); lastErr == nil {
			return nil
		}
	}
	if lastErr != nil {
		return lastErr
	}
	return errors.New("search: no usable results")
}

func probeSeries(provider hibikemanga.Provider, seriesID string) error {
	chapters, err := provider.FindChapters(seriesID)
	if err != nil {
		return fmt.Errorf("chapter list: %w", err)
	}
	for i := len(chapters) - 1; i >= 0; i-- {
		if chapters[i] == nil || chapters[i].ID == "" {
			continue
		}
		pages, err := provider.FindChapterPages(chapters[i].ID)
		if err != nil {
			return fmt.Errorf("chapter pages: %w", err)
		}
		if len(pages) == 0 {
			return errors.New("chapter pages: empty")
		}
		return nil
	}
	return errors.New("chapter list: empty")
}

// isTransientProviderError reports a failure that came from the server or the road to it, rather than
// an answer about what was asked for. 404 is not here: on a healthy site it means the series is gone.
func isTransientProviderError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "unexpected status 5") ||
		strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "deadline exceeded") ||
		strings.Contains(errStr, "connection") ||
		strings.Contains(errStr, "eof") ||
		strings.Contains(errStr, "temporarily unavailable")
}

func isRateLimitError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "rate limit") ||
		strings.Contains(errStr, "too many requests") ||
		strings.Contains(errStr, "429")
}
