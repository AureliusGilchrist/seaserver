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
			EnMasse:       true,
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
		EnMasse:       true,
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
		EnMasse:       true,
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
		EnMasse:       true,
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
		EnMasse:       true,
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
		EnMasse:       true,
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
			EnMasse:       true,
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
		EnMasse:       true,
	}
	err = database.InsertChapterDownloadQueueItem(newItem)
	assert.Error(t, err, "Should fail when exceeding 50 series limit")
	assert.Contains(t, err.Error(), "maximum of 50 series")
}

// Hand-queued chapters ("private" downloads) have no series limit and must not use up the
// en masse budget either.
func TestChapterDownloadQueueManualSeriesAreUnlimited(t *testing.T) {
	test_utils.InitTestProvider(t)

	tempDir := t.TempDir()
	logger := util.NewLogger()
	database, err := NewDatabase(tempDir, test_utils.ConfigData.Database.Name, logger)
	if err != nil {
		t.Fatalf("Failed to create database: %v", err)
	}

	newItem := func(mediaID int, enMasse bool) *models.ChapterDownloadQueueItem {
		return &models.ChapterDownloadQueueItem{
			Provider:      "test",
			MediaID:       mediaID,
			ChapterID:     "chapter1",
			ChapterNumber: "1",
			ChapterTitle:  "Test Chapter",
			MediaTitle:    "Test Manga",
			Status:        "not_started",
			EnMasse:       enMasse,
		}
	}

	// Well past the limit, all queued by hand.
	for i := 1; i <= MaxQueuedSeries+10; i++ {
		assert.NoError(t, database.InsertChapterDownloadQueueItem(newItem(i, false)),
			"hand-queued series should never hit the limit")
	}

	// The en masse budget is untouched by all of the above.
	for i := 1000; i < 1000+MaxQueuedSeries; i++ {
		assert.NoError(t, database.InsertChapterDownloadQueueItem(newItem(i, true)),
			"hand-queued series should not count towards the en masse limit")
	}

	// ...and still applies once the bulk downloader has filled it.
	err = database.InsertChapterDownloadQueueItem(newItem(2000, true))
	assert.Error(t, err, "en masse should still be capped")
	assert.Contains(t, err.Error(), "maximum of 50 series")

	// A hand-queued series goes through even with a full en masse queue.
	assert.NoError(t, database.InsertChapterDownloadQueueItem(newItem(2001, false)),
		"a full en masse queue must not block a hand-queued download")
}
