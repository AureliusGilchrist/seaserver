package manga

import (
	"testing"

	"seanime/internal/api/anilist"
	"seanime/internal/database/models"
)

// A synthetic entry is the only description of that series the app will ever have, so everything the
// provider gave us has to survive the trip to the screen. Dropping the synopsis here is what made a
// fully described series still open onto an empty entry page.
func TestSyntheticBaseMangaCarriesEverythingStored(t *testing.T) {
	media := SyntheticBaseManga(&models.SyntheticManga{
		SyntheticID: -42,
		Title:       "#Killstagram",
		CoverImage:  "https://example.invalid/cover.jpg",
		Description: "Remi Do has everything.",
		Status:      "FINISHED",
		Chapters:    64,
		Year:        2019,
		Genres:      "Horror, Josei, Psychological",
		Synonyms:    "Kilstagram, 킬스타그램",
	})

	if media.ID != -42 {
		t.Errorf("ID = %d, want -42", media.ID)
	}
	if media.Description == nil || *media.Description != "Remi Do has everything." {
		t.Errorf("description did not survive: %v", media.Description)
	}
	if media.Status == nil || *media.Status != anilist.MediaStatusFinished {
		t.Errorf("status = %v, want FINISHED", media.Status)
	}
	if len(media.Genres) != 3 {
		t.Errorf("genres = %d, want 3", len(media.Genres))
	}
	if len(media.Synonyms) != 2 {
		t.Errorf("synonyms = %d, want 2", len(media.Synonyms))
	}
	if media.StartDate == nil || media.StartDate.Year == nil || *media.StartDate.Year != 2019 {
		t.Errorf("year did not survive: %v", media.StartDate)
	}
	if media.CoverImage == nil || media.CoverImage.ExtraLarge == nil || *media.CoverImage.ExtraLarge == "" {
		t.Error("cover did not survive")
	}
}

func TestMediaStatusFromProvider(t *testing.T) {
	cases := map[string]string{
		"Ongoing":  "RELEASING",
		"Complete": "FINISHED",
		"Hiatus":   "HIATUS",
		"Canceled": "CANCELLED",
		"ongoing":  "RELEASING",
		// Wording nobody recognises returns nothing rather than a guess: leaving the status alone
		// beats telling the user a running series has finished.
		"":            "",
		"Who Knows":   "",
		"Coming Soon": "",
	}

	for input, want := range cases {
		if got := mediaStatusFromProvider(input); got != want {
			t.Errorf("mediaStatusFromProvider(%q) = %q, want %q", input, got, want)
		}
	}
}

// A synthetic that already has a cover and a synopsis is described well enough not to spend another
// request on, which is what keeps the startup pass from re-reading the whole library every boot.
func TestNeedsMetadata(t *testing.T) {
	cases := []struct {
		name      string
		synthetic *models.SyntheticManga
		want      bool
	}{
		{"nothing at all", &models.SyntheticManga{Title: "A"}, true},
		{"cover but no synopsis", &models.SyntheticManga{Title: "A", CoverImage: "x"}, true},
		{"synopsis but no cover", &models.SyntheticManga{Title: "A", Description: "x"}, true},
		{"both", &models.SyntheticManga{Title: "A", CoverImage: "x", Description: "y"}, false},
		{"whitespace is not a cover", &models.SyntheticManga{Title: "A", CoverImage: "  ", Description: "y"}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := needsMetadata(tc.synthetic); got != tc.want {
				t.Errorf("needsMetadata() = %v, want %v", got, tc.want)
			}
		})
	}
}
