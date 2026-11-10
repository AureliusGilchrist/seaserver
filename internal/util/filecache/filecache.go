package filecache

import (
	stdjson "encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"seanime/internal/util"
	"sort"
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
	// size is the total length of every item's encoded value, kept in step with data by
	// putLocked/deleteLocked/resetLocked so the byte bound can be enforced without a scan.
	size int64

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

	// lastUsed is when the store was last handed out (unix nanoseconds), guarded by the Cacher's
	// lock. Idle stores are flushed and dropped; see evictIdleStores.
	lastUsed int64
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

	janitorOnce sync.Once
}

// storeIdleTTL is how long a bucket's store may go unused before it is flushed and dropped from
// memory. Every store holds its whole bucket decoded in memory and a flusher goroutine, and buckets
// are per manga, so a large library opened over a day used to leave thousands of them resident —
// gigabytes of cache and thousands of goroutines for series nobody had looked at in hours. A dropped
// bucket is read back from its file the next time it is used.
const storeIdleTTL = 10 * time.Minute

// evictIdleStores runs for the life of the cacher, dropping stores idle longer than storeIdleTTL.
func (c *Cacher) evictIdleStores() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-storeIdleTTL).UnixNano()
		var idle []*CacheStore
		c.mu.Lock()
		for name, store := range c.stores {
			if store.lastUsed != 0 && store.lastUsed < cutoff {
				select {
				case <-store.loading:
				default:
					continue // still loading; not idle in any useful sense
				}
				idle = append(idle, store)
				delete(c.stores, name)
			}
		}
		c.mu.Unlock()
		// Outside the lock: the final flush can take a moment for a large bucket.
		for _, store := range idle {
			_ = store.flushAndStop()
		}
	}
}

// cacheItem is one entry. Value holds the entry's JSON encoding, not a decoded value.
//
// It used to be an interface{}, which meant a bucket loaded from its file was held in memory as
// generic map[string]interface{} trees — several times the size of the JSON they came from, one
// heap object per field — and every Get re-encoded that tree only to decode it again into the
// caller's type. With the AniList and metadata buckets at tens of thousands of entries, that was
// gigabytes of live heap on a server that had been running a few hours, and the main reason the
// NAS ran out of memory after a few days. Keeping the bytes costs about the file's size, and Get
// is a single decode. The file format is unchanged: a RawMessage encodes as the JSON it holds.
type cacheItem struct {
	Value      json.RawMessage `json:"value"`
	Expiration *time.Time      `json:"expiration,omitempty"`
	UpdatedAt  *time.Time      `json:"updated_at,omitempty"`
}

// encodeValue turns a caller's value into the bytes a cacheItem holds.
func encodeValue(value interface{}) (json.RawMessage, error) {
	if raw, ok := value.(json.RawMessage); ok {
		return append(json.RawMessage(nil), raw...), nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("filecache: failed to encode value: %w", err)
	}
	return data, nil
}

// itemAge is what eviction orders by: when the entry was written (zero for entries from files
// written before Set recorded it, so those go first).
func (it *cacheItem) itemAge() time.Time {
	if it.UpdatedAt != nil {
		return *it.UpdatedAt
	}
	return time.Time{}
}

// putLocked stores item under key. Called with cs.mu held.
func (cs *CacheStore) putLocked(key string, item *cacheItem) {
	if old, ok := cs.data[key]; ok {
		cs.size -= int64(len(old.Value))
	}
	cs.data[key] = item
	cs.size += int64(len(item.Value))
}

// deleteLocked removes key. Called with cs.mu held.
func (cs *CacheStore) deleteLocked(key string) {
	if old, ok := cs.data[key]; ok {
		cs.size -= int64(len(old.Value))
		delete(cs.data, key)
	}
}

// resetLocked empties the store. Called with cs.mu held.
func (cs *CacheStore) resetLocked() {
	cs.data = make(map[string]*cacheItem)
	cs.size = 0
}

// maxStoreBytes bounds the encoded size of any one bucket, whatever its entry count: a bucket is
// held in memory whole and re-written whole, so its size is a direct cost in both RAM and disk
// I/O. The metadata and complete-anime buckets carry entries of tens of kilobytes each, so the
// entry-count bound alone let them reach hundreds of megabytes.
var maxStoreBytes int64 = 64 << 20

