package filecache

import (
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/util"
	"strings"
	"sync"
	"time"

	"github.com/goccy/go-json"
	"github.com/samber/lo"
)

// CacheStore represents a single-process, file-based, key/value cache store.
//
// Persistence is coalesced: mutations mark the store dirty and wake a background flusher rather
// than re-encoding and re-writing the whole file on every call. The store's file holds one JSON
// object for every key in the bucket, and a bucket like the AniList base-anime cache runs to tens
// of thousands of entries — hundreds of megabytes on a server that has been running a while.
// Re-writing that per SetPerm, under the store lock, meant each cache write took as long as a
// full-file marshal plus a synced write to disk, and with the server's background workers writing
// several entries a second, callers queued behind the writes faster than the writes could finish.
// From the outside that was every AniList-touching request — home, playback metadata, matching —
// parked for as long as the queue took to drain, which on a NAS-mounted cache directory was many
// minutes at startup and grew every session as the buckets grew.
//
// The whole file is still written on flush (the format is unchanged); what changed is how often,
// and that nobody waits for it. A crash now costs at most flushMaxDelay worth of newly written
// entries — acceptable for a cache whose only job is surviving restarts.
type CacheStore struct {
	filePath string
	mu       sync.Mutex
	data     map[string]*cacheItem

	// dirty is set by every mutation (under mu) and cleared by the flusher once the file holds
	// everything currently in memory. Manipulated only under mu except by the flusher, which
	// re-checks it under mu when it snapshots.
	dirty bool

	// flush lifecycle. poke wakes the flusher (buffered, so waking is never blocking);
	// stop tells it to do a final flush and exit; done is closed when it has.
	poke chan struct{}
	stop chan struct{}
	done chan struct{}

	// loading gates first use: closed once loadFromFile has run, so a caller that did not create
	// the store still cannot touch data before the file's contents are in it.
	loading chan struct{}
	// loadErr carries a file-open failure out of the one-time load to every caller, matching the
	// old getStore behaviour of reporting it. Read only after loading is closed.
	loadErr error
	// stopOnce makes flushAndStop safe to call more than once (Close, then Remove).
	stopOnce sync.Once
}

// Bucket represents a cache bucket with a name and TTL.
type Bucket struct {
	name string
	ttl  time.Duration
}

type PermanentBucket struct {
	name string
}

func NewBucket(name string, ttl time.Duration) Bucket {
	return Bucket{name: name, ttl: ttl}
}

func (b *Bucket) Name() string {
	return b.name
}

func NewPermanentBucket(name string) PermanentBucket {
	return PermanentBucket{name: name}
}

func (b *PermanentBucket) Name() string {
	return b.name
}

// Cacher represents a single-process, file-based, key/value cache.
type Cacher struct {
	dir    string
	stores map[string]*CacheStore
	mu     sync.Mutex
}

type cacheItem struct {
	Value      interface{} `json:"value"`
	Expiration *time.Time `json:"expiration,omitempty"`
	UpdatedAt  *time.Time `json:"updated_at,omitempty"`
}

// NewCacher creates a new instance of Cacher.
func NewCacher(dir string) (*Cacher, error) {
	// Check if the directory exists
	_, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			if err := os.MkdirAll(dir, os.ModePerm); err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}
	return &Cacher{
		stores: make(map[string]*CacheStore),
		dir:    dir,
	}, nil
}

