package enmasse

import (
	"context"
	"errors"
	hibikemanga "seanime/internal/extension/hibike/manga"
	"testing"
	"time"

	"github.com/rs/zerolog"
)

var (
	errNotFound = errors.New("weebcentral: unexpected status 404 Not Found")
	errRate     = errors.New("weebcentral: rate limited (429)")
	err522      = errors.New("weebcentral: unexpected status 522 <none>")
)

// fakeProvider answers like a site that can be taken down: while down every request 404s, the way
// WeebCentral's maintenance does, and otherwise only the missing series does.
type fakeProvider struct {
	down          func() bool
	chaptersDown  bool // search works, chapter lists do not
	missingSeries string
	searchIDs     []string
	calls         int
}

func (f *fakeProvider) isDown() bool { return f.down != nil && f.down() }

func (f *fakeProvider) Search(hibikemanga.SearchOptions) ([]*hibikemanga.SearchResult, error) {
	f.calls++
	if f.isDown() {
		return nil, errNotFound
	}
	if len(f.searchIDs) == 0 {
		return []*hibikemanga.SearchResult{{ID: "known-series"}}, nil
	}
	results := make([]*hibikemanga.SearchResult, 0, len(f.searchIDs))
	for _, id := range f.searchIDs {
		results = append(results, &hibikemanga.SearchResult{ID: id})
	}
	return results, nil
}

func (f *fakeProvider) FindChapters(id string) ([]*hibikemanga.ChapterDetails, error) {
	f.calls++
	if f.isDown() || f.chaptersDown || id == f.missingSeries {
		return nil, errNotFound
	}
	return []*hibikemanga.ChapterDetails{{ID: "chapter-" + id}}, nil
}

func (f *fakeProvider) FindChapterPages(string) ([]*hibikemanga.ChapterPage, error) {
	f.calls++
	if f.isDown() {
		return nil, errNotFound
	}
	return []*hibikemanga.ChapterPage{{URL: "https://example.test/1.jpg"}}, nil
}

func (f *fakeProvider) GetSettings() hibikemanga.Settings { return hibikemanga.Settings{} }

// testWatchdog runs on a fake clock, so its sleeps add up without taking any time.
func testWatchdog() (*providerWatchdog, *time.Time, *[]time.Duration) {
	clock := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	slept := &[]time.Duration{}
	watch := newProviderWatchdog()
	watch.now = func() time.Time { return clock }
	watch.sleep = func(ctx context.Context, d time.Duration) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		*slept = append(*slept, d)
		clock = clock.Add(d)
		return nil
	}
	return watch, &clock, slept
}

func TestMissingSeriesOnHealthyProviderIsNotAnOutage(t *testing.T) {
	watch, _, slept := testWatchdog()
	provider := &fakeProvider{missingSeries: "gone"}

	_, err := retryThroughOutage(context.Background(), watch, provider, func() ([]*hibikemanga.ChapterDetails, error) {
		return provider.FindChapters("gone")
	})

	if !errors.Is(err, errNotFound) {
		t.Fatalf("want the request's own 404 so the series is skipped, got %v", err)
	}
	if isProviderWaitFailure(context.Background(), err) {
		t.Fatal("a missing series must not count as an outage")
	}
	if len(*slept) != 0 {
		t.Fatalf("a healthy provider must not be waited on, slept %v", *slept)
	}
}

func TestOutageWaitsAndRetriesUntilRecovery(t *testing.T) {
	watch, clock, slept := testWatchdog()
	recoverAt := clock.Add(time.Hour)
	provider := &fakeProvider{down: func() bool { return clock.Before(recoverAt) }}

	waits, recovered := 0, 0
	watch.onWait = func(wait providerWait) {
		waits++
		if wait.Attempt != waits {
			t.Fatalf("attempt %d reported on wait %d", wait.Attempt, waits)
		}
		if !wait.GiveUpAt.After(wait.NextProbe.Add(-time.Nanosecond)) {
			t.Fatalf("next probe %v is after the limit %v", wait.NextProbe, wait.GiveUpAt)
		}
	}
	watch.onRecover = func() { recovered++ }

	chapters, err := retryThroughOutage(context.Background(), watch, provider, func() ([]*hibikemanga.ChapterDetails, error) {
		return provider.FindChapters("series")
	})

	if err != nil {
		t.Fatalf("want success after recovery, got %v", err)
	}
	if len(chapters) != 1 || chapters[0].ID != "chapter-series" {
		t.Fatalf("want the series' own chapters, got %+v", chapters)
	}
	if recovered != 1 {
		t.Fatalf("want one recovery, got %d", recovered)
	}

	// 30s, 1m, 2m, 4m, 8m, then the 15m cap until the hour is up.
	want := []time.Duration{30 * time.Second, time.Minute, 2 * time.Minute, 4 * time.Minute, 8 * time.Minute, 15 * time.Minute, 15 * time.Minute, 15 * time.Minute}
	if len(*slept) != len(want) {
		t.Fatalf("want backoff %v, got %v", want, *slept)
	}
	for i := range want {
		if (*slept)[i] != want[i] {
			t.Fatalf("want backoff %v, got %v", want, *slept)
		}
	}
}

