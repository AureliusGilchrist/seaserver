package manga

import (
	"os"
	"path/filepath"
	chapter_downloader "seanime/internal/manga/downloader"
	"sync"
	"sync/atomic"
	"time"
)

// seriesDirIndexMaxAge is how long the index is trusted without a rebuild. A new series folder
// changes the download folder's modification time and rebuilds it at once; this only bounds how
// long a series whose registry changed media ID in place could be looked for in the wrong folder.
const seriesDirIndexMaxAge = 2 * time.Minute

// seriesDirIndex maps a media ID to the download folders that hold its chapters.
//
// Opening a chapter used to list the whole download folder and parse the registry.json of every
// series in it, one after another, until one matched — on a library of thousands of series on a
// NAS, minutes before the source was even asked for pages. The index is built once (registries
// come from the read-only cache, so a rebuild is mostly stats) and then a lookup is a map read.
type seriesDirIndex struct {
	mu       sync.Mutex
	builtAt  time.Time
	dirMtime time.Time
	byMedia  map[int][]string

	// buildMu serialises builds; rebuilding marks a background rebuild in flight.
	buildMu    sync.Mutex
	rebuilding atomic.Bool
}

// seriesDirsForMedia returns the download folder names (relative to downloadDir) holding chapters
// for any of the given media IDs.
//
// A stale index is rebuilt in the background while lookups keep answering from the current one;
// only the very first lookup, with no index at all, waits for a build. Rebuilding inline made every
// chapter list wait for a full read of the download folder each time a new series folder appeared —
// which during a large download run is all the time.
func (r *Repository) seriesDirsForMedia(mediaIds ...int) []string {
	idx := &r.seriesDirIndex

	idx.mu.Lock()
	byMedia := idx.byMedia
	info, statErr := os.Stat(r.downloadDir)
	stale := byMedia == nil ||
		time.Since(idx.builtAt) > seriesDirIndexMaxAge ||
		(statErr == nil && !info.ModTime().Equal(idx.dirMtime))
	idx.mu.Unlock()

	if byMedia == nil {
		byMedia = r.rebuildSeriesDirIndex()
	} else if stale && idx.rebuilding.CompareAndSwap(false, true) {
		go func() {
			defer idx.rebuilding.Store(false)
			defer func() { _ = recover() }()
			r.rebuildSeriesDirIndex()
		}()
	}

	seen := make(map[string]struct{})
	ret := make([]string, 0, 2)
	for _, id := range mediaIds {
		for _, dir := range byMedia[id] {
			if _, ok := seen[dir]; ok {
				continue
			}
			seen[dir] = struct{}{}
			ret = append(ret, dir)
		}
	}
	return ret
}

// rebuildSeriesDirIndex builds the index and installs it, one build at a time. A caller arriving
// while another build runs waits for it and uses its result.
func (r *Repository) rebuildSeriesDirIndex() map[int][]string {
	idx := &r.seriesDirIndex
	idx.buildMu.Lock()
	defer idx.buildMu.Unlock()

	// Another build may have finished while this one waited for the lock.
	idx.mu.Lock()
	if idx.byMedia != nil && time.Since(idx.builtAt) < time.Second {
		current := idx.byMedia
		idx.mu.Unlock()
		return current
	}
	idx.mu.Unlock()

	info, statErr := os.Stat(r.downloadDir)
	built := r.buildSeriesDirIndex()

	idx.mu.Lock()
	idx.byMedia = built
	idx.builtAt = time.Now()
	if statErr == nil {
		idx.dirMtime = info.ModTime()
	}
	idx.mu.Unlock()
	return built
}

// invalidateSeriesDirIndex forces the next lookup to rebuild the index.
func (r *Repository) invalidateSeriesDirIndex() {
	r.seriesDirIndex.mu.Lock()
	r.seriesDirIndex.byMedia = nil
	r.seriesDirIndex.mu.Unlock()
}

func (r *Repository) buildSeriesDirIndex() map[int][]string {
	ret := make(map[int][]string)
	entries, err := os.ReadDir(r.downloadDir)
	if err != nil {
		return ret
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dirPath := filepath.Join(r.downloadDir, entry.Name())

		// New format: one registry for the series.
		if registry, err := chapter_downloader.LoadSeriesRegistrySummary(dirPath, r.logger); err == nil && len(registry.Chapters) > 0 {
			if registry.MediaId != 0 {
				ret[registry.MediaId] = append(ret[registry.MediaId], entry.Name())
			}
			continue
		}

		// Old format: chapter folders named after the media they belong to.
		chapterDirs, err := os.ReadDir(dirPath)
		if err != nil {
			continue
		}
		seen := make(map[int]struct{})
		for _, chapterDir := range chapterDirs {
			if !chapterDir.IsDir() {
				continue
			}
			id, ok := chapter_downloader.ParseChapterDirName(chapterDir.Name())
			if !ok || id.MediaId == 0 {
				continue
			}
			if _, done := seen[id.MediaId]; done {
				continue
			}
			seen[id.MediaId] = struct{}{}
			ret[id.MediaId] = append(ret[id.MediaId], entry.Name())
		}
	}
	return ret
}