// enforceLimitsLocked evicts the oldest entries while the store is over either bound, down to 90%
// of it so a store sitting at the bound does not pay for a sort on every insert. keep (the entry
// just written) is never evicted. Returns whether anything was removed. Called with cs.mu held.
func (cs *CacheStore) enforceLimitsLocked(maxEntries int, keep string) bool {
	overEntries := maxEntries > 0 && len(cs.data) > maxEntries
	if !overEntries && cs.size <= maxStoreBytes {
		return false
	}
	targetEntries := len(cs.data)
	if overEntries {
		targetEntries = maxEntries * 9 / 10
	}
	targetBytes := maxStoreBytes
	if cs.size > maxStoreBytes {
		targetBytes = maxStoreBytes * 9 / 10
	}

	keys := make([]string, 0, len(cs.data))
	for k := range cs.data {
		if k != keep {
			keys = append(keys, k)
		}
	}
	sort.Slice(keys, func(i, j int) bool {
		return cs.data[keys[i]].itemAge().Before(cs.data[keys[j]].itemAge())
	})
	removed := false
	for _, k := range keys {
		if len(cs.data) <= targetEntries && cs.size <= targetBytes {
			break
		}
		cs.deleteLocked(k)
		removed = true
	}
	return removed
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

// ReleaseMemory writes every loaded bucket to disk and drops it from memory; each is read back from
// its file the next time it is used. The map is swapped out first, so a caller arriving meanwhile
// gets a fresh store loaded from the file rather than one that is being shut down.
func (c *Cacher) ReleaseMemory() int {
	c.mu.Lock()
	old := c.stores
	c.stores = make(map[string]*CacheStore)
	c.mu.Unlock()
	for _, store := range old {
		_ = store.flushAndStop()
	}
	return len(old)
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
	c.janitorOnce.Do(func() { go c.evictIdleStores() })

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
	store.lastUsed = time.Now().UnixNano()
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

	// Streamed entry by entry rather than marshalled whole: one Marshal of the bucket built a
	// buffer the size of the file, and go-json keeps its encode buffers pooled at the largest
	// size they ever reached, so every large bucket pinned a file-sized buffer.
	if err := util.WriteFileCrashSafeFunc(cs.filePath, 0644, func(w io.Writer) error {
		return writeSnapshot(w, snapshot)
	}); err != nil {
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
		return fmt.Errorf("filecache: failed to write cache file: %w", err)
	}
	return nil
}

// writeSnapshot writes the bucket file's JSON object one entry at a time.
func writeSnapshot(w io.Writer, snapshot map[string]*cacheItem) error {
	if _, err := io.WriteString(w, "{"); err != nil {
		return err
	}
	first := true
	for k, item := range snapshot {
		key, err := json.Marshal(k)
		if err != nil {
			return err
		}
		val, err := json.Marshal(item)
		if err != nil {
			// One bad entry must not cost the whole bucket its file.
			continue
		}
		if !first {
			if _, err := io.WriteString(w, ","); err != nil {
				return err
			}
		}
		first = false
		if _, err := w.Write(key); err != nil {
			return err
		}
		if _, err := io.WriteString(w, ":"); err != nil {
			return err
		}
		if _, err := w.Write(val); err != nil {
			return err
		}
	}
	_, err := io.WriteString(w, "}")
	return err
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
	raw, err := encodeValue(value)
	if err != nil {
		return err
	}
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	now := time.Now()
	store.mu.Lock()
	store.putLocked(key, &cacheItem{Value: raw, Expiration: lo.ToPtr(now.Add(bucket.ttl)), UpdatedAt: lo.ToPtr(now)})
	store.enforceLimitsLocked(0, key)
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
			store.deleteLocked(key)
			expired = true
		} else {
			var out T
			err = json.Unmarshal(item.Value, &out)
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
		store.deleteLocked(key)
		store.markDirty()
		return false, nil
	}
	return true, json.Unmarshal(item.Value, out)
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
	store.deleteLocked(key)
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
		var out T
		err = json.Unmarshal(item.Value, &out)
		if err != nil {
			return err
		}
		if cond(key, out) {
			store.deleteLocked(key)
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
	store.resetLocked()
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
	raw, err := encodeValue(value)
	if err != nil {
		return err
	}
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	store.putLocked(key, &cacheItem{Value: raw, UpdatedAt: lo.ToPtr(time.Now())}) // No expiration
	// Evict the oldest entries while over either bound, so a walk through a large franchise
	// cannot grow the bucket (and the memory holding it) without limit.
	store.enforceLimitsLocked(maxPermanentEntries, key)
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
	return true, json.Unmarshal(item.Value, out)
}

// DeletePerm deletes the value for the given key from the permanent bucket.
func (c *Cacher) DeletePerm(bucket PermanentBucket, key string) error {
	store, err := c.getStore(bucket.name)
	if err != nil {
		return err
	}
	store.mu.Lock()
	store.deleteLocked(key)
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
	store.deleteLocked(oldestKey)
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
	store.resetLocked()
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
	data, err := os.ReadFile(cs.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // File does not exist, so nothing to load
		}
		return fmt.Errorf("filecache: failed to open cache file: %w", err)
	}

	// encoding/json, not go-json, for this one decode: measured on a 13 MB bucket, go-json left
	// ~42 MB live after decoding into RawMessages, the standard library ~15 MB (the bytes alone).
	loaded := make(map[string]*cacheItem)
	if err := stdjson.Unmarshal(data, &loaded); err != nil {
		// If decode fails (empty or corrupted file), start empty
		cs.resetLocked()
		return nil
	}

	cs.resetLocked()
	for k, item := range loaded {
		if item != nil {
			cs.putLocked(k, item)
		}
	}
	// A file written before the byte bound existed can be far over it: trim it on the way in and
	// let the flusher write the trimmed version back.
	if cs.enforceLimitsLocked(maxPermanentEntries, "") {
		cs.markDirty()
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