func TestLongOutageGivesUpAtTheLimit(t *testing.T) {
	watch, clock, _ := testWatchdog()
	provider := &fakeProvider{down: func() bool { return true }}
	start := *clock

	gaveUp := 0
	watch.onGiveUp = func(error) { gaveUp++ }

	_, err := retryThroughOutage(context.Background(), watch, provider, func() ([]*hibikemanga.ChapterDetails, error) {
		return provider.FindChapters("series")
	})

	if !errors.Is(err, errProviderOutage) {
		t.Fatalf("want errProviderOutage, got %v", err)
	}
	if !isProviderWaitFailure(context.Background(), err) {
		t.Fatal("giving up must leave the series unprocessed")
	}
	if waited := clock.Sub(start); waited != ProviderOutageMaxWait {
		t.Fatalf("want exactly the limit waited, got %v", waited)
	}
	if gaveUp != 1 {
		t.Fatalf("want one give-up, got %d", gaveUp)
	}
}

func TestTitlesAfterGivingUpDoNotWaitAgain(t *testing.T) {
	watch, clock, slept := testWatchdog()
	down := true
	provider := &fakeProvider{down: func() bool { return down }}
	request := func() ([]*hibikemanga.ChapterDetails, error) { return provider.FindChapters("series") }

	if _, err := retryThroughOutage(context.Background(), watch, provider, request); !errors.Is(err, errProviderOutage) {
		t.Fatalf("want errProviderOutage, got %v", err)
	}

	waited, sleeps := *clock, len(*slept)
	for range 5 {
		if _, err := retryThroughOutage(context.Background(), watch, provider, request); !errors.Is(err, errProviderOutage) {
			t.Fatalf("want errProviderOutage, got %v", err)
		}
	}
	if !clock.Equal(waited) || len(*slept) != sleeps {
		t.Fatalf("later titles must be deferred without waiting, clock moved %v", clock.Sub(waited))
	}

	// The first title after the site returns gets its request, and a fresh limit is back in force.
	down = false
	if chapters, err := retryThroughOutage(context.Background(), watch, provider, request); err != nil || len(chapters) != 1 {
		t.Fatalf("want success once the provider is back, got %v, %v", chapters, err)
	}
	if watch.gaveUp {
		t.Fatal("recovery must clear the give-up")
	}
}

func TestFailureDuringGiveUpOnRecoveredProviderIsStillJudged(t *testing.T) {
	watch, _, _ := testWatchdog()
	watch.gaveUp = true
	provider := &fakeProvider{missingSeries: "gone"}

	_, err := retryThroughOutage(context.Background(), watch, provider, func() ([]*hibikemanga.ChapterDetails, error) {
		return provider.FindChapters("gone")
	})

	if !errors.Is(err, errNotFound) {
		t.Fatalf("want the series treated as missing after one retry, got %v", err)
	}
}

func TestPartialOutageIsCaughtByTheProbe(t *testing.T) {
	watch, _, _ := testWatchdog()
	watch.maxWait = time.Minute
	provider := &fakeProvider{chaptersDown: true}

	_, err := retryThroughOutage(context.Background(), watch, provider, func() ([]*hibikemanga.ChapterDetails, error) {
		return provider.FindChapters("series")
	})

	if !errors.Is(err, errProviderOutage) {
		t.Fatalf("search working must not make a chapter list outage look like a missing series, got %v", err)
	}
}

