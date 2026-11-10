package filecache

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type memTestValue struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	Blob  string `json:"blob"`
}

// A file written by the old interface{}-valued store must still load and decode into a typed value.
func TestLoadsOldFormatFile(t *testing.T) {
	dir := t.TempDir()
	old := `{"a":{"value":{"name":"x","count":3,"blob":""},"updated_at":"2026-01-02T03:04:05Z"},` +
		`"b":{"value":[1,2,3],"expiration":"2999-01-01T00:00:00Z"}}`
	if err := os.WriteFile(filepath.Join(dir, "old.cache"), []byte(old), 0644); err != nil {
		t.Fatal(err)
	}
	c, err := NewCacher(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	var v memTestValue
	ok, err := c.GetPerm(NewPermanentBucket("old"), "a", &v)
	if err != nil || !ok || v.Name != "x" || v.Count != 3 {
		t.Fatalf("GetPerm old entry: ok=%v err=%v v=%+v", ok, err, v)
	}
	var arr []int
	ok, err = c.Get(NewBucket("old", time.Hour), "b", &arr)
	if err != nil || !ok || len(arr) != 3 {
		t.Fatalf("Get old entry: ok=%v err=%v arr=%v", ok, err, arr)
	}
}

// Values are copied at Set time: mutating the caller's value afterwards must not change the cache.
func TestSetSnapshotsValue(t *testing.T) {
	c, err := NewCacher(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	b := NewPermanentBucket("snap")
	v := memTestValue{Name: "before"}
	if err := c.SetPerm(b, "k", &v); err != nil {
		t.Fatal(err)
	}
	v.Name = "after"
	var out memTestValue
	if ok, _ := c.GetPerm(b, "k", &out); !ok || out.Name != "before" {
		t.Fatalf("got %+v", out)
	}
}

// A bucket over the byte bound evicts its oldest entries and keeps the newest.
func TestByteBoundEvictsOldest(t *testing.T) {
	prev := maxStoreBytes
	maxStoreBytes = 10_000
	defer func() { maxStoreBytes = prev }()

	c, err := NewCacher(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	b := NewPermanentBucket("bytes")
	blob := strings.Repeat("x", 1000)
	for i := 0; i < 50; i++ {
		if err := c.SetPerm(b, string(rune('A'+i)), memTestValue{Count: i, Blob: blob}); err != nil {
			t.Fatal(err)
		}
		time.Sleep(time.Millisecond) // distinct UpdatedAt for ordering
	}
	store, _ := c.getStore("bytes")
	store.mu.Lock()
	size, n := store.size, len(store.data)
	store.mu.Unlock()
	if size > maxStoreBytes {
		t.Fatalf("store size %d over bound %d", size, maxStoreBytes)
	}
	if n == 0 || n >= 50 {
		t.Fatalf("expected some but not all entries kept, have %d", n)
	}
	var out memTestValue
	if ok, _ := c.GetPerm(b, string(rune('A'+49)), &out); !ok {
		t.Fatal("newest entry was evicted")
	}
	if ok, _ := c.GetPerm(b, "A", &out); ok {
		t.Fatal("oldest entry survived eviction")
	}
}

// Flushed files round-trip through a fresh cacher, and an oversized file is trimmed on load.
func TestFlushRoundTripAndTrimOnLoad(t *testing.T) {
	dir := t.TempDir()
	c, err := NewCacher(dir)
	if err != nil {
		t.Fatal(err)
	}
	b := NewPermanentBucket("rt")
	blob := strings.Repeat("y", 1000)
	for i := 0; i < 30; i++ {
		if err := c.SetPerm(b, string(rune('a'+i)), memTestValue{Name: "n", Count: i, Blob: blob}); err != nil {
			t.Fatal(err)
		}
	}
	if err := c.Close(); err != nil {
		t.Fatal(err)
	}

	c2, err := NewCacher(dir)
	if err != nil {
		t.Fatal(err)
	}
	all, err := GetAll[memTestValue](c2, NewBucket("rt", time.Hour))
	if err != nil || len(all) != 30 {
		t.Fatalf("round trip: err=%v len=%d", err, len(all))
	}
	_ = c2.Close()

	prev := maxStoreBytes
	maxStoreBytes = 5_000
	defer func() { maxStoreBytes = prev }()
	c3, err := NewCacher(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer c3.Close()
	store, err := c3.getStore("rt")
	if err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	size := store.size
	store.mu.Unlock()
	if size > maxStoreBytes {
		t.Fatalf("loaded store %d bytes, bound %d", size, maxStoreBytes)
	}
}
