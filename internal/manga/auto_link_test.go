package manga

import (
	"testing"

	"seanime/internal/api/anilist"

	"github.com/samber/lo"
)

func mangaWith(romaji string, english string, synonyms ...string) *anilist.BaseManga {
	m := &anilist.BaseManga{
		ID:    1,
		Title: &anilist.BaseManga_Title{},
	}
	if romaji != "" {
		m.Title.Romaji = lo.ToPtr(romaji)
	}
	if english != "" {
		m.Title.English = lo.ToPtr(english)
	}
	for _, synonym := range synonyms {
		m.Synonyms = append(m.Synonyms, lo.ToPtr(synonym))
	}
	return m
}

// The titles a provider writes and the titles AniList writes differ in punctuation and spacing far
// more often than in words, and none of that should cost a match.
func TestLinkConfidenceMatchesTheSameSeries(t *testing.T) {
	cases := []struct {
		name      string
		local     string
		candidate *anilist.BaseManga
	}{
		{
			name:      "identical",
			local:     "1-nen A-gumi no Monster",
			candidate: mangaWith("1-nen A-gumi no Monster", ""),
		},
		{
			name:      "punctuation and case only",
			local:     "kaguya sama wa kokurasetai",
			candidate: mangaWith("Kaguya-sama wa Kokurasetai", ""),
		},
		{
			name:      "matched through the English title",
			local:     "Love is War",
			candidate: mangaWith("Kaguya-sama wa Kokurasetai", "Love is War"),
		},
		{
			name:      "matched through a synonym",
			local:     "Boku no Hero Academia",
			candidate: mangaWith("Boku no Hero Academia", "My Hero Academia", "Hero Aca"),
		},
		{
			name:      "a trailing subtitle is not a different series",
			local:     "Some Long Series Title",
			candidate: mangaWith("Some Long Series Title: Part 2", ""),
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if got := linkConfidence(tt.local, tt.candidate); got < MinLinkConfidence {
				t.Errorf("confidence = %.2f, want at least %.2f — these are the same series", got, MinLinkConfidence)
			}
		})
	}
}

// The expensive direction. A link filed against the wrong series puts somebody's downloads and
// reading progress on a series they have never read, with nothing on screen to say so.
func TestLinkConfidenceRejectsDifferentSeries(t *testing.T) {
	cases := []struct {
		name      string
		local     string
		candidate *anilist.BaseManga
	}{
		{
			name:      "unrelated",
			local:     "1-nen A-gumi no Monster",
			candidate: mangaWith("One Piece", ""),
		},
		{
			name:      "shares a common word",
			local:     "Monster Musume",
			candidate: mangaWith("Monster Hunter Orage", ""),
		},
		{
			name:      "same franchise, different entry",
			local:     "Gintama",
			candidate: mangaWith("Gintama Gaiden: Sorachi Hideaki Bangai Hen", ""),
		},
		{
			name:      "nothing to compare",
			local:     "",
			candidate: mangaWith("One Piece", ""),
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if got := linkConfidence(tt.local, tt.candidate); got >= MinLinkConfidence {
				t.Errorf("confidence = %.2f, want below %.2f — these are different series", got, MinLinkConfidence)
			}
		})
	}
}

// The best candidate wins, and a page of results with nothing close in it links nothing.
func TestBestLinkCandidate(t *testing.T) {
	candidates := []*anilist.BaseManga{
		mangaWith("One Piece", ""),
		nil,
		mangaWith("1-nen A-gumi no Monster", ""),
		mangaWith("Monster", ""),
	}

	best, confidence := bestLinkCandidate("1-nen A-gumi no Monster", candidates)
	if best == nil || best.Title.Romaji == nil || *best.Title.Romaji != "1-nen A-gumi no Monster" {
		t.Fatalf("picked %+v, want the exact title", best)
	}
	if confidence < MinLinkConfidence {
		t.Errorf("confidence = %.2f, want at least %.2f", confidence, MinLinkConfidence)
	}

	_, lowConfidence := bestLinkCandidate("Something Else Entirely", []*anilist.BaseManga{mangaWith("One Piece", "")})
	if lowConfidence >= MinLinkConfidence {
		t.Errorf("confidence = %.2f against an unrelated page, want below %.2f", lowConfidence, MinLinkConfidence)
	}
}

func TestNormalizeForLinking(t *testing.T) {
	cases := map[string]string{
		"Kaguya-sama: Love is War": "kaguya sama love is war",
		"  Spaced   Out  ":         "spaced out",
		"Re:Zero":                  "re zero",
		"":                         "",
		"...":                      "",
	}
	for input, want := range cases {
		if got := normalizeForLinking(input); got != want {
			t.Errorf("normalizeForLinking(%q) = %q, want %q", input, got, want)
		}
	}
}
