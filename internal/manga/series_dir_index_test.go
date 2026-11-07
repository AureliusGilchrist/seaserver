package manga

import (
	"os"
	"path/filepath"
	"testing"

	chapter_downloader "seanime/internal/manga/downloader"
	"seanime/internal/util"
)

func TestSeriesDirIndexFindsTheRightFolder(t *testing.T) {
	downloadDir := t.TempDir()

	// Many unrelated series, then the one being read, then an old-format one.
	for i := 0; i < 50; i++ {
		other := &chapter_downloader.SeriesRegistry{MediaId: 1000 + i, Provider: "p", Chapters: map[string]*chapter_downloader.ChapterEntry{
			"Chapter 1": {ChapterId: "x", ChapterNumber: "1", Provider: "p", FolderName: "Chapter 1"},
		}}
		if err := other.Save(filepath.Join(mustMkdir(t, downloadDir, "Other "+string(rune('A'+i%26))+string(rune('a'+i/26))))); err != nil {
			t.Fatal(err)
		}
	}
	punpunDir := mustMkdir(t, downloadDir, "Oyasumi Punpun")
	punpun := &chapter_downloader.SeriesRegistry{MediaId: 30001, Provider: "weebcentral", Chapters: map[string]*chapter_downloader.ChapterEntry{
		"Chapter 1": {
			ChapterId: "ch-1", ChapterNumber: "1", Provider: "weebcentral", FolderName: "Chapter 1",
			Pages: map[int]chapter_downloader.PageInfo{
				1: {Index: 1, Filename: "02.jpg", Width: 800, Height: 1200},
				0: {Index: 0, Filename: "01.jpg", Width: 800, Height: 1200},
			},
		},
	}}
	if err := punpun.Save(punpunDir); err != nil {
		t.Fatal(err)
	}
	legacyDir := mustMkdir(t, downloadDir, "Old Series")
	mustMkdir(t, legacyDir, chapter_downloader.FormatChapterDirName("mangapill", 42, "c9", "9"))

	r := &Repository{downloadDir: downloadDir, logger: util.NewLogger()}

	if dirs := r.seriesDirsForMedia(30001); len(dirs) != 1 || dirs[0] != "Oyasumi Punpun" {
		t.Fatalf("punpun dirs = %v", dirs)
	}
	if dirs := r.seriesDirsForMedia(42); len(dirs) != 1 || dirs[0] != "Old Series" {
		t.Fatalf("legacy dirs = %v", dirs)
	}
	if dirs := r.seriesDirsForMedia(7); len(dirs) != 0 {
		t.Fatalf("unknown media should have no dirs, got %v", dirs)
	}

	container, err := r.getDownloadedMangaPageContainer("weebcentral", 30001, "ch-1")
	if err != nil || container == nil {
		t.Fatalf("downloaded chapter not found: %v", err)
	}
	if len(container.Pages) != 2 || container.Pages[0].Index != 0 || !container.IsDownloaded {
		t.Fatalf("unexpected pages: %+v", container.Pages)
	}

	// A series added later is found without waiting for the index to age out.
	newDir := mustMkdir(t, downloadDir, "New Series")
	added := &chapter_downloader.SeriesRegistry{MediaId: 555, Provider: "p", Chapters: map[string]*chapter_downloader.ChapterEntry{
		"Chapter 1": {ChapterId: "n1", ChapterNumber: "1", Provider: "p", FolderName: "Chapter 1"},
	}}
	if err := added.Save(newDir); err != nil {
		t.Fatal(err)
	}
	r.invalidateSeriesDirIndex()
	if dirs := r.seriesDirsForMedia(555); len(dirs) != 1 {
		t.Fatalf("new series not indexed: %v", dirs)
	}
}

func mustMkdir(t *testing.T, parent, name string) string {
	t.Helper()
	dir := filepath.Join(parent, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}
