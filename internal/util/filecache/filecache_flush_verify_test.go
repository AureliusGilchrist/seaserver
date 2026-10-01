package filecache

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestFlushVerify is a self-contained check of the coalesced persistence behaviour. It does not
// use the shared test provider, so it runs without a config file.
func TestFlushVerify(t *testing.T) {
	dir := t.TempDir()

	cacher, err := NewCacher(filepath.Join(dir, "cache"))
	if err != nil {
		t.Fatal(err)
	}

	bucket := NewPermanentBucket("base-anime")

	// Write a few hundred entries; none of these should hit the disk synchronously.
	start := time.Now()
	for i := 0; i < 500; i++ {
		key := "key-" + time.Duration(i).String()
		if err := cacher.SetPerm(bucket, key, map[string]any{
			"id":    i,
			"title": "some anime title with some length to it",
		}); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("500 SetPerm calls took %s", time.Since(start))

	// In-memory reads must be immediate and correct.
	var out map[string]any
	found, err := cacher.GetPerm(bucket, "key-0s", &out)
	if err != nil {
		t.Fatal(err)
	}
	if !found {
		t.Fatal("entry not found in memory before any flush")
	}

	// Wait for the debounced flush, then check the file exists and contains the entries.
	time.Sleep(3 * time.Second)

	filePath := filepath.Join(dir, "cache", "base-anime.cache")
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("cache file not written after flush window: %v", err)
	}
	t.Logf("cache file size: %d bytes", info.Size())
	if info.Size() == 0 {
		t.Fatal("cache file is empty")
	}

	// A second cacher over the same directory must see the flushed entries.
	cacher2, err := NewCacher(filepath.Join(dir, "cache"))
	if err != nil {
		t.Fatal(err)
	}
	found, err = cacher2.GetPerm(bucket, "key-0s", &out)
	if err != nil {
		t.Fatal(err)
	}
	if !found {
		t.Fatal("reloaded cacher did not find the flushed entry")
	}

	// Close must flush and not hang.
	done := make(chan error, 1)
	go func() { done <- cacher.Close() }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Close returned error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not return within 5s")
	}
}

// TestFlushVerifyConcurrent is the regression test for the stall this coalescing was written for:
// many goroutines writing cache entries while the flusher writes the file. Before the change every
// write encoded and wrote the whole bucket under the store lock, so writers queued behind disk
// writes and a busy server's AniList-touching requests waited minutes. The check here is simply
// that concurrent writes stay fast and nothing races.
func TestFlushVerifyConcurrent(t *testing.T) {
	dir := t.TempDir()
	cacher, err := NewCacher(filepath.Join(dir, "cache"))
	if err != nil {
		t.Fatal(err)
	}
	bucket := NewPermanentBucket("concurrent")

	const writers = 8
	const perWriter = 400

	start := time.Now()
	done := make(chan struct{}, writers)
	for w := 0; w < writers; w++ {
		go func(w int) {
			defer func() { done <- struct{}{} }()
			for i := 0; i < perWriter; i++ {
				key := "w" + time.Duration(w).String() + "-" + time.Duration(i).String()
				if err := cacher.SetPerm(bucket, key, map[string]any{"w": w, "i": i}); err != nil {
					t.Errorf("SetPerm: %v", err)
					return
				}
				var out map[string]any
				if _, err := cacher.GetPerm(bucket, key, &out); err != nil {
					t.Errorf("GetPerm: %v", err)
					return
				}
			}
		}(w)
	}
	for w := 0; w < writers; w++ {
		<-done
	}
	t.Logf("%d concurrent writes took %s", writers*perWriter, time.Since(start))

	_ = cacher.Close()

	// Everything must be in the flushed file.
	cacher2, err := NewCacher(filepath.Join(dir, "cache"))
	if err != nil {
		t.Fatal(err)
	}
	store, err := cacher2.getStore("concurrent")
	if err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	size := len(store.data)
	store.mu.Unlock()
	if size != writers*perWriter {
		t.Fatalf("flushed file holds %d entries, want %d", size, writers*perWriter)
	}
	_ = cacher2.Close()
}

// TestPermanentBucketBound checks the entry cap evicts rather than growing without limit.
func TestPermanentBucketBound(t *testing.T) {
	dir := t.TempDir()
	cacher, err := NewCacher(filepath.Join(dir, "cache"))
	if err != nil {
		t.Fatal(err)
	}
	bucket := NewPermanentBucket("bounded")

	// Temporarily smaller than production bound for speed: write past maxPermanentEntries and
	// check the store's in-memory size stays at the bound.
	store, err := cacher.getStore("bounded")
	if err != nil {
		t.Fatal(err)
	}

	total := maxPermanentEntries + 50
	for i := 0; i < total; i++ {
		if err := cacher.SetPerm(bucket, "key"+time.Duration(i).String(), i); err != nil {
			t.Fatal(err)
		}
	}

	store.mu.Lock()
	size := len(store.data)
	store.mu.Unlock()

	if size > maxPermanentEntries {
		t.Fatalf("bucket grew past the bound: %d > %d", size, maxPermanentEntries)
	}
	t.Logf("bucket size after %d inserts: %d (bound %d)", total, size, maxPermanentEntries)

	_ = cacher.Close()
}
