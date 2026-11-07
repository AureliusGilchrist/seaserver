package manga

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"seanime/internal/database/db"
	"seanime/internal/database/models"
	chapter_downloader "seanime/internal/manga/downloader"
	"seanime/internal/util"
)

func newTestDatabase(t *testing.T, name string) *db.Database {
	t.Helper()
	database, err := db.NewDatabase(t.TempDir(), name, util.NewLogger())
	if err != nil {
		t.Fatalf("open %s database: %v", name, err)
	}
	t.Cleanup(func() {
		if sqlDB, err := database.Gorm().DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return database
}

func TestUnsynthesizeMatchedManga(t *testing.T) {
	const syn, anilist = -4242, 30001

	mainDB := newTestDatabase(t, "main")
	profileDB := newTestDatabase(t, "profile")
	downloadDir := t.TempDir()

	// The local series and its link.
	if err := mainDB.InsertSyntheticManga(&models.SyntheticManga{SyntheticID: syn, Title: "Oyasumi Punpun", Provider: "weebcentral", ProviderID: "wc-punpun"}); err != nil {
		t.Fatal(err)
	}
	if err := mainDB.SaveMangaIDMapping(syn, anilist, "wc-punpun"); err != nil {
		t.Fatal(err)
	}

	// Downloads: a series registry, and an old-format series with per-chapter folders.
	newDir := mustMkdir(t, downloadDir, "Oyasumi Punpun")
	registry := &chapter_downloader.SeriesRegistry{MediaId: syn, Provider: "weebcentral", Chapters: map[string]*chapter_downloader.ChapterEntry{
		"Chapter 1": {ChapterId: "ch-1", ChapterNumber: "1", Provider: "weebcentral", FolderName: "Chapter 1"},
	}}
	if err := registry.Save(newDir); err != nil {
		t.Fatal(err)
	}
	legacyDir := mustMkdir(t, downloadDir, "Oyasumi Punpun (old)")
	legacyChapter := chapter_downloader.FormatChapterDirName("weebcentral", syn, "ch-2", "2")
	mustMkdir(t, legacyDir, legacyChapter)
	if err := os.WriteFile(filepath.Join(legacyDir, legacyChapter, "registry.json"), []byte(`{"0":{"index":0,"filename":"01.jpg"}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	// Records in the shared database.
	g := mainDB.Gorm()
	older := time.Now().Add(-48 * time.Hour)
	newer := time.Now().Add(-1 * time.Hour)
	must(t, g.Create(&models.MangaReadingHistory{MediaID: syn, LastReadAt: newer, LastChapterNumber: "12", IsSynthetic: true}).Error)
	must(t, g.Create(&models.MangaReadingHistory{MediaID: anilist, LastReadAt: older, LastChapterNumber: "3"}).Error)
	must(t, g.Create(&models.MangaFavorite{MediaID: syn, AddedAt: older}).Error)
	must(t, g.Create(&models.DownloadedMangaMetadata{MediaID: syn, Title: "Oyasumi Punpun"}).Error)
	must(t, g.Create(&models.MangaChapterContainer{MediaID: syn, Provider: "weebcentral", ChapterID: "ch-1"}).Error)
	must(t, g.Create(&models.ChapterDownloadQueueItem{MediaID: syn, Provider: "weebcentral", ChapterID: "ch-3", Status: "queued"}).Error)

	// And in a profile's database.
	pg := profileDB.Gorm()
	must(t, pg.Create(&models.MangaReadingHistory{MediaID: syn, LastReadAt: newer, LastChapterNumber: "7", IsSynthetic: true}).Error)
	must(t, profileDB.InsertToWatchItem(&models.ToWatchItem{ProfileID: 1, AnimeID: syn, MediaType: "MANGA", Value: []byte(`{"mediaId":-4242,"title":"Oyasumi Punpun"}`)}))

	r := &Repository{downloadDir: downloadDir, logger: util.NewLogger(), db: mainDB}
	r.SetProfileDatabases(func() []*db.Database { return []*db.Database{profileDB} })

	if converted := r.UnsynthesizeMatchedManga(); converted != 1 {
		t.Fatalf("converted = %d, want 1", converted)
	}

	// The synthetic record is gone; the link stays as the tombstone.
	if _, found := mainDB.GetSyntheticManga(syn); found {
		t.Fatal("synthetic record should be deleted")
	}
	if id, found := mainDB.GetMangaIDMapping(syn); !found || id != anilist {
		t.Fatal("the link should be kept")
	}
	// Its provider link was carried across.
	if m, found := mainDB.GetMangaMapping("weebcentral", anilist); !found || m.MangaID != "wc-punpun" {
		t.Fatalf("provider link not carried across: %+v", m)
	}

	// Downloads now say AniList.
	reloaded, err := chapter_downloader.LoadSeriesRegistry(newDir, nil)
	if err != nil || reloaded.MediaId != anilist {
		t.Fatalf("registry media id = %d (%v)", reloaded.MediaId, err)
	}
	renamed := chapter_downloader.FormatChapterDirName("weebcentral", anilist, "ch-2", "2")
	if _, err := os.Stat(filepath.Join(legacyDir, renamed)); err != nil {
		t.Fatalf("legacy chapter folder not renamed: %v", err)
	}
	if dirs := r.seriesDirsForMedia(anilist); len(dirs) != 2 {
		t.Fatalf("both folders should index under the AniList id, got %v", dirs)
	}

	// Shared database: one reading history, the newer read, not synthetic.
	var history []models.MangaReadingHistory
	must(t, g.Where("media_id IN ?", []int{syn, anilist}).Find(&history).Error)
	if len(history) != 1 || history[0].MediaID != anilist || history[0].LastChapterNumber != "12" || history[0].IsSynthetic {
		t.Fatalf("reading history not merged: %+v", history)
	}
	for _, model := range []interface{}{&models.MangaFavorite{}, &models.DownloadedMangaMetadata{}, &models.MangaChapterContainer{}, &models.ChapterDownloadQueueItem{}} {
		var left, moved int64
		must(t, g.Model(model).Where("media_id = ?", syn).Count(&left).Error)
		must(t, g.Model(model).Where("media_id = ?", anilist).Count(&moved).Error)
		if left != 0 || moved != 1 {
			t.Fatalf("%T: %d left under synthetic, %d under AniList", model, left, moved)
		}
	}

	// Profile database.
	var profileHistory models.MangaReadingHistory
	must(t, pg.Where("media_id = ?", anilist).First(&profileHistory).Error)
	if profileHistory.LastChapterNumber != "7" || profileHistory.IsSynthetic {
		t.Fatalf("profile history not moved: %+v", profileHistory)
	}
	items, err := profileDB.GetToWatchItems(1)
	if err != nil || len(items) != 1 || items[0].AnimeID != anilist || string(items[0].Value) == `{"mediaId":-4242,"title":"Oyasumi Punpun"}` {
		t.Fatalf("todo entry not moved: %+v (%v)", items, err)
	}

	// The old-format chapter still opens under the AniList id.
	container, err := r.getDownloadedMangaPageContainer("weebcentral", anilist, "ch-2")
	if err != nil || container == nil {
		t.Fatalf("renamed legacy chapter does not open: %v", err)
	}

	// Nothing left to do the second time.
	if converted := r.UnsynthesizeMatchedManga(); converted != 0 {
		t.Fatalf("second run converted %d, want 0", converted)
	}
}

func TestRefiledChapterDirName(t *testing.T) {
	name := chapter_downloader.FormatChapterDirName("mangapill", -9, "abc_def", "12")
	got, ok := refiledChapterDirName(name, -9, 77)
	if !ok {
		t.Fatal("should rename")
	}
	id, parsed := chapter_downloader.ParseChapterDirName(got)
	if !parsed || id.MediaId != 77 || id.Provider != "mangapill" {
		t.Fatalf("renamed to %q, parsed %+v", got, id)
	}
	if _, ok := refiledChapterDirName(name, -10, 77); ok {
		t.Fatal("a folder for another series must be left alone")
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
