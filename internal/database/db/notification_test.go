package db

import (
	"seanime/internal/database/models"
	"seanime/internal/util"
	"testing"
)

func TestHasAnilistNotification(t *testing.T) {
	database, err := NewDatabase(t.TempDir(), "notifications_test", util.NewLogger())
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	sqlDB, err := database.Gorm().DB()
	if err != nil {
		t.Fatalf("Failed to get SQL database: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	exists, err := database.HasAnilistNotification(123)
	if err != nil {
		t.Fatalf("Failed to check missing AniList notification: %v", err)
	}
	if exists {
		t.Fatal("Expected notification ID 123 to be absent")
	}

	if err := database.CreateNotification(&models.Notification{
		Type:                  "related_anime_addition",
		AnilistNotificationID: 123,
	}); err != nil {
		t.Fatalf("Failed to create AniList notification: %v", err)
	}
	if err := database.SaveAnilistNotificationReceipt(123); err != nil {
		t.Fatalf("Failed to save AniList notification receipt: %v", err)
	}

	exists, err = database.HasAnilistNotification(123)
	if err != nil {
		t.Fatalf("Failed to check saved AniList notification: %v", err)
	}
	if !exists {
		t.Fatal("Expected notification ID 123 to exist")
	}

	if err := database.DeleteNotification(1); err != nil {
		t.Fatalf("Failed to delete notification: %v", err)
	}
	exists, err = database.HasAnilistNotification(123)
	if err != nil {
		t.Fatalf("Failed to check deleted notification receipt: %v", err)
	}
	if !exists {
		t.Fatal("Expected deleted notification's receipt to prevent reimport")
	}
}
