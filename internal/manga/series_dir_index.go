package manga

import (
	"os"
	"path/filepath"
	chapter_downloader "seanime/internal/manga/downloader"
	"sync"
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
}

// seriesDirsForMedia returns the download folder names (relative to downloadDir) holding chapters
// for any of the given media IDs.
func (r *Repository) seriesDirsForMedia(mediaIds ...int) []string {
	idx := &r.seriesDirIndex
	idx.mu.Lock()
	defer idx.mu.Unlock()

	info, statErr := os.Stat(r.downloadDir)
	stale := idx.byMedia == nil ||
		time.Since(idx.builtAt) > seriesDirIndexMaxAge ||
		(statErr == nil && !info.ModTime().Equal(idx.dirMtime))
	if stale {
		idx.byMedia = r.buildSeriesDirIndex()
		idx.builtAt = time.Now()
		if statErr == nil {
			idx.dirMtime = info.ModTime()
		}
	}

	seen := make(map[string]struct{})
	ret := make([]string, 0, 2)
	for _, id := range mediaIds {
		for _, dir := range idx.byMedia[id] {
			if _, ok := seen[dir]; ok {
				continue
			}
			seen[dir] = struct{}{}
			ret = append(ret, dir)
		}
	}
	return ret
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
		if registry, err := chapter_downloader.LoadSeriesRegistryReadOnly(dirPath, r.logger); err == nil && len(registry.Chapters) > 0 {
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