// Close stops every store's flusher after a final synchronous flush.
func (c *Cacher) Close() error {
	c.mu.Lock()
	stores := make([]*CacheStore, 0, len(c.stores))
	for _, store := range c.stores {
		stores = append(stores, store)
	}
	c.mu.Unlock()

	var firstErr error
	for _, store := range stores {
		if err := store.flushAndStop(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (c *Cacher) Clear() error {
	// Stop the old stores' flushers so their goroutines do not outlive the map entry.
	if err := c.Close(); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.stores = make(map[string]*CacheStore)
	return nil
}

// getStore returns a cache store for the given bucket name.
//
// The store is created under the cacher lock, but its file is loaded outside it: the load decodes
// what can be a very large file, and holding the cacher lock for that meant a slow load of one
// bucket blocked access to every other bucket's store. The load itself happens under the store's
// own mutex (in the creator), and every other caller waits on the store's loading gate before
// touching its data, so no one sees a half-loaded bucket.
func (c *Cacher) getStore(name string) (*CacheStore, error) {
	c.mu.Lock()
	store, ok := c.stores[name]
	created := false
	if !ok {
		store = &CacheStore{
			filePath: filepath.Join(c.dir, name+".cache"),
			data:     make(map[string]*cacheItem),
			poke:     make(chan struct{}, 1),
			stop:     make(chan struct{}),
			done:     make(chan struct{}),
			loading:  make(chan struct{}),
		}
		c.stores[name] = store
		created = true
	}
	c.mu.Unlock()

	if created {
		// The flusher exists from the moment the store does, so a mutation never has to think
		// about starting one.
		go store.flushLoop()
		// The decode of a large bucket file can take a while on a slow disk; the loading gate
		// keeps everyone else out of the data until it is done. loadErr is written before the
		// gate opens, so a reader released by the close is guaranteed to see it.
		func() {
			store.mu.Lock()
			defer store.mu.Unlock()
			store.loadErr = store.loadFromFile()
			close(store.loading)
		}()
	}

	<-store.loading
	if store.loadErr != nil {
		return nil, store.loadErr
	}
	return store, nil
}

// markDirty records that the file no longer reflects the data and wakes the flusher.
// Called with store.mu held; never blocks.
func (cs *CacheStore) markDirty() {
	cs.dirty = true
	select {
	case cs.poke <- struct{}{}:
	default:
	}
}

// flushDebounce is how long the flusher waits after the last mutation before writing the file, so
// a burst of writes costs one encode-and-write instead of one per entry.
const flushDebounce = 2 * time.Second

// flushMaxDelay bounds how long dirty data may sit in memory when writes keep coming: under
// steady load the debounce above would otherwise keep re-arming indefinitely.
const flushMaxDelay = 30 * time.Second

// flushLoop writes the store's file when it is dirty, until stopped.
//
// Two timers, deliberately different: the debounce is re-armed by every poke, so a burst of writes
// costs one write once the burst goes quiet; the max-delay is armed once when the store becomes
// dirty and is NOT re-armed by further pokes, so a steady stream of writes can never postpone the
// write indefinitely — the file is written at least every flushMaxDelay while anything is dirty.
func (cs *CacheStore) flushLoop() {
	defer close(cs.done)
	debounce := time.NewTimer(flushDebounce)
	debounce.Stop()
	maxDelay := time.NewTimer(flushMaxDelay)
	maxDelay.Stop()
	maxArmed := false

	for {
		select {
		case <-cs.poke:
			resetTimer(debounce, flushDebounce)
			if !maxArmed {
				maxArmed = true
				resetTimer(maxDelay, flushMaxDelay)
			}
		case <-debounce.C:
			maxArmed = false
			_ = cs.flushLockedIfNeeded()
		case <-maxDelay.C:
			maxArmed = false
			_ = cs.flushLockedIfNeeded()
		case <-cs.stop:
			// Final synchronous flush on the way out.
			_ = cs.flushLockedIfNeeded()
			return
		}
	}
}

// resetTimer re-arms a timer to d from now, draining a pending fire if there was one.
func resetTimer(t *time.Timer, d time.Duration) {
	if !t.Stop() {
		select {
		case <-t.C:
		default:
		}
	}
	t.Reset(d)
}

// flushLockedIfNeeded writes the file if the store is dirty.
//
// The snapshot is taken under the store lock and encoded outside it, so a caller reading or writing
// the cache is never held up for the duration of a marshal or a disk write — only for the map
// copy, which is pointer-sized and fast even for tens of thousands of entries.
func (cs *CacheStore) flushLockedIfNeeded() error {
	cs.mu.Lock()
	if !cs.dirty {
		cs.mu.Unlock()
		return nil
	}
	snapshot := make(map[string]*cacheItem, len(cs.data))
	for k, v := range cs.data {
		snapshot[k] = v
	}
	cs.dirty = false
	cs.mu.Unlock()

	data, err := json.Marshal(snapshot)
	if err != nil {
		// Put the snapshot back on the dirty pile; it is still in memory and still served,
		// it just has not reached the file yet. The re-poke re-arms the timers so the write is
		// retried even if nothing else is written in the meantime.
		cs.mu.Lock()
		cs.dirty = true
		cs.mu.Unlock()
		select {
		case cs.poke <- struct{}{}:
		default:
		}
		return fmt.Errorf("filecache: failed to encode cache data: %w", err)
	}
	if err := util.WriteFileCrashSafe(cs.filePath, data, 0644); err != nil {
		cs.mu.Lock()
		cs.dirty = true
		cs.mu.Unlock()
		select {
		case cs.poke <- struct{}{}:
		default:
		}
		return fmt.Errorf("filecache: failed to write cache file: %w", err)
	}
	return nil
}

// flushAndStop performs a final flush and waits for the flusher goroutine to exit. Idempotent:
// Close may run first (whole cacher), then Remove (one bucket), and both ask the flusher to stop.
func (cs *CacheStore) flushAndStop() error {
	cs.stopOnce.Do(func() { close(cs.stop) })
	<-cs.done
	return nil
}

// Set sets the value for the given key in the given bucket.
func (c *Cacher) Set(bucket Bucket, key string, value interface{}) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	store.data[key] = &cacheItem{Value: value, Expiration: lo.ToPtr(time.Now().Add(bucket.ttl))}
	store.markDirty()
	store.mu.Unlock()
	return nil
}

func Range[T any](c *Cacher, bucket Bucket, f func(key string, value T) bool) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	expired := false
	for key, item := range store.data {
		if item.Expiration != nil && time.Now().After(*item.Expiration) {
			delete(store.data, key)
			expired = true
		} else {
			itemVal, err := json.Marshal(item.Value)
			if err != nil {
				return err
			}
			var out T
			err = json.Unmarshal(itemVal, &out)
			if err != nil {
				return err
			}
			if !f(key, out) {
				break
			}
		}
	}
	if expired {
		store.markDirty()
	}

	return nil
}

// Get retrieves the value for the given key from the given bucket.
func (c *Cacher) Get(bucket Bucket, key string, out interface{}) (bool, error) {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return false, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	item, ok := store.data[key]
	if !ok {
		return false, nil
	}
	if item.Expiration != nil && time.Now().After(*item.Expiration) {
		delete(store.data, key)
		store.markDirty()
		return false, nil
	}
	data, err := json.Marshal(item.Value)
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(data, out)
}

func GetAll[T any](c *Cacher, bucket Bucket) (map[string]T, error) {
	data := make(map[string]T)
	err := Range(c, bucket, func(key string, value T) bool {
		data[key] = value
		return true
	})
	if err != nil {
		return nil, err
	}

	return data, nil
}

// Delete deletes the value for the given key from the given bucket.
func (c *Cacher) Delete(bucket Bucket, key string) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	delete(store.data, key)
	store.markDirty()
	store.mu.Unlock()
	return nil
}

