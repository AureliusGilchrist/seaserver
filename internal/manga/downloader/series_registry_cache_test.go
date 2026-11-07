package chapter_downloader

import (
	"testing"
)

func TestLoadSeriesRegistryReadOnlyReusesUntilSaved(t *testing.T) {
	dir := t.TempDir()
	reg := &SeriesRegistry{MediaId: 7, Provider: "p", Chapters: map[string]*ChapterEntry{
		"Chapter 1": {ChapterId: "a", ChapterNumber: "1"},
	}}
	if err := reg.Save(dir); err != nil {
		t.Fatal(err)
	}

	first, err := LoadSeriesRegistryReadOnly(dir, nil)
	if err != nil || len(first.Chapters) != 1 {
		t.Fatalf("first load: %v %v", first, err)
	}
	again, _ := LoadSeriesRegistryReadOnly(dir, nil)
	if again != first {
		t.Fatal("an unchanged registry should come from the cache")
	}

	reg.Chapters["Chapter 2"] = &ChapterEntry{ChapterId: "b", ChapterNumber: "2"}
	if err := reg.Save(dir); err != nil {
		t.Fatal(err)
	}
	updated, _ := LoadSeriesRegistryReadOnly(dir, nil)
	if len(updated.Chapters) != 2 {
		t.Fatalf("a saved registry should be re-read, got %d chapters", len(updated.Chapters))
	}

	empty, err := LoadSeriesRegistryReadOnly(t.TempDir(), nil)
	if err != nil || len(empty.Chapters) != 0 {
		t.Fatalf("a missing registry should load empty: %v %v", empty, err)
	}
}
