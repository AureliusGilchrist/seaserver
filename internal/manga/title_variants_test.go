package manga

import (
	"slices"
	"testing"
)

// The whole name is always asked first. A library of well-named folders must cost exactly what it
// cost before this existed — one search each — and that is only true if the first variant is the
// name itself.
func TestTitleSearchVariantsAsksForTheWholeNameFirst(t *testing.T) {
	for _, name := range []string{
		"Kaguya-sama - Love is War",
		"#Killstagram",
		"Vinland Saga",
	} {
		variants := titleSearchVariants(name)
		if len(variants) == 0 || variants[0] != name {
			t.Errorf("titleSearchVariants(%q)[0] = %v, want the name itself first", name, variants)
		}
	}
}

// The names that made a single search miss: release furniture, a bracketed group, a subtitle the
// folder was named after instead of the title.
func TestTitleSearchVariantsOffersTheOtherWaysToAsk(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  string
	}{
		{"the scanlation group comes off", "[Group] Vinland Saga", "Vinland Saga"},
		{"the volume range comes off", "Berserk Vol. 1-10", "Berserk"},
		{"a bare year comes off", "Nana 2000", "Nana"},
		{"the main title on its own", "Kaguya-sama - Love is War", "Kaguya-sama"},
		{"the subtitle on its own", "Kaguya-sama - Love is War", "Love is War"},
		{"a colon separates too", "Monogatari: Second Season", "Monogatari"},
		{"the opening words of a long name", "The Rising of the Shield Hero Volume Two", "The Rising of"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			variants := titleSearchVariants(tc.input)
			if !slices.Contains(variants, tc.want) {
				t.Errorf("titleSearchVariants(%q) = %v, want it to include %q", tc.input, variants, tc.want)
			}
		})
	}
}

// Every extra variant is a request against a shared budget, and a two-letter query matches things at
// random rather than matching less well.
func TestTitleSearchVariantsStaysWithinItsBudget(t *testing.T) {
	variants := titleSearchVariants("A Very Long Folder Name - With A Subtitle (Group) [Digital] Vol. 1-20")

	if len(variants) > maxTitleVariants {
		t.Errorf("got %d variants, want at most %d: %v", len(variants), maxTitleVariants, variants)
	}

	seen := make(map[string]bool)
	for _, variant := range variants {
		if len([]rune(variant)) < 3 {
			t.Errorf("variant %q is too short to be a name", variant)
		}
		if seen[variant] {
			t.Errorf("variant %q was offered twice", variant)
		}
		seen[variant] = true
	}
}

// A name that is only punctuation is not a name, and searching for it would return whatever the
// provider felt like returning.
func TestTitleSearchVariantsRefusesNamesThatAreNotNames(t *testing.T) {
	for _, input := range []string{"", "   ", "--", "[]"} {
		if variants := titleSearchVariants(input); len(variants) != 0 {
			t.Errorf("titleSearchVariants(%q) = %v, want nothing", input, variants)
		}
	}
}