func TestRateLimitWaitsWithoutProbingFirst(t *testing.T) {
	watch, _, slept := testWatchdog()
	provider := &fakeProvider{}

	retry, err := watch.await(context.Background(), provider, errRate)

	if err != nil || !retry {
		t.Fatalf("want a retry after the wait, got %v, %v", retry, err)
	}
	if len(*slept) != 1 || (*slept)[0] != ProviderOutageMinBackoff {
		t.Fatalf("want one backoff before anything else is sent, got %v", *slept)
	}
}

func TestPassing522OnHealthyProviderIsRetried(t *testing.T) {
	watch, _, slept := testWatchdog()
	provider := &fakeProvider{}

	failures := 2
	pages, err := retryThroughOutage(context.Background(), watch, provider, func() ([]*hibikemanga.ChapterPage, error) {
		if failures > 0 {
			failures--
			return nil, err522
		}
		return provider.FindChapterPages("chapter")
	})

	if err != nil || len(pages) != 1 {
		t.Fatalf("want the chapter fetched after the 522s pass, got %v, %v", pages, err)
	}
	if len(*slept) != 2 {
		t.Fatalf("want a wait before each retry, got %v", *slept)
	}
	if watch.transientRetries != 0 {
		t.Fatal("a success must clear the retry count")
	}
}

func TestStubborn522IsDeferredNotDropped(t *testing.T) {
	watch, _, _ := testWatchdog()
	provider := &fakeProvider{}

	attempts := 0
	_, err := retryThroughOutage(context.Background(), watch, provider, func() ([]*hibikemanga.ChapterPage, error) {
		attempts++
		return nil, err522
	})

	if !errors.Is(err, errProviderOutage) {
		t.Fatalf("want the series deferred, got %v", err)
	}
	if attempts != ProviderTransientRetries+1 {
		t.Fatalf("want %d attempts, got %d", ProviderTransientRetries+1, attempts)
	}
	if watch.gaveUp {
		t.Fatal("one bad request must not put the whole run in give-up")
	}
}

func TestPauseEndsTheWait(t *testing.T) {
	watch, _, _ := testWatchdog()
	ctx, cancel := context.WithCancel(context.Background())
	provider := &fakeProvider{down: func() bool { return true }}
	watch.onWait = func(providerWait) { cancel() }

	_, err := retryThroughOutage(ctx, watch, provider, func() ([]*hibikemanga.ChapterDetails, error) {
		return provider.FindChapters("series")
	})

	if !errors.Is(err, context.Canceled) || !isProviderWaitFailure(ctx, err) {
		t.Fatalf("want the title left unprocessed by the pause, got %v", err)
	}
}

func TestDeferredTitlesAreNotMarkedAndSurviveResume(t *testing.T) {
	logger := zerolog.Nop()
	d := NewMangaDownloader(&NewMangaDownloaderOptions{Logger: &logger})

	d.addToDeferred("One")
	d.addToDeferred("Two")
	d.addToDeferred("One")

	if d.deferredCount() != 2 {
		t.Fatalf("want 2 deferred titles, got %d", d.deferredCount())
	}
	if len(d.downloadedManga)+len(d.failedManga)+len(d.skippedManga) != 0 {
		t.Fatal("a deferred title must not land in the downloaded, failed or skipped lists")
	}

	d.mu.Lock()
	saved := d.deferredTitleList()
	d.mu.Unlock()

	resumed := NewMangaDownloader(&NewMangaDownloaderOptions{Logger: &logger})
	resumed.mu.Lock()
	resumed.restoreDeferred(saved)
	resumed.mu.Unlock()
	if !resumed.isDeferred("One") || !resumed.isDeferred("Two") {
		t.Fatalf("want deferred titles restored from %v", saved)
	}

	resumed.removeFromDeferred("One")
	if resumed.isDeferred("One") || resumed.deferredCount() != 1 || len(resumed.deferredManga) != 1 {
		t.Fatal("a processed title must leave the deferred list")
	}
}

func TestProbeTriesPastABrokenSeries(t *testing.T) {
	provider := &fakeProvider{missingSeries: "known-series"}
	if err := probeProvider(provider); err == nil {
		t.Fatal("want the probe to fail when its only series is broken")
	}

	provider = &fakeProvider{missingSeries: "broken", searchIDs: []string{"broken", "known-series"}}
	if err := probeProvider(provider); err != nil {
		t.Fatalf("one broken result must not read as an outage, got %v", err)
	}
}