func DeleteIf[T any](c *Cacher, bucket Bucket, cond func(key string, value T) bool) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	removed := false
	for key, item := range store.data {
		itemVal, err := json.Marshal(item.Value)
		if err != nil {
			return err
		}
		var out T
		err = json.Unmarshal(itemVal, &out)
		if err != nil {
			return err
		}
		if cond(key, out) {
			delete(store.data, key)
			removed = true
		}
	}
	if removed {
		store.markDirty()
	}

	return nil
}

// Empty empties the given bucket.
func (c *Cacher) Empty(bucket Bucket) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	store.data = make(map[string]*cacheItem)
	store.markDirty()
	store.mu.Unlock()
	return nil
}

// Remove removes the given bucket.
func (c *Cacher) Remove(bucketName string) error {
	c.mu.Lock()
	store, ok := c.stores[bucketName]
	if ok {
		delete(c.stores, bucketName)
	}
	c.mu.Unlock()

	if ok {
		// Stop the flusher so its goroutine does not outlive the map entry.
		_ = store.flushAndStop()
	}

	_ = os.Remove(filepath.Join(c.dir, bucketName+".cache"))

	return nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// maxPermanentEntries bounds how large a permanent bucket may grow.
//
// Buckets are written and loaded whole, so an unbounded bucket is an unbounded file: the AniList
// base-anime cache accumulated tens of thousands of entries this way — one for every anime any
// background worker ever fetched, including every relation node of every recommendation graph
// walk — and the cost of each write grew with it. Past the bound the oldest entries are evicted;
// a cache entry is only ever a fetch someone can make again, and the entries that matter are the
// recent ones, which is what UpdatedAt tracks.
const maxPermanentEntries = 25000

// SetPerm sets the value for the given key in the permanent bucket (no expiration).
func (c *Cacher) SetPerm(bucket PermanentBucket, key string, value interface{}) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	store.data[key] = &cacheItem{Value: value, UpdatedAt: lo.ToPtr(time.Now())} // No expiration
	// Evict the oldest entry while over the bound, so a walk through a large franchise cannot
	// grow the file without limit. One eviction per insertion keeps the bucket at the bound
	// without a separate sweep.
	if len(store.data) > maxPermanentEntries {
		oldestKey := ""
		var oldestTime time.Time
		for k, item := range store.data {
			updatedAt := time.Time{}
			if item.UpdatedAt != nil {
				updatedAt = *item.UpdatedAt
			}
			if oldestKey == "" || updatedAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = updatedAt
			}
		}
		if oldestKey != "" && oldestKey != key {
			delete(store.data, oldestKey)
		}
	}
	store.markDirty()
	store.mu.Unlock()
	return nil
}

