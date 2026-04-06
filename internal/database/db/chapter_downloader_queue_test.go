package db

import (
	"seanime/internal/database/models"
	"seanime/internal/test_utils"
	"seanime/internal/util"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestChapterDownloadQueueSeriesLimitWithErrored(t *testing.T) {
	test_utils.InitTestProvider(t)

	tempDir := t.TempDir()
	logger := util.NewLogger()
	database, err := NewDatabase(tempDir, test_utils.ConfigData.Database.Name, logger)
	if err != nil {
		t.Fatalf("Failed to create database: %v", err)
	}

	// Insert 49 series with "not_started" status
	for i := 1; i <= 49; i++ {
		item := &models.ChapterDownloadQueueItem{
			Provider:      "test",
			MediaID:       i,
			ChapterID:     "chapter1",
			ChapterNumber: "1",
			ChapterTitle:  "Test Chapter",
			MediaTitle:    "Test Manga",
			Status:        "not_started",
		}
		err := database.InsertChapterDownloadQueueItem(item)
		assert.NoError(t, err)
	}

	// Insert 1 series with "errored" status
	erroredItem := &models.ChapterDownloadQueueItem{
		Provider:      "test",
		MediaID:       50,
		ChapterID:     "chapter1",
		ChapterNumber: "1",
		ChapterTitle:  "Test Chapter",
		MediaTitle:    "Test Manga",
		Status:        "errored",
	}
	// Insert directly to bypass the limit check
	err = database.gormdb.Create(erroredItem).Error
	assert.NoError(t, err)

	// Now try to insert a new series - should succeed because the errored series doesn't count toward the limit
	newItem := &models.ChapterDownloadQueueItem{
		Provider:      "test",
		MediaID:       51,
		ChapterID:     "chapter1",
		ChapterNumber: "1",
		ChapterTitle:  "Test Chapter",
		MediaTitle:    "Test Manga",
		Status:        "not_started",
	}
	err = database.InsertChapterDownloadQueueItem(newItem)
	assert.NoError(t, err, "Should be able to insert new series when errored series don't count toward limit")

	// Try to insert another series - should fail because we now have 50 active series (49 not_started + 1 new)
	anotherItem := &models.ChapterDownloadQueueItem{
		Provider:      "test",
		MediaID:       52,
		ChapterID:     "chapter1",
		ChapterNumber: "1",
		ChapterTitle:  "Test Chapter",
		MediaTitle:    "Test Manga",
		Status:        "not_started",
	}
	err = database.InsertChapterDownloadQueueItem(anotherItem)
	assert.Error(t, err, "Should fail when exceeding 50 series limit")
	assert.Contains(t, err.Error(), "maximum of 50 series")
}

func TestChapterDownloadQueueMixedStatusSeries(t *testing.T) {
	test_utils.InitTestProvider(t)

	tempDir := t.TempDir()
	logger := util.NewLogger()
	database, err := NewDatabase(tempDir, test_utils.ConfigData.Database.Name, logger)
	if err != nil {
		t.Fatalf("Failed to create database: %v", err)
	}

	// Insert a series with mixed status chapters (some errored, some not_started)
	// This series should still count toward the limit because it has non-errored chapters
	mixedItem1 := &models.ChapterDownloadQueueItem{
		Provider:      "test",
		MediaID:       1,
		ChapterID:     "chapter1",
		ChapterNumber: "1",
		ChapterTitle:  "Test Chapter",
		MediaTitle:    "Test Manga",
		Status:        "errored",
	}
	err = database.InsertChapterDownloadQueueItem(mixedItem1)
	assert.NoError(t, err)

	mixedItem2 := &models.ChapterDownloadQueueItem{
		Provider:      "test",
		MediaID:       1,
		ChapterID:     "chapter2",
		ChapterNumber: "2",
		ChapterTitle:  "Test Chapter",
		MediaTitle:    "Test Manga",
		Status:        "not_started",
	}
	err = database.InsertChapterDownloadQueueItem(mixedItem2)
	assert.NoError(t, err, "Should be able to add another chapter to existing series")

	// Insert 49 more series to reach the limit
	for i := 2; i <= 50; i++ {
		item := &models.ChapterDownloadQueueItem{
			Provider:      "test",
			MediaID:       i,
			ChapterID:     "chapter1",
			ChapterNumber: "1",
			ChapterTitle:  "Test Chapter",
			MediaTitle:    "Test Manga",
			Status:        "not_started",
		}
		err := database.InsertChapterDownloadQueueItem(item)
		assert.NoError(t, err)
	}

	// Try to insert one more series - should fail because the mixed series counts toward the limit
	newItem := &models.ChapterDownloadQueueItem{
		Provider:      "test",
		MediaID:       51,
		ChapterID:     "chapter1",
		ChapterNumber: "1",
		ChapterTitle:  "Test Chapter",
		MediaTitle:    "Test Manga",
		Status:        "not_started",
	}
	err = database.InsertChapterDownloadQueueItem(newItem)
	assert.Error(t, err, "Should fail when exceeding 50 series limit")
	assert.Contains(t, err.Error(), "maximum of 50 series")
}
