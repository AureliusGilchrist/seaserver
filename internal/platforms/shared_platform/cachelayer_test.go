package shared_platform

import (
	"errors"
	"testing"

	"seanime/internal/util"
	"seanime/internal/util/filecache"
)

type cacheLayerTestValue struct {
	Value string `json:"value"`
}

func TestNetworkFirstGetRetriesNetworkOnOfflineCacheMiss(t *testing.T) {
	withCacheLayerState(t, false)
	cache, err := filecache.NewCacher(t.TempDir())
	if err != nil {
		t.Fatalf("create cache: %v", err)
	}
	bucket := filecache.NewPermanentBucket("network-first-test")
	layer := &CacheLayer{
		fileCacher: cache,
		buckets:    map[string]filecache.PermanentBucket{"test": bucket},
		logger:     util.NewLogger(),
	}
	want := &cacheLayerTestValue{Value: "schedule"}
	calls := 0

	got, err := networkFirstGet(layer, "test", "key", func() (*cacheLayerTestValue, error) {
		calls++
		return want, nil
	})
	if err != nil {
		t.Fatalf("networkFirstGet returned an error: %v", err)
	}
	if got != want {
		t.Fatalf("networkFirstGet returned %#v, want %#v", got, want)
	}
	if calls != 1 {
		t.Fatalf("network called %d times, want 1", calls)
	}

	var cached cacheLayerTestValue
	found, err := cache.GetPerm(bucket, "key", &cached)
	if err != nil {
		t.Fatalf("read cached result: %v", err)
	}
	if !found || cached.Value != want.Value {
		t.Fatalf("cached result = %#v, found = %t; want %#v", cached, found, *want)
	}
}

func TestNetworkFirstGetReturnsNetworkErrorOnOfflineCacheMiss(t *testing.T) {
	withCacheLayerState(t, false)
	cache, err := filecache.NewCacher(t.TempDir())
	if err != nil {
		t.Fatalf("create cache: %v", err)
	}
	layer := &CacheLayer{
		fileCacher: cache,
		buckets:    map[string]filecache.PermanentBucket{"test": filecache.NewPermanentBucket("network-error-test")},
		logger:     util.NewLogger(),
	}
	wantErr := errors.New("AniList unavailable")

	got, err := networkFirstGet(layer, "test", "key", func() (*cacheLayerTestValue, error) {
		return nil, wantErr
	})
	if got != nil {
		t.Fatalf("networkFirstGet returned %#v, want nil", got)
	}
	if !errors.Is(err, wantErr) {
		t.Fatalf("networkFirstGet error = %v, want %v", err, wantErr)
	}
}

func withCacheLayerState(t *testing.T, isWorking bool) {
	t.Helper()

	previousShouldCache := ShouldCache.Load()
	previousIsWorking := IsWorking.Load()
	failureTrackingMutex.Lock()
	previousFailures := append([]failureRecord(nil), failureTracking...)
	failureTrackingMutex.Unlock()

	ShouldCache.Store(true)
	IsWorking.Store(isWorking)
	clearFailureTracking()

	t.Cleanup(func() {
		ShouldCache.Store(previousShouldCache)
		IsWorking.Store(previousIsWorking)
		failureTrackingMutex.Lock()
		failureTracking = previousFailures
		failureTrackingMutex.Unlock()
	})
}
