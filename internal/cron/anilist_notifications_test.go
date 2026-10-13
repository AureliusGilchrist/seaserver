package cron

import "testing"

func TestAnilistNotificationToModel(t *testing.T) {
	preferred := "Series: New Season"
	cover := "https://example.com/cover.jpg"
	context := "A sequel to a series on your list."

	var title relatedMediaNotificationMedia
	title.Title.UserPreferred = &preferred
	title.CoverImage.Large = &cover

	notification := anilistNotificationToModel(anilistNotification{
		ID:      456,
		Type:    "RELATED_MEDIA_ADDITION",
		Context: &context,
		Media: &relatedMediaNotificationMedia{
			ID:         789,
			Type:       "ANIME",
			Title:      title.Title,
			CoverImage: title.CoverImage,
		},
	})
	if notification == nil {
		t.Fatal("Expected anime related-media notification to be converted")
	}
	if notification.Type != "related_anime_addition" ||
		notification.Title != preferred ||
		notification.Body != context ||
		notification.ImageURL != cover ||
		notification.MediaID != 789 ||
		notification.AnilistNotificationID != 456 {
		t.Fatalf("Unexpected converted notification: %+v", notification)
	}

	mangaNotification := anilistNotificationToModel(anilistNotification{
		ID:   1,
		Type: "RELATED_MEDIA_ADDITION",
		Media: &relatedMediaNotificationMedia{
			ID:   2,
			Type: "MANGA",
		},
	})
	if mangaNotification == nil || mangaNotification.Type != "related_manga_addition" {
		t.Fatalf("Expected manga notification type, got %+v", mangaNotification)
	}

	airingNotification := anilistNotificationToModel(anilistNotification{
		ID:      5,
		Type:    "AIRING",
		Episode: 12,
		Media: &relatedMediaNotificationMedia{
			ID: 6,
		},
	})
	if airingNotification == nil || airingNotification.Type != "new_episode" || airingNotification.Body != "Episode 12 has aired." {
		t.Fatalf("Expected airing notification conversion, got %+v", airingNotification)
	}

	unsupported := anilistNotificationToModel(anilistNotification{
		ID:   3,
		Type: "RELATED_MEDIA_ADDITION",
		Media: &relatedMediaNotificationMedia{
			ID:   4,
			Type: "NOVEL",
		},
	})
	if unsupported != nil {
		t.Fatalf("Expected unsupported media type to be ignored, got %+v", unsupported)
	}
}
