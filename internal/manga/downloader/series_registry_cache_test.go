package chapter_downloader

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestLoadSeriesRegistrySummaryReusesUntilSaved(t *testing.T) {
	dir := t.TempDir()
	reg := &SeriesRegistry{MediaId: 7, Provider: "p", Chapters: map[string]*ChapterEntry{
		"Chapter 1": {ChapterId: "a", ChapterNumber: "1"},
	}}
	if err := reg.Save(dir); err != nil {
		t.Fatal(err)
	}
	first, err := LoadSeriesRegistrySummary(dir, nil)
	if err != nil || len(first.Chapters) != 1 {
		t.Fatalf("first load: %v %v", first, err)
	}
	again, err := LoadSeriesRegistrySummary(dir, nil)
	if err != nil || again != first {
		t.Fatalf("an unchanged registry should come from the cache: %v", err)
	}
	reg.Chapters["Chapter 2"] = &ChapterEntry{ChapterId: "b", ChapterNumber: "2"}
	if err := reg.Save(dir); err != nil {
		t.Fatal(err)
	}
	updated, err := LoadSeriesRegistrySummary(dir, nil)
	if err != nil || len(updated.Chapters) != 2 {
		t.Fatalf("a saved registry should be re-read: %v", err)
	}
	empty, err := LoadSeriesRegistrySummary(t.TempDir(), nil)
	if err != nil || len(empty.Chapters) != 0 {
		t.Fatalf("a missing registry should load empty: %v %v", empty, err)
	}
}

func TestSeriesRegistrySummaryOmitsPages(t *testing.T) {
	dir := t.TempDir()
	pages := make(map[int]PageInfo)
	for i := 0; i < 2000; i++ {
		pages[i] = PageInfo{Index: i, Filename: fmt.Sprintf("%d.jpg", i), OriginalURL: "https://example.test/page", Width: 800, Height: 1200}
	}
	reg := &SeriesRegistry{MediaId: 7, Provider: "p", Chapters: map[string]*ChapterEntry{
		"chapter": {ChapterId: "id", ChapterNumber: "1", ChapterTitle: "title", Provider: "p", Pages: pages},
	}}
	if err := reg.Save(dir); err != nil {
		t.Fatal(err)
	}
	summary, err := LoadSeriesRegistrySummary(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if summary.MediaId != 7 || summary.Chapters["chapter"].ChapterTitle != "title" {
		t.Fatalf("incorrect summary: %+v", summary)
	}
	seriesRegistryReadCache.Lock()
	cost := seriesRegistryReadCache.entries[dir].Value.(*cachedSeriesRegistry).cost
	seriesRegistryReadCache.Unlock()
	if cost > 2048 {
		t.Fatalf("summary cache cost includes page data: %d bytes", cost)
	}
	full, err := LoadSeriesRegistry(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(full.Chapters["chapter"].Pages) != len(pages) {
		t.Fatal("full registry lost pages")
	}
}

func TestSeriesRegistrySummaryCacheEvictsAtLimit(t *testing.T) {
	seriesRegistryReadCache.Lock()
	defer seriesRegistryReadCache.Unlock()
	for seriesRegistryReadCache.order.Len() > 0 {
		removeCachedSeriesRegistry(seriesRegistryReadCache.order.Back().Value.(*cachedSeriesRegistry).dir)
	}
	defer func() {
		for seriesRegistryReadCache.order.Len() > 0 {
			removeCachedSeriesRegistry(seriesRegistryReadCache.order.Back().Value.(*cachedSeriesRegistry).dir)
		}
	}()
	cacheSeriesRegistry(&cachedSeriesRegistry{dir: "first", cost: seriesRegistryCacheLimit / 2})
	cacheSeriesRegistry(&cachedSeriesRegistry{dir: "second", cost: seriesRegistryCacheLimit / 2})
	cacheSeriesRegistry(&cachedSeriesRegistry{dir: "third", cost: 1})
	if _, ok := seriesRegistryReadCache.entries["first"]; ok {
		t.Fatal("oldest entry was not evicted")
	}
	if seriesRegistryReadCache.cost > seriesRegistryCacheLimit {
		t.Fatalf("cache exceeds limit: %d", seriesRegistryReadCache.cost)
	}
	cacheSeriesRegistry(&cachedSeriesRegistry{dir: "oversized", cost: seriesRegistryCacheLimit + 1})
	if _, ok := seriesRegistryReadCache.entries["oversized"]; ok {
		t.Fatal("oversized entry was cached")
	}
}

func TestSeriesRegistrySummaryConcurrentLoadsAndExternalChanges(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "registry.json")
	if err := os.WriteFile(path, []byte(`{"mediaId":1,"chapters":{"a":{"chapterId":"one","pages":{"0":{"filename":"a.jpg"}}}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	const workers = 20
	results := make([]*SeriesRegistrySummary, workers)
	errs := make([]error, workers)
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = LoadSeriesRegistrySummary(dir, nil)
		}(i)
	}
	wg.Wait()
	for i := range results {
		if errs[i] != nil || results[i] != results[0] {
			t.Fatalf("concurrent load %d did not reuse summary: %v", i, errs[i])
		}
	}
	if err := os.WriteFile(path, []byte(`{"mediaId":2,"chapters":{"different":{"chapterId":"two"}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	updated, err := LoadSeriesRegistrySummary(dir, nil)
	if err != nil || updated.MediaId != 2 || updated.Chapters["different"] == nil {
		t.Fatalf("external change was not detected: %+v, %v", updated, err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	empty, err := LoadSeriesRegistrySummary(dir, nil)
	if err != nil || len(empty.Chapters) != 0 {
		t.Fatalf("deleted registry should load empty: %+v, %v", empty, err)
	}
}
