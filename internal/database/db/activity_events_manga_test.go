package db

import (
	"seanime/internal/database/models"
	"seanime/internal/util"
	"testing"
	"time"
)

func TestRecordMangaChapterReadDeduplicatesActivity(t *testing.T) {
	database, err := NewDatabase(t.TempDir(), "manga_activity_test", util.NewLogger())
	if err != nil {
		t.Fatalf("create test database: %v", err)
	}
	sqlDB, err := database.Gorm().DB()
	if err != nil {
		t.Fatalf("get SQL database: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	recorded, firstChapter, monthCount, err := database.RecordMangaChapterRead(123, 1, 4, map[string]interface{}{"chapter": 1})
	if err != nil {
		t.Fatalf("record first chapter: %v", err)
	}
	if !recorded || !firstChapter || monthCount != 1 {
		t.Fatalf("first chapter result = (%v, %v, %d), want (true, true, 1)", recorded, firstChapter, monthCount)
	}

	recorded, firstChapter, _, err = database.RecordMangaChapterRead(123, 1, 8, map[string]interface{}{"chapter": 1})
	if err != nil {
		t.Fatalf("record duplicate chapter: %v", err)
	}
	if recorded || firstChapter {
		t.Fatalf("duplicate chapter result = (%v, %v), want (false, false)", recorded, firstChapter)
	}

	recorded, firstChapter, monthCount, err = database.RecordMangaChapterRead(123, 2, 6, map[string]interface{}{"chapter": 2})
	if err != nil {
		t.Fatalf("record next chapter: %v", err)
	}
	if !recorded || firstChapter || monthCount != 2 {
		t.Fatalf("next chapter result = (%v, %v, %d), want (true, false, 2)", recorded, firstChapter, monthCount)
	}

	logs, err := database.GetAllActivityLogs()
	if err != nil {
		t.Fatalf("get activity logs: %v", err)
	}
	if len(logs) != 1 || logs[0].MangaChapters != 2 || logs[0].MangaMinutes != 10 {
		t.Fatalf("activity logs = %#v, want one log with 2 chapters and 10 minutes", logs)
	}

	events, err := database.GetActivityEvents(time.Now().Add(-time.Hour), 0, models.ActivityEventMangaChapterRead)
	if err != nil {
		t.Fatalf("get manga chapter events: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("recorded %d manga chapter events, want 2", len(events))
	}
}
