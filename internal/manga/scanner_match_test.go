package manga

import (
	"testing"

	"seanime/internal/util/comparison"
)

// bestRating scores a folder name against a set of candidate names the way the scanner does.
func bestRating(t *testing.T, name string, candidates []string) float64 {
	t.Helper()
	ptrs := make([]*string, 0, len(candidates))
	for _, c := range candidates {
		v := c
		ptrs = append(ptrs, &v)
	}
	match, found := comparison.FindBestMatchWithSorensenDice(&name, ptrs)
	if !found {
		return 0
	}
	return match.Rating
}

// Punctuation is part of a title, and stripping it moves the folder name away from the thing it is
// being compared to. This is what searching and matching on the stripped name was costing.
func TestRawNameScoresBetterWhenPunctuationIsPartOfTheTitle(t *testing.T) {
	candidates := []string{"Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen"}
	folder := "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen"

	raw := bestRating(t, folder, candidates)
	cleaned := bestRating(t, cleanMangaTitle(folder), candidates)

	if raw < cleaned {
		t.Fatalf("raw scored %.3f, stripped scored %.3f — the raw name must not be the worse of the two here", raw, cleaned)
	}
	if raw < ScanMatchThreshold {
		t.Errorf("raw scored %.3f, below the %.2f threshold on an exact title", raw, ScanMatchThreshold)
	}
}

// A folder named after a synonym — an abbreviation, an alternate romanisation, the name the release
// used — matched nothing at all before synonyms were compared.
func TestSynonymsAreMatchable(t *testing.T) {
	// The main titles, as AniList reports them.
	mainTitles := []string{
		"Kimetsu no Yaiba",
		"Demon Slayer: Kimetsu no Yaiba",
	}
	// The same series' synonyms.
	withSynonyms := append([]string{}, mainTitles...)
	withSynonyms = append(withSynonyms, "Blade of Demon Destruction", "鬼滅の刃")

	folder := "Blade of Demon Destruction"

	if got := bestRating(t, folder, mainTitles); got >= ScanMatchThreshold {
		t.Fatalf("the main titles alone scored %.3f — this test no longer demonstrates anything", got)
	}
	if got := bestRating(t, folder, withSynonyms); got < ScanMatchThreshold {
		t.Errorf("with synonyms the score was %.3f, want at least %.2f", got, ScanMatchThreshold)
	}
}

// A folder named in Japanese is matchable once the native title is compared.
func TestNativeTitleIsMatchable(t *testing.T) {
	folder := "鬼滅の刃"

	if got := bestRating(t, folder, []string{"Kimetsu no Yaiba"}); got >= ScanMatchThreshold {
		t.Fatalf("romaji alone scored %.3f against a native-named folder — unexpected", got)
	}
	if got := bestRating(t, folder, []string{"Kimetsu no Yaiba", "鬼滅の刃"}); got < ScanMatchThreshold {
		t.Errorf("with the native title the score was %.3f, want at least %.2f", got, ScanMatchThreshold)
	}
}

// Keeping the stripped name as a second candidate matters when the folder carries punctuation the
// title does not — trying both is what makes either shape work.
func TestStrippedNameStillHelpsWhenTheFolderHasExtraPunctuation(t *testing.T) {
	candidates := []string{"Vinland Saga"}
	folder := "Vinland Saga!"

	raw := bestRating(t, folder, candidates)
	cleaned := bestRating(t, cleanMangaTitle(folder), candidates)

	if cleaned < raw {
		t.Fatalf("stripped scored %.3f, raw scored %.3f — the stripped name should win here", cleaned, raw)
	}
	if cleaned < ScanMatchThreshold {
		t.Errorf("stripped scored %.3f, below the %.2f threshold", cleaned, ScanMatchThreshold)
	}
}