// GetPerm retrieves the value for the given key from the permanent bucket (ignores expiration).
func (c *Cacher) GetPerm(bucket PermanentBucket, key string, out interface{}) (bool, error) {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return false, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	item, ok := store.data[key]
	if !ok {
		return false, nil
	}
	data, err := json.Marshal(item.Value)
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(data, out)
}

// DeletePerm deletes the value for the given key from the permanent bucket.
func (c *Cacher) DeletePerm(bucket PermanentBucket, key string) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	delete(store.data, key)
	store.markDirty()
	store.mu.Unlock()
	return nil
}

// DeletePermOldest deletes the oldest value from the permanent bucket.
func (c *Cacher) DeletePermOldest(bucket PermanentBucket) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	oldestKey := ""
	oldestTime := time.Now()
	for key, item := range store.data {
		updatedAt := time.Time{} // Default to 0 time
		if item.UpdatedAt != nil {
			updatedAt = *item.UpdatedAt
		}
		if updatedAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = updatedAt
		}
	}
	delete(store.data, oldestKey)
	store.markDirty()
	return nil
}

// EmptyPerm empties the permanent bucket.
func (c *Cacher) EmptyPerm(bucket PermanentBucket) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	store.data = make(map[string]*cacheItem)
	store.markDirty()
	store.mu.Unlock()
	return nil
}

// RemovePerm calls Remove.
func (c *Cacher) RemovePerm(bucketName string) error {
	return c.Remove(bucketName)
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// ClearMediastreamVideoFiles clears all mediastream video file caches.
//
// The store map is reset through the same Close path Clear uses, so the reset stores' flushers are
// stopped rather than left running against a map nobody can reach.
func (c *Cacher) ClearMediastreamVideoFiles() error {
	files, err := os.ReadDir(filepath.Join(c.dir, "videofiles"))
	if err != nil {
		return nil
	}
	for _, file := range files {
		_ = os.RemoveAll(filepath.Join(c.dir, "videofiles", file.Name()))
	}

	err = c.RemoveAllBy(func(filename string) bool {
		return strings.HasPrefix(filename, "mediastream")
	})

	_ = c.Clear()
	return err
}

// TrimMediastreamVideoFiles clears all mediastream video file caches if the number of files exceeds the given limit.
func (c *Cacher) TrimMediastreamVideoFiles() error {
	// Remove the contents of the "videofiles" cache directory
	files, err := os.ReadDir(filepath.Join(c.dir, "videofiles"))
	if err != nil {
		return nil
	}

	// If the number of files exceeds 10, remove all files
	if len(files) > 10 {
		for _, file := range files {
			_ = os.RemoveAll(filepath.Join(c.dir, "videofiles", file.Name()))
		}
	}

	_ = c.Clear()
	return err
}

func (c *Cacher) GetMediastreamVideoFilesTotalSize() (int64, error) {
	_, err := os.Stat(filepath.Join(c.dir, "videofiles"))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	var totalSize int64
	err = filepath.Walk(filepath.Join(c.dir, "videofiles"), func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			totalSize += info.Size()
		}
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("filecache: failed to walk the cache directory: %w", err)
	}

	return totalSize, nil
}

// GetTotalSize returns the total size of all files in the cache directory.
// The size is in bytes.
func (c *Cacher) GetTotalSize() (int64, error) {
	var totalSize int64
	err := filepath.Walk(c.dir, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			totalSize += info.Size()
		}
		return nil
	})

	if err != nil {
		return 0, fmt.Errorf("filecache: failed to walk the cache directory: %w", err)
	}

	return totalSize, nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

func (cs *CacheStore) loadFromFile() error {
	file, err := os.Open(cs.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // File does not exist, so nothing to load
		}
		return fmt.Errorf("filecache: failed to open cache file: %w", err)
	}
	defer file.Close()

	if err := json.NewDecoder(file).Decode(&cs.data); err != nil {
		// If decode fails (empty or corrupted file), initialize with empty data
		cs.data = make(map[string]*cacheItem)
		return nil
	}

	return nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// RemoveAllBy removes all files in the cache directory that match the given filter.
func (c *Cacher) RemoveAllBy(filter func(filename string) bool) error {
	c.mu.Lock()
	entries, err := os.ReadDir(c.dir)
	c.mu.Unlock()
	if err != nil {
		return err
	}

	for _, e := range entries {
		if !e.IsDir() {
			if !strings.HasSuffix(e.Name(), ".cache") {
				continue
			}
			if filter(e.Name()) {
				_ = os.Remove(filepath.Join(c.dir, e.Name()))
			}
		}
	}

	return nil
}
